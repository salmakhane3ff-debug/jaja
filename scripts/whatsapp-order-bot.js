#!/usr/bin/env node
/**
 * scripts/whatsapp-order-bot.js — Phase 2 (DRY-RUN ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * Plans WhatsApp order-status notifications WITHOUT sending anything.
 *
 * This phase intentionally has NO WhatsApp dependency, NO Puppeteer, and does
 * NOT write any state. It is read-only against the store database and prints
 * exactly which messages *would* be sent, which are duplicates, and which have
 * invalid phones — so the mapping/normalization/dedupe can be validated safely.
 *
 * Usage:
 *   node scripts/whatsapp-order-bot.js --dry-run
 *
 * Later phases will add whatsapp-web.js + a --send mode. `--send` is a no-op here.
 *
 * Reads: DATABASE_URL (from .env). Never writes to the `orders` table.
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

// ── Logging ─────────────────────────────────────────────────────────────────
const ts  = () => new Date().toISOString();
const log = (...a) => console.log(`[${ts()}]`, ...a);

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

// ── Sent-state (read-only in dry-run) ─────────────────────────────────────────
function loadSent() {
  try { return JSON.parse(fs.readFileSync(SENT_FILE, "utf8")); }
  catch { return {}; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (SEND) {
    log("Live send mode is NOT enabled in this phase (Phase 2 = dry-run only). Use --dry-run.");
    process.exit(0);
  }
  if (!DRY_RUN) {
    console.log("Usage: node scripts/whatsapp-order-bot.js --dry-run");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    log("ERROR: DATABASE_URL is not set (checked .env and environment). Aborting.");
    process.exit(1);
  }

  log(`DRY-RUN start — planning notifications for orders updated in the last ${LOOKBACK_DAYS} days.`);
  log("No WhatsApp connection. No messages sent. No state written.");

  const sent = loadSent();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let rows;
  try {
    const res = await pool.query(
      `SELECT id, "customerName", "customerPhone", status, "updatedAt"
         FROM orders
        WHERE "updatedAt" >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'
        ORDER BY "updatedAt" DESC`
    );
    rows = res.rows;
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

// Run as a CLI, but also expose the pure helpers so the mapping / phone
// normalization can be unit-checked without a live database.
if (require.main === module) {
  main().catch((e) => {
    log("FATAL:", e?.message ?? e);
    process.exit(1);
  });
}

module.exports = { mapStatus, normalizeMoroccoPhone, MESSAGES };
