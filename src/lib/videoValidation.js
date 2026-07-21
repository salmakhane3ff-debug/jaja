/**
 * src/lib/videoValidation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Progressive video validation with ONE common interface (refinement #1).
 *
 *   validateVideoBuffer(buffer, opts) →
 *     { ok, container, durationSeconds, codec, reason, validator }
 *
 * Backend selection:
 *   • If ffprobe is available on the server, it is the PRIMARY metadata extractor
 *     (accurate duration/codec/container for any format it supports).
 *   • Otherwise — or if an ffprobe run fails — it falls back to the pure-JS
 *     ISO-BMFF parser (ugcVideoValidation.js).
 *
 * Both backends feed the SAME policy check (checkVideoPolicy), so the accept/
 * reject rules (size, container, duration, codec) are identical regardless of
 * which extractor ran. `validator` in the result says which one was used.
 *
 * Every external interaction (ffprobe availability + execution) is injectable via
 * `deps`, so this module is fully unit-testable without ffprobe installed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractMp4Metadata, checkVideoPolicy } from './ugcVideoValidation.js';

// ffprobe codec_name → the fourcc our allow-list uses (so policy is uniform).
const FFPROBE_CODEC_MAP = {
  h264: 'avc1', avc: 'avc1', hevc: 'hvc1', h265: 'hvc1',
  mpeg4: 'mp4v', av1: 'av01', vp9: 'vp09', vp8: 'vp08',
};

export function mapFfprobeContainer(formatName) {
  if (!formatName) return null;
  const names = String(formatName).split(',').map((s) => s.trim().toLowerCase());
  if (names.some((n) => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(n))) return 'mp4';
  if (names.some((n) => ['matroska', 'webm'].includes(n))) return 'webm';
  return null;
}

export function mapFfprobeCodec(name) {
  const key = String(name || '').toLowerCase();
  return FFPROBE_CODEC_MAP[key] || (name ? String(name) : null);
}

/** ffprobe JSON → the shared metadata shape checkVideoPolicy consumes. */
export function normalizeFfprobe(json) {
  const fmt = (json && json.format) || {};
  const streams = Array.isArray(json && json.streams) ? json.streams : [];
  const videoStreams = streams.filter((s) => s.codec_type === 'video');
  const durationRaw = fmt.duration ?? (videoStreams.find((s) => s.duration) || {}).duration;
  return {
    container: mapFfprobeContainer(fmt.format_name),
    durationSeconds: Number(durationRaw),
    codecs: videoStreams.map((s) => mapFfprobeCodec(s.codec_name)).filter(Boolean),
  };
}

// ── Default (real) ffprobe backend — never invoked when deps are injected ──────
function defaultFfprobeAvailable(env = process.env) {
  if (env.UGC_DISABLE_FFPROBE === '1') return false;
  const bin = env.FFPROBE_PATH || 'ffprobe';
  try {
    return spawnSync(bin, ['-version'], { timeout: 3000 }).status === 0;
  } catch {
    return false;
  }
}

function defaultRunFfprobe(buffer, env = process.env) {
  const bin = env.FFPROBE_PATH || 'ffprobe';
  const tmp = join(tmpdir(), `ugc-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  try {
    writeFileSync(tmp, buffer);
    const r = spawnSync(bin, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', tmp], {
      timeout: 15000, maxBuffer: 8 * 1024 * 1024,
    });
    if (r.status !== 0) throw new Error('ffprobe exited non-zero');
    return normalizeFfprobe(JSON.parse(r.stdout.toString('utf8')));
  } finally {
    try { unlinkSync(tmp); } catch { /* best-effort temp cleanup */ }
  }
}

/**
 * The one public entry point. `deps` lets tests substitute ffprobe behavior.
 */
export function validateVideoBuffer(buffer, opts = {}, deps = {}) {
  const {
    ffprobeAvailable = defaultFfprobeAvailable,
    runFfprobe = defaultRunFfprobe,
    jsExtract = extractMp4Metadata,
  } = deps;
  const byteLength = Buffer.isBuffer(buffer) ? buffer.length : 0;

  let meta = null;
  let validator = null;

  if (ffprobeAvailable()) {
    try {
      meta = runFfprobe(buffer);
      validator = 'ffprobe';
    } catch {
      meta = null;                      // fall back to the JS parser
    }
  }

  if (!meta) {
    const m = jsExtract(buffer);
    if (m.error) return { ok: false, reason: m.error, validator: 'js' };
    meta = m;
    validator = 'js';
  }

  return { ...checkVideoPolicy(meta, byteLength, opts), validator };
}
