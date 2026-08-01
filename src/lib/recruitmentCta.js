/**
 * src/lib/recruitmentCta.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers for the /tsajlim3ana affiliate-recruitment landing page.
 * Reuses the existing support-WhatsApp configuration (settings type
 * `affiliate-support`) — the recruitment CTAs never hardcode a number.
 * No React/DOM → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { normalizeSupportSettings, buildWhatsappUrl } from './whatsappSupport.js';
import { MOROCCAN_CITIES } from './recruitmentLiveData.js';

// Fixed Darija message opened when a visitor taps a "join us" CTA.
export const RECRUITMENT_WA_MESSAGE =
  'السلام عليكم، دخلت من صفحة التسجيل معاكم وبغيت نعرف كيفاش نبدا كأفلييت.';

export function buildRecruitmentWhatsappLink(supportSettings) {
  const s = normalizeSupportSettings(supportSettings);
  if (!s.enabled || !s.whatsappNumber) return null;
  return buildWhatsappUrl(s.whatsappNumber, RECRUITMENT_WA_MESSAGE);
}

// ── Defaults (Darija content; admin can override) ─────────────────────────────
export const DEFAULT_CONFIRMATION_BENEFITS = [
  'المنتجات علينا', 'جلب الزبناء علينا', 'الإعلانات علينا', 'استقبال الطلبات علينا',
  'التوصيل علينا', 'خدمة ما بعد البيع علينا', 'لوحة تحكم خاصة بيك',
  'تتبع الطلبات والأرباح', 'البداية سهلة وما كتحتاجش تجربة',
];

export const LIVE_FEED_EVENT_TYPES = [
  'new_affiliate', 'first_order', 'order_milestone', 'team_milestone',
  'ugc_uploaded', 'ugc_approved', 'rank_change', 'badge_unlocked',
];

export const LIVE_FEED_NEUTRAL = [
  'المنافسة الشهرية مفتوحة دابا',
  'تقدري تبداي بتأكيد الطلبات أو UGC',
  'كلما كنتي نشيطة، كتزيد فرص الربح',
];

const num = (v, def) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ── Config normalization ──────────────────────────────────────────────────────
export function normalizeRecruitmentConfig(raw = {}) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const hero = c.hero && typeof c.hero === 'object' ? c.hero : {};
  const confirmation = c.confirmation && typeof c.confirmation === 'object' ? c.confirmation : {};
  const ugc = c.ugc && typeof c.ugc === 'object' ? c.ugc : {};
  const team = c.team && typeof c.team === 'object' ? c.team : {};
  const competition = c.competition && typeof c.competition === 'object' ? c.competition : {};
  const statistics = c.statistics && typeof c.statistics === 'object' ? c.statistics : {};
  const stCounters = statistics.counters && typeof statistics.counters === 'object' ? statistics.counters : {};

  const videos = (Array.isArray(c.videos) ? c.videos : [])
    .filter((v) => v && typeof v === 'object' && v.url)
    .map((v, i) => ({
      id: v.id || `v${i}`, url: String(v.url), title: String(v.title || ''),
      thumbnail: String(v.thumbnail || ''), order: num(v.order, i), active: v.active !== false,
    }));
  const testimonials = (Array.isArray(c.testimonials) ? c.testimonials : [])
    .filter((t) => t && typeof t === 'object' && (t.text || t.name))
    .map((t, i) => ({
      id: t.id || `t${i}`, name: String(t.name || ''), text: String(t.text || ''),
      rating: clamp(num(t.rating, 5), 1, 5), active: t.active !== false,
    }));

  return {
    enabled: c.enabled === true,
    hero: {
      image:    String(hero.image || ''),
      title:    String(hero.title || 'ربحي دخل إضافي وأنتِ فالدار مع أولادك'),
      subtitle: String(hero.subtitle || 'إحنا كنجيبو ليك الطلبات والزبناء، وإنتِ غير كتأكدي الطلبات من التليفون ديالك.'),
    },
    confirmation: {
      title:       String(confirmation.title || 'إحنا اللي كنجيبو الزبناء والطلبات، وإنتِ غير كتأكدي الطلبات'),
      description: String(confirmation.description || ''),
      benefits:    Array.isArray(confirmation.benefits) && confirmation.benefits.length
        ? confirmation.benefits.map(String) : DEFAULT_CONFIRMATION_BENEFITS,
    },
    ugc: normalizeUgc(ugc),
    team: {
      enabled:     team.enabled !== false,
      title:       String(team.title || 'كوّني فريقك وربحي أكثر'),
      description: String(team.description || 'تقدري تعاوني أشخاص آخرين يسجلو معانا ويخدمو من المنصة، وكلما تطور الفريق ديالك كتزيد فرص الربح.'),
    },
    competition: { enabled: competition.enabled !== false },
    statistics: {
      enabled: statistics.enabled !== false,
      counters: {
        members:          stCounters.members          !== false,
        activeAffiliates: stCounters.activeAffiliates  !== false,
        confirmedOrders:  stCounters.confirmedOrders   !== false,
        successfulOrders: stCounters.successfulOrders  !== false,
        ugcApproved:      stCounters.ugcApproved       !== false,
        activeTeams:      stCounters.activeTeams       !== false,
      },
    },
    liveFeed: normalizeLiveFeedConfig(c.liveFeed),
    liveActivity: normalizeLiveActivity(c.liveActivity),
    videos,
    testimonials,
    ...(c.stats ? { stats: c.stats } : {}),
  };
}

/** UGC commission range (admin-configured; never hardcoded in business logic). */
export function normalizeUgc(raw = {}) {
  const u = raw && typeof raw === 'object' ? raw : {};
  let min = Math.max(0, num(u.minCommission, 4));
  let max = Math.max(0, num(u.maxCommission, 10));
  if (min > max) [min, max] = [max, min];
  return {
    enabled: u.enabled !== false,
    minCommission: min,
    maxCommission: max,
    title:       String(u.title || 'زيدي أرباحك مع فيديوهات UGC'),
    description: String(u.description || 'إلى بغيتي تزيدي الأرباح ديالك، تقدري تصوري فيديوهات قصيرة للمنتجات وترفعيهم فالمنصة من المكان الخاص بـ UGC.'),
  };
}

