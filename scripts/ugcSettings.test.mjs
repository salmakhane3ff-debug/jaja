#!/usr/bin/env node
/**
 * scripts/ugcSettings.test.mjs
 * Unit tests for UGC settings defaults/normalization/validation (src/lib/ugcSettings.js).
 * Pure logic — no DB. Run: node scripts/ugcSettings.test.mjs
 */

import {
  UGC_DEFAULT_SETTINGS, UGC_MAX_UPLOAD_BYTES_CEILING, UGC_MIN_POLL_INTERVAL_MS,
  normalizeUgcSettings, validateUgcSettings, assertValidUgcSettings,
  isEngineRunnable, estimatePotentialEarnings,
  sanitizePlainText, UGC_MAX_INSTRUCTION_LEN, UGC_MAX_INSTRUCTIONS,
  resolvePollIntervalMs,
} from "../src/lib/ugcSettings.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };
const valid = (over = {}) => ({ ...UGC_DEFAULT_SETTINGS, ...over });
const throws = (fn, code) => { try { fn(); return false; } catch (e) { return e.code === code; } };

console.log("1) safe defaults (module OFF until admin enables):");
{
  ok("enabled defaults false", UGC_DEFAULT_SETTINGS.enabled === false);
  ok("earningsEngineEnabled defaults false (no accidental earnings)", UGC_DEFAULT_SETTINGS.earningsEngineEnabled === false);
  ok("defaults validate clean", validateUgcSettings(UGC_DEFAULT_SETTINGS).length === 0);
  ok("defaults are not engine-runnable (disabled)", isEngineRunnable(UGC_DEFAULT_SETTINGS) === false);
}

console.log("2) normalization coerces + fills missing:");
{
  const n = normalizeUgcSettings({ commissionPerSale: "6", enabled: "true", instructions: ["a", 5, "b"] });
  ok("string number coerced", n.commissionPerSale === 6);
  ok("string bool coerced", n.enabled === true);
  ok("missing keys filled from defaults", n.maxGeneratedSales === UGC_DEFAULT_SETTINGS.maxGeneratedSales);
  ok("instructions filtered to strings", n.instructions.join() === "a,b");
  ok("null raw → full defaults", normalizeUgcSettings(null).pollIntervalMs === UGC_DEFAULT_SETTINGS.pollIntervalMs);
  ok("invalid defaultApprovedStatus falls back", normalizeUgcSettings({ defaultApprovedStatus: "LIVE" }).defaultApprovedStatus === "RUNNING");
}

console.log("3) validation rules:");
{
  ok("valid settings → no errors", validateUgcSettings(valid()).length === 0);
  ok("negative commission rejected", validateUgcSettings(valid({ commissionPerSale: -1 })).some((e) => e.includes("commissionPerSale")));
  ok("max<min sales rejected", validateUgcSettings(valid({ minGeneratedSales: 10, maxGeneratedSales: 5 })).some((e) => e.includes("maxGeneratedSales")));
  ok("min==max sales allowed", validateUgcSettings(valid({ minGeneratedSales: 5, maxGeneratedSales: 5 })).length === 0);
  ok("maxDaily<minDaily rejected", validateUgcSettings(valid({ minDailyEstimate: 10, maxDailyEstimate: 2 })).some((e) => e.includes("maxDailyEstimate")));
  ok("minVideo>=maxVideo rejected", validateUgcSettings(valid({ minVideoSeconds: 60, maxVideoSeconds: 60 })).some((e) => e.includes("maxVideoSeconds")));
  ok("zero minVideo rejected", validateUgcSettings(valid({ minVideoSeconds: 0 })).some((e) => e.includes("minVideoSeconds")));
  ok("upload over ceiling rejected", validateUgcSettings(valid({ maxUploadBytes: UGC_MAX_UPLOAD_BYTES_CEILING + 1 })).some((e) => e.includes("ceiling")));
  ok("poll below floor rejected", validateUgcSettings(valid({ pollIntervalMs: UGC_MIN_POLL_INTERVAL_MS - 1 })).some((e) => e.includes("pollIntervalMs")));
  ok("negative generationSpeed rejected", validateUgcSettings(valid({ generationSpeed: -2 })).some((e) => e.includes("generationSpeed")));
}

