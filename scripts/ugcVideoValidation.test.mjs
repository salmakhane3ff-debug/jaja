#!/usr/bin/env node
/**
 * scripts/ugcVideoValidation.test.mjs
 * Tests server-side video metadata validation (src/lib/ugcVideoValidation.js).
 * Builds real MP4 box structures from bytes — no ffmpeg, no fixtures, no DB.
 * Run: node scripts/ugcVideoValidation.test.mjs
 */

import { validateVideo, detectContainer, DEFAULT_ALLOWED_CODECS } from "../src/lib/ugcVideoValidation.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

// ── Minimal ISO-BMFF (MP4) builder ────────────────────────────────────────────
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0, 0); return b; };
const box = (type, ...parts) => {
  const payload = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p, "ascii"))));
  return Buffer.concat([u32(8 + payload.length), Buffer.from(type, "ascii"), payload]);
};
const ftyp = () => box("ftyp", "isom", u32(0), "mp42");
const mvhd = (timescale, duration) => box("mvhd", u32(0), u32(0), u32(0), u32(timescale), u32(duration));
const stsd = (fourcc) => box("stsd", u32(0), u32(1), u32(16), fourcc);
const trakWith = (codec) => box("trak", box("mdia", box("minf", box("stbl", stsd(codec)))));
const validMp4 = ({ timescale = 1000, duration = 30000, codec = "avc1" } = {}) =>
  Buffer.concat([ftyp(), box("moov", mvhd(timescale, duration), trakWith(codec))]);

console.log("1) container detection is structural, NOT filename/MIME:");
{
  ok("MP4 (ftyp) detected", detectContainer(validMp4()) === "mp4");
  ok("WebM (EBML magic) detected", detectContainer(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])) === "webm");
  ok("random bytes → null", detectContainer(Buffer.from("this is not a video, it's a .mp4-named text file")) === null);
  ok("too small → null", detectContainer(Buffer.from([0, 1, 2])) === null);
}

console.log("2) a valid MP4 passes with parsed metadata:");
{
  const r = validateVideo(validMp4({ timescale: 1000, duration: 30000, codec: "avc1" }), { minSeconds: 5, maxSeconds: 120 });
  ok("ok=true", r.ok === true);
  ok("duration parsed from mvhd (authoritative, not client-claimed)", r.durationSeconds === 30);
  ok("codec parsed from stsd", r.codec === "avc1");
  ok("container reported", r.container === "mp4");
  // 64-bit-ish large timescale/duration still divides correctly
  ok("hevc accepted", validateVideo(validMp4({ codec: "hvc1" }), { minSeconds: 1 }).ok === true);
}

console.log("3) duration bounds (read from the file, not trusted):");
{
  ok("too short rejected", validateVideo(validMp4({ timescale: 1000, duration: 500 }), { minSeconds: 1 }).reason.includes("too short"));
  ok("too long rejected", validateVideo(validMp4({ timescale: 1, duration: 700 }), { maxSeconds: 600 }).reason.includes("too long"));
  ok("exactly at min accepted", validateVideo(validMp4({ timescale: 1, duration: 5 }), { minSeconds: 5, maxSeconds: 120 }).ok === true);
  ok("zero duration rejected", validateVideo(validMp4({ timescale: 1000, duration: 0 })).reason.includes("duration"));
}

console.log("4) corrupted / truncated files are rejected (fail-closed):");
{
  const good = validMp4();
  ok("truncated file rejected", validateVideo(good.slice(0, good.length - 12)).ok === false);
  ok("empty buffer rejected", validateVideo(Buffer.alloc(0)).reason === "empty file");
  ok("non-video bytes rejected", validateVideo(Buffer.from("plain text pretending to be video")).ok === false);
  // ftyp present but no moov (e.g. still uploading)
  ok("ftyp without moov rejected", validateVideo(ftyp()).reason.includes("moov"));
  // a box claiming a size past the file end
  const lying = Buffer.concat([ftyp(), Buffer.concat([u32(9999), Buffer.from("moov")])]);
  ok("box size past EOF rejected as corrupted", validateVideo(lying).ok === false);
}

console.log("5) codec allow-list (unsupported codecs rejected before storage):");
{
  ok("unsupported video codec rejected", validateVideo(validMp4({ codec: "xvid" })).reason.includes("unsupported video codec"));
  ok("audio-only (mp4a) rejected — no video track", validateVideo(validMp4({ codec: "mp4a" })).ok === false);
  // audio track first, video track second → still accepted (searches all tracks)
  const mixed = Buffer.concat([ftyp(), box("moov", mvhd(1000, 30000), trakWith("mp4a"), trakWith("avc1"))]);
  ok("video codec found even when an audio track is listed first", validateVideo(mixed, { minSeconds: 1 }).ok === true);
  ok("custom allow-list respected", validateVideo(validMp4({ codec: "av01" }), { allowedCodecs: new Set(["av01"]) }).ok === true);
  ok("default allow-list has the common codecs", DEFAULT_ALLOWED_CODECS.has("avc1") && DEFAULT_ALLOWED_CODECS.has("hvc1"));
}

console.log("6) size ceiling + container allow-list:");
{
  ok("oversized rejected", validateVideo(validMp4(), { maxBytes: 10 }).reason.includes("maximum size"));
  ok("WebM rejected by default (documented limitation)", validateVideo(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])).ok === false);
  ok("container not in allow-list rejected", validateVideo(validMp4(), { allowedContainers: ["webm"] }).reason.includes("unsupported container"));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
