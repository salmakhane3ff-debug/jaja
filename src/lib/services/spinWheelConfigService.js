/**
 * src/lib/services/spinWheelConfigService.js
 * Spin Wheel – config CRUD + event tracking + analytics
 */

import prisma from '../prisma.js';

// ── Default segments used when no config exists yet ───────────────────────────
const DEFAULT_SEGMENTS = [
  { label: 'Better luck next time', color: '#94a3b8', rewardType: 'none',         probability: 30, position: 0 },
  { label: '10% OFF',               color: '#f59e0b', rewardType: 'coupon',        probability: 25, position: 1 },
  { label: 'Free Shipping',         color: '#10b981', rewardType: 'free_shipping', probability: 20, position: 2 },
  { label: 'Try again',             color: '#6366f1', rewardType: 'none',          probability: 10, position: 3 },
  { label: '20% OFF',               color: '#ef4444', rewardType: 'coupon',        probability: 10, position: 4 },
  { label: 'Free Gift',             color: '#8b5cf6', rewardType: 'product',       probability:  5, position: 5 },
];

// ── Get or create the single config row ───────────────────────────────────────
export async function getConfig() {
  let config = await prisma.spinWheelConfig.findFirst({
    include: { segments: { orderBy: { position: 'asc' } } },
  });

  if (!config) {
    config = await prisma.spinWheelConfig.create({
      data: {
        segments: { create: DEFAULT_SEGMENTS },
      },
      include: { segments: { orderBy: { position: 'asc' } } },
    });
  }

  return config;
}

// ── Update config (settings only, no segments) ────────────────────────────────
export async function updateConfig(id, data) {
  const { segments: _seg, ...fields } = data;
  return prisma.spinWheelConfig.update({ where: { id }, data: fields });
}

// ── Replace all segments for a config ─────────────────────────────────────────
export async function replaceSegments(configId, segments) {
  await prisma.spinWheelSegment.deleteMany({ where: { configId } });
  const created = await prisma.spinWheelSegment.createMany({
    data: segments.map((s, i) => ({
      configId,
      label:        s.label        || 'Segment',
      color:        s.color        || '#94a3b8',
      image:        s.image        || null,
      rewardType:   s.rewardType   || 'none',
      probability:  Number(s.probability) || 10,
      couponCode:   s.couponCode   || null,
      productId:    s.productId    || null,
      minCartValue: Number(s.minCartValue) || 0,
      position:     i,
    })),
  });
  return created;
}

// ── Weighted random spin ───────────────────────────────────────────────────────
export function pickWinner(segments) {
  const total = segments.reduce((s, seg) => s + seg.probability, 0);
  let rand    = Math.random() * total;
  for (const seg of segments) {
    rand -= seg.probability;
    if (rand <= 0) return seg;
  }
  return segments[segments.length - 1];
}

// ── Record any spin event ──────────────────────────────────────────────────────
export async function recordEvent(data) {
  return prisma.spinWheelEvent.create({ data });
}

// ── Analytics aggregation ─────────────────────────────────────────────────────
export async function getAnalytics() {
  const [views, clicks, wins, unlocks, coupons, conversions] = await Promise.all([
    prisma.spinWheelEvent.count({ where: { eventType: 'spin_view'       } }),
    prisma.spinWheelEvent.count({ where: { eventType: 'spin_click'      } }),
    prisma.spinWheelEvent.count({ where: { eventType: 'spin_win'        } }),
    prisma.spinWheelEvent.count({ where: { eventType: 'reward_unlock'   } }),
    prisma.spinWheelEvent.count({ where: { eventType: 'coupon_used'     } }),
    prisma.spinWheelEvent.count({ where: { eventType: 'spin_conversion' } }),
  ]);

  // Revenue from converted orders
  const conversionRows = await prisma.spinWheelEvent.findMany({
    where: { eventType: 'spin_conversion', orderId: { not: null } },
    select: { orderId: true },
  });
  const orderIds = [...new Set(conversionRows.map((r) => r.orderId))];
  let revenue = 0;
  if (orderIds.length) {
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { paymentDetails: true },
    });
    revenue = orders.reduce((sum, o) => {
      const total = o.paymentDetails?.total || 0;
      return sum + Number(total);
    }, 0);
  }

  return { views, clicks, wins, unlocks, coupons, conversions, orders: orderIds.length, revenue };
}
