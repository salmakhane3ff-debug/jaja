/**
 * src/lib/ugcUpload.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Multipart video extraction with early size/type guards (refinement #1):
 *   1. Content-Length header (if present) checked before we call formData().
 *   2. File.size checked BEFORE arrayBuffer() — avoids materializing a SECOND
 *      oversized copy of the bytes.
 *   3. Missing / non-video files rejected.
 *   4. A hard route-level maximum size is enforced.
 * The SERVICE still performs the authoritative video validation (codec/duration/
 * structure) on the returned bytes — this is only a cheap first line of defence.
 *
 * ⚠️ LIMITATION — this is NOT fully streaming and NOT fully pre-buffer-safe.
 *   Next.js `request.formData()` parses the ENTIRE multipart body into memory
 *   (as a File/Blob backed by an in-memory buffer) before this code runs. Our
 *   File.size / arrayBuffer() guards only prevent an ADDITIONAL oversized copy;
 *   they do NOT prevent the initial parse from holding the whole upload in RAM.
 *   The Content-Length pre-check is the only guard that can reject before that
 *   parse, and only when the client sends an honest Content-Length header.
 *   The route ceiling (UGC_ROUTE_MAX_UPLOAD_BYTES) therefore also bounds the
 *   worst-case memory a single request can pin.
 *
 * FUTURE (only if larger files become necessary): move to a streaming or
 * direct-to-storage flow — e.g. a presigned upload straight to Cloudinary/S3
 * with a size cap enforced by the storage provider, or a streaming multipart
 * parser that enforces the byte cap incrementally — so the server never buffers
 * the full file. Until then, keep UGC_ROUTE_MAX_UPLOAD_BYTES conservative.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { UGC_MAX_UPLOAD_BYTES_CEILING } from './ugcSettings.js';

// Hard route ceiling — never buffer more than this regardless of admin config.
export const UGC_ROUTE_MAX_UPLOAD_BYTES = UGC_MAX_UPLOAD_BYTES_CEILING;

const err = (code, message) => Object.assign(new Error(message || code), { code });

/**
 * @param {Request} req  a request with headers.get + formData
 * @param {{maxBytes?:number, required?:boolean}} [opts]
 * @returns {Promise<{videoBuffer:Buffer|null, byteLength:number, form:FormData}>}
 */
export async function extractUploadedVideo(req, { maxBytes = UGC_ROUTE_MAX_UPLOAD_BYTES, required = true } = {}) {
  // 1. Content-Length pre-check — reject before the body is even parsed.
  const cl = Number(req.headers?.get?.('content-length'));
  if (Number.isFinite(cl) && cl > maxBytes) {
    throw err('UGC_UPLOAD_TOO_LARGE', `upload exceeds the ${maxBytes}-byte limit`);
  }

  const form = await req.formData();
  const file = form.get('video');

  if (!file || typeof file.arrayBuffer !== 'function') {
    if (required) throw err('UGC_BAD_INPUT', 'a video file is required');
    return { videoBuffer: null, byteLength: 0, form };
  }

  // 3. Reject non-video files by declared type (service does authoritative checks).
  const type = String(file.type || '');
  if (!type.startsWith('video/')) throw err('UGC_INVALID_VIDEO', 'the uploaded file is not a video');

  // 2. File.size guard BEFORE arrayBuffer().
  if (typeof file.size === 'number') {
    if (file.size === 0) throw err('UGC_BAD_INPUT', 'the video file is empty');
    if (file.size > maxBytes) throw err('UGC_UPLOAD_TOO_LARGE', `the video exceeds the ${maxBytes}-byte limit`);
  }

  // 4. Only now materialize the bytes.
  const videoBuffer = Buffer.from(await file.arrayBuffer());
  if (videoBuffer.length > maxBytes) throw err('UGC_UPLOAD_TOO_LARGE', `the video exceeds the ${maxBytes}-byte limit`);

  return { videoBuffer, byteLength: videoBuffer.length, form };
}
