/**
 * src/lib/services/demoService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All business logic for the Demo Competition system.
 * Demo data is completely isolated from real affiliate data.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';
import { saveMedia, destroyByUrl } from '../cloudinary.js';
import { processDemoAvatar, DEMO_AVATAR_FOLDER, DEMO_AVATAR_GENDERS } from '../demoAvatarImage.js';
import { businessDateKey } from '../ugcTime.js';

// All demo DB access goes through `_db` (the real Prisma client in production).
// Tests swap in an in-memory fake via __setDemoDb — proving isolation without a DB.
let _db = prisma;
export function __setDemoDb(db) { _db = db || prisma; }

// ── Name pools (Moroccan market), split by gender for men/women/mixed modes ─────
const MALE_NAMES = [
  'Youssef','Hamza','Omar','Amine','Karim','Mehdi','Rachid','Samir','Nabil','Khalid',
  'Tariq','Hassan','Mouad','Bilal','Hicham','Soufiane','Adil','Zakaria','Ismail','Younes',
  'Ayoub','Ilyass','Walid','Ayman','Othmane','Driss','Morad','Reda','Tarik','Jawad',
];
const FEMALE_NAMES = [
  'Sara','Nadia','Fatima','Samira','Leila','Meryem','Houda','Zineb','Hajar','Imane',
  'Chaimae','Doha','Yasmina','Sanaa','Karima','Siham','Widad','Asmaa','Nawal','Btissam',
];
const FIRST_NAMES = [...MALE_NAMES, ...FEMALE_NAMES]; // kept for any legacy reference
const LAST_NAMES = [
  'Benaissa','El Amrani','Chaabi','Benali','Ouarrach','Akhtar','Bennis','Filali',
  'Berrada','Essaidi','Lazrak','Mrani','Tahiri','Ziani','Bennani','Alaoui','Skali',
  'Chraibi','Benkirane','Tazi','Hajji','Bouazzaoui','Fassi','Mansouri','Sentissi',
];
const AVATAR_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6',
  '#ef4444','#14b8a6','#f97316','#84cc16','#06b6d4','#a855f7',
];

// ── Growth parameters ─────────────────────────────────────────────────────────
const GROWTH = {
  aggressive: { ordersRange: [4, 12], revenuePerOrder: [200, 500], teamGrowthChance: 0.4, cancelRate: 0.05 },
  consistent: { ordersRange: [2, 5],  revenuePerOrder: [120, 320], teamGrowthChance: 0.2, cancelRate: 0.10 },
  slow:       { ordersRange: [0, 2],  revenuePerOrder: [80,  200], teamGrowthChance: 0.1, cancelRate: 0.15 },
};

const SPEED_MULT = { slow: 0.4, medium: 1, fast: 2.8 };

const COMMISSION_RATE = 0.05; // 5% parent earns from team
const DEMO_UGC_COMMISSION = 5; // MAD per simulated UGC sale (demo-only, never a real rate)

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randF(min, max) { return +(Math.random() * (max - min) + min).toFixed(2); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Seed demo UGC stats for a freshly generated affiliate (presentation-only).
function seedDemoUgc() {
  const todaySales = rand(0, 30);
  const totalSales = rand(10, 500);
  return {
    ugcTodaySales:    todaySales,
    ugcTotalSales:    totalSales,
    ugcTodayEarnings: +(todaySales * DEMO_UGC_COMMISSION).toFixed(2),
    ugcTotalEarnings: +(totalSales * DEMO_UGC_COMMISSION).toFixed(2),
  };
}

// ── Demo avatar library (permanent — only an admin deletes) ────────────────────

export async function listDemoAvatars() {
  const rows = await _db.demoAvatar.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map((a) => ({ id: a.id, gender: a.gender, url: a.url, createdAt: a.createdAt }));
}

/**
 * Process (crop→256→webp q80) + store each buffer, then persist a DemoAvatar row.
 * @param {'men'|'women'} gender
 * @param {Buffer[]} buffers
 */
export async function addDemoAvatars(gender, buffers) {
  if (!DEMO_AVATAR_GENDERS.includes(gender)) {
    throw Object.assign(new Error('gender must be men or women'), { code: 'DEMO_AVATAR_BAD_GENDER' });
  }
  const created = [];
  for (const buffer of buffers) {
    const webp = await processDemoAvatar(buffer);
    const stored = await saveMedia(webp, { resourceType: 'image', folder: DEMO_AVATAR_FOLDER, subdir: DEMO_AVATAR_FOLDER });
    const row = await _db.demoAvatar.create({
      data: { gender, url: stored.url, storageKey: stored.publicId || stored.key || null },
    });
    created.push({ id: row.id, gender: row.gender, url: row.url });
  }
  return created;
}

