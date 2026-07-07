#!/usr/bin/env node
/**
 * scripts/whatsapp-order-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * WhatsApp order-status notifier. Read-only against the store database
 * (`DATABASE_URL` from .env); it NEVER writes to the `orders` table and never
 * touches checkout/order logic.
 *
 * Two modes:
 *   --dry-run   Plan only. No WhatsApp, no sends, no state written. Prints which
 *               messages would be sent, duplicates, and invalid phones.
 *   --send      Live. Connects via whatsapp-web.js (LocalAuth — scan the QR once
 *               in the terminal on first run), polls every 60s, and sends each
 *               order+status message exactly once (tracked in
 *               .whatsapp-sent-orders.json), with a 20–40s delay between sends.
 *
 * The WhatsApp deps (whatsapp-web.js, qrcode-terminal) are only required in
 * --send mode, so --dry-run has zero heavy dependencies.
 *
 * Usage:
 *   node scripts/whatsapp-order-bot.js --dry-run
 *   node scripts/whatsapp-order-bot.js --send
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Load .env if dotenv is available; otherwise rely on the shell environment.
try { require("dotenv").config(); } catch { /* env provided externally */ }

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const args    = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SEND    = args.includes("--send");

const SENT_FILE = path.join(process.cwd(), ".whatsapp-sent-orders.json");
const ABANDONED_SENT_FILE = path.join(process.cwd(), ".whatsapp-abandoned-sent.json");
const LOOKBACK_DAYS = 7;
const ABANDONED_DELAY_MIN = 30; // only remind carts idle for >= 30 minutes
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://houseelectronic.ma").replace(/\/$/, "");

// ── Localhost control API (Phase 4a) config ───────────────────────────────────
const CONTROL_PORT   = parseInt(process.env.WA_BOT_CONTROL_PORT || "4599", 10);
const CONTROL_TOKEN  = process.env.WA_BOT_CONTROL_TOKEN || "";
const LOG_BUFFER_MAX = 300;

// In-memory state surfaced to the admin panel via the control API.
const botState  = {
  state: "starting", since: new Date().toISOString(), lastError: null,
  lastActivity: null, number: null, connectedSince: null,
};
const qrState   = { qr: null, ascii: null, dataUrl: null, at: null };
const logBuffer = [];               // { ts, level, msg }
const messageHistory = [];          // { ts, orderId, state, phone, result, error }
const MSG_HISTORY_MAX = 100;
const stats = { sentTotal: 0, failedTotal: 0, pending: 0 };

// Live WhatsApp client / DB pool / poll timer — module-scoped so control
// endpoints (start/stop/restart) can act on them.
let waClient  = null;
let dbPool    = null;
let pollTimer = null;
let isSending = false;      // guard against overlapping send cycles
let lastSkipState = null;   // avoids logging the same "not ready" skip every cycle
const _wa = {}; // lazily-loaded { Client, LocalAuth, qrcode }

function setState(s, err) {
  botState.state = s;
  botState.since = new Date().toISOString();
  if (err !== undefined) botState.lastError = err ? String(err) : null;
}
function touchActivity() { botState.lastActivity = new Date().toISOString(); }

// ── Logging (leveled: INFO | WARNING | ERROR) ─────────────────────────────────
const ts = () => new Date().toISOString();
function pushLog(level, a) {
  const t = ts();
  const msg = `[${t}] ${a.map((x) => (typeof x === "string" ? x : String(x))).join(" ")}`;
  console.log(msg);
  logBuffer.push({ ts: t, level, msg });
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
}
const log  = (...a) => pushLog("INFO", a);
const warn = (...a) => pushLog("WARNING", a);
const errl = (...a) => pushLog("ERROR", a);

// ── Message templates (exact darija/arabic wording) ───────────────────────────
const MESSAGES = {
  NEW:       (name) => `Salam ${name}, waslna talab dyalk. Ghadi nraj3o lik bach n2akdo talab.`,
  CONFIRMED: (name) => `Salam ${name}, talab dyalk t2akkad. Ghadi nوجدوه ونرسلوا ليك التفاصيل.`,
  SHIPPED:   ()     => `Talab dyalk خرج للتوصيل.`,
  DELIVERED: ()     => `شكراً، نتمنى الطلب يكون عجبك.`,
  CANCELLED: ()     => `تم إلغاء طلبك.`,
};

// ── Status → notification-state mapping ───────────────────────────────────────
// New orders are stored as "pending"; admin sets uppercase states.
function mapStatus(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (s === "PENDING" || s === "NEW" || s === "SUCCESS") return "NEW";
  if (s === "CONFIRMED") return "CONFIRMED";
  if (s === "SHIPPED")   return "SHIPPED";
  if (s === "DELIVERED") return "DELIVERED";
  if (s === "CANCELLED" || s === "CANCELED") return "CANCELLED";
  return null; // any other status → no notification
}

