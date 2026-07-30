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

// ── Live activity (inline "🔥 النشاط المباشر" section) ─────────────────────────
// Presentation-only, fully admin-editable, demo data. No DB, no real PII — the
// admin curates the activity items, the 4 stat numbers, the loop speed, and the
// on/off toggle. The client just cycles the items with a smooth fade+slide.
export const LIVE_ACTIVITY_MIN_SPEED = 1000;   // ms
export const LIVE_ACTIVITY_MAX_SPEED = 10000;  // ms
export const LIVE_ACTIVITY_DEFAULT_SPEED = 2500;

export const DEFAULT_LIVE_ACTIVITY_ITEMS = [
  { icon: '🟢', name: 'أمينة',  city: 'الدار البيضاء', activity: 'أكدت طلب جديد',   time: 'قبل 18 ثانية' },
  { icon: '💰', name: 'فاطمة',  city: 'مراكش',         activity: 'ربحت 84 درهم',    time: 'قبل دقيقة' },
  { icon: '📦', name: '',       city: 'الرباط',        activity: 'طلب جديد',        time: 'قبل دقيقتين' },
  { icon: '🚚', name: '',       city: 'طنجة',          activity: 'تم تسليم طلب',     time: 'قبل 3 دقائق' },
  { icon: '🎉', name: 'خديجة',  city: '',              activity: 'انضمت للمنصة',    time: 'قبل 4 دقائق' },
];

export const DEFAULT_LIVE_ACTIVITY_STATS = {
  todayOrders: 128, todayDelivered: 96, todayCommissions: 3420, affiliatesOnline: 42,
};

export function normalizeLiveActivity(raw = {}) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const s = a.stats && typeof a.stats === 'object' ? a.stats : {};
  const rawItems = Array.isArray(a.items) ? a.items : null;
  const items = (rawItems && rawItems.length ? rawItems : DEFAULT_LIVE_ACTIVITY_ITEMS)
    .filter((it) => it && typeof it === 'object')
    .map((it) => ({
      icon:     String(it.icon || '🟢'),
      name:     String(it.name || ''),
      city:     String(it.city || ''),
      activity: String(it.activity || ''),
      time:     String(it.time || ''),
    }))
    .filter((it) => it.activity || it.name || it.city);
  return {
    enabled: a.enabled !== false,
    speedMs: clamp(num(a.speedMs, LIVE_ACTIVITY_DEFAULT_SPEED), LIVE_ACTIVITY_MIN_SPEED, LIVE_ACTIVITY_MAX_SPEED),
    stats: {
      todayOrders:      Math.max(0, num(s.todayOrders, DEFAULT_LIVE_ACTIVITY_STATS.todayOrders)),
      todayDelivered:   Math.max(0, num(s.todayDelivered, DEFAULT_LIVE_ACTIVITY_STATS.todayDelivered)),
      todayCommissions: Math.max(0, num(s.todayCommissions, DEFAULT_LIVE_ACTIVITY_STATS.todayCommissions)),
      affiliatesOnline: Math.max(0, num(s.affiliatesOnline, DEFAULT_LIVE_ACTIVITY_STATS.affiliatesOnline)),
    },
    items: items.length ? items : DEFAULT_LIVE_ACTIVITY_ITEMS,
  };
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