/**
 * Team commission % RANGE — reuses the REAL affiliate-level logic (the
 * commission tiers from team-bonus-config). Returns null when no tiers exist, so
 * the UI hides the percentage instead of inventing one.
 */
export function teamRangeFromTiers(commissionTiers) {
  const pct = (Array.isArray(commissionTiers) ? commissionTiers : [])
    .map((t) => Number(t?.commissionPct))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!pct.length) return null;
  return { min: Math.min(...pct), max: Math.max(...pct) };
}

// ── Live feed ─────────────────────────────────────────────────────────────────
export function normalizeLiveFeedConfig(raw = {}) {
  const l = raw && typeof raw === 'object' ? raw : {};
  let min = clamp(num(l.minInterval, 30), 15, 120);
  let max = clamp(num(l.maxInterval, 60), 15, 120);
  if (min > max) [min, max] = [max, min];
  const et = l.eventTypes && typeof l.eventTypes === 'object' ? l.eventTypes : {};
  const eventTypes = {};
  for (const t of LIVE_FEED_EVENT_TYPES) eventTypes[t] = et[t] !== false;
  return {
    enabled:         l.enabled === true,
    showOnLanding:   l.showOnLanding !== false,
    minInterval:     min,
    maxInterval:     max,
    displayDuration: clamp(num(l.displayDuration, 5), 2, 30),
    order:           l.order === 'chronological' ? 'chronological' : 'random',
    maxEvents:       clamp(num(l.maxEvents, 20), 1, 100),
    eventTypes,
  };
}

// ── Live activity (inline "🔥 النشاط المباشر" live dashboard) ──────────────────
// Presentation-only demo config for the SERVER-SIDE engine (liveActivityEngine).
// People/identities come from the shared demo pool (same as the competition);
// this config only controls pacing, probabilities, counters, amounts and the
// cities dataset. Counters evolve realistically (delivered stays below orders,
// online fluctuates by ±1/+2, commissions grow).
export const LIVE_ACTIVITY_TYPES = ['newOrder', 'delivered', 'commission', 'ugc', 'newAffiliate', 'competition', 'booster'];