// ── Moroccan phone normalization ──────────────────────────────────────────────
//   06XXXXXXXX  → 2126XXXXXXXX
//   07XXXXXXXX  → 2127XXXXXXXX
//   +212XXXXXXXX → 212XXXXXXXX
//   212XXXXXXXX → unchanged
// Returns null for anything that isn't a plausible MA mobile number.
function normalizeMoroccoPhone(raw) {
  if (!raw) return null;
  let p = String(raw).trim().replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(p)) return null;

  if (p.startsWith("212")) {
    // already international
  } else if ((p.startsWith("06") || p.startsWith("07")) && p.length === 10) {
    p = "212" + p.slice(1);            // drop the leading 0
  } else if ((p.startsWith("6") || p.startsWith("7")) && p.length === 9) {
    p = "212" + p;                     // missing leading 0
  } else {
    return null;
  }

  return /^212[67]\d{8}$/.test(p) ? p : null;
}

// ── Sent-state ────────────────────────────────────────────────────────────────
// Read in both modes (dedupe planning); written ONLY after a successful live send.
function loadSent() {
  try { return JSON.parse(fs.readFileSync(SENT_FILE, "utf8")); }
  catch { return {}; }
}
function saveSent(sent) {
  fs.writeFileSync(SENT_FILE, JSON.stringify(sent, null, 2));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Read-only query: REAL orders updated within the lookback window.
// Excludes abandoned-cart / draft rows (paymentDetails.isDraft = true, or a
// "draft_" sessionId) so paniers never receive order notifications.
async function fetchRecentOrders(pool) {
  const res = await pool.query(
    `SELECT id, "customerName", "customerPhone", status, "updatedAt",
            "paymentMethod", "paymentStatus", "paymentTotal", "paymentDetails", "shippingAddress"
       FROM orders
      WHERE "updatedAt" >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'
        AND COALESCE(("paymentDetails"->>'isDraft'), 'false') <> 'true'
        AND ("sessionId" IS NULL OR "sessionId" NOT LIKE 'draft\\_%')
      ORDER BY "updatedAt" DESC`
  );
  return res.rows;
}

// Read-only: order line items for the given order ids, grouped by orderId.
// Returns { [orderId]: ["Title x2", ...] } built from productSnapshot.title.
async function fetchOrderItems(pool, orderIds) {
  const ids = (orderIds || []).filter(Boolean);
  if (!ids.length) return {};
  const res = await pool.query(
    `SELECT "orderId", quantity, "productSnapshot"
       FROM order_items
      WHERE "orderId" = ANY($1)`,
    [ids]
  );
  const byOrder = {};
  for (const r of res.rows) {
    const snap = r.productSnapshot && typeof r.productSnapshot === "object" ? r.productSnapshot : {};
    const title = String(snap.title || snap.name || "Produit").trim();
    const qty = Number(r.quantity) || 1;
    (byOrder[r.orderId] = byOrder[r.orderId] || []).push(`${title} x${qty}`);
  }
  return byOrder;
}

// ── Abandoned carts (fully separate from real orders) ─────────────────────────
// Read-only: paniers not recovered, idle for >= ABANDONED_DELAY_MIN, within window.
async function fetchAbandonedCarts(pool) {
  const res = await pool.query(
    `SELECT id, phone, "fullName", city, items, "cartTotal", "updatedAt"
       FROM abandoned_carts
      WHERE recovered = false
        AND "updatedAt" <= NOW() - INTERVAL '${ABANDONED_DELAY_MIN} minutes'
        AND "updatedAt" >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'
      ORDER BY "updatedAt" DESC`
  );
  return res.rows;
}

// Separate dedupe store for abandoned reminders (keyed by cart id, send-once).
function loadAbandoned() {
  try { return JSON.parse(fs.readFileSync(ABANDONED_SENT_FILE, "utf8")); }
  catch { return {}; }
}
function saveAbandoned(x) {
  fs.writeFileSync(ABANDONED_SENT_FILE, JSON.stringify(x, null, 2));
}

const fmtMoney = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? `${Math.round(n)} MAD` : "";
};