console.log("4) assert + engine-runnable gate:");
{
  ok("assert returns normalized on valid", assertValidUgcSettings(valid()).commissionPerSale === UGC_DEFAULT_SETTINGS.commissionPerSale);
  ok("assert throws coded on invalid", throws(() => assertValidUgcSettings(valid({ commissionPerSale: -5 })), "UGC_INVALID_SETTINGS"));
  // An ENABLED engine must also be feasible (speed 2 × 24 windows = 48 ≥ target 30).
  const runnable = { enabled: true, earningsEngineEnabled: true, generationSpeed: 2 };
  ok("engine runnable only when enabled+engine+valid", isEngineRunnable(valid(runnable)) === true);
  ok("engine NOT runnable if module disabled", isEngineRunnable(valid({ ...runnable, enabled: false })) === false);
  ok("engine NOT runnable if engine flag off", isEngineRunnable(valid({ ...runnable, earningsEngineEnabled: false })) === false);
  ok("engine NOT runnable if enabled config is infeasible (speed 1 × 24 < 30)",
     isEngineRunnable(valid({ enabled: true, earningsEngineEnabled: true, generationSpeed: 1 })) === false);
  ok("engine NOT runnable on invalid settings (safety)",
     isEngineRunnable(valid({ enabled: true, earningsEngineEnabled: true, maxGeneratedSales: -1 })) === false);
}

console.log("5) potential-earnings estimate (display-only):");
{
  const e = estimatePotentialEarnings(valid({ commissionPerSale: 4, minGeneratedSales: 1, maxGeneratedSales: 30 }));
  ok("min/max earning computed", e.minEarning === 4 && e.maxEarning === 120);
  ok("carries commission + sales bounds", e.commissionPerSale === 4 && e.minSales === 1 && e.maxSales === 30);
  ok("null when estimates disabled", estimatePotentialEarnings(valid({ allowEstimatedEarnings: false })) === null);
  ok("rounds to 2dp", estimatePotentialEarnings(valid({ commissionPerSale: 3.335, minGeneratedSales: 1, maxGeneratedSales: 1 })).minEarning === 3.34
      || estimatePotentialEarnings(valid({ commissionPerSale: 3.33, minGeneratedSales: 1, maxGeneratedSales: 1 })).minEarning === 3.33);
}

console.log("6) instructions/informational settings are bounded plain text (refinement #4):");
{
  const ctrl = "a" + String.fromCharCode(0) + String.fromCharCode(9) + String.fromCharCode(10) + String.fromCharCode(27) + "b";
  ok("control chars stripped/normalized to space", sanitizePlainText(ctrl) === "a b");
  ok("whitespace collapsed + trimmed", sanitizePlainText("  hello    world  ") === "hello world");
  ok("length hard-capped", sanitizePlainText("x".repeat(1000), 10).length === 10);
  ok("non-string → empty", sanitizePlainText(42) === "" && sanitizePlainText(null) === "");
  ok("no control chars survive", (() => { const out = sanitizePlainText("A" + String.fromCharCode(7) + String.fromCharCode(31) + "B"); return ![...out].some((c) => c.codePointAt(0) <= 31); })());

  const n = normalizeUgcSettings({
    exampleVideoUrl: "https://x.test/v.mp4" + String.fromCharCode(0),
    instructions: ["good " + String.fromCharCode(10) + "lighting", "", 5, "x".repeat(500), ...Array.from({ length: 50 }, () => "line")],
  });
  ok("exampleVideoUrl sanitized", !n.exampleVideoUrl.split("").some((c) => c.codePointAt(0) <= 31));
  ok("instruction lines sanitized (newline→space)", n.instructions[0] === "good lighting");
  ok("empty/non-string instructions dropped", !n.instructions.includes(""));
  ok("each instruction length-capped", n.instructions.every((s) => s.length <= UGC_MAX_INSTRUCTION_LEN));
  ok("instruction count capped", n.instructions.length <= UGC_MAX_INSTRUCTIONS);
}

