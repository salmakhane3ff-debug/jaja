/**
 * src/lib/boosterSimulation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE logic for the Starter Booster SIMULATION (demo) engine — the ONE source
 * of truth every consumer reads: the Booster page, the dashboard widget, the
 * timeline and the Live Activity booster events.
 *
 * STRICT ISOLATION: these are simulated counters. Nothing here reads or writes
 * AffiliateOrder, commissions, payouts, withdrawable balance or any real
 * statistic. The booster PRICE deduction lives on the purchase row and is never
 * touched — completing a simulation must never refund anything.
 *
 * No React, no DB, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const SIM_STATUS = { RUNNING: 'RUNNING', PAUSED: 'PAUSED', COMPLETED: 'COMPLETED' };
export const TIMELINE_MAX = 40;
const DAY_MS = 86_400_000;

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const int = (v, d = 0) => Math.round(num(v, d));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Admin simulation settings (stored in the `booster-packages` settings row). */
export const DEFAULT_SIM_CONFIG = Object.freeze({
  enabled: true,
  tickIntervalSec: 900,   // 15 min between ticks per booster
  minPerTick: 1,
  maxPerTick: 2,          // occasional +3 when the admin raises this
  dailyMin: 0,            // 0 = no floor
  dailyMax: 0,            // 0 = uncapped
});

export function normalizeSimConfig(raw = {}) {
  const c = raw && typeof raw === 'object' ? raw : {};
  let min = clamp(int(c.minPerTick, DEFAULT_SIM_CONFIG.minPerTick), 0, 100);
  let max = clamp(int(c.maxPerTick, DEFAULT_SIM_CONFIG.maxPerTick), 0, 100);
  if (min > max) [min, max] = [max, min];
  let dMin = Math.max(0, int(c.dailyMin, DEFAULT_SIM_CONFIG.dailyMin));
  let dMax = Math.max(0, int(c.dailyMax, DEFAULT_SIM_CONFIG.dailyMax));
  if (dMax > 0 && dMin > dMax) [dMin, dMax] = [dMax, dMin];
  return {
    enabled: c.enabled !== false,
    tickIntervalSec: clamp(int(c.tickIntervalSec, DEFAULT_SIM_CONFIG.tickIntervalSec), 5, 86_400),
    minPerTick: min,
    maxPerTick: max,
    dailyMin: dMin,
    dailyMax: dMax,
  };
}

/** Fresh simulation state for a newly activated booster (progress starts at 0). */
export function initialSimulation({ purchaseId, affiliateId, packageId, targetSales, durationDays }, now = Date.now()) {
  const target = Math.max(0, int(targetSales, 0));
  const days = Math.max(0, int(durationDays, 0));
  return {
    purchaseId, affiliateId, packageId,
    targetSales: target,
    simulatedSales: 0,
    todaySales: 0,
    dayKey: dayKeyOf(now),
    startedAt: new Date(now),
    endsAt: days > 0 ? new Date(now + days * DAY_MS) : null,
    lastTickAt: null,
    status: SIM_STATUS.RUNNING,
    timeline: [],
  };
}

