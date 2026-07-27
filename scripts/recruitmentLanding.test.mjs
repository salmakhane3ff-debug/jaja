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

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
