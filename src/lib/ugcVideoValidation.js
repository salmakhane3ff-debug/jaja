/**
 * src/lib/ugcVideoValidation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side video validation from the ACTUAL file bytes — not the client's
 * claimed MIME type or extension (refinement #2). Pure: operates on a Buffer,
 * no ffmpeg, no dependencies.
 *
 * What it proves before a file is ever stored:
 *   • Container is a real MP4/MOV (ISO-BMFF), detected by structure, not name.
 *   • The box tree parses cleanly end-to-end — a corrupted/truncated file fails
 *     (a box whose size runs past its parent is rejected).
 *   • Duration is read from the movie header (mvhd), the authoritative value —
 *     never trusted from the client — and checked against min/max.
 *   • At least one video track uses an allow-listed codec (from the sample
 *     description, stsd). Unsupported codecs are rejected.
 *
 * FAIL-CLOSED: anything we cannot positively parse and validate is rejected.
 *
 * SCOPE: MP4/MOV (ISO base media — the format phone cameras export, incl. iPhone
 * .mov 'qt  ' brand and Android .mp4). WebM is detected but rejected by default
 * (documented limitation) because reliable duration/codec extraction there needs
 * an EBML parser; enable via allowedContainers when that lands.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ISO-BMFF boxes that CONTAIN child boxes (we recurse into these).
const CONTAINER_BOXES = new Set([
  'moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta', 'mvex', 'moof', 'traf',
]);

// Video sample formats (fourcc in stsd) we accept. Audio-only formats (mp4a,
// etc.) are ignored — we require at least one of THESE to be present.
export const DEFAULT_ALLOWED_CODECS = new Set([
  'avc1', 'avc3', // H.264
  'hev1', 'hvc1', // H.265 / HEVC
  'mp4v',         // MPEG-4 Visual
  'av01',         // AV1
  'vp09',         // VP9 in MP4
]);

/** Container type from magic bytes/structure — never from filename. */
export function detectContainer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.toString('ascii', 4, 8) === 'ftyp') return 'mp4';          // ISO-BMFF (mp4/mov)
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm'; // EBML
  return null;
}

/**
 * Read the sequence of boxes in [start, end). Returns { boxes, malformed }.
 * malformed=true if any box header/size is inconsistent with the region — the
 * corruption/truncation guard.
 */
function readBoxes(buf, start, end) {
  const boxes = [];
  let off = start;
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    let header = 8;
    if (size === 1) {                       // 64-bit extended size
      if (off + 16 > end) return { boxes, malformed: true };
      const hi = buf.readUInt32BE(off + 8);
      const lo = buf.readUInt32BE(off + 12);
      size = hi * 2 ** 32 + lo;
      header = 16;
    } else if (size === 0) {
      size = end - off;                     // box extends to end of region
    }
    if (size < header || off + size > end) return { boxes, malformed: true };
    boxes.push({ type, dataStart: off + header, dataEnd: off + size });
    off += size;
  }
  // Trailing bytes shorter than a box header ⇒ truncated.
  if (off !== end) return { boxes, malformed: true };
  return { boxes, malformed: false };
}

/** Collect every box of `type` at any depth within [start, end). */
function findAllBoxes(buf, type, start, end, out = []) {
  const { boxes, malformed } = readBoxes(buf, start, end);
  if (malformed) return { malformed: true, out };
  for (const b of boxes) {
    if (b.type === type) out.push(b);
    if (CONTAINER_BOXES.has(b.type)) {
      const r = findAllBoxes(buf, type, b.dataStart, b.dataEnd, out);
      if (r.malformed) return { malformed: true, out };
    }
  }
  return { malformed: false, out };
}

/** Duration in seconds from an mvhd box, or null if unreadable. */
function parseDuration(buf, box) {
  const s = box.dataStart;
  if (s + 4 > box.dataEnd) return null;
  const version = buf[s];
  let timescale, duration;
  if (version === 1) {
    const tsOff = s + 4 + 8 + 8;            // version/flags + 2×u64 times
    if (tsOff + 4 + 8 > box.dataEnd) return null;
    timescale = buf.readUInt32BE(tsOff);
    const hi = buf.readUInt32BE(tsOff + 4);
    const lo = buf.readUInt32BE(tsOff + 8);
    duration = hi * 2 ** 32 + lo;
  } else {
    const tsOff = s + 4 + 4 + 4;            // version/flags + 2×u32 times
    if (tsOff + 4 + 4 > box.dataEnd) return null;
    timescale = buf.readUInt32BE(tsOff);
    duration = buf.readUInt32BE(tsOff + 4);
  }
  if (!timescale) return null;
  return duration / timescale;
}

