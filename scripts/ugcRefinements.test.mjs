#!/usr/bin/env node
/**
 * scripts/ugcRefinements.test.mjs
 * Tests the four Phase-3 refinements' pure cores:
 *   #1 progressive video validation facade (src/lib/videoValidation.js)
 *   #2 balance provider registry            (src/lib/balance/providerRegistry.js)
 *   #3/#4 structured cycle logging          (src/lib/ugcCycleLog.js)
 * No DB, no ffprobe — all external interactions are injected.
 * Run: node scripts/ugcRefinements.test.mjs
 */

import { validateVideoBuffer, normalizeFfprobe, mapFfprobeContainer, mapFfprobeCodec } from "../src/lib/videoValidation.js";
import {
  registerBalanceProvider, getBalanceProviders, clearBalanceProviders, computeRegisteredBalance,
  DEFAULT_PROVIDER_PRIORITY, BALANCE_PRIORITY,
} from "../src/lib/balance/providerRegistry.js";
import { toDecimal } from "../src/lib/balance/composeBalance.js";
import { createUgcCycleLog, UGC_CYCLE_EVENT, UGC_LOG_SCHEMA_VERSION } from "../src/lib/ugcCycleLog.js";
import { UGC_EARNING_STATUS, buildEarningResult } from "../src/lib/ugcEarnings.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };
const throws = (fn, code) => { try { fn(); return false; } catch (e) { return e.code === code; } };

// ── Minimal valid MP4 for the fallback path ───────────────────────────────────
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0, 0); return b; };
const box = (t, ...p) => { const pl = Buffer.concat(p.map((x) => (Buffer.isBuffer(x) ? x : Buffer.from(x, "ascii")))); return Buffer.concat([u32(8 + pl.length), Buffer.from(t, "ascii"), pl]); };
const validMp4 = () => Buffer.concat([box("ftyp", "isom", u32(0), "mp42"),
  box("moov", box("mvhd", u32(0), u32(0), u32(0), u32(1000), u32(30000)), box("trak", box("mdia", box("minf", box("stbl", box("stsd", u32(0), u32(1), u32(16), "avc1"))))))]);

console.log("1) progressive validation — one interface, backend chosen at runtime:");
{
  // ffprobe available + healthy → primary
  const r1 = validateVideoBuffer(Buffer.from("ignored"), { minSeconds: 5 }, {
    ffprobeAvailable: () => true,
    runFfprobe: () => ({ container: "mp4", durationSeconds: 30, codecs: ["avc1"] }),
  });
  ok("uses ffprobe when available", r1.ok === true && r1.validator === "ffprobe");
  ok("ffprobe metadata drives duration/codec", r1.durationSeconds === 30 && r1.codec === "avc1");

  // ffprobe applies the SAME policy (rejects a short video from ffprobe metadata)
  const r2 = validateVideoBuffer(Buffer.from("x"), { minSeconds: 10 }, {
    ffprobeAvailable: () => true, runFfprobe: () => ({ container: "mp4", durationSeconds: 3, codecs: ["avc1"] }),
  });
  ok("ffprobe path enforces identical policy (too short rejected)", r2.ok === false && r2.reason.includes("too short") && r2.validator === "ffprobe");

  // ffprobe throws → falls back to JS parser on the real bytes
  const r3 = validateVideoBuffer(validMp4(), { minSeconds: 1 }, {
    ffprobeAvailable: () => true, runFfprobe: () => { throw new Error("ffprobe crashed"); },
  });
  ok("falls back to JS parser when ffprobe fails", r3.ok === true && r3.validator === "js");

  // ffprobe unavailable → JS parser
  const r4 = validateVideoBuffer(validMp4(), { minSeconds: 1 }, { ffprobeAvailable: () => false });
  ok("uses JS parser when ffprobe absent", r4.ok === true && r4.validator === "js");

  // common interface: identical result shape from both backends
  ok("identical result keys from both backends",
     ["ok", "container", "durationSeconds", "codec", "validator"].every((k) => k in r1 && k in r4));

  // corrupted file rejected under JS fallback
  const r5 = validateVideoBuffer(Buffer.from("not a video"), {}, { ffprobeAvailable: () => false });
  ok("JS fallback still rejects garbage", r5.ok === false && r5.validator === "js");
}

console.log("2) ffprobe normalization → shared metadata shape:");
{
  const meta = normalizeFfprobe({
    format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "42.5" },
    streams: [{ codec_type: "audio", codec_name: "aac" }, { codec_type: "video", codec_name: "h264" }],
  });
  ok("container mapped (mov/mp4 family → mp4)", meta.container === "mp4");
  ok("duration parsed to number", meta.durationSeconds === 42.5);
  ok("video codec mapped h264 → avc1 (audio ignored)", meta.codecs.join() === "avc1");
  ok("hevc → hvc1", mapFfprobeCodec("hevc") === "hvc1");
  ok("webm/matroska container mapped", mapFfprobeContainer("matroska,webm") === "webm");
  ok("unknown codec passes through (policy will reject it)", mapFfprobeCodec("realvideo") === "realvideo");
}