// ── Editable message templates (from the `settings` store) ────────────────────
// Read via raw pg from settings.data.templates (+ .abandonedTemplate); falls back
// to built-in defaults. Variables:
//   {name} {products} {total} {shipping} {payment} {status} {checkoutLink} {orderId}
const DEFAULT_TEMPLATES = {
  NEW: `Salam {name} 👋

Wsalna talab dyalk ✅

📦 Produit: {products}
💰 Total: {total}
🚚 Livraison: {shipping}
💳 Paiement: {payment}

Ghadi nraj3o lik bach n2akdo talab.`,
  CONFIRMED: `Salam {name} 👋

Talab dyalk t2akkad ✅

📦 Produit: {products}
💰 Total: {total}
🚚 Livraison: {shipping}
💳 Paiement: {payment}

Ghadi nوجدوه ونرسلوا ليك التفاصيل.`,
  SHIPPED: `Salam {name} 👋

Talab dyalk خرج للتوصيل 🚚

📦 Produit: {products}
💰 Total: {total}
🚚 Livraison: {shipping}

غادي يوصلك قريبا.`,
  DELIVERED: `Salam {name} 👋

Talab dyalk توصل ✅

📦 Produit: {products}
💰 Total: {total}

شكراً، نتمنى المنتج يعجبك 🙏`,
  CANCELLED: `Salam {name} 👋

تم إلغاء طلبك ❌

📦 Produit: {products}
💰 Total: {total}
📊 Statut: {status}`,
};

const DEFAULT_ABANDONED_TEMPLATE = `Salam {name} 👋

La7dna belli khlliti panier dyalk w makmltich commande.

📦 Produit: {products}
💰 Total: {total}
🚚 Livraison: {shipping}
🔗 Lien: {checkoutLink}

Wash mazal mahtam nkmlouha lik? Wla nlghiwha?`;

let templates = { ...DEFAULT_TEMPLATES };
let abandonedTemplate = DEFAULT_ABANDONED_TEMPLATE;

async function loadTemplates(pool) {
  try {
    const res = await pool.query(`SELECT data FROM settings WHERE id = 'whatsapp-bot' LIMIT 1`);
    const data = (res.rows[0] && res.rows[0].data) || {};
    const t = data.templates || {};
    templates = {
      NEW:       t.NEW       || DEFAULT_TEMPLATES.NEW,
      CONFIRMED: t.CONFIRMED || DEFAULT_TEMPLATES.CONFIRMED,
      SHIPPED:   t.SHIPPED   || DEFAULT_TEMPLATES.SHIPPED,
      DELIVERED: t.DELIVERED || DEFAULT_TEMPLATES.DELIVERED,
      CANCELLED: t.CANCELLED || DEFAULT_TEMPLATES.CANCELLED,
    };
    abandonedTemplate = (typeof data.abandonedTemplate === "string" && data.abandonedTemplate.trim())
      ? data.abandonedTemplate
      : DEFAULT_ABANDONED_TEMPLATE;
  } catch (e) {
    warn("Could not load templates from settings; using defaults:", e.message);
  }
}

function renderTemplate(tpl, vars) {
  const v = vars || {};
  return String(tpl || "")
    .split("{name}").join(v.name || "")
    .split("{products}").join(v.products || "")
    .split("{total}").join(v.total || "")
    .split("{shipping}").join(v.shipping || "")
    .split("{payment}").join(v.payment || "")
    .split("{status}").join(v.status || "")
    .split("{checkoutLink}").join(v.checkoutLink || "")
    .split("{orderId}").join(v.orderId || "");
}

// Build a real-order message: rich details from the order row + line items.
function buildOrderMessage(o, state, itemsByOrder) {
  const pd = o.paymentDetails && typeof o.paymentDetails === "object" ? o.paymentDetails : {};
  const items = (itemsByOrder && itemsByOrder[o.id]) || [];
  const products = items.length ? items.join(", ") : "—";
  const total = fmtMoney(o.paymentTotal != null ? o.paymentTotal : pd.total) || "—";
  const shipping = String(pd.shippingCompany || o.paymentMethod || "—").trim() || "—";
  const payment = String(o.paymentStatus || pd.paymentMethod || o.paymentMethod || "—").trim() || "—";
  const name = String(o.customerName || "").trim();
  return renderTemplate(templates[state], {
    name, products, total, shipping, payment,
    status: state, orderId: o.id, checkoutLink: `${SITE_URL}/cart`,
  });
}

// Build an abandoned-cart reminder: never claims an order was received.
// Shipping falls back to the cart city when no company is known.
function buildAbandonedMessage(cart) {
  const items = Array.isArray(cart.items) ? cart.items : [];
  const products = items.length
    ? items.map((i) => `${String((i && (i.title || i.name)) || "Produit").trim()} x${Number(i && i.quantity) || 1}`).join(", ")
    : "—";
  const total = fmtMoney(cart.cartTotal) || "—";
  const shipping = String(cart.city || "—").trim() || "—";
  const name = String(cart.fullName || "").trim();
  return renderTemplate(abandonedTemplate, {
    name, products, total, shipping,
    payment: "", status: "", orderId: "",
    checkoutLink: `${SITE_URL}/cart`,
  });
}

function recordMessage(entry) {
  messageHistory.push({ ts: new Date().toISOString(), ...entry });
  if (messageHistory.length > MSG_HISTORY_MAX) messageHistory.shift();
}