/** First sample-format fourcc from a stsd box, or null. */
function parseCodec(buf, box) {
  const s = box.dataStart;               // version(1)+flags(3)+entryCount(4)+entry: size(4)+format(4)
  if (s + 16 > box.dataEnd) return null;
  return buf.toString('ascii', s + 12, s + 16);
}

/**
 * Extract structural metadata from an MP4/MOV buffer using the pure JS parser.
 * Split from policy so the progressive facade can apply the SAME policy to
 * metadata produced by ffprobe.
 * @returns {{container:string, durationSeconds:number, codecs:string[]} | {error:string}}
 */
export function extractMp4Metadata(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return { error: 'empty file' };

  const container = detectContainer(buf);
  if (!container) return { error: 'unrecognized container — not a valid video file' };
  if (container !== 'mp4') return { error: 'only MP4/MOV videos can be parsed by the JS validator' };

  const top = readBoxes(buf, 0, buf.length);
  if (top.malformed) return { error: 'corrupted or truncated video structure' };
  if (!top.boxes.length || top.boxes[0].type !== 'ftyp') return { error: 'missing ftyp header' };

  const moov = findAllBoxes(buf, 'moov', 0, buf.length);
  if (moov.malformed) return { error: 'corrupted video structure' };
  if (!moov.out.length) return { error: 'missing moov — incomplete video (e.g. still uploading)' };
  const moovBox = moov.out[0];

  const mvhd = findAllBoxes(buf, 'mvhd', moovBox.dataStart, moovBox.dataEnd);
  if (mvhd.malformed) return { error: 'corrupted movie header' };
  if (!mvhd.out.length) return { error: 'missing movie header (mvhd)' };
  const durationSeconds = parseDuration(buf, mvhd.out[0]);
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { error: 'could not determine video duration' };
  }

  const stsd = findAllBoxes(buf, 'stsd', moovBox.dataStart, moovBox.dataEnd);
  if (stsd.malformed) return { error: 'corrupted sample description' };
  const codecs = stsd.out.map((b) => parseCodec(buf, b)).filter(Boolean);

  return { container, durationSeconds, codecs };
}

/**
 * Apply upload policy to already-extracted metadata. Backend-agnostic: the same
 * function validates whether metadata came from the JS parser or from ffprobe,
 * so both paths enforce identical rules (single source of policy truth).
 * @param {{container?:string, durationSeconds?:number, codecs?:string[], codec?:string}} meta
 * @param {number} byteLength
 * @returns {{ok:boolean, container?:string, durationSeconds?:number, codec?:string, reason?:string}}
 */
export function checkVideoPolicy(meta, byteLength, opts = {}) {
  const {
    minSeconds = 1,
    maxSeconds = 600,
    maxBytes = 200 * 1024 * 1024,
    allowedContainers = ['mp4'],
    allowedCodecs = DEFAULT_ALLOWED_CODECS,
  } = opts;
  const fail = (reason) => ({ ok: false, reason });
  const codecAllowed = (c) => (allowedCodecs instanceof Set ? allowedCodecs.has(c) : allowedCodecs.includes(c));

  if (Number.isFinite(byteLength) && byteLength > maxBytes) return fail('file exceeds maximum size');
  if (!meta || !meta.container) return fail('unknown container');
  if (!allowedContainers.includes(meta.container)) return fail(`unsupported container: ${meta.container}`);

  const dur = meta.durationSeconds;
  if (dur == null || !Number.isFinite(dur) || dur <= 0) return fail('could not determine video duration');
  if (dur < minSeconds) return fail(`video too short: ${dur.toFixed(1)}s (min ${minSeconds}s)`);
  if (dur > maxSeconds) return fail(`video too long: ${dur.toFixed(1)}s (max ${maxSeconds}s)`);

  const codecs = Array.isArray(meta.codecs) ? meta.codecs : (meta.codec ? [meta.codec] : []);
  const videoCodec = codecs.find(codecAllowed);
  if (!videoCodec) return fail(codecs.length ? `unsupported video codec: ${codecs.join(', ')}` : 'no readable video codec');

  return { ok: true, container: meta.container, durationSeconds: dur, codec: videoCodec };
}

/**
 * Full pure-JS validation = extract + policy. Standalone validator AND the
 * fallback backend of the progressive facade (videoValidation.js).
 * @returns {{ok:boolean, container?:string, durationSeconds?:number, codec?:string, reason?:string}}
 */
export function validateVideo(buf, opts = {}) {
  const meta = extractMp4Metadata(buf);
  if (meta.error) return { ok: false, reason: meta.error };
  return checkVideoPolicy(meta, Buffer.isBuffer(buf) ? buf.length : 0, opts);
}
