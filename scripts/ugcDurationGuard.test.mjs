#!/usr/bin/env node
/**
 * scripts/ugcDurationGuard.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Proves the onLoadedMetadata duration fix. React nulls a synthetic event's
 * `currentTarget` AFTER the handler returns, but functional setState updaters can
 * run LATER — so `(m) => ({ ...m, duration: e.currentTarget.duration })` reads
 * `null.duration` → "Cannot read properties of null (reading 'duration')".
 *
 * The fix reads currentTarget SYNCHRONOUSLY into a local, guarded by Number.isFinite.
 * Run: node scripts/ugcDurationGuard.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

// Simulate React: handlers queue functional updaters; currentTarget is nulled
// after the handler returns; updaters flush afterwards.
function reactSim(handler, event) {
  const queued = [];
  const setState = (updater) => queued.push(updater);
  handler(event, setState);          // 1. run the event handler
  event.currentTarget = null;        // 2. React nulls currentTarget post-dispatch
  let state = { duration: null, size: 5 };
  let threw = null;
  try { for (const u of queued) state = u(state); } // 3. flush deferred updaters
  catch (e) { threw = e; }
  return { state, threw };
}

// OLD (buggy): reads e.currentTarget.duration INSIDE the deferred updater.
const oldHandler = (e, setMediaInfo) => setMediaInfo((m) => ({ ...m, duration: e.currentTarget.duration }));

// NEW (fixed): capture synchronously + Number.isFinite guard.
const newHandler = (e, setMediaInfo) => {
  const d = e.currentTarget?.duration;
  setMediaInfo((m) => ({ ...m, duration: Number.isFinite(d) ? d : null }));
};

console.log("1) the OLD pattern reproduces the reported crash:");
{
  const r = reactSim(oldHandler, { currentTarget: { duration: 42 } });
  ok("old handler throws once currentTarget is nulled", r.threw !== null);
  ok("error is the reported TypeError on 'duration'",
     /Cannot read properties of null \(reading 'duration'\)/.test(String(r.threw && r.threw.message)));
}

console.log("2) the NEW pattern never crashes and keeps the real duration:");
{
  const r = reactSim(newHandler, { currentTarget: { duration: 42 } });
  ok("new handler does NOT throw", r.threw === null);
  ok("captured the real duration (42)", r.state.duration === 42);
  ok("other state preserved", r.state.size === 5);
}

console.log("3) metadata unavailable → null (renders as “—”), still no crash:");
{
  for (const [label, dur] of [["NaN", NaN], ["undefined", undefined], ["Infinity", Infinity]]) {
    const r = reactSim(newHandler, { currentTarget: { duration: dur } });
    ok(`duration ${label} → null, no throw`, r.threw === null && r.state.duration === null);
  }
  // currentTarget already null (e.g. teardown) — optional chaining protects it.
  const r = reactSim(newHandler, { currentTarget: null });
  ok("currentTarget null at call time → null, no throw", r.threw === null && r.state.duration === null);
}

console.log("4) fmtDuration renders null as “—” (matches admin drawer helper):");
{
  const fmtDuration = (sec) => (sec == null || !isFinite(sec) ? "—" : `${Math.round(sec)}s`);
  ok("null → —", fmtDuration(null) === "—");
  ok("NaN → —", fmtDuration(NaN) === "—");
  ok("42 → 42s", fmtDuration(42) === "42s");
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