export const DEFAULT_LIVE_ACTIVITY_STATS = {
  todayOrders: 128, todayDelivered: 96, todayCommissions: 3420, affiliatesOnline: 42,
};
export const DEFAULT_LIVE_ACTIVITY_PROBABILITIES = {
  newOrder: 38, delivered: 20, commission: 14, ugc: 12, newAffiliate: 6, competition: 4, booster: 6,
};
export const LIVE_ACTIVITY_DEFAULTS = {
  intervalMinSec: 2, intervalMaxSec: 6, commissionMin: 15, commissionMax: 120,
  ugcMaxVideos: 8, ugcSalesPerVideoMin: 3, ugcSalesPerVideoMax: 12,
};

export function normalizeLiveActivity(raw = {}) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const s = a.stats && typeof a.stats === 'object' ? a.stats : {};
  const p = a.probabilities && typeof a.probabilities === 'object' ? a.probabilities : {};

  let minI = clamp(num(a.intervalMinSec, LIVE_ACTIVITY_DEFAULTS.intervalMinSec), 1, 30);
  let maxI = clamp(num(a.intervalMaxSec, LIVE_ACTIVITY_DEFAULTS.intervalMaxSec), 1, 30);
  if (minI > maxI) [minI, maxI] = [maxI, minI];

  let cMin = Math.max(0, num(a.commissionMin, LIVE_ACTIVITY_DEFAULTS.commissionMin));
  let cMax = Math.max(0, num(a.commissionMax, LIVE_ACTIVITY_DEFAULTS.commissionMax));
  if (cMin > cMax) [cMin, cMax] = [cMax, cMin];

  let sMin = Math.max(1, num(a.ugcSalesPerVideoMin, LIVE_ACTIVITY_DEFAULTS.ugcSalesPerVideoMin));
  let sMax = Math.max(1, num(a.ugcSalesPerVideoMax, LIVE_ACTIVITY_DEFAULTS.ugcSalesPerVideoMax));
  if (sMin > sMax) [sMin, sMax] = [sMax, sMin];

  const probabilities = {};
  for (const t of LIVE_ACTIVITY_TYPES) probabilities[t] = Math.max(0, num(p[t], DEFAULT_LIVE_ACTIVITY_PROBABILITIES[t]));
  // Guard against an all-zero probability set (would stall the engine).
  if (LIVE_ACTIVITY_TYPES.every((t) => probabilities[t] === 0)) Object.assign(probabilities, DEFAULT_LIVE_ACTIVITY_PROBABILITIES);

  const cleanList = (v, fallback) => {
    const arr = Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
    return arr.length ? [...new Set(arr)] : fallback;
  };

  return {
    enabled: a.enabled !== false,
    intervalMinSec: minI,
    intervalMaxSec: maxI,
    stats: {
      todayOrders:      Math.max(0, Math.round(num(s.todayOrders, DEFAULT_LIVE_ACTIVITY_STATS.todayOrders))),
      todayDelivered:   Math.max(0, Math.round(num(s.todayDelivered, DEFAULT_LIVE_ACTIVITY_STATS.todayDelivered))),
      todayCommissions: Math.max(0, Math.round(num(s.todayCommissions, DEFAULT_LIVE_ACTIVITY_STATS.todayCommissions))),
      affiliatesOnline: Math.max(0, Math.round(num(s.affiliatesOnline, DEFAULT_LIVE_ACTIVITY_STATS.affiliatesOnline))),
    },
    probabilities,
    commissionMin: cMin,
    commissionMax: cMax,
    ugcMaxVideos: clamp(num(a.ugcMaxVideos, LIVE_ACTIVITY_DEFAULTS.ugcMaxVideos), 1, 50),
    ugcSalesPerVideoMin: sMin,
    ugcSalesPerVideoMax: sMax,
    resetToken: String(a.resetToken || ''),
    // People/identities come from the SHARED demo pool (getDemoIdentityPool —
    // same dataset as the Monthly Competition), never from a separate name list.
    cities: cleanList(a.cities, MOROCCAN_CITIES),
  };
}

/** Pick an activity type by weight. Returns a key from LIVE_ACTIVITY_TYPES. */
export function pickActivityType(probabilities, rnd = Math.random) {
  const entries = LIVE_ACTIVITY_TYPES.map((t) => [t, Math.max(0, Number(probabilities?.[t]) || 0)]);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  if (total <= 0) return 'newOrder';
  let r = rnd() * total;
  for (const [t, w] of entries) { if (r < w) return t; r -= w; }
  return entries[entries.length - 1][0];
}

