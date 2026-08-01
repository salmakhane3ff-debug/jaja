/**
 * src/lib/boosterProgress.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE, READ-ONLY presentation helpers for the Starter Booster dashboard.
 *
 * Progress is DERIVED from real data — the affiliate's own AffiliateOrder rows
 * created since the booster was activated — and from the package's admin-set
 * duration/target. Nothing here is stored, invented or written back:
 *
 *   • Completion is COMPUTED (target reached or the period elapsed). The stored
 *     status stays ACTIVE on purpose: the balance provider derives the booster
 *     deduction from ACTIVE rows, so flipping the status would silently refund
 *     the affiliate. Never write a "COMPLETED" status here.
 *   • When the admin has not configured a target/duration, the corresponding
 *     figure is reported as null and the UI hides it rather than guessing.
 *
 * No React, no DB, no I/O → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DAY_MS = 86_400_000;
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const ms = (d) => (d instanceof Date ? d.getTime() : new Date(d || 0).getTime());

/**
 * Build the dashboard view of ONE booster purchase.
 * @param {object} purchase  { packageId, packageName, price, status, activatedAt, createdAt }
 * @param {object|null} pkg  admin package config (durationDays, targetSales, dailyMin/Max)
 * @param {Array} orders     the affiliate's order rows since activation ({ createdAt, commissionAmount })
 * @param {number} now       epoch ms
 */
export function computeBoosterProgress(purchase, pkg, orders = [], now = Date.now()) {
  const startedAt = ms(purchase?.activatedAt || purchase?.createdAt);
  const target    = Math.max(0, Math.round(num(pkg?.targetSales, 0)));
  const duration  = Math.max(0, Math.round(num(pkg?.durationDays, 0)));
  const endsAt    = duration > 0 ? startedAt + duration * DAY_MS : null;

  // Only orders in the booster window count.
  const inWindow = (orders || []).filter((o) => {
    const t = ms(o?.createdAt);
    return t >= startedAt && (endsAt === null || t <= endsAt);
  });

  const rawSales = inWindow.length;
  const sales    = target > 0 ? Math.min(rawSales, target) : rawSales;
  const remaining = target > 0 ? Math.max(0, target - sales) : null;
  const percent   = target > 0 ? Math.min(100, Math.round((sales / target) * 100)) : null;

  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const todaySales = inWindow.filter((o) => ms(o.createdAt) >= startOfToday.getTime()).length;

  const daysLeft = endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / DAY_MS));
  const expired  = endsAt !== null && now >= endsAt;
  const reached  = target > 0 && sales >= target;
  // DERIVED only — the stored status is never mutated (see file header).
  const completed = purchase?.status === 'ACTIVE' && (expired || reached);

  const earnings = inWindow.reduce((s, o) => s + num(o?.commissionAmount, 0), 0);

  return {
    id: purchase?.id,
    packageId: purchase?.packageId,
    packageName: purchase?.packageName,
    price: num(purchase?.price, 0),
    status: purchase?.status,
    startedAt: startedAt || null,
    endsAt,
    target: target || null,
    durationDays: duration || null,
    sales,
    todaySales,
    remaining,
    percent,
    daysLeft,
    completed,
    earnings: Math.round(earnings * 100) / 100,
    timeline: buildTimeline(inWindow, now),
  };
}

/**
 * Hourly activity timeline, NEWEST FIRST — "09:00 · +2 مبيعات".
 * Groups the real order rows of the current day by hour; never fabricates slots.
 */
export function buildTimeline(orders = [], now = Date.now(), maxSlots = 8) {
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const buckets = new Map(); // hourStartMs → count
  for (const o of orders) {
    const t = ms(o?.createdAt);
    if (t < startOfToday.getTime() || t > now) continue;
    const d = new Date(t); d.setMinutes(0, 0, 0);
    buckets.set(d.getTime(), (buckets.get(d.getTime()) || 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])              // newest first
    .slice(0, maxSlots)
    .map(([hourMs, count]) => ({
      at: hourMs,
      label: new Date(hourMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      count,
    }));
}

/**
 * Split purchases into the ACTIVE dashboard list and the finished history.
 * Card payments still awaiting validation stay in `pending`.
 */
export function splitBoosters(views = []) {
  const active  = views.filter((v) => v.status === 'ACTIVE' && !v.completed);
  const past    = views.filter((v) => v.status === 'ACTIVE' && v.completed);
  const pending = views.filter((v) => v.status === 'PENDING');
  const refused = views.filter((v) => v.status === 'REJECTED');
  return { active, past: [...past, ...refused], pending };
}
