/**
 * POST /api/facebook/capi
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side bridge to the Facebook Conversions API.
 *
 * The browser calls this endpoint with event data + cookies.
 * We hash PII here (server-side, safe) and forward to Graph API.
 *
 * Why server-side?
 *   - Ad blockers cannot intercept server→server requests
 *   - iOS 14+ ITP does not restrict server-side cookies
 *   - Access token is never exposed to the browser
 *
 * Deduplication:
 *   Caller passes an `event_id` that must match the one passed to
 *   fbq('track', ..., { eventID }) in the browser pixel.
 *   Facebook deduplicates within 48 h by (event_name + event_id).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse }        from 'next/server';
import { getSettings }         from '@/lib/services/settingsService';
import { sha256, sendCapiEvents } from '@/lib/facebookCapi';

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      event_name,        // 'Purchase' | 'PageView' | etc.
      event_id,          // dedup ID — must match browser pixel eventID
      event_source_url,  // full URL of the page where event happened
      fbp,               // _fbp cookie value (browser sends this)
      fbc,               // _fbc cookie value (browser sends this)
      user_agent,        // navigator.userAgent (browser sends this)
      // Purchase-specific
      value,
      currency = 'MAD',
      content_ids,
      contents,
      num_items,
      order_id,
      // PII — hashed server-side (never trust client to hash)
      phone,
      city,
    } = body;

    // ── Load pixel config from DB (server context — no auth needed) ──────────
    const cfg        = await getSettings('integrations');
    const pixelCfg   = cfg?.metaPixel;

    if (!pixelCfg?.enabled) {
      return NextResponse.json({ skipped: 'pixel_disabled' });
    }

    const pixelId     = pixelCfg?.pixelIds?.[0]?.id;
    const accessToken = pixelCfg?.accessToken;

    if (!pixelId || !accessToken) {
      return NextResponse.json({ skipped: 'missing_pixel_id_or_token' });
    }

    // ── Client IP (for attribution accuracy) ────────────────────────────────
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '0.0.0.0';

    // ── Build user_data (PII must be SHA-256 hashed) ─────────────────────────
    const user_data = {
      client_ip_address: clientIp,
      client_user_agent: user_agent || req.headers.get('user-agent') || '',
    };

    // Non-hashed cookies — passed through as-is
    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;

    // Hashed PII — normalise before hashing (Facebook requirement)
    const hashedPhone = phone ? sha256(phone.replace(/\D/g, '')) : null; // digits only
    const hashedCity  = city  ? sha256(city)  : null;

    if (hashedPhone) user_data.ph = [hashedPhone];
    if (hashedCity)  user_data.ct = [hashedCity];

    // ── Build server event ───────────────────────────────────────────────────
    const event = {
      event_name,
      event_time:       Math.floor(Date.now() / 1000),
      event_source_url: event_source_url || '',
      action_source:    'website',
      user_data,
    };

    if (event_id) event.event_id = event_id;

    // ── Purchase custom_data ─────────────────────────────────────────────────
    if (event_name === 'Purchase') {
      event.custom_data = {
        value,
        currency,
        content_type: 'product',
        ...(content_ids?.length && { content_ids }),
        ...(contents?.length    && { contents }),
        ...(num_items           && { num_items }),
        ...(order_id            && { order_id }),
      };
    }

    // ── Send to Facebook ─────────────────────────────────────────────────────
    const result = await sendCapiEvents([event], pixelId, accessToken);
    return NextResponse.json({ ok: true, events_received: result.events_received });

  } catch (err) {
    console.error('[CAPI]', err.message);
    // Return 200 so the client doesn't retry on transient FB errors
    return NextResponse.json({ error: err.message }, { status: 200 });
  }
}