// Statistics for the admin panel: "today"/"this week" from the persistent
// sent-state file; failed/pending/history from in-memory counters.
function computeStats() {
  const sent = loadSent();
  const now = Date.now();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  let sentToday = 0, sentWeek = 0;
  for (const v of Object.values(sent)) {
    const time = new Date(v).getTime();
    if (!Number.isFinite(time)) continue;
    if (time >= startOfToday.getTime()) sentToday++;
    if (time >= now - 7 * 864e5) sentWeek++;
  }
  return {
    sentToday, sentWeek,
    pending: stats.pending,
    failed:  stats.failedTotal,
    lastMessages: messageHistory.slice(-100).reverse(),
  };
}

// ── Main dispatcher ────────────────────────────────────────────────────────────
async function main() {
  if (!DRY_RUN && !SEND) {
    console.log("Usage: node scripts/whatsapp-order-bot.js --dry-run | --send");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    log("ERROR: DATABASE_URL is not set (checked .env and environment). Aborting.");
    process.exit(1);
  }
  // If both flags are passed, dry-run wins (safe).
  if (DRY_RUN) return runDryRun();
  return runSend();
}

// ── Dry-run (unchanged behavior — no WhatsApp, no sends, no state written) ─────
async function runDryRun() {
  log(`DRY-RUN start — planning notifications for orders updated in the last ${LOOKBACK_DAYS} days.`);
  log("No WhatsApp connection. No messages sent. No state written.");

  const sent = loadSent();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let rows;
  try {
    rows = await fetchRecentOrders(pool);
  } catch (err) {
    log("ERROR: failed to query database:", err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }

  log(`orders checked: ${rows.length}`);

  let wouldSend = 0, duplicates = 0, invalidPhone = 0, ignoredStatus = 0;

  for (const o of rows) {
    const state = mapStatus(o.status);
    if (!state) { ignoredStatus++; continue; }

    const phone = normalizeMoroccoPhone(o.customerPhone);
    if (!phone) {
      invalidPhone++;
      log(`invalid phone     | order ${o.id} | ${o.status} | "${o.customerPhone ?? ""}"`);
      continue;
    }

    const key = `${o.id}:${state}`;
    if (sent[key]) {
      duplicates++;
      log(`skipped duplicate | order ${o.id} | ${state}`);
      continue;
    }

    const name = String(o.customerName || "").trim();
    const msg  = MESSAGES[state](name);
    wouldSend++;
    log(`WOULD SEND        | order ${o.id} | ${state} | ${phone} | "${msg}"`);
    // Dry-run: intentionally do NOT record this as sent.
  }

  log(`summary: wouldSend=${wouldSend} duplicates=${duplicates} invalidPhone=${invalidPhone} ignoredStatus=${ignoredStatus}`);
  log("DRY-RUN complete.");

  await pool.end().catch(() => {});
}

// ── Localhost control API ─────────────────────────────────────────────────────
// Bound to 127.0.0.1 only and gated by WA_BOT_CONTROL_TOKEN. Never serves the
// WhatsApp session files — only ephemeral status/QR/log/stat state. POST actions
// control the WhatsApp *client* lifecycle inside this (always-on) process.
function startControlServer() {
  if (!CONTROL_TOKEN) {
    log("Control API disabled: WA_BOT_CONTROL_TOKEN is not set (nothing exposed).");
    return;
  }
  const http = require("http");
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");

    // Token check (constant header, localhost-only listener).
    if ((req.headers["x-bot-token"] || "") !== CONTROL_TOKEN) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const url = (req.url || "").split("?")[0];

    if (req.method === "GET") {
      if (url === "/status")   { res.writeHead(200); res.end(JSON.stringify({ ...botState })); return; }
      if (url === "/qr") {
        const showing = botState.state === "qr";
        res.writeHead(200);
        res.end(JSON.stringify({
          state:   botState.state,
          qr:      showing ? qrState.qr      : null,
          ascii:   showing ? qrState.ascii   : null,
          dataUrl: showing ? qrState.dataUrl : null,
          at:      qrState.at,
        }));
        return;
      }
      if (url === "/logs")     { res.writeHead(200); res.end(JSON.stringify({ logs: logBuffer.slice(-200) })); return; }
      if (url === "/stats")    { res.writeHead(200); res.end(JSON.stringify(computeStats())); return; }
      if (url === "/messages") { res.writeHead(200); res.end(JSON.stringify({ messages: messageHistory.slice(-100).reverse() })); return; }
      res.writeHead(404); res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on("end", () => {
        let payload = {};
        try { payload = body ? JSON.parse(body) : {}; } catch {}
        handleControlPost(url, payload)
          .then((out) => { res.writeHead(out.status || 200); res.end(JSON.stringify(out.body || { ok: true })); })
          .catch((e) => { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e?.message ?? String(e) })); });
      });
      return;
    }

    res.writeHead(405); res.end(JSON.stringify({ error: "method not allowed" }));
  });

  server.on("error", (e) => errl("Control API error:", e.message));
  server.listen(CONTROL_PORT, "127.0.0.1", () => {
    log(`Control API listening on http://127.0.0.1:${CONTROL_PORT} (localhost only).`);
  });
}