/** Delete one avatar from the library + its stored object. Assigned copies stay
 *  on affiliate rows (avatarUrl) until the next generation → never a broken image. */
export async function deleteDemoAvatar(id) {
  const row = await _db.demoAvatar.findUnique({ where: { id } });
  if (!row) return { deleted: false };
  await _db.demoAvatar.delete({ where: { id } });
  if (row.url) await destroyByUrl(row.url).catch(() => {});
  return { deleted: true };
}

// ── Leaderboard in-memory cache ───────────────────────────────────────────────
let _leaderboardCache = null;
let _leaderboardTs    = 0;
const LEADERBOARD_TTL = 60_000; // 60 s

export function invalidateDemoCache() {
  _leaderboardCache = null;
}

// ── Generate demo affiliates ──────────────────────────────────────────────────

export async function generateDemoAffiliates(count = 60, mode = 'mixed') {
  // Clear existing demo AFFILIATES/stats/history. The avatar LIBRARY is permanent
  // and deliberately NOT touched here (only an admin deletes avatars).
  await _db.demoEarningsHistory.deleteMany();
  await _db.demoStats.deleteMany();
  await _db.demoAffiliate.deleteMany();

  const genderMode = ['men', 'women', 'mixed'].includes(mode) ? mode : 'mixed';

  // Load the avatar library once; assign one avatar per affiliate, reused cyclically
  // when there are fewer avatars than affiliates. Empty library → initials fallback.
  const avatars = await _db.demoAvatar.findMany({ select: { gender: true, url: true } });
  const byGender = {
    men:   avatars.filter((a) => a.gender === 'men'),
    women: avatars.filter((a) => a.gender === 'women'),
  };
  const cursor = { men: 0, women: 0 };
  const nextAvatarUrl = (gender) => {
    const pool = byGender[gender];
    if (!pool || pool.length === 0) return null;                 // → initials fallback
    const url = pool[cursor[gender] % pool.length].url;
    cursor[gender] += 1;
    return url;
  };

  const types  = ['aggressive', 'consistent', 'consistent', 'slow']; // weighted
  const created = [];

  for (let i = 0; i < count; i++) {
    const gender = genderMode === 'mixed' ? pick(['men', 'women']) : genderMode;
    const first  = pick(gender === 'men' ? MALE_NAMES : FEMALE_NAMES);
    const last   = pick(LAST_NAMES);
    const name   = `${first} ${last}`;
    const username = `demo_${first.toLowerCase()}${rand(10, 999)}`;

    const affiliate = await _db.demoAffiliate.create({
      data: {
        name,
        username,
        gender,
        avatarUrl:   nextAvatarUrl(gender),      // persisted — never re-randomized
        avatarColor: pick(AVATAR_COLORS),        // initials fallback colour
        growthType:  pick(types),
        stats: {
          create: {
            totalOrders:     rand(0, 30),
            totalRevenue:    randF(0, 9000),
            confirmedOrders: rand(0, 25),
            cancelledOrders: rand(0, 5),
            teamSize:        rand(0, 8),
            teamOrders:      rand(0, 20),
            teamRevenue:     randF(0, 5000),
            teamCommission:  0,
            todayOrders:     rand(0, 3),
            todayRevenue:    randF(0, 800),
            ...seedDemoUgc(),
          },
        },
      },
    });
    created.push(affiliate.id);
  }

  // Seed 7 days of history for each
  const now = new Date();
  for (const demoId of created) {
    const affiliate = await _db.demoAffiliate.findUnique({
      where: { id: demoId },
      select: { growthType: true },
    });
    const g = GROWTH[affiliate.growthType];

    for (let d = 6; d >= 0; d--) {
      const date    = new Date(now);
      date.setDate(date.getDate() - d);
      date.setHours(0, 0, 0, 0);
      const orders   = rand(...g.ordersRange);
      const revenue  = orders > 0 ? orders * randF(...g.revenuePerOrder) : 0;
      const commission = +(revenue * COMMISSION_RATE).toFixed(2);
      await _db.demoEarningsHistory.create({
        data: { demoAffiliateId: demoId, date, orders, revenue: +revenue.toFixed(2), commission },
      });
    }
  }

  // Recalculate teamCommission and ranks
  await recomputeRanks();

  // Ensure competition row exists
  await ensureCompetition();

  // Mark settings as generated
  await _db.demoSettings.upsert({
    where:  { id: 'settings' },
    update: { autoGenerated: true },
    create: { id: 'settings', isEnabled: true, simulationSpeed: 'medium', autoGenerated: true },
  });

  invalidateDemoCache();
  return { generated: count };
}

