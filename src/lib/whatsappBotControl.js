/**
 * src/lib/whatsappBotControl.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side proxy to the WhatsApp order bot's LOCALHOST control API.
 *
 * The bot (scripts/whatsapp-order-bot.js) is a separate PM2 process that owns
 * whatsapp-web.js / Puppeteer. This module NEVER imports whatsapp-web.js — it
 * only does a token-gated fetch to 127.0.0.1 and returns plain JSON, degrading
 * gracefully when the bot is offline or unconfigured.
 *
 * Env:
 *   WA_BOT_CONTROL_PORT   (default 4599)
 *   WA_BOT_CONTROL_TOKEN  (shared secret; if unset → "unconfigured")
 * ─────────────────────────────────────────────────────────────────────────────
 */

export async function botControlProxy(pathname) {
  const token = process.env.WA_BOT_CONTROL_TOKEN || "";
  const port  = process.env.WA_BOT_CONTROL_PORT || "4599";

  if (!token) {
    return { ok: false, state: "unconfigured", error: "WA_BOT_CONTROL_TOKEN not set" };
  }

  try {
    const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      headers: { "x-bot-token": token },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, state: "error", httpStatus: res.status };
    const data = await res.json();
    return { ok: true, ...data };
  } catch {
    // Bot process not running / not reachable on this host.
    return { ok: false, state: "offline" };
  }
}