// POST action dispatcher (start/stop/restart/reconnect/logout/clear-logs/send-test).
async function handleControlPost(url, payload) {
  switch (url) {
    case "/start":      return controlStart();
    case "/stop":       return controlStop();
    case "/restart":    return controlRestart();
    case "/reconnect":  return controlRestart();
    case "/logout":     return controlLogout();
    case "/clear-logs": logBuffer.length = 0; log("Logs cleared from admin panel."); return { body: { ok: true } };
    case "/send-test":  return controlSendTest(payload);
    default:            return { status: 404, body: { ok: false, error: "not found" } };
  }
}

// ── WhatsApp client lifecycle ─────────────────────────────────────────────────
function buildClient() {
  const client = new _wa.Client({
    authStrategy: new _wa.LocalAuth({ clientId: "order-bot" }),
    puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  });

  client.on("qr", async (qr) => {
    _wa.qrcode.generate(qr, { small: true }); // terminal QR
    _wa.qrcode.generate(qr, { small: true }, (ascii) => { qrState.ascii = ascii; }); // admin panel (fallback)
    qrState.qr = qr;
    qrState.at = new Date().toISOString();
    if (_wa.QRCode) {
      try { qrState.dataUrl = await _wa.QRCode.toDataURL(qr, { width: 350, margin: 2 }); }
      catch { qrState.dataUrl = null; }
    }
    setState("qr");
    log("QR ready — scan it in WhatsApp → Linked Devices, or from the Admin panel.");
  });
  client.on("authenticated", () => { setState("authenticated"); log("WhatsApp authenticated — session saved (LocalAuth)."); });
  client.on("auth_failure", (m) => { setState("auth_failure", m); errl("WhatsApp auth failure:", m); });
  client.on("disconnected", (r) => { setState("disconnected", r); warn("WhatsApp disconnected:", r); });
  client.on("ready", () => {
    qrState.qr = null;
    qrState.ascii = null;
    qrState.dataUrl = null;
    botState.number = (client.info && client.info.wid && client.info.wid.user) || null;
    botState.connectedSince = new Date().toISOString();
    setState("ready");
    touchActivity();
    log("WhatsApp connected.");
    scheduleCycle(0);
  });

  return client;
}

// ── Control actions (WhatsApp client lifecycle inside the running process) ─────
async function controlStart() {
  if (waClient) return { body: { ok: true, note: "already running" } };
  setState("starting");
  waClient = buildClient();
  waClient.initialize();
  log("Bot start requested (WhatsApp client initializing).");
  return { body: { ok: true } };
}

async function controlStop() {
  clearTimeout(pollTimer); pollTimer = null;
  if (waClient) { try { await waClient.destroy(); } catch {} waClient = null; }
  setState("disconnected");
  botState.number = null; botState.connectedSince = null;
  log("Bot stop requested (WhatsApp client stopped; process stays alive).");
  return { body: { ok: true } };
}

async function controlRestart() {
  await controlStop();
  return controlStart();
}

async function controlLogout() {
  clearTimeout(pollTimer); pollTimer = null;
  if (waClient) {
    try { await waClient.logout(); } catch {}
    try { await waClient.destroy(); } catch {}
    waClient = null;
  }
  // Delete the LocalAuth session so the next start requires a fresh QR.
  try {
    fs.rmSync(path.join(process.cwd(), ".wwebjs_auth"), { recursive: true, force: true });
    log("WhatsApp session logged out and LocalAuth session deleted.");
  } catch (e) {
    warn("Could not delete LocalAuth dir:", e.message);
  }
  setState("disconnected");
  botState.number = null; botState.connectedSince = null;
  return { body: { ok: true } };
}

// Prefer a real c.us chat id for Moroccan numbers. getNumberId may return a
// LID (@lid) that does not deliver — in that case fall back to <phone>@c.us.
function resolveChatId(normalized, numberId) {
  const ser = numberId && numberId._serialized;
  if (ser && ser.endsWith("@c.us")) return ser;
  return `${normalized}@c.us`;
}

// Poll the message ack for up to `timeoutMs`. ack >= 1 means WhatsApp's server
// acknowledged/delivered the message. Returns the latest ack seen.
async function waitForAck(client, chatId, messageId, initialAck, timeoutMs = 15000) {
  let ack = typeof initialAck === "number" ? initialAck : 0;
  if (!messageId) return ack;
  const start = Date.now();
  while (ack < 1 && Date.now() - start < timeoutMs) {
    await sleep(1500);
    let fresh = null;
    try { fresh = await client.getMessageById(messageId); } catch {}
    if (!fresh) {
      try {
        const chat = await client.getChatById(chatId);
        const msgs = await chat.fetchMessages({ limit: 10 });
        fresh = msgs.find((m) => (m.id && (m.id._serialized || m.id.id)) === messageId) || null;
      } catch {}
    }
    if (fresh && typeof fresh.ack === "number") ack = fresh.ack;
  }
  return ack;
}

