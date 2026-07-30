#!/usr/bin/env node
/**
 * scripts/recruitmentLanding.test.mjs
 * /tsajlim3ana recruitment landing — CTA link (reuses support settings, fixed
 * Darija message, disabled gracefully) + config normalization (active/sorted
 * videos, real-only testimonials, enabled gate). Pure — no DOM/network.
 * Run: node scripts/recruitmentLanding.test.mjs
 */
import {
  RECRUITMENT_WA_MESSAGE, buildRecruitmentWhatsappLink,
  normalizeRecruitmentConfig, publicVideos, publicTestimonials,
  normalizeUgc, teamRangeFromTiers, normalizeLiveFeedConfig,
  maskFirstName, maskSurname, formatLiveFeedEvent,
  LIVE_FEED_EVENT_TYPES,
  normalizeLiveActivity, pickActivityType, applyActivityToStats,
  LIVE_ACTIVITY_TYPES, DEFAULT_LIVE_ACTIVITY_PROBABILITIES,
  DEFAULT_LIVE_ACTIVITY_STATS, LIVE_ACTIVITY_DEFAULTS,
} from "../src/lib/recruitmentCta.js";
import { MOROCCAN_FEMALE_NAMES, MOROCCAN_CITIES, LIVE_AVATAR_COLORS } from "../src/lib/recruitmentLiveData.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

console.log("1) WhatsApp CTA link (reuses support settings, fixed Darija message):");
{
  const enabled = { enabled: true, whatsappNumber: "+212 600-11-22-33" };
  const link = buildRecruitmentWhatsappLink(enabled);
  ok("enabled + number → wa.me link (digits only)", link.startsWith("https://wa.me/212600112233?text="));
  ok("uses the fixed recruitment message, url-encoded", link.includes(encodeURIComponent(RECRUITMENT_WA_MESSAGE)));
  ok("message is the required Darija text", RECRUITMENT_WA_MESSAGE.includes("كأفلييت"));
  ok("disabled support → null (CTA disabled)", buildRecruitmentWhatsappLink({ enabled: false, whatsappNumber: "212600000000" }) === null);
  ok("no number → null", buildRecruitmentWhatsappLink({ enabled: true, whatsappNumber: "" }) === null);
  ok("null settings → null", buildRecruitmentWhatsappLink(null) === null);
}

console.log("2) Config normalization + enabled gate:");
{
  ok("enabled coerced strictly", normalizeRecruitmentConfig({ enabled: "yes" }).enabled === false);
  ok("enabled true respected", normalizeRecruitmentConfig({ enabled: true }).enabled === true);
  ok("missing config → disabled, empty arrays", (() => { const c = normalizeRecruitmentConfig(null); return c.enabled === false && c.videos.length === 0 && c.testimonials.length === 0; })());

  const cfg = normalizeRecruitmentConfig({
    enabled: true,
    videos: [
      { url: "/b.mp4", title: "B", order: 2, active: true },
      { title: "no-url", order: 0 },                 // dropped (no url)
      { url: "/a.mp4", title: "A", order: 1, active: true },
      { url: "/x.mp4", title: "X", order: 3, active: false }, // inactive
    ],
    testimonials: [
      { name: "Sara", text: "رائعة", rating: 5, active: true },
      { name: "", text: "", active: true },          // dropped (empty)
      { name: "Hidden", text: "…", active: false },  // inactive
    ],
  });
  ok("videos without a url are dropped", cfg.videos.length === 3);
  ok("empty testimonials are dropped", cfg.testimonials.length === 2);
}

console.log("3) Public views — active only, videos sorted by order:");
{
  const cfg = {
    enabled: true,
    videos: [
      { url: "/b.mp4", order: 2, active: true },
      { url: "/a.mp4", order: 1, active: true },
      { url: "/x.mp4", order: 0, active: false },
    ],
    testimonials: [
      { name: "A", text: "t1", active: true },
      { name: "B", text: "t2", active: false },
    ],
  };
  const vids = publicVideos(cfg);
  ok("only active videos", vids.length === 2 && vids.every((v) => v.active));
  ok("sorted by order (a before b)", vids[0].url === "/a.mp4" && vids[1].url === "/b.mp4");
  ok("only active testimonials", publicTestimonials(cfg).length === 1);
  ok("rating clamped to 1..5", normalizeRecruitmentConfig({ testimonials: [{ text: "x", rating: 9 }] }).testimonials[0].rating === 5);
}

