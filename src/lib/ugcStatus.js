/**
 * src/lib/ugcStatus.js
 * ─────────────────────────────────────────────────────────────────────────────
 * UGC submission status state machine — the single source of truth for which
 * transitions are legal and who may perform them. Every status change (affiliate
 * or admin, API or engine) must go through here; arbitrary status writes are
 * never allowed.
 *
 * Pure logic: no DB, no React, no network. Unit-testable with plain Node.
 *
 * Allowed transitions (per spec):
 *   PENDING  → APPROVED   (admin)
 *   PENDING  → REJECTED   (admin, reason required — enforced at the service layer)
 *   APPROVED → RUNNING    (admin)
 *   RUNNING  → PAUSED     (affiliate or admin)
 *   PAUSED   → RUNNING    (affiliate or admin)
 *   REJECTED → PENDING    (affiliate, via video replacement)
 *
 * "Approve straight to RUNNING" (when UGC Settings defaultApprovedStatus=RUNNING)
 * is NOT a new edge — the service composes two legal edges: PENDING→APPROVED then
 * APPROVED→RUNNING. Keeping the machine to these six edges keeps it verifiable.
 *
 * Only RUNNING is earning-eligible. PAUSED keeps all history/stats but generates
 * zero new earnings.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const UGC_STATUS = Object.freeze({
  PENDING:  'PENDING',
  APPROVED: 'APPROVED',
  RUNNING:  'RUNNING',
  PAUSED:   'PAUSED',
  REJECTED: 'REJECTED',
});

export const UGC_ACTOR = Object.freeze({
  AFFILIATE: 'AFFILIATE',
  ADMIN:     'ADMIN',
  SYSTEM:    'SYSTEM',
});

const { PENDING, APPROVED, RUNNING, PAUSED, REJECTED } = UGC_STATUS;
const { AFFILIATE, ADMIN } = UGC_ACTOR;

// from → { to → [actors permitted to make this transition] }
const TRANSITIONS = Object.freeze({
  [PENDING]:  { [APPROVED]: [ADMIN], [REJECTED]: [ADMIN] },
  [APPROVED]: { [RUNNING]:  [ADMIN] },
  [RUNNING]:  { [PAUSED]:   [AFFILIATE, ADMIN] },
  [PAUSED]:   { [RUNNING]:  [AFFILIATE, ADMIN] },
  [REJECTED]: { [PENDING]:  [AFFILIATE] },
});

/** True for a recognized UGC status string. */
export function isValidStatus(status) {
  return Object.values(UGC_STATUS).includes(status);
}

/** Only RUNNING videos earn. */
export function isEarningEligible(status) {
  return status === RUNNING;
}

/**
 * Can `actor` move a submission from `from` to `to`?
 * @returns {boolean}
 */
export function canTransition(from, to, actor) {
  const edges = TRANSITIONS[from];
  if (!edges) return false;
  const actors = edges[to];
  if (!actors) return false;
  return actors.includes(actor);
}

/** The statuses `actor` may move `from` to (for building UI actions). */
export function allowedNextStatuses(from, actor) {
  const edges = TRANSITIONS[from];
  if (!edges) return [];
  return Object.keys(edges).filter((to) => edges[to].includes(actor));
}

/**
 * Could `actor` legitimately reach `toStatus` from SOME state? Used to decide
 * whether an "already in target status" request is an idempotent no-op (the actor
 * owns that capability) versus an unauthorized command.
 */
export function canReach(toStatus, actor) {
  for (const from of Object.values(UGC_STATUS)) {
    const edges = TRANSITIONS[from];
    if (edges && edges[toStatus] && edges[toStatus].includes(actor)) return true;
  }
  return false;
}

/**
 * Assert a transition is legal, or throw a coded error the API layer maps to 4xx.
 * Never mutates anything — validation only.
 */
export function assertTransition(from, to, actor) {
  if (!Object.values(UGC_STATUS).includes(from)) {
    throw Object.assign(new Error(`Unknown source status: ${from}`), { code: 'UGC_BAD_STATUS' });
  }
  if (!Object.values(UGC_STATUS).includes(to)) {
    throw Object.assign(new Error(`Unknown target status: ${to}`), { code: 'UGC_BAD_STATUS' });
  }
  if (!Object.values(UGC_ACTOR).includes(actor)) {
    throw Object.assign(new Error(`Unknown actor: ${actor}`), { code: 'UGC_BAD_ACTOR' });
  }
  if (!canTransition(from, to, actor)) {
    throw Object.assign(
      new Error(`Transition ${from} → ${to} is not permitted for ${actor}`),
      { code: 'UGC_ILLEGAL_TRANSITION' },
    );
  }
  return true;
}