// Send a one-off test message with full delivery diagnostics.
// Never writes the sent-state file (no dedupe entry).
async function controlSendTest(payload) {
  const diag = { timestamp: new Date().toISOString(), botState: botState.state };

  // client.getState() + client.info (logged and returned).
  try { diag.clientState = waClient ? await waClient.getState() : "no-client"; }
  catch (e) { diag.clientState = `getState error: ${e?.message ?? e}`; }
  try {
    diag.clientInfo = (waClient && waClient.info)
      ? { wid: waClient.info.wid && waClient.info.wid._serialized, pushname: waClient.info.pushname, platform: waClient.info.platform }
      : null;
  } catch { diag.clientInfo = null; }

  if (!waClient || botState.state !== "ready") {
    return { status: 409, body: { ok: false, error: "WhatsApp not connected", diagnostics: diag } };
  }

  const normalized = normalizeMoroccoPhone(payload && payload.phone);
  diag.normalizedPhone = normalized;
  if (!normalized) return { status: 400, body: { ok: false, error: "invalid phone", diagnostics: diag } };

  const text = String((payload && payload.message) || "").trim();
  if (!text) return { status: 400, body: { ok: false, error: "empty message", diagnostics: diag } };

  try {
    // 1. Verify the destination is a registered WhatsApp number.
    const numberId = await waClient.getNumberId(normalized);
    diag.getNumberId = numberId
      ? { server: numberId.server, user: numberId.user, _serialized: numberId._serialized }
      : null;

    if (!numberId) {
      recordMessage({ orderId: "TEST", state: "TEST", phone: normalized, result: "failed", error: "not on WhatsApp" });
      warn(`test send rejected | ${normalized} | not registered on WhatsApp | state=${diag.clientState}`);
      return { status: 422, body: { ok: false, error: "This number is not registered on WhatsApp.", diagnostics: diag } };
    }

    // Prefer c.us; if getNumberId returned a LID, send to <phone>@c.us instead.
    diag.getNumberIdSerialized = numberId._serialized;
    const chatId = resolveChatId(normalized, numberId);
    diag.chatIdAttempted = chatId;

    // 2. Send.
    const sent = await waClient.sendMessage(chatId, text);
    const messageId = (sent && sent.id && (sent.id._serialized || sent.id.id)) || null;
    const initialAck = sent && typeof sent.ack === "number" ? sent.ack : 0;
    diag.messageId = messageId;
    diag.sent = {
      ack:       initialAck,
      fromMe:    sent ? sent.fromMe : undefined,
      to:        (sent && sent.to && (sent.to._serialized || sent.to)) || null,
      timestamp: sent ? sent.timestamp : null,
    };

    // 3. Wait up to 15s for the ack to reach >= 1 (server acknowledged/delivered).
    const finalAck = await waitForAck(waClient, chatId, messageId, initialAck, 15000);
    diag.finalAck = finalAck;

    log(`test send | phone=${normalized} chatId=${chatId} id=${messageId} initialAck=${initialAck} finalAck=${finalAck} state=${diag.clientState}`);

    // 4. Success only if a message id exists AND ack >= 1.
    if (!messageId || finalAck < 1) {
      stats.failedTotal++;
      recordMessage({ orderId: "TEST", state: "TEST", phone: normalized, result: "failed", error: `ack=${finalAck}`, messageId });
      errl(`test send NOT acknowledged | ${normalized} | chatId=${chatId} ack=${finalAck}`);
      return { status: 502, body: { ok: false, error: "Message created but not acknowledged by WhatsApp.", diagnostics: diag } };
    }

    touchActivity();
    recordMessage({ orderId: "TEST", state: "TEST", phone: normalized, result: "sent", messageId });
    log(`test message acknowledged | ${normalized} | chatId=${chatId} id=${messageId} ack=${finalAck}`);
    return { body: { ok: true, phone: normalized, messageId, ack: finalAck, chatId, diagnostics: diag } };
  } catch (e) {
    stats.failedTotal++;
    recordMessage({ orderId: "TEST", state: "TEST", phone: normalized, result: "failed", error: e?.message });
    errl(`test send failed | ${normalized} | ${e?.message ?? e}`);
    diag.error = e?.message ?? String(e);
    return { status: 502, body: { ok: false, error: e?.message ?? String(e), diagnostics: diag } };
  }
}

