/**
 * POST /api/facebook/capi
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side bridge to the Meta Conversions API.
 *
 * TRUST MODEL — the important part.
 *
 * The browser tells this endpoint only WHICH event happened and hands over the
 * two Meta cookies it alone can read (_fbp / _fbc). Everything that Meta counts
 * as money or identity is resolved SERVER-SIDE:
 *
 *   Purchase     → the order is loaded from the database by id. Value, currency,
 *                  contents, order_id and all PII come from that row. Nothing
 *                  the client sends about money or identity is trusted, so a
 *                  crafted request cannot invent revenue.
 *   ViewContent  → the product is loaded from the database by id, so price and
 *                  name are authoritative too.
 *
 * AddToCart, InitiateCheckout and PageView have NO trustworthy server-side
 * source — a cart is purely browser state and no server record exists at that
 * moment. Rather than forward unverifiable client numbers to Meta, they stay
 * browser-pixel-only. That is a deliberate, documented gap, not an oversight.
 *
 * The access token is read from the database inside getMetaServerConfig() and
 * never leaves this process. The client cannot supply a token or a pixel id;
 * both are ignored if present.
 *
 * Purchase delivery is idempotent server-side (see lib/meta/idempotency.js), so
 * refreshing, reopening or sharing the success URL cannot double-count.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { getMetaServerConfig, canSendCapi } from '@/lib/meta/config';
import { isAllowedEvent, purchaseEventId, purchaseEligibility } from '@/lib/meta/events';
import { buildUserData, buildServerEvent, sendCapiEvents, CAPI_RESULT } from '@/lib/meta/capi';
import {
  claimPurchase, markPurchaseSent, markPurchaseFailed, CLAIM,
} from '@/lib/meta/idempotency';
import {
  STORE_CURRENCY, toNumericValue, buildContents, buildContentIds, totalQuantity,
} from '@/lib/meta/normalize';

/** Events this endpoint will act on. Anything else is rejected outright. */
const SERVER_EVENTS = new Set(['Purchase', 'ViewContent']);

/** A JSON body larger than this is refused before parsing. */
const MAX_BODY_BYTES = 8 * 1024;

/** Generic, non-revealing responses. Upstream bodies are never forwarded. */
const ok = (extra = {}) => NextResponse.json({ ok: true, ...extra });
const skip = (reason) => NextResponse.json({ ok: true, skipped: reason });
const bad = (reason) => NextResponse.json({ ok: false, error: reason }, { status: 400 });

