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
const LOOKBACK_DAYS = 7;

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
    `SELECT id, "customerName", "customerPhone", status, "updatedAt"
       FROM orders
      WHERE "updatedAt" >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'
        AND COALESCE(("paymentDetails"->>'isDraft'), 'false') <> 'true'
        AND ("sessionId" IS NULL OR "sessionId" NOT LIKE 'draft\\_%')
      ORDER BY "updatedAt" DESC`
  );
  return res.rows;
}

// ── Editable message templates (from the `settings` store) ────────────────────
// Read via raw pg from settings.data.templates; falls back to built-in defaults.
// Variables: {name}, {orderId}, {status}.
const DEFAULT_TEMPLATES = {
  NEW:       "Salam {name}, waslna talab dyalk. Ghadi nraj3o lik bach n2akdo talab.",
  CONFIRMED: "Salam {name}, talab dyalk t2akkad. Ghadi nوجدوه ونرسلوا ليك التفاصيل.",
  SHIPPED:   "Talab dyalk خرج للتوصيل.",
  DELIVERED: "شكراً، نتمنى الطلب يكون عجبك.",
  CANCELLED: "تم إلغاء طلبك.",
};
let templates = { ...DEFAULT_TEMPLATES };

async function loadTemplates(pool) {
  try {
    const res = await pool.query(`SELECT data FROM settings WHERE id = 'whatsapp-bot' LIMIT 1`);
    const t = (res.rows[0] && res.rows[0].data && res.rows[0].data.templates) || {};
    templates = {
      NEW:       t.NEW       || DEFAULT_TEMPLATES.NEW,
      CONFIRMED: t.CONFIRMED || DEFAULT_TEMPLATES.CONFIRMED,
      SHIPPED:   t.SHIPPED   || DEFAULT_TEMPLATES.SHIPPED,
      DELIVERED: t.DELIVERED || DEFAULT_TEMPLATES.DELIVERED,
      CANCELLED: t.CANCELLED || DEFAULT_TEMPLATES.CANCELLED,
    };
  } catch (e) {
    warn("Could not load templates from settings; using defaults:", e.message);
  }
}

function renderTemplate(tpl, vars) {
  return String(tpl || "")
    .split("{name}").join(vars.name || "")
    .split("{orderId}").join(vars.orderId || "")
    .split("{status}").join(vars.status || "");
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

// Send a one-off test message. Never writes the sent-state file (no dedupe entry).
async function controlSendTest(payload) {
  if (!waClient || botState.state !== "ready") return { status: 409, body: { ok: false, error: "WhatsApp not connected" } };
  const normalized = normalizeMoroccoPhone(payload && payload.phone);
  if (!normalized) return { status: 400, body: { ok: false, error: "invalid phone" } };
  const text = String((payload && payload.message) || "").trim();
  if (!text) return { status: 400, body: { ok: false, error: "empty message" } };
  try {
    // Verify the destination is a registered WhatsApp number BEFORE sending.
    const numberId = await waClient.getNumberId(normalized);
    if (!numberId) {
      recordMessage({ orderId: "TEST", state: "TEST", phone: normalized, result: "failed", error: "not on WhatsApp" });
      warn(`test send rejected | ${normalized} | number not registered on WhatsApp`);
      return { status: 422, body: { ok: false, error: "This number is not registered on WhatsApp." } };
    }
    const chatId = numberId._serialized;
    const sent = await waClient.sendMessage(chatId, text);
    const messageId = (sent && sent.id && (sent.id._serialized || sent.id.id)) || null;
    touchActivity();
    recordMessage({ orderId: "TEST", state: "TEST", phone: normalized, result: "sent", messageId });
    log(`test message sent | ${normalized} | id=${messageId ?? "?"}`);
    return { body: { ok: true, phone: normalized, messageId } };
  } catch (e) {
    stats.failedTotal++;
    recordMessage({ orderId: "TEST", state: "TEST", phone: normalized, result: "failed", error: e?.message });
    errl(`test send failed | ${normalized} | ${e?.message ?? e}`);
    return { status: 502, body: { ok: false, error: e?.message ?? String(e) } };
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

    // ── First-run baseline ────────────────────────────────────────────────
    // On the very first run (no sent-state file yet) mark every existing
    // order+status as already seen and send NOTHING. Stops the backlog blast
    // to old pending orders. After baseline, only genuinely new orders or
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
      return; // finally reschedules
    }

    log(`orders checked: ${rows.length}`);

    const actions = [];
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

      const name = String(o.customerName || "").trim();
      const msg  = renderTemplate(templates[state], { name, orderId: o.id, status: state });
      actions.push({ id: o.id, state, phone, key, msg });
    }

    stats.pending = actions.length;
    log(`eligible=${actions.length} duplicates=${duplicates} invalidPhone=${invalidPhone} ignoredStatus=${ignoredStatus}`);

    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      // Re-check readiness before EVERY send (client can drop mid-cycle).
      if (!waClient || botState.state !== "ready") {
        warn("aborting send cycle — WhatsApp is no longer ready.");
        break;
      }
      try {
        await waClient.sendMessage(`${a.phone}@c.us`, a.msg);
        sent[a.key] = new Date().toISOString();
        saveSent(sent); // persist immediately → restart-safe, no duplicates
        stats.sentTotal++;
        touchActivity();
        recordMessage({ orderId: a.id, state: a.state, phone: a.phone, result: "sent" });
        log(`message sent      | order ${a.id} | ${a.state} | ${a.phone}`);
      } catch (e) {
        stats.failedTotal++;
        recordMessage({ orderId: a.id, state: a.state, phone: a.phone, result: "failed", error: e?.message });
        errl(`failed send       | order ${a.id} | ${a.state} | ${a.phone} | ${e?.message ?? e}`);
      }
      stats.pending = actions.length - (i + 1);
      // Safe pacing between messages (20–40s).
      await sleep(20000 + Math.floor(Math.random() * 20000));
    }
    stats.pending = 0;
  } catch (e) {
    errl("ERROR during send cycle:", e?.message ?? e);
  } finally {
    isSending = false;
    scheduleCycle();
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