// ── Ensure competition row ────────────────────────────────────────────────────

export async function ensureCompetition() {
  const existing = await _db.demoCompetition.findUnique({ where: { id: 'current' } });
  if (existing) return existing;

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  return _db.demoCompetition.create({
    data: { id: 'current', startDate: start, endDate: end, isActive: true, cycleNum: 1 },
  });
}

// ── Recalculate ranks ─────────────────────────────────────────────────────────

async function recomputeRanks() {
  const stats = await _db.demoStats.findMany({
    orderBy: [{ totalOrders: 'desc' }, { totalRevenue: 'desc' }],
    select:  { id: true, demoAffiliateId: true, totalRevenue: true },
  });

  for (let i = 0; i < stats.length; i++) {
    await _db.demoStats.update({
      where: { id: stats[i].id },
      data:  {
        teamCommission: +(stats[i].totalRevenue * COMMISSION_RATE).toFixed(2),
        rank: i + 1,
      },
    });
  }
}

// ── Simulate one tick ─────────────────────────────────────────────────────────

export async function simulateTick() {
  const settings = await getDemoSettings();
  if (!settings.isEnabled) return { skipped: true };

  // New business day → roll the "today" buckets (boutique + demo UGC) back to 0.
  // Totals accumulate; only the daily figures reset. Uses the same TZ-aware day
  // boundary as the real UGC engine (Africa/Casablanca default) so demo "today"
  // flips over at the same instant the dashboard's day does.
  if (settings.lastSimAt &&
      businessDateKey(new Date(settings.lastSimAt)) !== businessDateKey(new Date())) {
    await _db.demoStats.updateMany({
      data: { todayOrders: 0, todayRevenue: 0, ugcTodaySales: 0, ugcTodayEarnings: 0 },
    });
  }

  const mult      = SPEED_MULT[settings.simulationSpeed] ?? 1;
  const affiliates = await _db.demoAffiliate.findMany({
    where:   { isActive: true },
    include: { stats: true },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const aff of affiliates) {
    if (!aff.stats) continue;
    const g       = GROWTH[aff.growthType];
    const orders  = Math.round(rand(...g.ordersRange) * mult);
    const revenue = orders > 0 ? +(orders * randF(...g.revenuePerOrder)).toFixed(2) : 0;
    const cancelled = Math.round(orders * g.cancelRate);
    const confirmed = orders - cancelled;

    // Team growth (probabilistic)
    const teamDelta = Math.random() < g.teamGrowthChance * mult ? rand(0, 2) : 0;
    const teamOrdersDelta = Math.round(orders * 0.3);
    const teamRevenueDelta = +(teamOrdersDelta * randF(100, 300)).toFixed(2);

    // Demo UGC growth (presentation-only — never writes to ugc_earnings/targets).
    const ugcSalesDelta = Math.round(rand(0, 8) * mult);
    const ugcEarnDelta  = +(ugcSalesDelta * DEMO_UGC_COMMISSION).toFixed(2);

    await _db.demoStats.update({
      where: { demoAffiliateId: aff.id },
      data: {
        totalOrders:     { increment: orders },
        totalRevenue:    { increment: revenue },
        confirmedOrders: { increment: confirmed },
        cancelledOrders: { increment: cancelled },
        todayOrders:     { increment: orders },
        todayRevenue:    { increment: revenue },
        teamSize:        { increment: teamDelta },
        teamOrders:      { increment: teamOrdersDelta },
        teamRevenue:     { increment: teamRevenueDelta },
        ugcTodaySales:    { increment: ugcSalesDelta },
        ugcTotalSales:    { increment: ugcSalesDelta },
        ugcTodayEarnings: { increment: ugcEarnDelta },
        ugcTotalEarnings: { increment: ugcEarnDelta },
      },
    });

    // Upsert today's history row
    const existing = await _db.demoEarningsHistory.findFirst({
      where: { demoAffiliateId: aff.id, date: today },
    });
    const commission = +(revenue * COMMISSION_RATE).toFixed(2);
    if (existing) {
      await _db.demoEarningsHistory.update({
        where: { id: existing.id },
        data: {
          orders:     { increment: orders },
          revenue:    { increment: revenue },
          commission: { increment: commission },
        },
      });
    } else {
      await _db.demoEarningsHistory.create({
        data: { demoAffiliateId: aff.id, date: today, orders, revenue, commission },
      });
    }
  }

  // Recalculate ranks + update lastSimAt
  await recomputeRanks();
  await _db.demoSettings.upsert({
    where:  { id: 'settings' },
    update: { lastSimAt: new Date() },
    create: { id: 'settings', isEnabled: true, simulationSpeed: 'medium', lastSimAt: new Date() },
  });

  // Check if competition needs reset (30-day cycle)
  const comp = await _db.demoCompetition.findUnique({ where: { id: 'current' } });
  if (comp && new Date() >= comp.endDate) {
    await resetCompetition(false); // silent reset
  }

  invalidateDemoCache();
  return { simulated: affiliates.length };
}

// ── Background auto-simulation ────────────────────────────────────────────────
// Keeps the competition "alive" without manual clicks: a standalone PM2 worker
// (scripts/demo-competition-engine.mjs) calls runAutoSimTick() on a loop. Same
// advisory-lock pattern as the other engines — only ONE runner ticks at a time.
export const DEMO_SIM_LOCK_KEY      = 0x44454d43; // "DEMC" — distinct from UGC/fake-order locks
export const DEMO_SIM_MIN_INTERVAL  = 5;          // seconds
export const DEMO_SIM_MAX_INTERVAL  = 30;         // seconds
export const DEMO_SIM_DEFAULT_INTERVAL = 10;      // seconds

/** Clamp an auto-sim interval (seconds) into the allowed 5–30 s window. */
export function clampSimInterval(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEMO_SIM_DEFAULT_INTERVAL;
  return Math.min(DEMO_SIM_MAX_INTERVAL, Math.max(DEMO_SIM_MIN_INTERVAL, n));
}

/**
 * One auto-simulation decision + tick. Runs a real simulateTick() ONLY when the
 * demo competition is enabled AND auto-simulation is turned on. Always returns
 * the (clamped) interval so the runner can schedule the next tick and pick up
 * interval changes live, without a restart. The optional advisory lock ensures a
 * single ticking runner even if the process is duplicated.
 * @returns {Promise<{ticked:boolean, intervalMs:number, skipped?:string, result?:object}>}
 */
export async function runAutoSimTick(deps = {}) {
  const { lock } = deps;
  const settings   = await getDemoSettings();
  const intervalMs = clampSimInterval(settings.autoSimIntervalSec) * 1000;

  if (!settings.isEnabled || !settings.autoSimEnabled) {
    return { ticked: false, skipped: 'disabled', intervalMs };
  }

  let held = true;
  if (lock && typeof lock.acquire === 'function') {
    held = await lock.acquire();
    if (!held) return { ticked: false, skipped: 'no_lock', intervalMs };
  }
  try {
    const result = await simulateTick(); // identical logic to the manual button
    return { ticked: !result?.skipped, result, intervalMs };
  } finally {
    if (held && lock && typeof lock.release === 'function') {
      try { await lock.release(); } catch { /* release never masks the result */ }
    }
  }
}

// ── Reset competition ─────────────────────────────────────────────────────────

export async function resetCompetition(clearHistory = true) {
  // Zero all stats (DEMO tables only — production data is never touched).
  await _db.demoStats.updateMany({
    data: {
      totalOrders: 0, totalRevenue: 0, confirmedOrders: 0, cancelledOrders: 0,
      todayOrders: 0, todayRevenue: 0, teamOrders: 0, teamRevenue: 0,
      teamCommission: 0, rank: 0,
      ugcTodayEarnings: 0, ugcTodaySales: 0, ugcTotalEarnings: 0, ugcTotalSales: 0,
    },
  });

  if (clearHistory) {
    await _db.demoEarningsHistory.deleteMany();
  }

  // Advance competition cycle
  const prev = await _db.demoCompetition.findUnique({ where: { id: 'current' } });
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 30);

  await _db.demoCompetition.upsert({
    where:  { id: 'current' },
    update: { startDate: start, endDate: end, cycleNum: { increment: 1 } },
    create: { id: 'current', startDate: start, endDate: end, isActive: true, cycleNum: 1 },
  });

  invalidateDemoCache();
  return { reset: true, cycle: (prev?.cycleNum ?? 0) + 1 };
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getLeaderboard(limit = 20) {
  if (_leaderboardCache && Date.now() - _leaderboardTs < LEADERBOARD_TTL) {
    return _leaderboardCache.slice(0, limit);
  }

  const rows = await _db.demoAffiliate.findMany({
    where:   { isActive: true },
    include: { stats: true },
    orderBy: { stats: { totalOrders: 'desc' } },
    take:    limit,
  });

  const data = rows.map((a, i) => ({
    id:          a.id,
    name:        a.name,
    username:    a.username,
    avatarColor: a.avatarColor,
    avatarUrl:   a.avatarUrl ?? null,   // persisted; UI falls back to initials when null
    gender:      a.gender ?? null,
    growthType:  a.growthType,
    rank:        i + 1,
    totalOrders:     a.stats?.totalOrders     ?? 0,
    totalRevenue:    a.stats?.totalRevenue    ?? 0,
    confirmedOrders: a.stats?.confirmedOrders ?? 0,
    cancelledOrders: a.stats?.cancelledOrders ?? 0,
    todayOrders:     a.stats?.todayOrders     ?? 0,
    todayRevenue:    a.stats?.todayRevenue    ?? 0,
    teamSize:        a.stats?.teamSize        ?? 0,
  }));

  _leaderboardCache = data;
  _leaderboardTs    = Date.now();
  return data.slice(0, limit);
}

// ── Affiliate details (lazy) ──────────────────────────────────────────────────

export async function getDemoAffiliateDetails(id) {
  const aff = await _db.demoAffiliate.findUnique({
    where:   { id },
    include: {
      stats: true,
      earningsHistory: {
        orderBy: { date: 'asc' },
        take:    30,
      },
    },
  });
  if (!aff) return null;

  const s = aff.stats;
  return {
    id:          aff.id,
    name:        aff.name,
    username:    aff.username,
    avatarColor: aff.avatarColor,
    avatarUrl:   aff.avatarUrl ?? null,
    gender:      aff.gender ?? null,
    growthType:  aff.growthType,
    rank:        s?.rank ?? 0,
    // Main stats
    totalOrders:     s?.totalOrders     ?? 0,
    totalRevenue:    s?.totalRevenue    ?? 0,
    confirmedOrders: s?.confirmedOrders ?? 0,
    cancelledOrders: s?.cancelledOrders ?? 0,
    // Today
    todayOrders:  s?.todayOrders  ?? 0,
    todayRevenue: s?.todayRevenue ?? 0,
    // Team
    teamSize:       s?.teamSize       ?? 0,
    teamOrders:     s?.teamOrders     ?? 0,
    teamRevenue:    s?.teamRevenue    ?? 0,
    teamCommission: s?.teamCommission ?? 0,
    // Demo UGC (presentation-only) — for the competition popup "Gains" tab
    ugcTodayEarnings: s?.ugcTodayEarnings ?? 0,
    ugcTodaySales:    s?.ugcTodaySales    ?? 0,
    ugcTotalEarnings: s?.ugcTotalEarnings ?? 0,
    ugcTotalSales:    s?.ugcTotalSales    ?? 0,
    // History (last 30 days)
    earningsHistory: aff.earningsHistory.map((h) => ({
      date:       h.date,
      orders:     h.orders,
      revenue:    h.revenue,
      commission: h.commission,
    })),
  };
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getDemoSettings() {
  const s = await _db.demoSettings.findUnique({ where: { id: 'settings' } });
  return s ?? {
    id: 'settings', isEnabled: true, simulationSpeed: 'medium', lastSimAt: null,
    autoGenerated: false, autoSimEnabled: false, autoSimIntervalSec: DEMO_SIM_DEFAULT_INTERVAL,
  };
}

export async function saveDemoSettings(data = {}) {
  // Only apply fields the caller actually sent, so a partial patch (e.g. just the
  // auto-sim toggle) never clobbers the other settings.
  const patch = {};
  if (data.isEnabled !== undefined)       patch.isEnabled = data.isEnabled === true;
  if (data.simulationSpeed !== undefined && SPEED_MULT[data.simulationSpeed] !== undefined) {
    patch.simulationSpeed = data.simulationSpeed;
  }
  if (data.autoSimEnabled !== undefined)  patch.autoSimEnabled = data.autoSimEnabled === true;
  if (data.autoSimIntervalSec !== undefined) patch.autoSimIntervalSec = clampSimInterval(data.autoSimIntervalSec);

  return _db.demoSettings.upsert({
    where:  { id: 'settings' },
    update: patch,
    create: { id: 'settings', isEnabled: true, simulationSpeed: 'medium', ...patch },
  });
}

// ── Competition info ──────────────────────────────────────────────────────────

export async function getCompetitionInfo() {
  const comp  = await ensureCompetition();
  const total = await _db.demoAffiliate.count({ where: { isActive: true } });
  const now   = new Date();
  const msLeft = comp.endDate.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));

  return {
    startDate: comp.startDate,
    endDate:   comp.endDate,
    cycleNum:  comp.cycleNum,
    daysLeft,
    totalParticipants: total,
  };
}
