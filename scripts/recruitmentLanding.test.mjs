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
} from "../src/lib/recruitmentCta.js";

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

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
