/**
 * src/lib/services/recruitmentData.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side data for the /tsajlim3ana landing page — REAL platform data only,
 * cached (60 s) so the public page stays fast. No private data (no phone/email);
 * names are masked at formatting time. Fake/engine orders (isFake) are excluded.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import prisma from '../prisma.js';
import { formatLiveFeedEvent } from '../recruitmentCta.js';

const TTL = 60_000;

// ── Public statistics (real counts) ───────────────────────────────────────────
let _statsCache = { at: 0, data: null };

export async function getRecruitmentStats() {
  if (_statsCache.data && Date.now() - _statsCache.at < TTL) return _statsCache.data;
  try {
    const [members, activeAffiliates, confirmedOrders, successfulOrders, ugcApproved, teams] = await Promise.all([
      prisma.affiliate.count(),
      prisma.affiliate.count({ where: { isActive: true } }),
      prisma.affiliateOrder.count({ where: { status: 'confirmed', isFake: false } }),
      prisma.affiliateOrder.count({ where: { status: 'delivered', isFake: false } }),
      prisma.ugcVideoSubmission.count({ where: { status: 'APPROVED' } }),
      prisma.affiliate.groupBy({ by: ['parentId'], where: { parentId: { not: null } } }),
    ]);
    const data = { members, activeAffiliates, confirmedOrders, successfulOrders, ugcApproved, activeTeams: teams.length };
    _statsCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    console.error('[recruitment] stats error:', err?.message ?? err);
    return { members: 0, activeAffiliates: 0, confirmedOrders: 0, successfulOrders: 0, ugcApproved: 0, activeTeams: 0 };
  }
}

// ── Live feed (real events → masked Darija sentences) ──────────────────────────
let _feedCache = { at: 0, data: null };

async function buildRealEvents() {
  const events = [];
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

  const [recentAff, approvedUgc, uploadedUgc, todayGroups, teamGroups] = await Promise.all([
    prisma.affiliate.findMany({ where: { isActive: true }, orderBy: { createdAt: 'desc' }, take: 8, select: { name: true } }),
    prisma.ugcVideoSubmission.findMany({ where: { status: 'APPROVED' }, orderBy: { approvedAt: 'desc' }, take: 8, include: { affiliate: { select: { name: true } } } }),
    prisma.ugcVideoSubmission.findMany({ orderBy: { submittedAt: 'desc' }, take: 8, include: { affiliate: { select: { name: true } } } }),
    prisma.affiliateOrder.groupBy({ by: ['affiliateId'], where: { status: { in: ['confirmed', 'delivered'] }, isFake: false, createdAt: { gte: startOfDay } }, _count: { _all: true } }),
    prisma.affiliate.groupBy({ by: ['parentId'], where: { parentId: { not: null } }, _count: { _all: true } }),
  ]);

  recentAff.forEach((a) => { if (a.name) events.push({ type: 'new_affiliate', name: a.name }); });
  approvedUgc.forEach((s) => { if (s.affiliate?.name) events.push({ type: 'ugc_approved', name: s.affiliate.name }); });
  uploadedUgc.forEach((s) => { if (s.affiliate?.name) events.push({ type: 'ugc_uploaded', name: s.affiliate.name }); });

  // Order milestones (real orders only, today).
  const top = [...todayGroups].sort((a, b) => b._count._all - a._count._all).slice(0, 8);
  if (top.length) {
    const affs = await prisma.affiliate.findMany({ where: { id: { in: top.map((g) => g.affiliateId) } }, select: { id: true, name: true } });
    const nameOf = Object.fromEntries(affs.map((a) => [a.id, a.name]));
    top.forEach((g) => {
      const name = nameOf[g.affiliateId];
      if (name) events.push({ type: g._count._all === 1 ? 'first_order' : 'order_milestone', name, count: g._count._all });
    });
  }

  // Team milestones (parents with ≥2 members).
  const bigTeams = teamGroups.filter((t) => t._count._all >= 2).slice(0, 5);
  if (bigTeams.length) {
    const parents = await prisma.affiliate.findMany({ where: { id: { in: bigTeams.map((t) => t.parentId) } }, select: { id: true, name: true } });
    const nameOf = Object.fromEntries(parents.map((a) => [a.id, a.name]));
    bigTeams.forEach((t) => {
      const name = nameOf[t.parentId];
      if (name) events.push({ type: 'team_milestone', name, count: t._count._all });
    });
  }

  return events; // raw {type,name,count?} — never formatted/masked here
}

/**
 * Formatted, masked, admin-filtered live-feed messages for the public endpoint.
 * @param {object} liveCfg normalized liveFeed config (enabled, eventTypes, order, maxEvents)
 * @returns {Promise<{ id:string, text:string, type:string }[]>}
 */
export async function getLiveFeedMessages(liveCfg) {
  if (!liveCfg?.enabled) return [];
  let base;
  if (_feedCache.data && Date.now() - _feedCache.at < TTL) base = _feedCache.data;
  else {
    try { base = await buildRealEvents(); } catch (err) { console.error('[recruitment] feed error:', err?.message ?? err); base = []; }
    _feedCache = { at: Date.now(), data: base };
  }

  let evs = base.filter((e) => liveCfg.eventTypes?.[e.type]);
  if (liveCfg.order === 'random') {
    evs = [...evs].sort(() => Math.random() - 0.5);
  }
  return evs.slice(0, liveCfg.maxEvents).map((e, i) => ({
    id: `${e.type}-${i}`,
    type: e.type,
    text: formatLiveFeedEvent(e), // masks name (first name only) internally
  })).filter((e) => e.text);
}