console.log("3) balance provider registry:");
{
  const reg = new Map();
  registerBalanceProvider({ source: "referral", compute: async () => "1500" }, reg);
  registerBalanceProvider({ source: "payouts",  compute: async () => -200 }, reg);
  registerBalanceProvider({ source: "ugc",      compute: async () => toDecimal("640.50") }, reg);
  ok("providers registered in order", getBalanceProviders(reg).map((p) => p.source).join() === "referral,payouts,ugc");

  const bal = await computeRegisteredBalance("aff-1", null, reg);
  ok("orchestrator composes registered providers → 1940.50", bal.toString() === "1940.5");

  // re-registering same source replaces (no double count)
  registerBalanceProvider({ source: "ugc", compute: async () => "0" }, reg);
  ok("re-register by source replaces, not duplicates", getBalanceProviders(reg).length === 3);
  ok("balance reflects replacement (ugc now 0) → 1300", (await computeRegisteredBalance("aff-1", null, reg)).toString() === "1300");

  ok("adding a NEW source needs no orchestrator change",
     (() => { registerBalanceProvider({ source: "future_bonus", compute: async () => "10" }, reg); return getBalanceProviders(reg).length === 4; })());

  clearBalanceProviders(reg);
  ok("clear empties the registry", getBalanceProviders(reg).length === 0);
  ok("empty registry → 0 balance", (await computeRegisteredBalance("aff-1", null, reg)).toString() === "0");

  ok("bad provider (no source) rejected", throws(() => registerBalanceProvider({ compute: async () => 1 }, reg), "BAL_BAD_PROVIDER"));
  ok("bad provider (no compute) rejected", throws(() => registerBalanceProvider({ source: "x" }, reg), "BAL_BAD_PROVIDER"));
}

console.log("4) structured cycle logging (refinement #3) + duration:");
{
  const records = [];
  let t = 1000;
  const log = createUgcCycleLog({ now: () => t, sink: (r) => records.push(r), cycleId: "cycle-A" });
  log.started({ eligibleVideos: 3 });
  log.lockAcquired();
  log.videoProcessed("v1");
  log.earningGenerated({ ugcVideoId: "v1", affiliateId: "a1", amount: toDecimal("68.00"), generatedSales: 17, idempotencyKey: "v1:2026-07-20" });
  t = 1500;
  const report = log.finished();

  const events = records.map((r) => r.event);
  ok("emits started/lock_acquired/video_processed/earning_generated/finished",
     ["started", "lock_acquired", "video_processed", "earning_generated", "finished"].every((e) => events.includes(e)));
  ok("every record is structured (ts + component + cycleId + event)",
     records.every((r) => r.ts && r.component === "ugc-earnings-engine" && r.cycleId === "cycle-A" && r.event));
  ok("counters accumulated", report.videosProcessed === 1 && report.earningsGenerated === 1);
  ok("execution duration computed from clock", report.durationMs === 500);
  ok("finished summary carries the counts + duration",
     records.at(-1).earningsGenerated === 1 && records.at(-1).durationMs === 500);
  ok("earning amount logged as string (no lossy Number)", records.find((r) => r.event === "earning_generated").amount === "68");
  // 8 original + daily_target_generated + target_completed (daily-target engine).
  ok("all 10 event names are defined", Object.keys(UGC_CYCLE_EVENT).length === 10);
}

console.log("5) duplicate suppression is an EXPLICIT expected event (refinement #4):");
{
  const records = [];
  const log = createUgcCycleLog({ now: () => 0, sink: (r) => records.push(r) });
  log.duplicateSuppressed({ ugcVideoId: "v9", idempotencyKey: "v9:2026-07-20" });
  const dup = records.find((r) => r.event === "duplicate_suppressed");
  ok("emits a duplicate_suppressed event (not silent)", !!dup);
  ok("marked expected:true", dup.expected === true);
  ok("carries the idempotency key for traceability", dup.idempotencyKey === "v9:2026-07-20");
  ok("counter incremented", log.report.duplicatesSuppressed === 1);
}

console.log("6) lock-skipped cycle generates nothing:");
{
  const records = [];
  const log = createUgcCycleLog({ now: () => 0, sink: (r) => records.push(r) });
  log.started();
  log.lockSkipped();
  const report = log.finished();
  ok("lock_skipped emitted with a reason", records.find((r) => r.event === "lock_skipped")?.reason);
  ok("no earnings generated on a skipped cycle", report.earningsGenerated === 0 && report.lock === "skipped");
}

