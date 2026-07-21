#!/usr/bin/env node
/**
 * scripts/ugcUpload.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the pre-buffer multipart guard (refinement #1, src/lib/ugcUpload.js):
 * every rejection must happen BEFORE the whole file is read into memory.
 * Run: node scripts/ugcUpload.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { extractUploadedVideo, UGC_ROUTE_MAX_UPLOAD_BYTES } from '../src/lib/ugcUpload.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };
const codeOf = async (fn) => { try { await fn(); return null; } catch (e) { return e.code; } };

// A fake File whose arrayBuffer() flips a flag so we can assert it was NOT read.
function fakeFile({ type = 'video/mp4', size = 10, bytes } = {}) {
  const f = { type, size, read: false };
  const src = bytes || Buffer.alloc(size);
  // Exact-sized ArrayBuffer copy (avoid Node's shared small-buffer pool, whose
  // .buffer is the whole 8 KB slab).
  f.arrayBuffer = async () => { f.read = true; return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength); };
  return f;
}
function fakeReq({ contentLength, file } = {}) {
  const form = { get: (k) => (k === 'video' ? (file ?? null) : null) };
  return {
    _file: file,
    headers: { get: (h) => (h.toLowerCase() === 'content-length' && contentLength != null ? String(contentLength) : null) },
    formData: async () => form,
  };
}

console.log('1) Content-Length pre-check (before body parse):');
{
  const req = fakeReq({ contentLength: UGC_ROUTE_MAX_UPLOAD_BYTES + 1, file: fakeFile() });
  ok('oversized Content-Length → UGC_UPLOAD_TOO_LARGE', await codeOf(() => extractUploadedVideo(req, { maxBytes: 100 })) === 'UGC_UPLOAD_TOO_LARGE');
  // With a tiny maxBytes the header (undefined here) is skipped; still caught by size.
  const req2 = fakeReq({ contentLength: 500, file: fakeFile({ size: 10 }) });
  ok('within Content-Length passes header check', (await extractUploadedVideo(req2, { maxBytes: 1000 })).byteLength === 10);
}

console.log('2) File.size guard fires BEFORE arrayBuffer():');
{
  const file = fakeFile({ size: 1000 });
  const req = fakeReq({ file });
  const code = await codeOf(() => extractUploadedVideo(req, { maxBytes: 100 }));
  ok('oversized File.size → UGC_UPLOAD_TOO_LARGE', code === 'UGC_UPLOAD_TOO_LARGE');
  ok('bytes were NOT materialized (arrayBuffer not called)', file.read === false);
}

console.log('3) missing / non-video / empty rejections:');
{
  ok('missing video (required) → UGC_BAD_INPUT', await codeOf(() => extractUploadedVideo(fakeReq({}), {})) === 'UGC_BAD_INPUT');
  ok('missing video (optional) → null, no throw', (await extractUploadedVideo(fakeReq({}), { required: false })).videoBuffer === null);
  const notVideo = fakeFile({ type: 'image/png', size: 10 });
  ok('non-video type → UGC_INVALID_VIDEO', await codeOf(() => extractUploadedVideo(fakeReq({ file: notVideo }), {})) === 'UGC_INVALID_VIDEO');
  ok('non-video not read', notVideo.read === false);
  ok('empty file → UGC_BAD_INPUT', await codeOf(() => extractUploadedVideo(fakeReq({ file: fakeFile({ size: 0 }) }), {})) === 'UGC_BAD_INPUT');
}

console.log('4) happy path returns buffer + form:');
{
  const bytes = Buffer.from('mp4 data here');
  const file = fakeFile({ size: bytes.length, bytes });
  const req = fakeReq({ file, contentLength: bytes.length });
  const out = await extractUploadedVideo(req, { maxBytes: 1000 });
  ok('returns a Buffer', Buffer.isBuffer(out.videoBuffer));
  ok('byteLength correct', out.byteLength === bytes.length);
  ok('returns the parsed form for field access', typeof out.form.get === 'function');
  ok('arrayBuffer WAS read on the happy path', file.read === true);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