console.log("4) UGC commission range (admin-configured, normalized, never hardcoded):");
{
  ok("defaults to 4..10 DH", (() => { const u = normalizeUgc({}); return u.minCommission === 4 && u.maxCommission === 10; })());
  ok("admin values respected", (() => { const u = normalizeUgc({ minCommission: 6, maxCommission: 15 }); return u.minCommission === 6 && u.maxCommission === 15; })());
  ok("min>max is swapped", (() => { const u = normalizeUgc({ minCommission: 12, maxCommission: 5 }); return u.minCommission === 5 && u.maxCommission === 12; })());
  ok("negatives floored to 0", normalizeUgc({ minCommission: -3, maxCommission: 8 }).minCommission === 0);
  ok("non-numeric falls back to defaults", (() => { const u = normalizeUgc({ minCommission: "abc" }); return u.minCommission === 4; })());
  ok("enabled defaults true, respects false", normalizeUgc({}).enabled === true && normalizeUgc({ enabled: false }).enabled === false);
}

console.log("5) Team % range — reused from commission tiers (hidden when none):");
{
  ok("no tiers → null (UI hides, never invents)", teamRangeFromTiers(undefined) === null);
  ok("empty tiers → null", teamRangeFromTiers([]) === null);
  ok("tiers with no positive pct → null", teamRangeFromTiers([{ commissionPct: 0 }, { commissionPct: null }]) === null);
  ok("min/max from tiers", (() => { const r = teamRangeFromTiers([{ commissionPct: 5 }, { commissionPct: 15 }, { commissionPct: 10 }]); return r.min === 5 && r.max === 15; })());
}

console.log("6) Privacy masking (no surnames / PII leaked):");
{
  ok("first name only", maskFirstName("Sara Alaoui") === "Sara");
  ok("single token unchanged", maskFirstName("Khadija") === "Khadija");
  ok("empty safe", maskFirstName("") === "" && maskFirstName(null) === "");
  ok("surname reduced to initial", maskSurname("Sara Alaoui") === "Sara A.");
  ok("single token → no fake initial", maskSurname("Sara") === "Sara");
}

console.log("7) Live-feed formatting — real event types only, name masked:");
{
  ok("new_affiliate masks to first name", formatLiveFeedEvent({ type: "new_affiliate", name: "ابتسام العلوي" }) === "ابتسام انضمات للمنصة مؤخراً");
  ok("order_milestone includes count", formatLiveFeedEvent({ type: "order_milestone", name: "خديجة بنعلي", count: 12 }).includes("12"));
  ok("first_order phrasing", formatLiveFeedEvent({ type: "first_order", name: "سعاد" }).includes("أول طلب"));
  ok("unknown type → empty (dropped)", formatLiveFeedEvent({ type: "bank_transfer", name: "X" }) === "");
  ok("no payment/withdrawal event types exist", !LIVE_FEED_EVENT_TYPES.some((t) => /payment|withdraw|transfer|virement|retrait|paie/i.test(t)));
  ok("full name never appears in output", !formatLiveFeedEvent({ type: "new_affiliate", name: "Sara Alaoui" }).includes("Alaoui"));
}

