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

// In-memory, read-only state surfaced to the admin panel via the control API.
const botState  = { state: "starting", since: new Date().toISOString(), lastError: null };
const qrState   = { qr: null, ascii: null, at: null };
const logBuffer = [];

function setState(s, err) {
  botState.state = s;
  botState.since = new Date().toISOString();
  if (err !== undefined) botState.lastError = err ? String(err) : null;
}

// ── Logging ─────────────────────────────────────────────────────────────────
const ts = () => new Date().toISOString();
function log(...a) {
  const line = `[${ts()}] ${a.map((x) => (typeof x === "string" ? x : String(x))).join(" ")}`;
  console.log(line);
  logBuffer.push(line);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
}

// ── Message templates (exact darija/arabic wording) ───────────────────────────
const MESSAGES = {
  NEW:       (name) => `Salam ${name}, waslna order dyalk. Ghadi nraj3o lik bach n2akdo talab.`,
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

// Read-only query: orders updated within the lookback window.
async function fetchRecentOrders(pool) {
  const res = await pool.query(
    `SELECT id, "customerName", "customerPhone", status, "updatedAt"
       FROM orders
      WHERE "updatedAt" >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'
      ORDER BY "updatedAt" DESC`
  );
  return res.rows;
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

// ── Localhost control API (read-only: status / qr / logs) ─────────────────────
// Bound to 127.0.0.1 only and gated by WA_BOT_CONTROL_TOKEN. Never serves the
// WhatsApp session files — only ephemeral status/QR/log state. No send/control
// endpoints in this phase.
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
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end(JSON.stringify({ error: "method not allowed" }));
      return;
    }

    if (url === "/status") {
      res.writeHead(200);
      res.end(JSON.stringify({ ...botState }));
    } else if (url === "/qr") {
      // Only expose the QR while awaiting a scan; nothing once connected.
      const showing = botState.state === "qr";
      res.writeHead(200);
      res.end(JSON.stringify({
        state: botState.state,
        qr:    showing ? qrState.qr    : null,
        ascii: showing ? qrState.ascii : null,
        at:    qrState.at,
      }));
    } else if (url === "/logs") {
      res.writeHead(200);
      res.end(JSON.stringify({ logs: logBuffer.slice(-200) }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "not found" }));
    }
  });

  server.on("error", (err) => log("Control API error:", err.message));
  server.listen(CONTROL_PORT, "127.0.0.1", () => {
    log(`Control API listening on http://127.0.0.1:${CONTROL_PORT} (localhost only).`);
  });
}

// ── Live send ───────────────────────────────────────────────────────────────
async function runSend() {
  let Client, LocalAuth, qrcode;
  try {
    ({ Client, LocalAuth } = require("whatsapp-web.js"));
    qrcode = require("qrcode-terminal");
  } catch {
    log("ERROR: whatsapp-web.js / qrcode-terminal are not installed.");
    log("Install them first:  npm install whatsapp-web.js qrcode-terminal");
    process.exit(1);
  }

  log("LIVE SEND mode — connecting to WhatsApp. Each order+status message is sent once.");
  setState("starting");
  startControlServer();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const client = new Client({
    // Persistent session — scan the QR only on the first run.
    authStrategy: new LocalAuth({ clientId: "order-bot" }),
    puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  });

  client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true }); // terminal QR
    qrcode.generate(qr, { small: true }, (ascii) => { qrState.ascii = ascii; }); // for the admin panel
    qrState.qr = qr;
    qrState.at = new Date().toISOString();
    setState("qr");
    log("QR ready — scan it in WhatsApp → Linked Devices, or from the Admin panel.");
  });
  client.on("authenticated", () => { setState("authenticated"); log("WhatsApp authenticated — session saved (LocalAuth)."); });
  client.on("auth_failure", (m) => { setState("auth_failure", m); log("WhatsApp auth failure:", m); });
  client.on("disconnected", (r) => { setState("disconnected", r); log("WhatsApp disconnected:", r); });
  client.on("ready", () => {
    qrState.qr = null;
    qrState.ascii = null;
    setState("ready");
    log("WhatsApp connected.");
    sendCycle(client, pool);
  });

  process.on("SIGINT", async () => {
    log("Shutting down…");
    try { await client.destroy(); } catch {}
    try { await pool.end(); } catch {}
    process.exit(0);
  });

  client.initialize();
}

// One poll cycle: query orders, then send eligible messages with a delay between.
async function sendCycle(client, pool) {
  try {
    const sent = loadSent();
    const rows = await fetchRecentOrders(pool);
    log(`orders checked: ${rows.length}`);

    const actions = [];
    let duplicates = 0, invalidPhone = 0, ignoredStatus = 0;

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
      actions.push({ id: o.id, state, phone, key, msg: MESSAGES[state](name) });
    }

    log(`eligible=${actions.length} duplicates=${duplicates} invalidPhone=${invalidPhone} ignoredStatus=${ignoredStatus}`);

    for (const a of actions) {
      try {
        await client.sendMessage(`${a.phone}@c.us`, a.msg);
        sent[a.key] = new Date().toISOString();
        saveSent(sent); // persist immediately → restart-safe, no duplicates
        log(`message sent      | order ${a.id} | ${a.state} | ${a.phone}`);
      } catch (err) {
        log(`failed send       | order ${a.id} | ${a.state} | ${a.phone} | ${err?.message ?? err}`);
      }
      // Safe pacing between messages (20–40s).
      await sleep(20000 + Math.floor(Math.random() * 20000));
    }
  } catch (err) {
    log("ERROR during send cycle:", err?.message ?? err);
  } finally {
    // Poll again in 60s (after the previous cycle fully completes).
    setTimeout(() => sendCycle(client, pool), 60000);
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
