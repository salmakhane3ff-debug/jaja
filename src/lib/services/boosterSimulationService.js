/**
 * src/lib/services/boosterSimulationService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The ONE Starter Booster simulation engine. Every booster figure the product
 * shows — page progress, dashboard widget, timeline, Live Activity — is read
 * from `booster_simulations` through here. Nothing else computes booster
 * progress.
 *
 * STRICT ISOLATION (enforced by tests): this module never reads or writes
 * AffiliateOrder, never creates orders, never touches commissions, payouts,
 * withdrawable balance or real statistics. The booster PRICE deduction lives on
 * AffiliateBoosterPurchase (status ACTIVE) and is never modified here — so
 * completing a simulation can never refund the package.
 *
 * DB is injectable for unit tests.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import prisma from '../prisma.js';
import { getBoosterConfig } from './boosterService.js';
import {
  SIM_STATUS, normalizeSimConfig, initialSimulation, tickSimulation,
  adjustSimulation, setSimulationStatus, resetSimulation, simulationView, splitSimulations,
} from '../boosterSimulation.js';

export const BOOSTER_SIM_LOCK_KEY = 0x42535449; // "BSTI" — distinct from the other engines
const PERSISTED = ['targetSales', 'simulatedSales', 'todaySales', 'dayKey', 'startedAt', 'endsAt', 'lastTickAt', 'status', 'timeline'];

const pickPersisted = (s) => Object.fromEntries(PERSISTED.map((k) => [k, s[k]]));

/** Admin simulation settings live alongside the packages (one settings row). */
export async function getSimConfig(db = prisma) {
  const cfg = await getBoosterConfig(db);
  return normalizeSimConfig(cfg.simulation);
}

/**
 * Ensure every ACTIVE purchase has a simulation row (created at progress 0 from
 * the package's admin metadata). Returns the simulations for one affiliate.
 */
export async function ensureSimulations(affiliateId, db = prisma, now = Date.now()) {
  const [config, purchases, sims] = await Promise.all([
    getBoosterConfig(db),
    db.affiliateBoosterPurchase.findMany({ where: { affiliateId }, orderBy: { createdAt: 'desc' } }),
    db.boosterSimulation.findMany({ where: { affiliateId } }),
  ]);
  const pkgById = new Map(config.packages.map((p) => [p.id, p]));
  const simByPurchase = new Map(sims.map((s) => [s.purchaseId, s]));

  for (const p of purchases) {
    if (p.status !== 'ACTIVE' || simByPurchase.has(p.id)) continue;
    const pkg = pkgById.get(p.packageId) || {};
    const seed = initialSimulation({
      purchaseId: p.id, affiliateId, packageId: p.packageId,
      targetSales: pkg.targetSales, durationDays: pkg.durationDays,
    }, new Date(p.activatedAt || p.createdAt).getTime() || now);
    const created = await db.boosterSimulation.create({ data: seed }).catch(() => null);
    if (created) simByPurchase.set(p.id, created);
  }
  return { purchases, simByPurchase, config };
}

/**
 * THE read used by the Booster page AND the dashboard widget — one source of
 * truth, no duplicated calculation.
 */
export async function getBoosterSimulationDashboard(affiliateId, db = prisma, now = Date.now()) {
  const { purchases, simByPurchase, config } = await ensureSimulations(affiliateId, db, now);
  const views = purchases
    .filter((p) => p.status !== 'REJECTED')
    .map((p) => {
      const sim = simByPurchase.get(p.id);
      return sim ? simulationView(sim, p, now)
                 : simulationView({ purchaseId: p.id, packageId: p.packageId, status: SIM_STATUS.RUNNING, targetSales: 0, simulatedSales: 0, timeline: [] }, p, now);
    });
  return { ...splitSimulations(views), packages: config.packages };
}

/**
 * ONE engine tick over every RUNNING simulation. Advisory-locked so only one
 * runner advances the demo counters. Writes ONLY booster_simulations.
 * @returns {Promise<{ticked:number, added:number, skipped?:string}>}
 */