console.log("8) Live-feed config validation (intervals 15..120, safe defaults):");
{
  ok("defaults", (() => { const l = normalizeLiveFeedConfig({}); return l.enabled === false && l.showOnLanding === true && l.minInterval === 30 && l.maxInterval === 60 && l.displayDuration === 5 && l.order === "random" && l.maxEvents === 20; })());
  ok("interval below 15 clamped up", normalizeLiveFeedConfig({ minInterval: 3 }).minInterval === 15);
  ok("interval above 120 clamped down", normalizeLiveFeedConfig({ maxInterval: 999 }).maxInterval === 120);
  ok("min>max swapped", (() => { const l = normalizeLiveFeedConfig({ minInterval: 100, maxInterval: 20 }); return l.minInterval === 20 && l.maxInterval === 100; })());
  ok("displayDuration clamped 2..30", normalizeLiveFeedConfig({ displayDuration: 99 }).displayDuration === 30 && normalizeLiveFeedConfig({ displayDuration: 0 }).displayDuration === 2);
  ok("maxEvents clamped 1..100", normalizeLiveFeedConfig({ maxEvents: 500 }).maxEvents === 100 && normalizeLiveFeedConfig({ maxEvents: 0 }).maxEvents === 1);
  ok("order restricted to known values", normalizeLiveFeedConfig({ order: "weird" }).order === "random" && normalizeLiveFeedConfig({ order: "chronological" }).order === "chronological");
  ok("all event types default enabled", LIVE_FEED_EVENT_TYPES.every((t) => normalizeLiveFeedConfig({}).eventTypes[t] === true));
  ok("event type can be disabled", normalizeLiveFeedConfig({ eventTypes: { new_affiliate: false } }).eventTypes.new_affiliate === false);
  ok("enabled requires strict true", normalizeLiveFeedConfig({ enabled: "yes" }).enabled === false);
}

console.log("9) Statistics + live-feed defaults in full config:");
{
  const c = normalizeRecruitmentConfig({});
  ok("statistics enabled by default", c.statistics.enabled === true);
  ok("all counters default visible", Object.values(c.statistics.counters).every(Boolean));
  ok("counter can be hidden by admin", normalizeRecruitmentConfig({ statistics: { counters: { members: false } } }).statistics.counters.members === false);
  ok("live feed off by default (opt-in)", c.liveFeed.enabled === false);
  ok("competition on by default", c.competition.enabled === true);
  ok("hero/confirmation/ugc/team defaults present", !!c.hero.title && !!c.confirmation.title && !!c.ugc.title && !!c.team.title);
}

console.log("10) Live activity — seeded dataset is large enough to feel infinite:");
{
  ok("≥ 300 female names (unique)", MOROCCAN_FEMALE_NAMES.length >= 300);
  ok("≥ 150 cities (unique)", MOROCCAN_CITIES.length >= 150);
  ok("names are de-duplicated", new Set(MOROCCAN_FEMALE_NAMES).size === MOROCCAN_FEMALE_NAMES.length);
  ok("cities are de-duplicated", new Set(MOROCCAN_CITIES).size === MOROCCAN_CITIES.length);
  ok("multiple avatar colors", LIVE_AVATAR_COLORS.length >= 8);
}

console.log("11) Live activity config — generator engine, admin-editable:");
{
  const d = normalizeLiveActivity({});
  ok("enabled by default", d.enabled === true);
  ok("respects explicit disable", normalizeLiveActivity({ enabled: false }).enabled === false);
  ok("default interval 2–6s", d.intervalMinSec === 2 && d.intervalMaxSec === 6);
  ok("interval clamped to 1..30", (() => { const x = normalizeLiveActivity({ intervalMinSec: 0, intervalMaxSec: 999 }); return x.intervalMinSec === 1 && x.intervalMaxSec === 30; })());
  ok("interval min>max swapped", (() => { const x = normalizeLiveActivity({ intervalMinSec: 8, intervalMaxSec: 3 }); return x.intervalMinSec === 3 && x.intervalMaxSec === 8; })());
  ok("default probabilities 45/25/15/8/7", (() => { const p = d.probabilities; return p.newOrder === 45 && p.delivered === 25 && p.commission === 15 && p.newAffiliate === 8 && p.onlineChange === 7; })());
  ok("admin probabilities respected", normalizeLiveActivity({ probabilities: { newOrder: 90 } }).probabilities.newOrder === 90);
  ok("all-zero probabilities fall back to defaults", (() => { const p = normalizeLiveActivity({ probabilities: { newOrder: 0, delivered: 0, commission: 0, newAffiliate: 0, onlineChange: 0 } }).probabilities; return p.newOrder === 45; })());
  ok("commission range default 15..120", d.commissionMin === 15 && d.commissionMax === 120);
  ok("commission min>max swapped", (() => { const x = normalizeLiveActivity({ commissionMin: 200, commissionMax: 50 }); return x.commissionMin === 50 && x.commissionMax === 200; })());
  ok("starting stats respected + floored", normalizeLiveActivity({ stats: { todayOrders: 500, todayDelivered: -3 } }).stats.todayOrders === 500 && normalizeLiveActivity({ stats: { todayDelivered: -3 } }).stats.todayDelivered === 0);
  ok("persistence default on, can disable", d.persistence === true && normalizeLiveActivity({ persistence: false }).persistence === false);
  ok("resetToken coerced to string", typeof normalizeLiveActivity({ resetToken: 123 }).resetToken === "string");
  ok("names default to the big pool", d.names.length === MOROCCAN_FEMALE_NAMES.length);
  ok("admin can override names dataset", (() => { const x = normalizeLiveActivity({ names: ["أ", "ب", "أ"] }); return x.names.length === 2; })());
  ok("empty names override → default pool", normalizeLiveActivity({ names: [] }).names.length === MOROCCAN_FEMALE_NAMES.length);
  ok("exposed via normalizeRecruitmentConfig", (() => { const c = normalizeRecruitmentConfig({ liveActivity: { commissionMax: 99 } }); return c.liveActivity && c.liveActivity.commissionMax === 99; })());
}