console.log("7) poll-interval resolution (CLI --interval + per-cycle, final check #3):");
{
  ok("below floor is clamped up to the floor", resolvePollIntervalMs(1000).ms === UGC_MIN_POLL_INTERVAL_MS && resolvePollIntervalMs(1000).clamped === true);
  ok("exactly the floor is accepted", resolvePollIntervalMs(UGC_MIN_POLL_INTERVAL_MS).ms === UGC_MIN_POLL_INTERVAL_MS && resolvePollIntervalMs(UGC_MIN_POLL_INTERVAL_MS).clamped === false);
  ok("above the floor passes through", resolvePollIntervalMs(UGC_MIN_POLL_INTERVAL_MS + 5000).ms === UGC_MIN_POLL_INTERVAL_MS + 5000);
  ok("numeric string parsed", resolvePollIntervalMs("120000").ms === 120000);
  ok("non-numeric → invalid, falls back to default (>= floor)", resolvePollIntervalMs("abc").invalid === true && resolvePollIntervalMs("abc").ms >= UGC_MIN_POLL_INTERVAL_MS);
  ok("null → invalid, default fallback", resolvePollIntervalMs(null).invalid === true);
  ok("negative is clamped, not accepted", resolvePollIntervalMs(-5).ms === UGC_MIN_POLL_INTERVAL_MS);
  ok("custom fallback honored + still floored", resolvePollIntervalMs("nope", 10).ms === UGC_MIN_POLL_INTERVAL_MS);
}

console.log("8) feasibility is enforced ONLY when the earnings engine is enabled:");
{
  // Defaults: speed 1 × 24 windows = 24 capacity, max target 30 → infeasible, but engine OFF.
  ok("default generationSpeed is 1 (unchanged)", UGC_DEFAULT_SETTINGS.generationSpeed === 1);
  ok("defaults still validate clean (engine disabled)", validateUgcSettings(UGC_DEFAULT_SETTINGS).length === 0);

  const infeasibleOff = valid({ earningsEngineEnabled: false, generationSpeed: 1, maxGeneratedSales: 30, pollIntervalMs: 3_600_000 });
  ok("DISABLED + infeasible → saving allowed", validateUgcSettings(infeasibleOff).length === 0);

  const infeasibleOn = valid({ enabled: true, earningsEngineEnabled: true, generationSpeed: 1, maxGeneratedSales: 30, pollIntervalMs: 3_600_000 });
  const errs = validateUgcSettings(infeasibleOn);
  ok("ENABLING an infeasible config → fails", errs.length === 1);
  ok("message states the capacity (24)", /Maximum daily capacity is 24 sales/.test(errs[0]));
  ok("message shows the calculation (1 × 24 windows/day)", /generationSpeed 1 × 24 windows\/day/.test(errs[0]));
  ok("message states the configured target (30)", /Configured maximum daily target is 30/.test(errs[0]));
  ok("message suggests the three remedies", /Increase generationSpeed, reduce maxGeneratedSales, or reduce the engine interval/.test(errs[0]));
  ok("assert throws when enabling an infeasible config", throws(() => assertValidUgcSettings(infeasibleOn), "UGC_INVALID_SETTINGS"));

  // Editing while ALREADY enabled must also fail.
  const editWhileOn = valid({ enabled: true, earningsEngineEnabled: true, generationSpeed: 2, maxGeneratedSales: 100, pollIntervalMs: 3_600_000 });
  ok("editing while enabled → infeasible also fails (2×24=48 < 100)", validateUgcSettings(editWhileOn).some((e) => /Maximum daily capacity is 48 sales/.test(e)));

  // Feasible enabled configs pass; nothing is silently adjusted.
  const feasibleOn = valid({ enabled: true, earningsEngineEnabled: true, generationSpeed: 2, maxGeneratedSales: 30, pollIntervalMs: 3_600_000 });
  ok("enabled + feasible (2×24=48 ≥ 30) → valid", validateUgcSettings(feasibleOn).length === 0);
  const normalized = assertValidUgcSettings(feasibleOn);
  ok("values are NEVER auto-adjusted to pass",
     normalized.generationSpeed === 2 && normalized.maxGeneratedSales === 30
     && normalized.minGeneratedSales === feasibleOn.minGeneratedSales && normalized.pollIntervalMs === 3_600_000);

  // A shorter interval raises capacity (more windows/day).
  ok("shorter interval raises capacity (5min → 288 windows)",
     validateUgcSettings(valid({ enabled: true, earningsEngineEnabled: true, generationSpeed: 1, maxGeneratedSales: 200, pollIntervalMs: 300_000 })).length === 0);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