console.log("7) provider priority — deterministic execution order (refinement #1):");
{
  const reg = new Map();
  const calls = [];
  const P = (source, priority) => ({ source, priority, compute: async () => { calls.push(source); return "0"; } });
  // Register out of priority order; expect execution sorted by priority.
  registerBalanceProvider(P("c", 30), reg);
  registerBalanceProvider(P("a", 10), reg);
  registerBalanceProvider(P("b", 20), reg);
  ok("providers returned in priority order", getBalanceProviders(reg).map((p) => p.source).join() === "a,b,c");
  await computeRegisteredBalance("aff", null, reg);
  ok("composed in deterministic priority order", calls.join() === "a,b,c");

  // Equal priority → stable registration order.
  const reg2 = new Map();
  registerBalanceProvider({ source: "x", priority: 5, compute: async () => "0" }, reg2);
  registerBalanceProvider({ source: "y", priority: 5, compute: async () => "0" }, reg2);
  ok("equal priority keeps registration order (stable)", getBalanceProviders(reg2).map((p) => p.source).join() === "x,y");

  // Default priority applied when omitted.
  const reg3 = new Map();
  registerBalanceProvider({ source: "hi", priority: 1, compute: async () => "0" }, reg3);
  registerBalanceProvider({ source: "def", compute: async () => "0" }, reg3);   // default 100
  ok("omitted priority defaults to DEFAULT_PROVIDER_PRIORITY, runs last",
     getBalanceProviders(reg3).map((p) => p.source).join() === "hi,def" && DEFAULT_PROVIDER_PRIORITY === 100);

  // Replacing a source preserves its original order slot.
  const reg4 = new Map();
  registerBalanceProvider({ source: "first", priority: 100, compute: async () => "0" }, reg4);
  registerBalanceProvider({ source: "second", priority: 100, compute: async () => "0" }, reg4);
  registerBalanceProvider({ source: "first", priority: 100, compute: async () => "1" }, reg4); // replace
  ok("replacing keeps original registration slot", getBalanceProviders(reg4).map((p) => p.source).join() === "first,second");

  // Documented default priorities (refinement #2): the standard sources sort in
  // the documented order — commission, bonus, payout deduction, then UGC.
  ok("documented order: commission<bonus<payout<ugc",
     BALANCE_PRIORITY.REFERRAL_COMMISSION < BALANCE_PRIORITY.REFERRAL_BONUS &&
     BALANCE_PRIORITY.REFERRAL_BONUS < BALANCE_PRIORITY.PAYOUT_DEDUCTION &&
     BALANCE_PRIORITY.PAYOUT_DEDUCTION < BALANCE_PRIORITY.UGC_EARNING);
  ok("default priorities are 10/20/30/40",
     BALANCE_PRIORITY.REFERRAL_COMMISSION === 10 && BALANCE_PRIORITY.REFERRAL_BONUS === 20 &&
     BALANCE_PRIORITY.PAYOUT_DEDUCTION === 30 && BALANCE_PRIORITY.UGC_EARNING === 40);
  ok("future sources slot after UGC (default 100 > 40)", DEFAULT_PROVIDER_PRIORITY > BALANCE_PRIORITY.UGC_EARNING);
}

console.log("8) log schemaVersion on every record (refinement #2):");
{
  const records = [];
  const log = createUgcCycleLog({ now: () => 0, sink: (r) => records.push(r) });
  log.started(); log.lockAcquired(); log.duplicateSuppressed({ ugcVideoId: "v" }); log.finished();
  ok("every record carries schemaVersion", records.length > 0 && records.every((r) => r.schemaVersion === UGC_LOG_SCHEMA_VERSION));
  ok("schemaVersion is a number", typeof UGC_LOG_SCHEMA_VERSION === "number");
}

console.log("9) recordUgcEarning result contract (refinement #3):");
{
  const created = buildEarningResult({ status: UGC_EARNING_STATUS.CREATED, amount: toDecimal("68.00"), idempotencyKey: "v:2026-07-20" });
  ok("structured object, not a boolean", typeof created === "object" && created.status === "created");
  ok("amount serialized as string (Decimal-faithful)", created.amount === "68" && typeof created.amount === "string");
  ok("carries the idempotency key", created.idempotencyKey === "v:2026-07-20");
  ok("reason omitted when not provided", !("reason" in created));

  const dup = buildEarningResult({ status: UGC_EARNING_STATUS.DUPLICATE, idempotencyKey: "v:2026-07-20", reason: "already generated" });
  ok("duplicate result carries reason", dup.status === "duplicate" && dup.reason === "already generated");
  ok("null amount stays null", buildEarningResult({ status: UGC_EARNING_STATUS.SKIPPED }).amount === null);
  ok("invalid status throws", throws(() => buildEarningResult({ status: "bogus" }), "UGC_BAD_RESULT"));
  ok("four statuses defined", Object.keys(UGC_EARNING_STATUS).length === 4);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