console.log("12) pickActivityType — respects weights, always returns a valid type:");
{
  const seq = [0.0, 0.5, 0.99];
  ok("always returns a known type", [0, 0.2, 0.5, 0.7, 0.95].every((r) => LIVE_ACTIVITY_TYPES.includes(pickActivityType(DEFAULT_LIVE_ACTIVITY_PROBABILITIES, () => r))));
  ok("weight 0 for a type is never chosen", (() => {
    const probs = { newOrder: 0, delivered: 100, commission: 0, newAffiliate: 0, onlineChange: 0 };
    return Array.from({ length: 50 }, (_, i) => pickActivityType(probs, () => i / 50)).every((t) => t === "delivered");
  })());
  ok("first bucket picked at r=0", pickActivityType({ newOrder: 45, delivered: 25, commission: 15, newAffiliate: 8, onlineChange: 7 }, () => 0) === "newOrder");
}

console.log("13) applyActivityToStats — realistic evolution, delivered stays below orders:");
{
  const base = { todayOrders: 10, todayDelivered: 5, todayCommissions: 100, affiliatesOnline: 20 };
  ok("newOrder → +1 order only", (() => { const s = applyActivityToStats(base, "newOrder"); return s.todayOrders === 11 && s.todayDelivered === 5 && s.todayCommissions === 100; })());
  ok("commission → +commission only", (() => { const s = applyActivityToStats(base, "commission", 40); return s.todayCommissions === 140 && s.todayOrders === 10; })());
  ok("delivered → +1 delivered and +commission", (() => { const s = applyActivityToStats(base, "delivered", 30); return s.todayDelivered === 6 && s.todayCommissions === 130; })());
  ok("delivered never exceeds orders (bumps orders when equal)", (() => {
    const s = applyActivityToStats({ todayOrders: 5, todayDelivered: 5, todayCommissions: 0, affiliatesOnline: 3 }, "delivered", 10);
    return s.todayDelivered === 6 && s.todayOrders === 7 && s.todayOrders > s.todayDelivered;
  })());
  ok("onlineChange fluctuates by ±1/+2 only (never huge)", (() => {
    return [0, 0.4, 0.9].map((r) => applyActivityToStats(base, "onlineChange", 0, () => r).affiliatesOnline - base.affiliatesOnline).every((d) => [1, -1, 2].includes(d));
  })());
  ok("online never drops below 1", applyActivityToStats({ todayOrders: 1, todayDelivered: 0, todayCommissions: 0, affiliatesOnline: 1 }, "onlineChange", 0, () => 0.4).affiliatesOnline >= 1);
  ok("newAffiliate can add an online (deterministic rnd<0.6)", applyActivityToStats(base, "newAffiliate", 0, () => 0.1).affiliatesOnline === 21);
  ok("returns a fresh object (no mutation)", (() => { const s = applyActivityToStats(base, "newOrder"); return s !== base && base.todayOrders === 10; })());
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
