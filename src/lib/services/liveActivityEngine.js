/**
 * src/lib/services/liveActivityEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The single, SERVER-SIDE Live Activity engine shared by BOTH the landing page
 * (/tsajlim3ana) and the affiliate dashboard. There is exactly one source of
 * truth: a stored rolling feed + four running counters advanced over time on the
 * server. All clients poll /api/live-activity and therefore see the SAME events —
 * no localStorage, no client-generated feed, no duplicated engine.
 *
 * Demo/presentation only — never real users or PII. PEOPLE in the feed come from
 * the SHARED demo identity pool (getDemoIdentityPool — the exact same dataset as
 * the 🏆 Monthly Competition), so a person always keeps the same id / name /
 * username / avatar in the leaderboard AND in Live Activity. Only the activity
 * details are generated around the person. UGC earnings are ALWAYS computed as
 *   generatedSales × commissionPerSale   (the real UGC admin setting)
 * at serve time, so changing the commission instantly updates every UGC activity.
 *
 * State is kept in the `live-activity-state` settings row (durable across
 * restarts) plus a short in-memory cache to bound reads/writes. Counters reset at
 * the business-day boundary and whenever the admin bumps the reset token.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { getSettings, upsertSettings } from './settingsService.js';
import { getDemoIdentityPool } from './demoService.js';
import { getBoosterLiveFacts } from './boosterSimulationService.js';
import { normalizeUgcSettings } from '../ugcSettings.js';
import { businessDateKey } from '../ugcTime.js';
import {
  normalizeLiveActivity, pickActivityType, applyActivityToStats, driftOnline, relTime,
} from '../recruitmentCta.js';

const STATE_KEY   = 'live-activity-state';
const CACHE_MS    = 3000;   // serve the same snapshot for up to 3s
const MAX_EVENTS  = 40;     // rolling feed length kept in state
const MAX_CATCHUP = 3;      // never add more than this per advance → no huge jumps

let _cache = { at: 0, data: null };

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function getUgcCommissionPerSale() {
  try {
    const s = normalizeUgcSettings(await getSettings('ugc'));
    const v = Number(s.commissionPerSale);
    return Number.isFinite(v) && v >= 0 ? v : 4;
  } catch { return 4; }
}

// Build ONE stored event around a person from the SHARED identity pool: the
// person's stable id/name/username/avatar are COPIED verbatim (never re-rolled),
// only the activity details are generated. Exported for tests. UGC events store
// videos+sales only — earnings are computed live at serve time.
export function buildEvent(type, cfg, now, pool, rnd = Math.random) {
  const person = pool && pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
  const city = pick(cfg.cities) || '';
  const base = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`, type, at: now,
    personId:  person?.id || null,
    name:      person?.name || 'مسوقة',
    username:  person?.username || null,
    avatarUrl: person?.avatarUrl || null,
    color:     person?.avatarColor || '#f43f5e',
  };

  if (type === 'ugc') {
    const videos = randInt(1, cfg.ugcMaxVideos);
    const sales  = videos * randInt(cfg.ugcSalesPerVideoMin, cfg.ugcSalesPerVideoMax);
    return { ...base, icon: '🎥', videos, sales };           // NO city, NO views, NO product
  }
  if (type === 'delivered')  return { ...base, icon: '🚚', city, activity: 'تم تسليم طلب', amount: randInt(cfg.commissionMin, cfg.commissionMax) };
  if (type === 'commission') return { ...base, icon: '💰', activity: 'عمولة جديدة',        amount: randInt(cfg.commissionMin, cfg.commissionMax) };
  if (type === 'newOrder')   return { ...base, icon: '📦', city, activity: 'طلب جديد' };
  if (type === 'newAffiliate') return { ...base, icon: '👤', city, activity: 'انضمت للمنصة' };
  if (type === 'booster') {
    // Booster events come from the SIMULATION engine's real facts (passed in as
    // cfg.boosterFacts) — one source of truth, no second generator. The persona
    // is still a demo identity, so no affiliate is ever identified publicly.
    const fact = pick(cfg.boosterFacts || []);
    if (fact?.kind === 'milestone') {
      return { ...base, icon: '🚀', activity: 'وصلت', detail: `${fact.sales} / ${fact.target}` };
    }
    if (fact?.kind === 'sales') {
      const n = Math.max(1, fact.count);
      return { ...base, icon: '🚀', activity: 'Starter Booster', detail: `+${n} ${n === 1 ? 'مبيعة' : 'مبيعات'}`, boosterSales: n };
    }
    return null; // no simulation activity yet → caller picks another type
  }
  return { ...base, icon: '🏆', activity: 'دخلات المنافسة ديال هاد الشهر' }; // competition
}

// Counter delta for an event (UGC earnings depend on the CURRENT commission).
function counterAmount(ev, commissionPerSale) {
  if (ev.type === 'ugc') return Math.round(ev.sales * commissionPerSale);
  if (ev.type === 'delivered' || ev.type === 'commission') return ev.amount || 0;
  if (ev.type === 'booster') return ev.boosterSales || 0; // sales, not money
  return 0;
}

function freshState(cfg, dayKey, now) {
  return { dayKey, resetToken: cfg.resetToken || '', counters: { ...cfg.stats }, events: [], lastTickAt: now };
}

const BOOTSTRAP_COUNT = 15; // events generated up-front so the feed is NEVER empty

// Seed an initial batch of activities with staggered past timestamps so the very
// first page load already shows a full, natural-looking feed.
function bootstrapFeed(state, cfg, commissionPerSale, now, avgMs, pool) {
  const batch = [];
  for (let i = 0; i < BOOTSTRAP_COUNT; i++) {
    const type = pickActivityType(cfg.probabilities);
    const at = now - (BOOTSTRAP_COUNT - i) * avgMs; // i=0 oldest … newest ≈ now-avgMs
    const ev = buildEvent(type, cfg, at, pool) || buildEvent('newOrder', cfg, at, pool);
    state.counters = applyActivityToStats(state.counters, type, counterAmount(ev, commissionPerSale));
    if (Math.random() < 0.15) state.counters.affiliatesOnline = driftOnline(state.counters.affiliatesOnline);
    batch.push(ev);
  }
  state.events = batch.reverse().slice(0, MAX_EVENTS); // newest first
}

/**
 * Return the current live-activity snapshot, advancing the shared server state.
 * @returns {Promise<{enabled:boolean, counters:object|null, events:Array, config:object|null}>}
 */
