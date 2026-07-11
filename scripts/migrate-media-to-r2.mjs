#!/usr/bin/env node
/**
 * scripts/migrate-media-to-r2.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time migration: move local /uploads/... media referenced by Product.images
 * to Cloudinary, using the EXISTING saveMedia() service, and rewrite the DB URLs.
 *
 *   - scans Product.images (batched, default 20)
 *   - migrates only local /uploads/... entries; skips Cloudinary URLs
 *   - uploads via saveMedia() with a deterministic public_id (idempotent)
 *   - VERIFIES each asset (upload ok + secure_url reachable) BEFORE any DB write
 *   - updates Product.images with the secure_url (order + entry shape preserved)
 *   - writes a JSON ledger (resume + rollback source of truth)
 *   - never deletes or modifies local files
 *
 * Flags:
 *   --dry-run              report only; no uploads, no DB writes, no ledger writes
 *   --batch=N              batch size (default 20)
 *   --limit=N              stop after N products
 *   --product-id=<uuid>    migrate a single product
 *   --ledger=<path>        ledger file (default media-migration-ledger.json)
 *   --folder=<folder>      Cloudinary folder (default shopgold/products)
 *   --rollback             restore old local URLs from the ledger
 *
 * Run on the VPS (NOT here — needs DATABASE_URL + Cloudinary creds):
 *   node --env-file=.env --experimental-detect-module scripts/migrate-media-to-r2.mjs --dry-run
 *   node --env-file=.env --experimental-detect-module scripts/migrate-media-to-r2.mjs --batch=20
 *   node --env-file=.env --experimental-detect-module scripts/migrate-media-to-r2.mjs --rollback
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Force Cloudinary for THIS process only (does not modify .env or the running app).
process.env.MEDIA_STORAGE = 'cloudinary';

import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createLedger, makeAssetMigrator, runMigration, runRollback,
} from './lib/mediaMigration.mjs';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (name, def = null) => {
  const a = argv.find((x) => x.startsWith(name + '='));
  return a ? a.slice(name.length + 1) : def;
};

const DRY_RUN    = has('--dry-run');
const ROLLBACK   = has('--rollback');
const BATCH      = Math.max(1, parseInt(val('--batch', '20'), 10) || 20);
const LIMIT      = val('--limit') != null ? parseInt(val('--limit'), 10) : null;
const PRODUCT_ID = val('--product-id');
const FOLDER     = val('--folder', 'shopgold/products');
const LEDGER_PATH = path.resolve(ROOT, val('--ledger', 'media-migration-ledger.json'));

function abort(msg, err) {
  console.error('✗', msg);
  console.error('  Expected run:  node --env-file=.env --experimental-detect-module scripts/migrate-media-to-r2.mjs [flags]');
  if (err) console.error('   ', err?.message ?? err);
  process.exit(1);
}

async function importDefaultOr(modPath, pickDefault) {
  const mod = await import(pathToFileURL(path.resolve(ROOT, modPath)).href);
  return pickDefault ? mod.default : mod;
}

async function main() {
  // Load the REAL service + Prisma client.
  let svc, prisma;
  try { svc = await importDefaultOr('src/lib/cloudinary.js', false); }
  catch (err) { abort('Could not load src/lib/cloudinary.js', err); }
  if (!svc.isCloudinaryConfigured()) abort('No Cloudinary credentials found (provide them via --env-file=.env).');

  if (!DRY_RUN) {
    try { await svc.verifyConnection(); }
    catch (err) { abort('Cloudinary connection failed — aborting BEFORE any upload.', err); }
  }

  try { prisma = await importDefaultOr('src/lib/prisma.js', true); }
  catch (err) { abort('Could not load src/lib/prisma.js', err); }

  // Ledger with immediate persistence (unless dry-run).
  let ledgerData = {};
  try { if (fs.existsSync(LEDGER_PATH)) ledgerData = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); }
  catch (e) { console.warn('could not read existing ledger:', e?.message); }
  const ledger = createLedger(ledgerData, {
    onChange: DRY_RUN ? null : (json) => {
      try { fs.writeFileSync(LEDGER_PATH, JSON.stringify(json, null, 2)); }
      catch (e) { console.warn('ledger write failed:', e?.message); }
    },
  });

  // DB accessors — KEYSET pagination (id ascending, continue with id > afterId).
  // Stable under concurrent writes and never re-reads rows. --limit is enforced
  // by the core loop; --product-id short-circuits to a single row.
  const loadProductsBatch = async (afterId, size) => {
    if (PRODUCT_ID) {
      if (afterId != null) return [];   // single product already returned
      return prisma.product.findMany({ where: { id: PRODUCT_ID }, select: { id: true, images: true }, take: 1 });
    }
    const where = afterId != null ? { id: { gt: afterId } } : {};
    return prisma.product.findMany({
      where, select: { id: true, images: true }, orderBy: { id: 'asc' }, take: size,
    });
  };
  const updateProductImages = (id, images) => prisma.product.update({ where: { id }, data: { images } });

  // secure_url reachability (HEAD, GET fallback).
  const reachable = async (url) => {
    try { const r = await fetch(url, { method: 'HEAD' }); if (r.ok) return true; } catch { /* fall through */ }
    try { const r = await fetch(url, { method: 'GET' }); return r.ok; } catch { return false; }
  };

  const migrateAsset = makeAssetMigrator({
    readFile,
    fileExists: async (p) => fs.existsSync(p),
    saveMedia: svc.saveMedia,
    reachable,
    folder: FOLDER,
    root: ROOT,
  });

  console.log('── Cloudinary media migration ──────────────────────');
  console.log(`mode   : ${ROLLBACK ? 'ROLLBACK' : DRY_RUN ? 'DRY-RUN (no writes)' : 'MIGRATE'}`);
  console.log(`batch  : ${BATCH}${LIMIT != null ? ` | limit ${LIMIT}` : ''}${PRODUCT_ID ? ` | product ${PRODUCT_ID}` : ''}`);
  console.log(`folder : ${FOLDER}`);
  console.log(`ledger : ${LEDGER_PATH}`);
  console.log('────────────────────────────────────────────────────');

  try {
    if (ROLLBACK) {
      const s = await runRollback({ loadProductsBatch, updateProductImages, ledger, dryRun: DRY_RUN, batchSize: BATCH, limit: LIMIT, log: console.log });
      console.log('\n── Rollback summary ───────────────');
      console.log(`ledger mappings  : ${s.reverseCount}`);
      console.log(`products scanned : ${s.productsScanned}`);
      console.log(`products reverted: ${s.productsReverted}`);
      console.log(`urls reverted    : ${s.urlsReverted}`);
      console.log(`db update errors : ${s.dbUpdateErrors}`);
    } else {
      const s = await runMigration({ loadProductsBatch, updateProductImages, migrateAsset, ledger, dryRun: DRY_RUN, batchSize: BATCH, limit: LIMIT, log: console.log });
      console.log('\n── Migration summary ──────────────');
      console.log(`products scanned : ${s.productsScanned}`);
      console.log(`products updated : ${s.productsUpdated}`);
      console.log(`assets migrated  : ${s.migrated}`);
      console.log(`assets resumed   : ${s.resumed}`);
      console.log(`skipped (cloud)  : ${s.skippedCloudinary}`);
      console.log(`skipped (other)  : ${s.skippedNonlocal}`);
      console.log(`would-migrate    : ${s.wouldMigrate}${DRY_RUN ? '' : ' (dry-run only)'}`);
      console.log(`missing files    : ${s.missing}`);
      console.log(`failed           : ${s.failed}`);
      console.log(`db update errors : ${s.dbUpdateErrors}`);
      console.log(`ledger           : ${DRY_RUN ? '(not written in dry-run)' : LEDGER_PATH}`);
    }
  } finally {
    try { await prisma.$disconnect?.(); } catch { /* ignore */ }
  }
}

main().catch((e) => { console.error('Fatal:', e?.message ?? e); process.exit(1); });