// ── Live send ───────────────────────────────────────────────────────────────
async function runSend() {
  try {
    ({ Client: _wa.Client, LocalAuth: _wa.LocalAuth } = require("whatsapp-web.js"));
    _wa.qrcode = require("qrcode-terminal");
    try { _wa.QRCode = require("qrcode"); } catch { _wa.QRCode = null; } // image QR (optional)
  } catch {
    errl("ERROR: whatsapp-web.js / qrcode-terminal are not installed.");
    errl("Install them first:  npm install whatsapp-web.js qrcode-terminal");
    process.exit(1);
  }

  log("LIVE SEND mode — connecting to WhatsApp. Each order+status message is sent once.");
  setState("starting");
  startControlServer();
  dbPool = new Pool({ connectionString: process.env.DATABASE_URL });

  waClient = buildClient();

  process.on("SIGINT", async () => {
    log("Shutting down…");
    clearTimeout(pollTimer);
    try { if (waClient) await waClient.destroy(); } catch {}
    try { if (dbPool)   await dbPool.end();   } catch {}
    process.exit(0);
  });

  waClient.initialize();
}

// ── Poll cycle (module-scoped; templates loaded live each cycle) ──────────────
function scheduleCycle(delay = 60000) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(runCycle, delay);
}

async function runCycle() {
  // Prevent overlapping cycles — the in-flight cycle reschedules itself.
  if (isSending) return;

  // Only ever send when the WhatsApp client is truly READY.
  if (!waClient || botState.state !== "ready") {
    if (lastSkipState !== botState.state) {
      log(`waiting — not sending while WhatsApp state is "${botState.state}".`);
      lastSkipState = botState.state;
    }
    scheduleCycle();
    return;
  }
  lastSkipState = null;

  isSending = true;
  try {
    await loadTemplates(dbPool);
    // Two fully separate workflows: real orders, then abandoned carts.
    // Each keeps its own query, dedupe file, baseline, and templates.
    await processOrders();
    await sendAbandonedReminders();
  } catch (e) {
    errl("ERROR during send cycle:", e?.message ?? e);
  } finally {
    isSending = false;
    scheduleCycle();
  }
}

// ── Workflow 1: REAL orders ───────────────────────────────────────────────────
async function processOrders() {
  // First-run baseline: on the very first run (no sent-state file yet) mark every
  // existing order+status as already seen and send NOTHING. Stops the backlog
  // blast to old pending orders. After baseline, only genuinely new orders or
  // future status changes produce a message.
  const firstRun = !fs.existsSync(SENT_FILE);
  const sent = loadSent();
  const rows = await fetchRecentOrders(dbPool);
  touchActivity();

  if (firstRun) {
    let n = 0;
    for (const o of rows) {
      const state = mapStatus(o.status);
      if (!state) continue;
      sent[`${o.id}:${state}`] = new Date().toISOString();
      n++;
    }
    saveSent(sent);
    log(`baseline created: ${n} existing order state(s) marked as seen — no messages sent on first run.`);
    return;
  }

  log(`orders checked: ${rows.length}`);

  const eligible = [];
  let duplicates = 0, invalidPhone = 0, ignoredStatus = 0;

  for (const o of rows) {
    const state = mapStatus(o.status);
    if (!state) { ignoredStatus++; continue; }

    const phone = normalizeMoroccoPhone(o.customerPhone);
    if (!phone) {
      invalidPhone++;
      warn(`invalid phone     | order ${o.id} | ${o.status} | "${o.customerPhone ?? ""}"`);
      continue;
    }

    const key = `${o.id}:${state}`;
    if (sent[key]) { duplicates++; continue; } // already seen/sent → quiet skip

    eligible.push({ o, state, phone, key });
  }

  stats.pending = eligible.length;
  log(`eligible=${eligible.length} duplicates=${duplicates} invalidPhone=${invalidPhone} ignoredStatus=${ignoredStatus}`);

  // One grouped fetch of line items to fill {products} for all eligible orders.
  const itemsByOrder = await fetchOrderItems(dbPool, eligible.map((e) => e.o.id));

  for (let i = 0; i < eligible.length; i++) {
    const e = eligible[i];
    // Re-check readiness before EVERY send (client can drop mid-cycle).
    if (!waClient || botState.state !== "ready") {
      warn("aborting send cycle — WhatsApp is no longer ready.");
      break;
    }
    const chatId = `${e.phone}@c.us`; // prefer c.us for Moroccan numbers
    const body = buildOrderMessage(e.o, e.state, itemsByOrder);
    try {
      const msg = await waClient.sendMessage(chatId, body);
      const messageId = (msg && msg.id && (msg.id._serialized || msg.id.id)) || null;
      const initialAck = msg && typeof msg.ack === "number" ? msg.ack : 0;
      // Mark as sent immediately to preserve "send once" (never resend/spam).
      sent[e.key] = new Date().toISOString();
      saveSent(sent);
      touchActivity();
      // Wait up to 15s for the ack to confirm delivery.
      const finalAck = await waitForAck(waClient, chatId, messageId, initialAck, 15000);
      if (finalAck >= 1) {
        stats.sentTotal++;
        recordMessage({ orderId: e.o.id, state: e.state, phone: e.phone, result: "sent", messageId });
        log(`message sent      | order ${e.o.id} | ${e.state} | chatId=${chatId} ack=${finalAck}`);
      } else {
        stats.failedTotal++;
        recordMessage({ orderId: e.o.id, state: e.state, phone: e.phone, result: "failed", error: `ack=${finalAck}`, messageId });
        warn(`not acknowledged  | order ${e.o.id} | ${e.state} | chatId=${chatId} ack=${finalAck}`);
      }
    } catch (err) {
      stats.failedTotal++;
      recordMessage({ orderId: e.o.id, state: e.state, phone: e.phone, result: "failed", error: err?.message });
      errl(`failed send       | order ${e.o.id} | ${e.state} | chatId=${chatId} | ${err?.message ?? err}`);
    }
    stats.pending = eligible.length - (i + 1);
    // Safe pacing between messages (20–40s).
    await sleep(20000 + Math.floor(Math.random() * 20000));
  }
  stats.pending = 0;
}

