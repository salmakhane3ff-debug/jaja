#!/usr/bin/env node
/**
 * scripts/thumbnailUrl.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for src/lib/thumbnailUrl.js — no test framework, plain assertions.
 *
 * Run:  node --experimental-detect-module scripts/thumbnailUrl.test.mjs
 *       (the --experimental-detect-module flag lets plain Node load the ESM-syntax
 *        src/lib/thumbnailUrl.js; it is the default on Node >= 22.7, drop it there.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { thumbUrl } from "../src/lib/thumbnailUrl.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (got === want) { pass++; console.log("  PASS ", name); }
  else { fail++; console.log("  FAIL ", name, "\n    got : " + got + "\n    want: " + want); }
};

console.log("1) local image → -sm/-md/-lg.webp sidecars (existing behavior preserved)");
eq("local md sidecar", thumbUrl("/uploads/1699-photo.jpg", "md"), "/uploads/1699-photo-md.webp");
eq("local sm sidecar", thumbUrl("/uploads/1699-photo.jpg", "sm"), "/uploads/1699-photo-sm.webp");
eq("local lg nested",  thumbUrl("/uploads/sub/dir/pic.png", "lg"), "/uploads/sub/dir/pic-lg.webp");
eq("local strips query", thumbUrl("/uploads/1699-photo.jpg?v=2", "md"), "/uploads/1699-photo-md.webp");

console.log("2) Cloudinary image → transform inserted after /image/upload/ (folder contains 'uploads')");
const CLD = "https://res.cloudinary.com/demo/image/upload/v1699999999/shopgold/uploads/1699-photo.jpg";
eq("cloudinary sm", thumbUrl(CLD, "sm"),
   "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_300,c_limit/v1699999999/shopgold/uploads/1699-photo.jpg");
eq("cloudinary md", thumbUrl(CLD, "md"),
   "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_600,c_limit/v1699999999/shopgold/uploads/1699-photo.jpg");
eq("cloudinary lg", thumbUrl(CLD, "lg"),
   "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200,c_limit/v1699999999/shopgold/uploads/1699-photo.jpg");
eq("cloudinary NEVER appends -lg.webp", /-(sm|md|lg)\.webp/.test(thumbUrl(CLD, "lg")), false);

console.log("3) Cloudinary video → unchanged (no image transforms)");
const CLDV = "https://res.cloudinary.com/demo/video/upload/v12/shopgold/uploads/clip.mp4";
eq("cloudinary video unchanged", thumbUrl(CLDV, "md"), CLDV);

console.log("4) external non-Cloudinary URL → unchanged");
eq("external placehold unchanged",
   thumbUrl("https://placehold.co/400x500?text=No+Image", "md"),
   "https://placehold.co/400x500?text=No+Image");
eq("external cdn unchanged",
   thumbUrl("https://cdn.example.com/img/photo.jpg", "lg"),
   "https://cdn.example.com/img/photo.jpg");

console.log("extra) videos / gif / empty");
eq("local video unchanged", thumbUrl("/uploads/movie.mp4", "md"), "/uploads/movie.mp4");
eq("local gif unchanged",   thumbUrl("/uploads/anim.gif", "md"), "/uploads/anim.gif");
eq("empty string",          thumbUrl("", "md"), "");
eq("object {url} input",    thumbUrl({ url: "/uploads/x.jpg" }, "sm"), "/uploads/x-sm.webp");

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
