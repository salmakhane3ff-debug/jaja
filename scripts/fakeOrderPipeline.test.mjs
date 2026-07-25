#!/usr/bin/env node
/**
 * scripts/fakeOrderPipeline.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Fake Orders Engine — pipeline + isolation. Proves a fake order reuses the
 * EXISTING order/commission/notification pipeline (no duplicate engine), credits
 * the wallet only on DELIVERED (idempotently), and is excluded from every
 * external integration. Uses in-memory fake dbs — no real database/network.
 * Run: node scripts/fakeOrderPipeline.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createFakeOrder, countFakeOrdersInWindows, sanitizeConfigInput } from '../src/lib/services/fakeOrderService.js';
import {
  syncLinkedAffiliateOrderStatus, getReferralCommissionComponent,
} from '../src/lib/services/affiliateSystemService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };

console.log('1) createFakeOrder builds a flagged order from REAL product data:');
{
  const products = [
    { id: 'p1', title: 'Montre Or', images: ['/u/a.jpg'], salePrice: 199, regularPrice: 299 },
    { id: 'p2', title: 'Sac Cuir',  images: ['/u/b.jpg'], salePrice: null, regularPrice: 149 },
  ];
  const created = [];
  const recordArgs = [];
  const db = {
    product: { findMany: async ({ where }) => {
      let list = products.filter((p) => p.isActive !== false);
      if (where?.id?.in) list = list.filter((p) => where.id.in.includes(p.id));
      return list;
    } },
    order: { create: async ({ data }) => { const o = { id: `ord${created.length + 1}`, ...data, items: data.items.create.map((i, k) => ({ id: `it${k}`, ...i })) }; created.push(o); return o; } },
  };
  const record = async (args) => { recordArgs.push(args); return { _id: 'af1' }; };

  const res = await createFakeOrder(
    { affiliateId: 'aff1', productMode: 'all', productIds: [] },
    { db, record, rng: () => 0, now: () => new Date('2026-02-01T12:00:00Z') },
  );
  const o = created[0];
  ok('returns ok', res.ok === true && res.orderId === o.id);
  ok('order is flagged isFake=true', o.isFake === true);
  ok("order.orderSource === 'FAKE'", o.orderSource === 'FAKE');
  ok('NO bemobClickId (→ Bemob never fires)', o.bemobClickId === undefined || o.bemobClickId === null);
  ok('uses a REAL product id + snapshot title', o.items[0].productId === 'p1' && o.items[0].productSnapshot.title === 'Montre Or');
  ok('uses REAL DB price (salePrice 199)', o.items[0].price === 199 && o.paymentTotal === 199);
  ok('customer name looks Moroccan (two words)', String(o.customerName).split(' ').length >= 2);
  ok('has a Moroccan phone', /^0[67]\d{8}$/.test(o.customerPhone));
  ok('affiliate pipeline invoked with isFake:true', recordArgs[0].isFake === true && recordArgs[0].affiliateId === 'aff1');
  ok('record got the linked orderId + real total', recordArgs[0].orderId === o.id && recordArgs[0].total === 199);

  // Selected-products mode restricts the pool.
  const created2 = [];
  const db2 = { ...db, order: { create: async ({ data }) => { const o = { id: 'x', ...data, items: data.items.create }; created2.push(o); return o; } } };
  await createFakeOrder({ affiliateId: 'aff1', productMode: 'selected', productIds: ['p2'] },
    { db: db2, record: async () => ({}), rng: () => 0, now: () => new Date() });
  ok('selected mode picks only a selected product (p2 → price 149)', created2[0].items[0].price === 149);

  // Empty catalogue → no order.
  const dbEmpty = { product: { findMany: async () => [] }, order: { create: async () => { throw new Error('should not create'); } } };
  const none = await createFakeOrder({ affiliateId: 'aff1', productMode: 'all', productIds: [] }, { db: dbEmpty, record: async () => ({}) });
  ok('no active products → {ok:false, NO_PRODUCTS}', none.ok === false && none.reason === 'NO_PRODUCTS');
}

console.log('2) countFakeOrdersInWindows counts only fake orders per window:');
{
  const now = new Date('2026-02-01T12:00:00Z');
  const rows = [
    { affiliateId: 'a', isFake: true,  createdAt: new Date(now.getTime() - 30_000) },      // 30s
    { affiliateId: 'a', isFake: true,  createdAt: new Date(now.getTime() - 20 * 60_000) }, // 20m
    { affiliateId: 'a', isFake: true,  createdAt: new Date(now.getTime() - 5 * 3_600_000) },// 5h
    { affiliateId: 'a', isFake: false, createdAt: new Date(now.getTime() - 10_000) },       // REAL — ignored
  ];
  const db = { order: { count: async ({ where }) => rows.filter((r) =>
    r.affiliateId === where.affiliateId && r.isFake === where.isFake && r.createdAt >= where.createdAt.gte).length } };
  const c = await countFakeOrdersInWindows('a', now, db);
  ok('minute window = 1', c.minute === 1);
  ok('hour window = 2', c.hour === 2);
  ok('day window = 3 (real order excluded)', c.day === 3);
}

// ── Shared fake db for the affiliate-order status pipeline ────────────────────
function makePipelineDb() {
  const state = {
    affOrder: { id: 'af1', orderId: 'ord1', affiliateId: 'aff1', total: 200, commissionAmount: 100, status: 'pending', clientName: 'Sara Alaoui' },
    affiliate: { id: 'aff1', deliveredOrdersCount: 0, generatedRevenue: 0, referralStatus: 'pending' },
    notifications: [],
  };
  const db = {
    affiliateOrder: {
      findFirst: async ({ where }) => (where.orderId === state.affOrder.orderId ? { ...state.affOrder } : null),
      update: async ({ data }) => { Object.assign(state.affOrder, data); return { ...state.affOrder }; },
      aggregate: async ({ where }) => ({
        _sum: { commissionAmount: state.affOrder.status === where.status ? state.affOrder.commissionAmount : 0 },
      }),
    },
    affiliate: {
      update: async ({ data, select }) => {
        if (data.deliveredOrdersCount?.increment) state.affiliate.deliveredOrdersCount += data.deliveredOrdersCount.increment;
        if (data.generatedRevenue?.increment) state.affiliate.generatedRevenue += data.generatedRevenue.increment;
        if (data.referralStatus) state.affiliate.referralStatus = data.referralStatus;
        return select ? { deliveredOrdersCount: state.affiliate.deliveredOrdersCount, referralStatus: state.affiliate.referralStatus } : { ...state.affiliate };
      },
    },
    affiliateNotification: { create: async ({ data }) => { state.notifications.push(data); return data; } },
  };
  return { db, state };
}

console.log('3) DELIVERED reuses the existing commission engine (wallet + counters), idempotently:');
{
  const { db, state } = makePipelineDb();

  const r1 = await syncLinkedAffiliateOrderStatus('ord1', 'confirmed', { db });
  ok('confirmed syncs, does NOT deliver', r1.synced === true && r1.delivered === false);
  ok('no delivered-count change on confirm', state.affiliate.deliveredOrdersCount === 0);
  ok('affiliate notified on status change', state.notifications.length === 1);

  const r2 = await syncLinkedAffiliateOrderStatus('ord1', 'delivered', { db });
  ok('delivered transition credited once', r2.delivered === true && state.affiliate.deliveredOrdersCount === 1);
  ok('generatedRevenue increased by order total', state.affiliate.generatedRevenue === 200);
  ok('referralStatus flipped to active', state.affiliate.referralStatus === 'active');

  const r3 = await syncLinkedAffiliateOrderStatus('ord1', 'delivered', { db });
  ok('re-delivering is a no-op (idempotent)', r3.synced === false && state.affiliate.deliveredOrdersCount === 1);

  // Balance provider (referral_commission) now sees the delivered commission —
  // exactly the SAME provider real orders use → wallet increases.
  const component = await getReferralCommissionComponent('aff1', db);
  ok('referral_commission provider counts the delivered fake order (wallet ↑)', component === 100);

  const rMissing = await syncLinkedAffiliateOrderStatus('nope', 'delivered', { db });
  ok('unlinked order → no sync', rMissing.synced === false);
}

console.log('4) External integrations are excluded for fake orders:');
{
  // Bemob: covered in §1 (fake order carries no bemobClickId → triggerBemobConversion returns early).
  ok('fake order has no bemobClickId (Bemob excluded)', true);

  // WhatsApp bot: the read-only order query must exclude isFake rows.
  const botSrc = readFileSync(join(__dirname, 'whatsapp-order-bot.js'), 'utf8');
  ok('whatsapp-order-bot query excludes fake orders', /COALESCE\("isFake",\s*false\)\s*<>\s*true/.test(botSrc));

  // orderService: fake orders skip the Bemob CONFIRMED branch + sync to affiliate.
  const orderSvc = readFileSync(join(__dirname, '..', 'src', 'lib', 'services', 'orderService.js'), 'utf8');
  ok('orderService excludes fake orders from the Bemob path', /!isFakeOrder\s*\n?\s*&&\s*typeof data\.status/.test(orderSvc));
  ok('orderService syncs fake status to the affiliate pipeline', /isFakeOrder\s*&&\s*data\.status !== undefined/.test(orderSvc));
}

console.log('5) Config input sanitisation:');
{
  const s = sanitizeConfigInput({
    enabled: 'yes', ordersPerHour: '2', ordersPerDay: '20', ordersPerMinute: '',
    minDelaySec: '30', maxDelaySec: '600', workingHourStart: '9', workingHourEnd: '22',
    workingDays: '1,2,9,-1,5', productMode: 'selected', productIds: ['p1', '', 'p2'],
  });
  ok('enabled coerced to boolean', s.enabled === true);
  ok('numeric fields parsed', s.ordersPerHour === 2 && s.ordersPerDay === 20 && s.minDelaySec === 30);
  ok('empty ordersPerMinute → null (limit cleared)', s.ordersPerMinute === null);
  ok('workingDays keeps only valid 0-6', s.workingDays === '1,2,5');
  ok('productMode selected preserved', s.productMode === 'selected');
  ok('productIds filtered (no blanks)', s.productIds.length === 2);
  ok('unknown productMode falls back to all', sanitizeConfigInput({ productMode: 'xxx' }).productMode === 'all');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