// ── Workflow 2: ABANDONED carts (separate query/dedupe/templates) ─────────────
async function sendAbandonedReminders() {
  let carts;
  try {
    carts = await fetchAbandonedCarts(dbPool);
  } catch (e) {
    errl("abandoned query failed:", e?.message ?? e);
    return;
  }

  // First-run baseline for abandoned carts too: mark all currently-eligible
  // carts as reminded and send NOTHING (no backlog blast).
  const firstRun = !fs.existsSync(ABANDONED_SENT_FILE);
  const sentAb = loadAbandoned();

  if (firstRun) {
    let n = 0;
    for (const c of carts) { sentAb[c.id] = new Date().toISOString(); n++; }
    saveAbandoned(sentAb);
    log(`abandoned baseline: ${n} existing cart(s) marked as reminded — no reminders sent on first run.`);
    return;
  }

  const pending = carts.filter((c) => !sentAb[c.id]);
  log(`abandoned eligible=${carts.length} toRemind=${pending.length}`);

  for (const c of pending) {
    // Re-check readiness before EVERY send (client can drop mid-cycle).
    if (!waClient || botState.state !== "ready") {
      warn("aborting abandoned reminders — WhatsApp is no longer ready.");
      break;
    }
    const phone = normalizeMoroccoPhone(c.phone);
    if (!phone) {
      // Cannot ever deliver — mark reminded so we don't re-check every cycle.
      warn(`abandoned invalid phone | cart ${c.id} | "${c.phone ?? ""}"`);
      sentAb[c.id] = new Date().toISOString();
      saveAbandoned(sentAb);
      continue;
    }
    const chatId = `${phone}@c.us`;
    const body = buildAbandonedMessage(c);
    try {
      const msg = await waClient.sendMessage(chatId, body);
      const messageId = (msg && msg.id && (msg.id._serialized || msg.id.id)) || null;
      const initialAck = msg && typeof msg.ack === "number" ? msg.ack : 0;
      // Mark reminded immediately — one reminder per cart, ever.
      sentAb[c.id] = new Date().toISOString();
      saveAbandoned(sentAb);
      touchActivity();
      const finalAck = await waitForAck(waClient, chatId, messageId, initialAck, 15000);
      if (finalAck >= 1) {
        stats.sentTotal++;
        recordMessage({ orderId: c.id, state: "ABANDONED", phone, result: "sent", messageId });
        log(`abandoned sent    | cart ${c.id} | chatId=${chatId} ack=${finalAck}`);
      } else {
        stats.failedTotal++;
        recordMessage({ orderId: c.id, state: "ABANDONED", phone, result: "failed", error: `ack=${finalAck}`, messageId });
        warn(`abandoned no ack  | cart ${c.id} | chatId=${chatId} ack=${finalAck}`);
      }
    } catch (err) {
      stats.failedTotal++;
      recordMessage({ orderId: c.id, state: "ABANDONED", phone, result: "failed", error: err?.message });
      errl(`abandoned failed  | cart ${c.id} | chatId=${chatId} | ${err?.message ?? err}`);
    }
    // Safe pacing between messages (20–40s).
    await sleep(20000 + Math.floor(Math.random() * 20000));
  }
}

// Run as a CLI, but also expose the pure helpers so the mapping / phone
// normalization can be unit-checked without a live database.
if (require.main === module) {
  main().catch((e) => {
    log("FATAL:", e?.message ?? e);
    process.exit(1);
  });
}

module.exports = { mapStatus, normalizeMoroccoPhone, MESSAGES };