export async function getLiveActivitySnapshot() {
  if (_cache.data && Date.now() - _cache.at < CACHE_MS) return _cache.data;

  const cfg = normalizeLiveActivity((await getSettings('recruitment-landing').catch(() => null))?.liveActivity);
  if (!cfg.enabled) {
    const out = { enabled: false, counters: null, events: [], config: null };
    _cache = { at: Date.now(), data: out };
    return out;
  }

  const commissionPerSale = await getUgcCommissionPerSale();
  const pool = await getDemoIdentityPool(); // shared with the Monthly Competition
  // Booster events read the SIMULATION engine — never a second generator.
  cfg.boosterFacts = await getBoosterLiveFacts().catch(() => []);
  const now = Date.now();
  const today = businessDateKey(new Date());
  const avgMs = ((cfg.intervalMinSec + cfg.intervalMaxSec) / 2) * 1000;

  let state = await getSettings(STATE_KEY).catch(() => null);
  if (!state || !Array.isArray(state.events) || state.dayKey !== today || state.resetToken !== (cfg.resetToken || '')) {
    state = freshState(cfg, today, now);
  }

  let dirty = false;

  // Bootstrap: the feed must NEVER be empty. On a brand-new/rolled-over/reset
  // state, seed an initial batch so the first page load shows several activities.
  if (!state.events.length) {
    bootstrapFeed(state, cfg, commissionPerSale, now, avgMs, pool);
    state.lastTickAt = now;
    dirty = true;
  }

  // Advance the shared feed by whole ticks since we last advanced (capped).
  const elapsedTicks = Math.floor((now - state.lastTickAt) / avgMs);
  if (elapsedTicks > 0) {
    const add = Math.min(elapsedTicks, MAX_CATCHUP);
    for (let k = 0; k < add; k++) {
      const type = pickActivityType(cfg.probabilities);
      const ev = buildEvent(type, cfg, now, pool) || buildEvent('newOrder', cfg, now, pool);
      state.counters = applyActivityToStats(state.counters, type, counterAmount(ev, commissionPerSale));
      if (Math.random() < 0.15) state.counters.affiliatesOnline = driftOnline(state.counters.affiliatesOnline); // slow fluctuation
      state.events.unshift(ev);
    }
    state.events = state.events.slice(0, MAX_EVENTS);
    // Discard a large idle backlog (jump to now) so counters never leap.
    state.lastTickAt = elapsedTicks > MAX_CATCHUP ? now : state.lastTickAt + elapsedTicks * avgMs;
    dirty = true;
  }

  if (dirty) await upsertSettings(STATE_KEY, state).catch(() => {});

  // Serve: relative time + live UGC earnings (respects current commission) + a
  // fresh identity resolve by personId, so if a person's avatar/username changes
  // in the shared pool, every stored event follows — one identity everywhere.
  const byId = new Map(pool.map((p) => [p.id, p]));
  const events = state.events.map((e) => {
    const p = e.personId ? byId.get(e.personId) : null;
    const identity = p
      ? { name: p.name, username: p.username, avatarUrl: p.avatarUrl ?? null, color: p.avatarColor }
      : {};
    const time = relTime(now - (e.at || now));
    if (e.type === 'ugc') return { ...e, ...identity, time, earnings: Math.round(e.sales * commissionPerSale) };
    return { ...e, ...identity, time };
  });

  const out = {
    enabled: true,
    counters: state.counters,
    events,
    config: { intervalMinSec: cfg.intervalMinSec, intervalMaxSec: cfg.intervalMaxSec },
  };
  _cache = { at: now, data: out };
  return out;
}