export async function POST(req) {
  // Abuse guard: an unauthenticated endpoint that talks to an ad platform must
  // not be a free event-injection channel.
  const limited = rateLimit(req, 'meta_capi', { max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const declared = Number(req.headers.get('content-length') || 0);
  if (declared && declared > MAX_BODY_BYTES) return bad('payload_too_large');

  let body;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return bad('payload_too_large');
    body = JSON.parse(text);
  } catch {
    return bad('invalid_body');
  }
  if (!body || typeof body !== 'object') return bad('invalid_body');

  const eventName = typeof body.event_name === 'string' ? body.event_name.trim() : '';
  if (!isAllowedEvent(eventName)) return bad('unsupported_event');
  if (!SERVER_EVENTS.has(eventName)) return skip('browser_only_event');

  // Credentials come from the database, never from the request. A client-supplied
  // access_token or pixel_id is ignored by construction — neither is read here.
  const cfg = await getMetaServerConfig();
  if (!cfg.enabled) return skip('pixel_disabled');
  if (!canSendCapi(cfg)) return skip('missing_pixel_id_or_token');

  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') || undefined;
  const userAgent = typeof body.user_agent === 'string'
    ? body.user_agent.slice(0, 512)
    : req.headers.get('user-agent') || undefined;

  // The only client-supplied values that are USED: the two Meta cookies (which
  // only the browser can read) and the page URL. Both are format-validated
  // downstream in buildUserData / here.
  const fbp = typeof body.fbp === 'string' ? body.fbp.slice(0, 128) : undefined;
  const fbc = typeof body.fbc === 'string' ? body.fbc.slice(0, 256) : undefined;
  const eventSourceUrl = safeUrl(body.event_source_url);

  try {
    if (eventName === 'Purchase') {
      return await handlePurchase({ body, cfg, clientIp, userAgent, fbp, fbc, eventSourceUrl });
    }
    return await handleViewContent({ body, cfg, clientIp, userAgent, fbp, fbc, eventSourceUrl });
  } catch (err) {
    // Detail stays in the server log; the browser only ever sees a generic code.
    console.error('[meta/capi]', eventName, err?.message ?? err);
    return NextResponse.json({ ok: false, error: 'delivery_failed' }, { status: 200 });
  }
}

// ── Purchase — fully server-authoritative ───────────────────────────────────

async function handlePurchase({ body, cfg, clientIp, userAgent, fbp, fbc, eventSourceUrl }) {
  const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : '';
  if (!orderId || orderId.length > 100) return bad('invalid_order_id');

  const order = await prisma.order.findFirst({
    where: { OR: [{ id: orderId }, { sessionId: orderId }] },
    select: {
      id: true, status: true, paymentStatus: true, paymentMethod: true,
      paymentTotal: true, paymentDetails: true,
      customerName: true, customerEmail: true, customerPhone: true,
      shippingAddress: true, isFake: true, orderSource: true,
      items: { select: { productId: true, quantity: true, price: true } },
    },
  });
  if (!order) return skip('order_not_found');

  // Business rule, independent of Bemob: COD converts at order creation, but a
  // bank transfer is not revenue until the payment is actually verified.
  const eligibility = purchaseEligibility(order);
  if (!eligibility.eligible) return skip(eligibility.reason);

  // Server-authoritative idempotency. localStorage on the success page is only a
  // client-side optimisation; THIS is what makes a shared link safe.
  const claim = await claimPurchase(order.id);
  if (claim.status === CLAIM.ALREADY_SENT) return skip('already_sent');
  if (claim.status === CLAIM.IN_FLIGHT) return skip('in_flight');
  if (claim.status === CLAIM.ERROR) return skip('claim_unavailable');

  const pd = order.paymentDetails && typeof order.paymentDetails === 'object' ? order.paymentDetails : {};
  const lines = order.items.map((i) => ({ productId: i.productId, quantity: i.quantity, price: i.price }));

  // paymentTotal is the amount the store actually books for the order: it is the
  // order-level total written at creation and INCLUDES shipping and any discount
  // already applied. Line-item sums are only a fallback when it is missing.
  const value = toNumericValue(order.paymentTotal ?? pd.total) ??
                toNumericValue(lines.reduce((s, i) => s + (Number(i.price) || 0) * (i.quantity || 1), 0));

  const addr = order.shippingAddress && typeof order.shippingAddress === 'object' ? order.shippingAddress : {};
  const userData = buildUserData({
    email: order.customerEmail,
    phone: order.customerPhone,
    fullName: order.customerName,
    city: addr.city ?? addr.address?.city,
    zip: addr.zip ?? addr.postalCode,
    country: 'ma',
    externalId: order.id,
    fbp, fbc, clientIp, userAgent,
  });

  const event = buildServerEvent({
    eventName: 'Purchase',
    eventId: purchaseEventId(order.id),   // identical to the browser's eventID
    eventSourceUrl,
    userData,
    ...(value === null ? {} : { value }),
    currency: STORE_CURRENCY,
    contentIds: buildContentIds(lines),
    contents: buildContents(lines),
    numItems: totalQuantity(lines),
    orderId: order.id,
  });

  const res = await sendCapiEvents([event], cfg);

  if (res.result === CAPI_RESULT.OK) {
    await markPurchaseSent(order.id, { received: res.received });
    return ok({ delivered: true });
  }

  // Anything other than a clean 2xx stays retryable — the claim is released
  // back to "failed" so a later legitimate attempt can try again.
  await markPurchaseFailed(order.id, res.result);
  console.error('[meta/capi] purchase delivery failed for order', order.id, '-', res.result, res.detail ?? '');
  return NextResponse.json({ ok: false, error: 'delivery_failed' }, { status: 200 });
}

// ── ViewContent — price and name re-resolved from the catalogue ─────────────

async function handleViewContent({ body, cfg, clientIp, userAgent, fbp, fbc, eventSourceUrl }) {
  const productId = typeof body.product_id === 'string' ? body.product_id.trim() : '';
  if (!productId || productId.length > 100) return bad('invalid_product_id');

  const eventId = typeof body.event_id === 'string' ? body.event_id.trim().slice(0, 120) : '';
  if (!eventId) return bad('missing_event_id');

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, title: true, salePrice: true, regularPrice: true, status: true },
  });
  if (!product || product.status !== 'Active') return skip('product_not_found');

  const value = toNumericValue(product.salePrice ?? product.regularPrice);

  const event = buildServerEvent({
    eventName: 'ViewContent',
    eventId,                                   // minted by the browser helper
    eventSourceUrl,
    userData: buildUserData({ fbp, fbc, clientIp, userAgent }),
    ...(value === null ? {} : { value }),
    currency: STORE_CURRENCY,
    contentIds: [product.id],
    contents: [{ id: product.id, quantity: 1, ...(value === null ? {} : { item_price: value }) }],
    contentName: product.title || undefined,
  });

  const res = await sendCapiEvents([event], cfg);
  if (res.result === CAPI_RESULT.OK) return ok({ delivered: true });
  console.error('[meta/capi] viewcontent delivery failed -', res.result);
  return NextResponse.json({ ok: false, error: 'delivery_failed' }, { status: 200 });
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Accept only an http(s) URL, capped, so nothing odd reaches Meta. */
function safeUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 1000) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Every other method is refused — no GET-based event injection. */
export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
