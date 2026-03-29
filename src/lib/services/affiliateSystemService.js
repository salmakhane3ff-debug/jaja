/**
 * src/lib/services/affiliateSystemService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete business logic for the new Affiliate Platform.
 * Independent from the old affiliateService.js — no shared state.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma                            from '../prisma.js';
import { hashPassword, comparePassword, signToken } from './authService.js';

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapAffiliate(a) {
  if (!a) return null;
  return {
    _id:                 a.id,
    id:                  a.id,
    username:            a.username,
    name:                a.name,
    phone:               a.phone     || null,
    avatarUrl:           a.avatarUrl || null,
    commissionRate:      a.commissionRate,
    isActive:            a.isActive,
    bankName:            a.bankName,
    rib:                 a.rib,
    accountName:         a.accountName,
    parentId:            a.parentId,
    totalClicks:         a.totalClicks,
    totalOrders:         a.totalOrders,
    totalCommission:     a.totalCommission,
    referralStatus:      a.referralStatus      ?? 'pending',
    deliveredOrdersCount:a.deliveredOrdersCount ?? 0,
    createdAt:           a.createdAt,
  };
}

function mapOrder(o, rawData = null) {
  // Accept either a plain array (legacy) or { items, shippingAddress } object
  const rawItems     = Array.isArray(rawData) ? rawData : (rawData?.items     || []);
  const shippingAddr = Array.isArray(rawData) ? null    : (rawData?.shippingAddress || null);

  // Build structured orderItems from Order.items (if fetched)
  const orderItems = rawItems.map((item) => {
    const snap = (item.productSnapshot && typeof item.productSnapshot === 'object')
      ? item.productSnapshot
      : {};
    // images can be an array or a single string depending on how snapshot was saved
    const rawImages = snap.images;
    const productImage = Array.isArray(rawImages)
      ? (rawImages[0] || null)
      : (typeof rawImages === 'string' ? rawImages : null);
    return {
      productName:  snap.title || o.productTitle || 'Produit',
      productImage,
      quantity:     item.quantity || 1,
      price:        item.price    || 0,
    };
  });
  const totalItems = orderItems.reduce((s, i) => s + i.quantity, 0);

  return {
    _id:             o.id,
    id:              o.id,
    affiliateId:     o.affiliateId,
    orderId:         o.orderId,
    clientName:      o.clientName,
    clientPhone:     o.clientPhone,
    productTitle:    o.productTitle,
    total:           o.total,
    commissionAmount:o.commissionAmount,
    status:          o.status,
    ipAddress:       o.ipAddress,
    isSuspicious:    o.isSuspicious,
    suspicionReason: o.suspicionReason,
    createdAt:       o.createdAt,
    orderItems,
    totalItems,
    shippingAddress: shippingAddr,
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Login with username + password.
 * Returns { token, affiliate } or throws.
 */
export async function loginAffiliate(username, password) {
  const input = username.toLowerCase().trim();
  // Accept login by username OR phone number
  const affiliate = await prisma.affiliate.findFirst({
    where: { OR: [{ username: input }, { phone: input }] },
  });

  if (!affiliate) throw Object.assign(new Error('Identifiant ou mot de passe incorrect'), { code: 'INVALID_CREDENTIALS' });
  if (!affiliate.isActive) throw Object.assign(new Error('Compte inactif. Contactez l\'administrateur.'), { code: 'INACTIVE' });

  const valid = await comparePassword(password, affiliate.password);
  if (!valid)  throw Object.assign(new Error('Identifiant ou mot de passe incorrect'), { code: 'INVALID_CREDENTIALS' });

  const token = signToken({ affiliateId: affiliate.id, username: affiliate.username, type: 'affiliate' });
  return { token, affiliate: mapAffiliate(affiliate) };
}

// ── Profile ───────────────────────────────────────────────────────────────────

export async function getAffiliateById(id) {
  const a = await prisma.affiliate.findUnique({ where: { id } });
  return mapAffiliate(a);
}

export async function updateAffiliateBank(id, { bankName, rib, accountName }) {
  const a = await prisma.affiliate.update({
    where: { id },
    data:  { bankName, rib, accountName },
  });
  return mapAffiliate(a);
}