export async function runBoosterSimulationTick(deps = {}) {
  const { db = prisma, lock, now = Date.now(), rnd = Math.random } = deps;
  const cfg = await getSimConfig(db);
  if (!cfg.enabled) return { ticked: 0, added: 0, skipped: 'disabled' };

  let held = true;
  if (lock && typeof lock.acquire === 'function') {
    held = await lock.acquire();
    if (!held) return { ticked: 0, added: 0, skipped: 'no_lock' };
  }
  try {
    const running = await db.boosterSimulation.findMany({ where: { status: SIM_STATUS.RUNNING } });
    let ticked = 0, added = 0;
    for (const sim of running) {
      const r = tickSimulation(sim, cfg, now, rnd);
      if (!r.changed) continue;
      await db.boosterSimulation.update({ where: { id: sim.id }, data: pickPersisted(r.next) }).catch(() => {});
      ticked += 1; added += r.added;
    }
    return { ticked, added };
  } finally {
    if (held && lock && typeof lock.release === 'function') {
      try { await lock.release(); } catch { /* release never masks the result */ }
    }
  }
}

/**
 * Recent DEMO booster facts for the Live Activity feed — same simulation state,
 * no second source. Returns plain numbers only (no affiliate identity: the
 * public feed pairs them with its own demo persona pool).
 * @returns {Promise<Array<{kind:'sales'|'milestone', count?:number, sales?:number, target?:number}>>}
 */
export async function getBoosterLiveFacts(db = prisma, limit = 12) {
  const sims = await db.boosterSimulation.findMany({
    where: { status: { in: [SIM_STATUS.RUNNING, SIM_STATUS.COMPLETED] } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { simulatedSales: true, targetSales: true, timeline: true },
  }).catch(() => []);

  const facts = [];
  for (const s of sims) {
    const tl = Array.isArray(s.timeline) ? s.timeline : [];
    if (tl[0]?.count > 0) facts.push({ kind: 'sales', count: Math.min(9, Number(tl[0].count) || 1) });
    if (s.targetSales > 0 && s.simulatedSales > 0) {
      facts.push({ kind: 'milestone', sales: s.simulatedSales, target: s.targetSales });
    }
  }
  return facts;
}

// ── Admin operations (all isolated to booster_simulations) ───────────────────
const err = (code, message) => Object.assign(new Error(message), { code });

export async function adminSimulationAction(purchaseId, action, value, db = prisma, now = Date.now()) {
  const sim = await db.boosterSimulation.findUnique({ where: { purchaseId: String(purchaseId || '') } });
  if (!sim) throw err('SIM_NOT_FOUND', 'Simulation introuvable');

  let next = sim;
  switch (action) {
    case 'pause':    next = setSimulationStatus(sim, SIM_STATUS.PAUSED); break;
    case 'resume':   next = setSimulationStatus(sim, SIM_STATUS.RUNNING); break;
    case 'complete': next = setSimulationStatus(sim, SIM_STATUS.COMPLETED); break;
    case 'reset':    next = resetSimulation(sim, now); break;
    case 'add':      next = adjustSimulation(sim, Math.abs(Number(value) || 0), now).next; break;
    case 'remove':   next = adjustSimulation(sim, -Math.abs(Number(value) || 0), now).next; break;
    default: throw err('INVALID_ACTION', 'Action invalide');
  }
  // NOTE: only the simulation row is written — the purchase (and therefore the
  // balance deduction) is never touched, so nothing is ever refunded.
  return db.boosterSimulation.update({ where: { id: sim.id }, data: pickPersisted(next) });
}

/** Admin list: every simulation with its affiliate + purchase context. */
export async function adminListSimulations(db = prisma, limit = 100) {
  const sims = await db.boosterSimulation.findMany({ orderBy: { updatedAt: 'desc' }, take: limit });
  if (!sims.length) return [];
  const [purchases, affiliates] = await Promise.all([
    db.affiliateBoosterPurchase.findMany({ where: { id: { in: sims.map((s) => s.purchaseId) } } }),
    db.affiliate.findMany({ where: { id: { in: [...new Set(sims.map((s) => s.affiliateId))] } }, select: { id: true, name: true, username: true } }),
  ]);
  const pById = new Map(purchases.map((p) => [p.id, p]));
  const aById = new Map(affiliates.map((a) => [a.id, a]));
  return sims.map((s) => ({
    ...simulationView(s, pById.get(s.purchaseId) || {}, Date.now()),
    affiliateName: aById.get(s.affiliateId)?.name || null,
    affiliateUsername: aById.get(s.affiliateId)?.username || null,
  }));
}
