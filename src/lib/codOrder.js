/**
 * src/lib/codOrder.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure builder + validation for an inline COD order. Shared by the landing-page
 * order form AND the product-page inline COD form so BOTH post the exact same
 * shape to the existing /api/order endpoint — no duplicated order logic, one
 * source of truth. No React/DOM/network → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Server-authoritative price still comes from the DB in /api/order; this is the
 *  display/submitted unit price (sale → regular → 0), with an optional override. */
export function resolveCodPrice(product, override = null) {
  if (override != null && Number.isFinite(Number(override))) return Number(override);
  return Number(product?.salePrice || product?.regularPrice || 0);
}

/** Minimal COD validation — name + phone required (same rule the forms enforce). */
export function validateCodForm(form = {}) {
  const errors = [];
  if (!String(form.name ?? '').trim())  errors.push('name');
  if (!String(form.phone ?? '').trim()) errors.push('phone');
  return { valid: errors.length === 0, errors };
}

/**
 * Build the /api/order request body for an inline COD order.
 * The shape matches the working checkout exactly (nested shipping, products.items
 * with productSnapshot-compatible fields, COD paymentDetails), so orders from the
 * product page behave identically to landing / checkout orders.
 *
 * `orderSource` distinguishes analytics attribution ("landing" | "product"); all
 * other behaviour (admin orders, CAPI, Bemob, affiliate, stock, notifications) is
 * driven by the single /api/order pipeline.
 */
export function buildCodOrderPayload({
  product, form = {}, quantity = 1, variant = null, price = null,
  orderSource = 'landing', landingPage = null,
  sessionId, bemobClickId = null, affiliateId = null, images = null,
}) {
  const qty  = Math.max(1, parseInt(quantity, 10) || 1);
  const unit = resolveCodPrice(product, price);
  const total = +(unit * qty).toFixed(2);

  const name    = String(form.name ?? '').trim();
  const phone   = String(form.phone ?? '').trim();
  const city    = String(form.city ?? '').trim();
  const address = String(form.address ?? '').trim();

  const item = {
    productId: product?._id || product?.id,
    title:     product?.title || 'منتج',
    quantity:  qty,
    price:     unit,
    images:    Array.isArray(images) ? images : [],
  };
  // Only attach variants when the caller actually has a selection (landing form
  // passes none → identical payload to before).
  if (variant && (Array.isArray(variant) ? variant.length : true)) item.variants = variant;

  return {
    name,
    phone,
    shipping: { address: { city, address1: address || city }, name, phone },
    products: { items: [item] },
    paymentDetails: { paymentMethod: 'COD', status: 'pending', total },
    status:      'pending',
    sessionId,
    affiliateId,
    orderSource,
    utm_source:  landingPage?.slug || null,
    bemobClickId,
  };
}