export function dayKeyOf(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Decide ONE tick for a simulation. PURE — returns the next state plus how many
 * demo sales were added; the caller persists it. Never exceeds targetSales,
 * never advances a PAUSED/COMPLETED simulation, and rolls `todaySales` over at
 * the day boundary.
 *
 * @returns {{ changed:boolean, added:number, reason?:string, next:object }}
 */
export function tickSimulation(sim, cfg, now = Date.now(), rnd = Math.random) {
  const s = { ...sim };
  const conf = normalizeSimConfig(cfg);
  const keep = (reason) => ({ changed: false, added: 0, reason, next: s });

  if (!conf.enabled) return keep('disabled');
  if (s.status === SIM_STATUS.PAUSED) return keep('paused');
  if (s.status === SIM_STATUS.COMPLETED) return keep('completed');

  // Roll the daily bucket over before any cap check.
  const today = dayKeyOf(now);
  if (s.dayKey !== today) { s.dayKey = today; s.todaySales = 0; }

  // Period elapsed → complete (no refund, ever).
  const endsAt = s.endsAt ? new Date(s.endsAt).getTime() : null;
  if (endsAt !== null && now >= endsAt) {
    s.status = SIM_STATUS.COMPLETED;
    return { changed: true, added: 0, reason: 'expired', next: s };
  }

  // Already at target → complete.
  if (s.targetSales > 0 && s.simulatedSales >= s.targetSales) {
    s.status = SIM_STATUS.COMPLETED;
    return { changed: true, added: 0, reason: 'target_reached', next: s };
  }

  // Respect the tick interval.
  const last = s.lastTickAt ? new Date(s.lastTickAt).getTime() : null;
  if (last !== null && now - last < conf.tickIntervalSec * 1000) return keep('too_soon');

  // Daily cap.
  if (conf.dailyMax > 0 && s.todaySales >= conf.dailyMax) return keep('daily_cap');

  let add = conf.minPerTick + Math.floor(rnd() * (conf.maxPerTick - conf.minPerTick + 1));
  if (conf.dailyMax > 0) add = Math.min(add, conf.dailyMax - s.todaySales);
  if (s.targetSales > 0) add = Math.min(add, s.targetSales - s.simulatedSales);
  add = Math.max(0, add);

  s.lastTickAt = new Date(now);
  if (add === 0) return { changed: true, added: 0, reason: 'no_room', next: s };

  s.simulatedSales += add;
  s.todaySales += add;
  s.timeline = pushTimeline(s.timeline, now, add);
  if (s.targetSales > 0 && s.simulatedSales >= s.targetSales) s.status = SIM_STATUS.COMPLETED;

  return { changed: true, added: add, next: s };
}

/** Append to the newest-first hourly timeline (same hour aggregates). */
export function pushTimeline(timeline, now, count) {
  const list = Array.isArray(timeline) ? [...timeline] : [];
  const hour = new Date(now); hour.setMinutes(0, 0, 0);
  const at = hour.getTime();
  if (list.length && list[0].at === at) {
    list[0] = { at, count: num(list[0].count, 0) + count };
  } else {
    list.unshift({ at, count });
  }
  return list.slice(0, TIMELINE_MAX);
}

// ── Admin operations (pure state transitions) ────────────────────────────────
/** Manually add/subtract demo sales. Clamped to [0, targetSales]. */
export function adjustSimulation(sim, delta, now = Date.now()) {
  const s = { ...sim };
  const d = int(delta, 0);
  const max = s.targetSales > 0 ? s.targetSales : Number.MAX_SAFE_INTEGER;
  const next = clamp(s.simulatedSales + d, 0, max);
  const applied = next - s.simulatedSales;
  s.simulatedSales = next;
  s.todaySales = Math.max(0, s.todaySales + applied);
  if (applied > 0) s.timeline = pushTimeline(s.timeline, now, applied);
  // Reaching the target completes it; going back below re-opens it.
  if (s.targetSales > 0 && s.simulatedSales >= s.targetSales) s.status = SIM_STATUS.COMPLETED;
  else if (s.status === SIM_STATUS.COMPLETED) s.status = SIM_STATUS.RUNNING;
  return { next: s, applied };
}

export function setSimulationStatus(sim, status) {
  if (![SIM_STATUS.RUNNING, SIM_STATUS.PAUSED, SIM_STATUS.COMPLETED].includes(status)) {
    throw Object.assign(new Error('Statut de simulation invalide'), { code: 'INVALID_SIM_STATUS' });
  }
  return { ...sim, status };
}

/** Reset progress to 0 and restart the simulation. Never touches the purchase. */
export function resetSimulation(sim, now = Date.now()) {
  return {
    ...sim,
    simulatedSales: 0, todaySales: 0, dayKey: dayKeyOf(now),
    timeline: [], lastTickAt: null, status: SIM_STATUS.RUNNING, startedAt: new Date(now),
  };
}

/**
 * The ONE view model consumed by the Booster page, the dashboard widget, the
 * timeline and Live Activity. Built from simulation state only.
 */
export function simulationView(sim, purchase = {}, now = Date.now()) {
  const target = Math.max(0, int(sim?.targetSales, 0));
  const sales = Math.max(0, int(sim?.simulatedSales, 0));
  const endsAt = sim?.endsAt ? new Date(sim.endsAt).getTime() : null;
  const today = dayKeyOf(now) === sim?.dayKey ? Math.max(0, int(sim?.todaySales, 0)) : 0;
  return {
    id: purchase?.id ?? sim?.purchaseId,
    purchaseId: sim?.purchaseId,
    packageId: sim?.packageId ?? purchase?.packageId,
    packageName: purchase?.packageName ?? '',
    price: num(purchase?.price, 0),
    purchaseStatus: purchase?.status ?? null,   // ACTIVE/PENDING — accounting side
    status: sim?.status ?? SIM_STATUS.RUNNING,  // simulation lifecycle
    simulated: true,                            // explicit: demo figures
    target: target || null,
    sales,
    todaySales: today,
    remaining: target > 0 ? Math.max(0, target - sales) : null,
    percent: target > 0 ? Math.min(100, Math.round((sales / target) * 100)) : null,
    daysLeft: endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / DAY_MS)),
    startedAt: sim?.startedAt ? new Date(sim.startedAt).getTime() : null,
    endsAt,
    completed: sim?.status === SIM_STATUS.COMPLETED,
    timeline: (Array.isArray(sim?.timeline) ? sim.timeline : [])
      .slice(0, 8)
      .map((e) => ({
        at: e.at,
        count: num(e.count, 0),
        label: new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      })),
  };
}

/** Split simulation views: running dashboard vs finished history. */
export function splitSimulations(views = []) {
  return {
    active: views.filter((v) => v.purchaseStatus === 'ACTIVE' && !v.completed),
    past:   views.filter((v) => v.purchaseStatus === 'ACTIVE' && v.completed),
    pending: views.filter((v) => v.purchaseStatus === 'PENDING'),
  };
}