/**
 * Apply one generated activity of `type` to the running counters, enforcing the
 * realism rules (delivered < orders, online fluctuates slowly, values only grow
 * except online). Pure: returns a NEW stats object. `commission` is the amount to
 * add for delivered/commission events.
 */
export function applyActivityToStats(stats, type, commission = 0, rnd = Math.random) {
  const s = {
    todayOrders:      Math.max(0, Math.round(num(stats?.todayOrders, 0))),
    todayDelivered:   Math.max(0, Math.round(num(stats?.todayDelivered, 0))),
    todayCommissions: Math.max(0, Math.round(num(stats?.todayCommissions, 0))),
    affiliatesOnline: Math.max(0, Math.round(num(stats?.affiliatesOnline, 0))),
  };
  const comm = Math.max(0, Math.round(num(commission, 0)));
  switch (type) {
    case 'newOrder':
      s.todayOrders += 1;
      break;
    case 'delivered':
      s.todayDelivered += 1;
      if (s.todayDelivered >= s.todayOrders) s.todayOrders = s.todayDelivered + 1; // delivered stays below orders
      s.todayCommissions += comm;
      break;
    case 'commission':
    case 'ugc': // comm = UGC earnings (sales × commissionPerSale)
      s.todayCommissions += comm;
      break;
    case 'newAffiliate':
      if (rnd() < 0.6) s.affiliatesOnline += 1; // increase online "randomly if needed"
      break;
    case 'booster':
      // Booster progress shows sales landing — same shape as a new order.
      s.todayOrders += Math.max(1, Math.round(num(commission, 1)));
      break;
    case 'competition':
      break; // no counter change
    default:
      break;
  }
  return s;
}

/** Slow online-affiliates drift (±1 / +2), never a huge jump. Pure. */
export function driftOnline(affiliatesOnline, rnd = Math.random) {
  const delta = [1, -1, 2][Math.floor(rnd() * 3)];
  return Math.max(1, Math.round(Number(affiliatesOnline) || 0) + delta);
}

/** Relative Darija time, compact style ("قبل 15 ث", "قبل 1 د", "قبل 2 س"). Pure. */
export function relTime(ageMs) {
  const s = Math.max(1, Math.round((Number(ageMs) || 0) / 1000));
  if (s < 60) return `قبل ${s} ث`;
  const m = Math.round(s / 60);
  if (m < 60) return `قبل ${m} د`;
  return `قبل ${Math.round(m / 60)} س`;
}

/** First name only (privacy). "Sara Alaoui" → "Sara". */
export function maskFirstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}
/** First name + surname initial for the competition. "Sara Alaoui" → "Sara A." */
export function maskSurname(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  return `${parts[0]} ${parts[1][0]}.`;
}

/** Build a Darija live-feed sentence from a SAFE raw event (already masked). */
export function formatLiveFeedEvent(ev = {}) {
  const name = maskFirstName(ev.name);
  switch (ev.type) {
    case 'new_affiliate':  return `${name} انضمات للمنصة مؤخراً`;
    case 'first_order':    return `${name} أكدات أول طلب ديالها`;
    case 'order_milestone':return `${name} أكدات ${num(ev.count, 0)} طلب اليوم`;
    case 'team_milestone': return `فريق ${name} وصل لـ${num(ev.count, 0)} عضو`;
    case 'ugc_uploaded':   return `${name} رفعات فيديو UGC ديالها`;
    case 'ugc_approved':   return `تم قبول فيديو UGC ديال ${name}`;
    case 'rank_change':    return `${name} فالمركز ${num(ev.rank, 0)} فالمنافسة`;
    case 'badge_unlocked': return `${name} حصلات على Badge جديد`;
    default: return '';
  }
}

// ── Public views ──────────────────────────────────────────────────────────────
export function publicVideos(config) {
  return normalizeRecruitmentConfig(config).videos.filter((v) => v.active).sort((a, b) => a.order - b.order);
}
export function publicTestimonials(config) {
  return normalizeRecruitmentConfig(config).testimonials.filter((t) => t.active);
}