export async function updateAffiliateProfile(id, data) {
  const update = {};
  if (data.name      !== undefined) update.name      = data.name;
  if (data.isActive  !== undefined) update.isActive  = Boolean(data.isActive);
  if (data.commissionRate !== undefined) update.commissionRate = parseFloat(data.commissionRate);
  if (data.password  !== undefined && data.password.trim()) {
    update.password = await hashPassword(data.password);
  }

  // Avatar URL — freely updatable
  if (data.avatarUrl !== undefined) update.avatarUrl = data.avatarUrl || null;

  // Phone is set-once: only update if currently null/empty
  if (data.phone !== undefined && data.phone.trim()) {
    const current = await prisma.affiliate.findUnique({ where: { id }, select: { phone: true } });
    if (!current?.phone) {
      update.phone = data.phone.trim();
    }
  }

  const a = await prisma.affiliate.update({ where: { id }, data: update });
  return mapAffiliate(a);
}

// ── Validate ref (public) ─────────────────────────────────────────────────────

export async function validateAffiliateRef(username) {
  const a = await prisma.affiliate.findFirst({
    where: { username: username.toLowerCase().trim(), isActive: true },
  });
  if (!a) return null;
  return { affiliateId: a.id, username: a.username, name: a.name };
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function getAffiliateOrders(affiliateId) {
  const affOrders = await prisma.affiliateOrder.findMany({
    where:   { affiliateId },
    orderBy: { createdAt: 'desc' },
  });

  // Bulk-fetch linked Order items (one extra query — avoids N+1)
  const orderIds = affOrders.map((o) => o.orderId).filter(Boolean);
  const itemsByOrderId = {};
  if (orderIds.length > 0) {
    const linkedOrders = await prisma.order.findMany({
      where:  { id: { in: orderIds } },
      select: {
        id:              true,
        shippingAddress: true,
        items: {
          select: { quantity: true, price: true, productSnapshot: true },
        },
      },
    });
    for (const lo of linkedOrders) {
      itemsByOrderId[lo.id] = { items: lo.items, shippingAddress: lo.shippingAddress };
    }
  }

  console.log('[Affiliate] getAffiliateOrders | count:', affOrders.length, '| with items:', orderIds.length);
  return affOrders.map((o) => mapOrder(o, itemsByOrderId[o.orderId] || null));
}

/**
 * Record an affiliate order (called after checkout order creation).
 * Creates AffiliateOrder + AffiliateNotification + links Order.affiliateId.
 * Returns null if affiliate not found.
 * Accepts either `affiliateId` (direct FK) or `username` (fallback lookup).
 */
export async function recordAffiliateOrder({ username, affiliateId, orderId, clientName, clientPhone, productTitle, total, ipAddress }) {
  // Look up affiliate — prefer affiliateId for accuracy, fall back to username
  let affiliate = null;
  if (affiliateId?.trim()) {
    affiliate = await prisma.affiliate.findFirst({
      where: { id: affiliateId.trim(), isActive: true },
    });
  }
  if (!affiliate && username?.trim()) {
    affiliate = await prisma.affiliate.findFirst({
      where: { username: username.toLowerCase().trim(), isActive: true },
    });
  }
  if (!affiliate) return null;

  const commissionAmount = parseFloat((total * affiliate.commissionRate).toFixed(2));
  const since1h = new Date(Date.now() - 60 * 60 * 1000);

  // ── Fraud detection (parallel lookups, no blocking) ───────────────────────
  const reasons = [];

  const [ipCount, phoneCount, nameCount, affiliateCount] = await Promise.all([
    // Same IP in last hour
    ipAddress
      ? prisma.affiliateOrder.count({
          where: { ipAddress, createdAt: { gte: since1h } },
        })
      : Promise.resolve(0),
    // Same phone number ever
    clientPhone?.trim()
      ? prisma.affiliateOrder.count({
          where: { clientPhone: clientPhone.trim() },
        })
      : Promise.resolve(0),
    // Same client name in last 24h
    clientName?.trim()
      ? prisma.affiliateOrder.count({
          where: {
            clientName: { equals: clientName.trim(), mode: 'insensitive' },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        })
      : Promise.resolve(0),
    // Same affiliate: more than 10 orders in last hour
    prisma.affiliateOrder.count({
      where: { affiliateId: affiliate.id, createdAt: { gte: since1h } },
    }),
  ]);

  if (ipAddress && ipCount >= 3)  reasons.push('Duplicate IP');
  if (clientPhone && phoneCount >= 1) reasons.push('Repeated phone');
  if (clientName && nameCount >= 2)  reasons.push('Repeated name');
  if (affiliateCount >= 10)          reasons.push('High frequency orders');

  const isSuspicious    = reasons.length > 0;
  const suspicionReason = isSuspicious ? reasons.join(', ') : null;

  const [affOrder] = await prisma.$transaction([
    prisma.affiliateOrder.create({
      data: {
        affiliateId:      affiliate.id,
        orderId:          orderId      || null,
        clientName:       clientName   || '',
        clientPhone:      clientPhone  || null,
        productTitle:     productTitle || '',
        total:            parseFloat(total) || 0,
        commissionAmount,
        status:           'pending',
        ipAddress:        ipAddress    || null,
        isSuspicious,
        suspicionReason,
      },
    }),
    prisma.affiliateNotification.create({
      data: {
        affiliateId: affiliate.id,
        message:     `Nouvelle commande: ${Number(total).toFixed(0)} MAD - Client: ${clientName || 'Inconnu'}${isSuspicious ? ' ⚠' : ''}`,
      },
    }),
    prisma.affiliate.update({
      where: { id: affiliate.id },
      data:  { totalOrders: { increment: 1 }, totalCommission: { increment: commissionAmount } },
    }),
  ]);

  // Link the main Order record to this affiliate (fire-and-forget, non-blocking)
  if (orderId) {
    prisma.order.update({
      where: { id: orderId },
      data:  { affiliateId: affiliate.id },
    }).catch(() => {}); // Don't fail if order ID doesn't exist
  }

  return mapOrder(affOrder);
}

/**
 * When an AffiliateOrder becomes "delivered", increment the owning affiliate's
 * deliveredOrdersCount and flip their referralStatus to "active" (once only).
 * Called fire-and-forget after any status change to "delivered".
 */
async function activateReferralIfDelivered(affiliateId) {
  const updated = await prisma.affiliate.update({
    where: { id: affiliateId },
    data:  { deliveredOrdersCount: { increment: 1 } },
    select: { deliveredOrdersCount: true, referralStatus: true },
  });
  if (updated.deliveredOrdersCount >= 1 && updated.referralStatus !== 'active') {
    await prisma.affiliate.update({
      where: { id: affiliateId },
      data:  { referralStatus: 'active' },
    });
  }
}

/**
 * Update AffiliateOrder status (affiliate or admin).
 * Triggers referral activation when status becomes "delivered".
 */
export async function updateAffiliateOrderStatus(affiliateOrderId, status) {
  const order = await prisma.affiliateOrder.update({
    where: { id: affiliateOrderId },
    data:  { status },
  });
  if (status === 'delivered') {
    activateReferralIfDelivered(order.affiliateId).catch(() => {});
  }
  return mapOrder(order);
}

// ── Payouts ───────────────────────────────────────────────────────────────────

/**
 * Get affiliate's available balance:
 *   balance = sum(commissionAmount for delivered orders) - sum(paid payouts)
 */
export async function getAffiliateBalance(affiliateId) {
  const [earned, paid] = await Promise.all([
    prisma.affiliateOrder.aggregate({
      where: { affiliateId, status: 'delivered' },
      _sum:  { commissionAmount: true },
    }),
    prisma.affiliatePayout.aggregate({
      where: { affiliateId, status: 'paid' },
      _sum:  { amount: true },
    }),
  ]);

  const totalEarned = earned._sum.commissionAmount ?? 0;
  const totalPaid   = paid._sum.amount             ?? 0;
  return parseFloat((totalEarned - totalPaid).toFixed(2));
}

export async function getAffiliatePayouts(affiliateId) {
  const payouts = await prisma.affiliatePayout.findMany({
    where:   { affiliateId },
    orderBy: { createdAt: 'desc' },
  });
  return payouts;
}

export async function requestPayout(affiliateId, amount) {
  const balance = await getAffiliateBalance(affiliateId);
  if (amount > balance) {
    throw Object.assign(new Error('Montant supérieur au solde disponible'), { code: 'INSUFFICIENT_BALANCE' });
  }
  if (amount <= 0) {
    throw Object.assign(new Error('Montant invalide'), { code: 'INVALID_AMOUNT' });
  }

  const payout = await prisma.affiliatePayout.create({
    data: { affiliateId, amount: parseFloat(amount), status: 'pending' },
  });
  return payout;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function getAffiliateNotifications(affiliateId) {
  return prisma.affiliateNotification.findMany({
    where:   { affiliateId },
    orderBy: { createdAt: 'desc' },
    take:    50,
  });
}

export async function markNotificationsRead(affiliateId) {
  await prisma.affiliateNotification.updateMany({
    where: { affiliateId, read: false },
    data:  { read: true },
  });
  return { ok: true };
}

// ── Team ──────────────────────────────────────────────────────────────────────

export async function getAffiliateTeam(parentId) {
  const members = await prisma.affiliate.findMany({
    where:   { parentId },
    orderBy: { createdAt: 'asc' },
  });
  return members.map(mapAffiliate);
}

// ── Stats (dashboard) ─────────────────────────────────────────────────────────

export async function getAffiliateDashboardStats(affiliateId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    affiliateRow,
    allOrders,
    todayOrders,
    teamCount,
    validReferrals,
    unreadCount,
    balance,
    payouts,
    teamMembers,
  ] = await Promise.all([
    prisma.affiliate.findUnique({ where: { id: affiliateId }, select: { totalClicks: true, totalOrders: true } }),
    prisma.affiliateOrder.findMany({
      where:   { affiliateId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.affiliateOrder.findMany({
      where: { affiliateId, createdAt: { gte: today } },
    }),
    prisma.affiliate.count({ where: { parentId: affiliateId } }),
    prisma.affiliate.count({ where: { parentId: affiliateId, referralStatus: 'active' } }),
    prisma.affiliateNotification.count({ where: { affiliateId, read: false } }),
    getAffiliateBalance(affiliateId),
    getAffiliatePayouts(affiliateId),
    prisma.affiliate.findMany({ where: { parentId: affiliateId }, select: { id: true } }),
  ]);

  // Total commission from all team members' delivered orders
  let teamCommission = 0;
  if (teamMembers.length > 0) {
    const teamIds = teamMembers.map(m => m.id);
    const teamOrders = await prisma.affiliateOrder.findMany({
      where: { affiliateId: { in: teamIds } },
      select: { commissionAmount: true },
    });
    teamCommission = teamOrders.reduce((s, o) => s + (o.commissionAmount || 0), 0);
  }

  const byStatus = (status) => allOrders.filter((o) => o.status === status);

  // ── Part 1: Count ITEMS not rows for delivered progress ───────────────────
  const deliveredAffOrders = byStatus('delivered');
  const deliveredOrderIds  = deliveredAffOrders.map((o) => o.orderId).filter(Boolean);
  let deliveredItems = deliveredAffOrders.length; // fallback: row count

  if (deliveredOrderIds.length > 0) {
    const deliveredLinked = await prisma.order.findMany({
      where:  { id: { in: deliveredOrderIds } },
      select: { id: true, items: { select: { quantity: true } } },
    });
    const qtyMap = {};
    for (const lo of deliveredLinked) {
      qtyMap[lo.id] = lo.items.reduce((s, i) => s + i.quantity, 0);
    }
    deliveredItems = deliveredAffOrders.reduce((sum, o) => {
      return sum + (o.orderId && qtyMap[o.orderId] != null ? qtyMap[o.orderId] : 1);
    }, 0);
    console.log('[Affiliate] deliveredItems (quantities):', deliveredItems, '| rows:', deliveredAffOrders.length);
  }

  const totalClicks = affiliateRow?.totalClicks ?? 0;
  const totalOrders = affiliateRow?.totalOrders ?? allOrders.length;
  const conversionRate = totalClicks > 0
    ? parseFloat(((totalOrders / totalClicks) * 100).toFixed(1))
    : 0;

  return {
    todaySales:       todayOrders.length,
    todayRevenue:     todayOrders.reduce((s, o) => s + o.total, 0),
    confirmed:        byStatus('confirmed').length,
    cancelled:        byStatus('cancelled').length,
    shipping:         byStatus('shipped').length,
    delivered:        deliveredItems,
    totalRevenue:     allOrders.reduce((s, o) => s + o.total, 0),
    totalCommission:  allOrders.reduce((s, o) => s + o.commissionAmount, 0),
    balance,
    teamCount,
    totalReferrals:   teamCount,        // all invited affiliates
    validReferrals,                     // only those with ≥1 delivered order
    unreadCount,
    payouts,
    totalClicks,
    totalOrders,
    conversionRate,
    teamCommission,
  };
}

// ── Gamification ──────────────────────────────────────────────────────────────

/**
 * Bonus progression based on VALID referrals (team members with ≥1 delivered order).
 * Goal: reach `target` valid referrals to unlock the bonus.
 * Target scales down as the team grows (max reduction: -2 per 2 members, floor 3).
 */
export function computeGamification(validReferrals, teamSize) {
  const target   = Math.max(3, 5 - Math.floor(teamSize / 2));
  const progress = Math.min(100, Math.round((validReferrals / target) * 100));
  return { target, progress, remaining: Math.max(0, target - validReferrals), validReferrals };
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function adminGetAllAffiliates() {
  const affiliates = await prisma.affiliate.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { affiliateOrders: true, children: true } } },
  });
  return affiliates.map((a) => ({
    ...mapAffiliate(a),
    ordersCount:  a._count.affiliateOrders,
    teamCount:    a._count.children,
  }));
}

export async function adminCreateAffiliate({ name, username, password, commissionRate }) {
  if (!username || !password) throw new Error('username et password sont requis');
  const hashed = await hashPassword(password);
  const a = await prisma.affiliate.create({
    data: {
      name:           name || username,
      username:       username.toLowerCase().trim(),
      password:       hashed,
      commissionRate: parseFloat(commissionRate) || 0.5,
      isActive:       false,
    },
  });
  return mapAffiliate(a);
}

export async function adminUpdateAffiliate(id, data) {
  const update = {};
  if (data.name           !== undefined) update.name           = data.name;
  if (data.commissionRate !== undefined) update.commissionRate = parseFloat(data.commissionRate);
  if (data.isActive       !== undefined) update.isActive       = Boolean(data.isActive);
  if (data.password       !== undefined && data.password.trim()) {
    update.password = await hashPassword(data.password);
  }
  const a = await prisma.affiliate.update({ where: { id }, data: update });
  return mapAffiliate(a);
}

export async function adminDeleteAffiliate(id) {
  try {
    await prisma.affiliate.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return false;
    throw err;
  }
}

export async function adminGetAllAffiliateOrders() {
  const affOrders = await prisma.affiliateOrder.findMany({
    orderBy: { createdAt: 'desc' },
    include: { affiliate: { select: { username: true, name: true } } },
  });

  // Bulk-fetch linked Order items (same pattern as getAffiliateOrders)
  const orderIds = affOrders.map((o) => o.orderId).filter(Boolean);
  const itemsByOrderId = {};
  if (orderIds.length > 0) {
    const linkedOrders = await prisma.order.findMany({
      where:  { id: { in: orderIds } },
      select: {
        id:              true,
        shippingAddress: true,
        items: {
          select: { quantity: true, price: true, productSnapshot: true },
        },
      },
    });
    for (const lo of linkedOrders) {
      itemsByOrderId[lo.id] = { items: lo.items, shippingAddress: lo.shippingAddress };
    }
  }

  return affOrders.map((o) => ({
    ...mapOrder(o, itemsByOrderId[o.orderId] || null),
    affiliateUsername: o.affiliate?.username,
    affiliateName:     o.affiliate?.name,
  }));
}

export async function adminUpdateAffiliateOrderStatus(id, status) {
  const o = await prisma.affiliateOrder.update({ where: { id }, data: { status } });
  if (status === 'delivered') {
    activateReferralIfDelivered(o.affiliateId).catch(() => {});
  }
  return mapOrder(o);
}

export async function adminGetAllPayouts() {
  const payouts = await prisma.affiliatePayout.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      affiliate: { select: { username: true, name: true, bankName: true, rib: true, accountName: true } },
    },
  });
  return payouts.map((p) => ({
    _id:               p.id,
    id:                p.id,
    affiliateId:       p.affiliateId,
    amount:            p.amount,
    status:            p.status,
    createdAt:         p.createdAt,
    affiliateUsername: p.affiliate?.username,
    affiliateName:     p.affiliate?.name,
    bankName:          p.affiliate?.bankName,
    rib:               p.affiliate?.rib,
    accountName:       p.affiliate?.accountName,
  }));
}

export async function adminApprovePayout(id) {
  const p = await prisma.affiliatePayout.update({ where: { id }, data: { status: 'paid' } });
  return { _id: p.id, id: p.id, status: p.status, amount: p.amount };
}
