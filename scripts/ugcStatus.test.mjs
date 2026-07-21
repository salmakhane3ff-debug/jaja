#!/usr/bin/env node
/**
 * scripts/ugcStatus.test.mjs
 * Unit tests for the UGC status state machine (src/lib/ugcStatus.js).
 * Pure logic — no DB. Run: node scripts/ugcStatus.test.mjs
 */

import {
  UGC_STATUS, UGC_ACTOR,
  isValidStatus, isEarningEligible, canTransition, allowedNextStatuses, assertTransition, canReach,
} from "../src/lib/ugcStatus.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };
const { PENDING, APPROVED, RUNNING, PAUSED, REJECTED } = UGC_STATUS;
const { AFFILIATE, ADMIN, SYSTEM } = UGC_ACTOR;
const throws = (fn, code) => { try { fn(); return false; } catch (e) { return e.code === code; } };

console.log("1) status validity + earning eligibility:");
{
  ok("all five statuses valid", [PENDING, APPROVED, RUNNING, PAUSED, REJECTED].every(isValidStatus));
  ok("unknown status invalid", !isValidStatus("LIVE") && !isValidStatus("") && !isValidStatus(null));
  ok("ONLY running earns", isEarningEligible(RUNNING) === true);
  ok("no other status earns", [PENDING, APPROVED, PAUSED, REJECTED].every((s) => isEarningEligible(s) === false));
}

console.log("2) the six legal transitions:");
{
  ok("PENDING→APPROVED by admin", canTransition(PENDING, APPROVED, ADMIN));
  ok("PENDING→REJECTED by admin", canTransition(PENDING, REJECTED, ADMIN));
  ok("APPROVED→RUNNING by admin", canTransition(APPROVED, RUNNING, ADMIN));
  ok("RUNNING→PAUSED by affiliate", canTransition(RUNNING, PAUSED, AFFILIATE));
  ok("RUNNING→PAUSED by admin", canTransition(RUNNING, PAUSED, ADMIN));
  ok("PAUSED→RUNNING by affiliate", canTransition(PAUSED, RUNNING, AFFILIATE));
  ok("PAUSED→RUNNING by admin", canTransition(PAUSED, RUNNING, ADMIN));
  ok("REJECTED→PENDING by affiliate (replacement)", canTransition(REJECTED, PENDING, AFFILIATE));
}

console.log("3) illegal transitions are rejected:");
{
  ok("no PENDING→RUNNING shortcut (must go via APPROVED)", !canTransition(PENDING, RUNNING, ADMIN));
  ok("affiliate cannot approve", !canTransition(PENDING, APPROVED, AFFILIATE));
  ok("affiliate cannot reject", !canTransition(PENDING, REJECTED, AFFILIATE));
  ok("admin cannot move REJECTED→PENDING (only affiliate replacement)", !canTransition(REJECTED, PENDING, ADMIN));
  ok("cannot un-reject to APPROVED", !canTransition(REJECTED, APPROVED, ADMIN));
  ok("cannot go RUNNING→APPROVED", !canTransition(RUNNING, APPROVED, ADMIN));
  ok("cannot go APPROVED→PAUSED", !canTransition(APPROVED, PAUSED, ADMIN));
  ok("no self-transition", !canTransition(RUNNING, RUNNING, ADMIN));
  ok("system actor cannot change status (engine never transitions)", !canTransition(RUNNING, PAUSED, SYSTEM));
}

console.log("4) allowedNextStatuses (for UI action buttons):");
{
  ok("admin on PENDING → [APPROVED, REJECTED]", allowedNextStatuses(PENDING, ADMIN).sort().join() === "APPROVED,REJECTED");
  ok("affiliate on PENDING → [] (can't self-approve)", allowedNextStatuses(PENDING, AFFILIATE).length === 0);
  ok("affiliate on RUNNING → [PAUSED]", allowedNextStatuses(RUNNING, AFFILIATE).join() === "PAUSED");
  ok("affiliate on REJECTED → [PENDING]", allowedNextStatuses(REJECTED, AFFILIATE).join() === "PENDING");
  ok("unknown from → []", allowedNextStatuses("NOPE", ADMIN).length === 0);
}

console.log("5) assertTransition throws coded errors:");
{
  ok("legal transition returns true", assertTransition(PENDING, APPROVED, ADMIN) === true);
  ok("illegal transition → UGC_ILLEGAL_TRANSITION", throws(() => assertTransition(PENDING, RUNNING, ADMIN), "UGC_ILLEGAL_TRANSITION"));
  ok("bad source status → UGC_BAD_STATUS", throws(() => assertTransition("X", APPROVED, ADMIN), "UGC_BAD_STATUS"));
  ok("bad target status → UGC_BAD_STATUS", throws(() => assertTransition(PENDING, "X", ADMIN), "UGC_BAD_STATUS"));
  ok("bad actor → UGC_BAD_ACTOR", throws(() => assertTransition(PENDING, APPROVED, "ROBOT"), "UGC_BAD_ACTOR"));
}

console.log("6) the machine is closed (every edge maps to a real status):");
{
  const all = Object.values(UGC_STATUS);
  let clean = true;
  for (const from of all) for (const to of all) for (const actor of Object.values(UGC_ACTOR)) {
    if (canTransition(from, to, actor) && (!all.includes(from) || !all.includes(to))) clean = false;
  }
  ok("no edge points at an unknown status", clean);
  // Exactly 8 (from,to,actor) permissions across the 6 edges (2 edges allow 2 actors).
  let count = 0;
  for (const from of all) for (const to of all) for (const actor of Object.values(UGC_ACTOR)) if (canTransition(from, to, actor)) count++;
  ok("exactly 8 actor-permitted transitions", count === 8);
}

console.log("7) canReach (for idempotent no-op authorization):");
{
  ok("admin can reach APPROVED", canReach(APPROVED, ADMIN) === true);
  ok("affiliate CANNOT reach APPROVED (admin-only)", canReach(APPROVED, AFFILIATE) === false);
  ok("affiliate can reach PAUSED", canReach(PAUSED, AFFILIATE) === true);
  ok("affiliate can reach RUNNING (via resume)", canReach(RUNNING, AFFILIATE) === true);
  ok("affiliate can reach PENDING (via replacement)", canReach(PENDING, AFFILIATE) === true);
  ok("affiliate CANNOT reach REJECTED (admin-only)", canReach(REJECTED, AFFILIATE) === false);
  ok("admin can reach RUNNING/PAUSED/REJECTED", canReach(RUNNING, ADMIN) && canReach(PAUSED, ADMIN) && canReach(REJECTED, ADMIN));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
