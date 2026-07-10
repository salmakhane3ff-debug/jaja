#!/usr/bin/env node
/**
 * scripts/cloudinary-smoketest.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * DB-free Cloudinary smoke test — validates that the REAL saveMedia() service
 * can upload to Cloudinary and that destroyByUrl() can delete, end to end.
 *
 * What it does NOT touch:
 *   - the database (no Prisma, no Image/Video/Product rows)
 *   - any product media
 *   - public/uploads (all test bytes are in-memory; no local file is written)
 *   - your .env or the running app (MEDIA_STORAGE is forced for THIS process only)
 *
 * Flow:
 *   1. Force MEDIA_STORAGE=cloudinary for this process.
 *   2. Load the existing src/lib/cloudinary.js service.
 *   3. Confirm credentials + a live connection (ping) BEFORE uploading anything.
 *   4. Upload one tiny image, then one small video, into shopgold/_smoketest.
 *   5. Verify each upload result; print secure_url/public_id/resource_type/bytes/
 *      width/height/duration.
 *   6. On success: delete BOTH via destroyByUrl() and print the results.
 *   7. On failure: print the real error, stop, and clean up ONLY assets that were
 *      actually uploaded (never attempts to delete the one that failed).
 *
 * Run on the VPS (see bottom of file / chat for the exact command).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Force Cloudinary for THIS process only. Does not modify .env or the app process.
process.env.MEDIA_STORAGE = "cloudinary";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SERVICE_PATH = path.resolve(process.cwd(), "src/lib/cloudinary.js");
const FOLDER = "shopgold/_smoketest";

// 1x1 transparent PNG — decoded to an in-memory Buffer (no file on disk).
const PNG_1x1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// A minimal sample MP4 (in-memory). Some Cloudinary accounts may reject a
// synthetic clip; if the VIDEO leg fails with "Invalid video file", re-run with
//   SMOKETEST_VIDEO_PATH=./yourclip.mp4   (any small real .mp4 — nothing is written)
const SAMPLE_MP4_B64 =
  "AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAAhmcmVlAAAC721kYXQAAAKzBgX//6/cRem9" +
  "5tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTU1IHIyOTAxIDdkMGZmMjIgLSBILjI2NC9NUEVHLTQg" +
  "QVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDE4IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcv" +
  "eDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MSByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9" +
  "MHgzOjB4MTEzIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVm" +
  "PTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0xIGNxbT0wIGRlYWR6" +
  "b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MSBsb29r" +
  "YWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFj" +
  "ZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0" +
  "cD0wIGtleWludD0yNTAga2V5aW50X21pbj0yNSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAg" +
  "cmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWlu" +
  "PTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAABZliIQL/LF" +
  "gBTgSyxxi/CAAAADAAADAAADAAADAAAOMK1QAAAAB1BmiEbAK//7AAAAAwAAAwAAAwAAAwAAAwAA" +
  "AwAAAwAAAwAAAwAAAwAAAwAAAwHTAAAABlBnkGyE/wAAAAMAAAMAAAMAAAMAAAMAB0wAAAAGUGeQ" +
  "bIT/AAAAAwAAAwAAAwAAAwAAAwAHTAAAAAZQZ5CyE/wAAAADAAADAAADAAADAAADAAdMAAAABlBn" +
  "sGyE/wAAAAMAAAMAAAMAAAMAAAMAB0wAAAAGUGewbIT/AAAAAwAAAwAAAwAAAwAAAwAHTAAAAA9B" +
  "moIzwr/8AAAADAAAdMAAAAAZQZ6hCH/8AAAAKQZ6mSjP//wAAAAlBnsQrf/8AAAAJQZ7lK3//AAA" +
  "ACUGfBit//wAAAAlBnyYrf/8AAAAJQZ9HK3//AAAAB0GfaCt//wAAAAlBn4orf/8AAAAJQZ+rK3//" +
  "AAAACUGfzCt//wAAAAdBn+0rf/8AAAAJQZ+OK3//AAAAB0Gfryt//wAAAAlBn9Arf/8AAAAJQZ/x" +
  "K3//AAAACUGf8it//wAAAAlBoAIrf/8AAAAJQaAjK3//AAAACUGgRCt//wAAAAdBoGUrf/8AAAAJ" +
  "QaCGK3//AAAACUGgpyt//wAAAAlBoMgrf/8AAAAJQaDpK3//AAAAB0Gg6it//wAAAAdBoQsrf/8A" +
  "AAAJQaEsK3//AAAACUGhTSt//wAAAAlBoW4rf/8AAAAJQaGPK3//AAAAB0Ghryt//wAAAAlBodAr" +
  "f/8AAAAJQaHxK3//AAAACUGiEit//wAAAAlBojMrf/8AAAAJQaJUK3//AAAACUGidSt//wAAAAdB" +
  "opYrf/8AAAAJQaK3K3//AAAAB0GjWCt//wAAAAlBo3krf/8AAAAJQaOaK3//AAAAB0Gjuyt//wAA" +
  "AAlBo9wrf/8AAAAJQaP9K3//AAAAB0GkHit//wAAAAdBpD8rf/8AAAAJQaRgK3//AAAAB0GkgSt/" +
  "/wAAAAlBpKIrf/8AAAAHQaTDK3//AAAAB0Gk5Ct//wAAAAlBpQUrf/8AAAAJQaUmK3//AAAAB0Gl" +
  "Ryt//wAAAAdBpWgrf/8AAAAHQaWJK3//AAAAB0Glqihh";

const line = () => console.log("─".repeat(64));

function printAsset(label, r, source) {
  console.log(`${label}:`);
  console.log(`  source        : ${source}`);
  console.log(`  storage       : ${r.storage}`);
  console.log(`  secure_url    : ${r.url}`);
  console.log(`  public_id     : ${r.publicId ?? "(none)"}`);
  console.log(`  resource_type : ${r.resourceType ?? "(none)"}`);
  console.log(`  bytes         : ${r.bytes ?? "(n/a)"}`);
  console.log(`  width         : ${r.width ?? "(n/a)"}`);
  console.log(`  height        : ${r.height ?? "(n/a)"}`);
  console.log(`  duration      : ${r.duration ?? "(not returned by saveMedia — check Cloudinary console)"}`);
}

// Verify an upload result BEFORE we consider it committed / before deletion.
function verify(r, expectedType) {
  if (!r || r.storage !== "cloudinary") {
    throw new Error(`expected cloudinary storage, got "${r?.storage}" — credentials/flag issue, nothing was uploaded`);
  }
  if (typeof r.url !== "string" || !/^https:\/\/res\.cloudinary\.com\//.test(r.url)) {
    throw new Error(`secure_url is not a Cloudinary HTTPS URL: ${r.url}`);
  }
  if (!r.publicId) throw new Error("upload result missing public_id");
  if (r.resourceType !== expectedType) {
    throw new Error(`resource_type mismatch: expected "${expectedType}", got "${r.resourceType}"`);
  }
  if (!(Number(r.bytes) > 0)) throw new Error("upload result bytes is not > 0");
}

async function getVideo() {
  const p = process.env.SMOKETEST_VIDEO_PATH || process.argv[2];
  if (p) {
    const abs = path.resolve(p);
    const buf = await readFile(abs); // reads an existing file — does not create one
    return { buf, source: abs };
  }
  return { buf: Buffer.from(SAMPLE_MP4_B64, "base64"), source: "embedded sample mp4" };
}

async function main() {
  line();
  console.log("Cloudinary smoke test — DB-free, no product media, no local upload file");
  console.log(`MEDIA_STORAGE (forced, this process only): ${process.env.MEDIA_STORAGE}`);
  console.log(`target folder: ${FOLDER}`);
  line();

  // ── Load the REAL service ──────────────────────────────────────────────────
  let svc;
  try {
    svc = await import(pathToFileURL(SERVICE_PATH).href);
  } catch (err) {
    console.error("✗ Could not load src/lib/cloudinary.js.");
    console.error("  Use Node ≥ 20.10 and run with:");
    console.error("    node --env-file=.env --experimental-detect-module scripts/cloudinary-smoketest.mjs");
    console.error("  Original error:", err?.message ?? err);
    process.exit(1);
  }

  // ── Credentials present? ───────────────────────────────────────────────────
  if (!svc.isCloudinaryConfigured()) {
    console.error("✗ No Cloudinary credentials found in the environment.");
    console.error("  Load them from .env with:");
    console.error("    node --env-file=.env --experimental-detect-module scripts/cloudinary-smoketest.mjs");
    process.exit(1);
  }

  // ── Live connection check BEFORE uploading anything ────────────────────────
  try {
    const ping = await svc.verifyConnection();
    console.log("Cloudinary ping:", JSON.stringify(ping));
  } catch (err) {
    console.error("✗ Cloudinary connection/auth failed — nothing uploaded.");
    console.error("  Error:", err?.message ?? err);
    process.exit(1);
  }

  const ts = Date.now();
  const uploaded = []; // { label, url } — only assets that actually uploaded + verified

  try {
    // ── Image ──
    line();
    const imgBuf = Buffer.from(PNG_1x1_B64, "base64");
    const img = await svc.saveMedia(imgBuf, {
      filename: `smoketest-image-${ts}.png`,
      folder: FOLDER,
      resourceType: "image",
    });
    verify(img, "image");
    uploaded.push({ label: "image", url: img.url });
    printAsset("IMAGE (verified)", img, "embedded 1x1 png");

    // ── Video ──
    line();
    const { buf: vidBuf, source: vidSource } = await getVideo();
    const vid = await svc.saveMedia(vidBuf, {
      filename: `smoketest-video-${ts}.mp4`,
      folder: FOLDER,
      resourceType: "video",
    });
    verify(vid, "video");
    uploaded.push({ label: "video", url: vid.url });
    printAsset("VIDEO (verified)", vid, vidSource);
  } catch (err) {
    line();
    console.error("✗ UPLOAD/VERIFY FAILED:", err?.message ?? err);
    if (uploaded.length) {
      console.error(`  Cleaning up ${uploaded.length} already-uploaded asset(s) (not touching the un-uploaded one)…`);
      for (const a of uploaded) {
        try { console.error(`   ${a.label} destroy:`, JSON.stringify(await svc.destroyByUrl(a.url))); }
        catch (e) { console.error(`   ${a.label} destroy error:`, e?.message ?? e); }
      }
    }
    console.error("Stopped.");
    process.exit(1);
  }

  // ── Happy path: delete BOTH verified assets ────────────────────────────────
  line();
  console.log("Deleting both test assets via destroyByUrl()…");
  let allDeleted = true;
  for (const a of uploaded) {
    try {
      const d = await svc.destroyByUrl(a.url);
      console.log(`  ${a.label} destroy:`, JSON.stringify(d));
      if (!d.ok) allDeleted = false;
    } catch (e) {
      allDeleted = false;
      console.log(`  ${a.label} destroy error:`, e?.message ?? e);
    }
  }

  line();
  if (allDeleted) {
    console.log("✓ SMOKE TEST PASSED — upload + verify + delete OK.");
    console.log("  No DB row, no product media, no local file created.");
    process.exit(0);
  } else {
    console.log("⚠ Uploads verified, but a deletion did not return ok.");
    console.log(`  Check the Cloudinary console under ${FOLDER} and remove leftovers manually.`);
    process.exit(2);
  }
}

main().catch((e) => { console.error("Fatal:", e?.message ?? e); process.exit(1); });
