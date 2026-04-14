/**
 * src/lib/uploadSecurity.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side upload validation: extension allowlist + magic byte checks.
 * No external dependencies — uses only Buffer inspection.
 *
 * SVG is BLOCKED entirely: SVG files can contain embedded <script> tags and
 * JS event handlers, making them equivalent to HTML files in attack scenarios.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Size limits ───────────────────────────────────────────────────────────────
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;   // 10 MB  (reduced from 50 MB)
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;  // 100 MB (reduced from 200 MB)

// ── Allowed extensions — SVG explicitly excluded ──────────────────────────────
// SVG is a text-based XML format that can contain <script> and JS event
// handlers. It bypasses magic-byte checks and is NOT safe to serve from
// the same origin as the admin panel.
const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.ogg']);

const BLOCKED_EXTS = new Set([
  '.svg', '.svgz',           // SVG — scriptable
  '.html', '.htm',           // HTML injection
  '.js', '.mjs', '.cjs',    // JavaScript
  '.php', '.py', '.rb',     // Server-side scripts
  '.sh', '.bat', '.cmd',    // Shell scripts
  '.xml',                    // XML with potential XSS
  '.exe', '.dll', '.so',    // Binaries
]);

// ── Magic byte signatures ─────────────────────────────────────────────────────
const MAGIC = [
  // Images
  { ext: '.jpg',  check: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: '.jpeg', check: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: '.png',  check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { ext: '.gif',  check: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { ext: '.webp', check: (b) => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  // Videos
  { ext: '.mp4',  check: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
  { ext: '.webm', check: (b) => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3 },
  { ext: '.mov',  check: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
  { ext: '.ogg',  check: (b) => b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53 },
];

// ── HTML/script detection inside buffers (secondary check) ───────────────────
// Catches polyglot attacks: a JPEG with <script> smuggled after the image data.
const SCRIPT_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /<iframe/i,
  /onerror=/i,
  /onload=/i,
  /<!DOCTYPE/i,
  /<html/i,
];

function containsScriptContent(buffer) {
  // Only scan the first 4 KB — polyglot payloads front-load their attack code
  const head = buffer.slice(0, 4096).toString('latin1');
  return SCRIPT_PATTERNS.some((re) => re.test(head));
}

// ── Public validators ─────────────────────────────────────────────────────────

/**
 * Validate an image upload.
 * Returns { ok: true } or { ok: false, error: string, status: number }
 */
export function validateImage(buffer, filename) {
  const ext = getExt(filename);

  // Hard-block dangerous extensions regardless of content
  if (BLOCKED_EXTS.has(ext)) {
    return { ok: false, error: `File type "${ext}" is not allowed`, status: 415 };
  }

  if (!ALLOWED_IMAGE_EXTS.has(ext)) {
    return { ok: false, error: `File type not allowed. Allowed: ${[...ALLOWED_IMAGE_EXTS].join(', ')}`, status: 415 };
  }

  if (buffer.length === 0) {
    return { ok: false, error: 'File is empty', status: 400 };
  }

  if (buffer.length > IMAGE_MAX_BYTES) {
    return { ok: false, error: `File too large (max ${IMAGE_MAX_BYTES / 1024 / 1024} MB)`, status: 413 };
  }

  if (!matchesMagic(buffer, ext)) {
    return { ok: false, error: 'File content does not match its extension', status: 415 };
  }

  if (containsScriptContent(buffer)) {
    return { ok: false, error: 'File contains disallowed content', status: 415 };
  }

  return { ok: true };
}

/**
 * Validate a video upload.
 * Returns { ok: true } or { ok: false, error: string, status: number }
 */
export function validateVideo(buffer, filename) {
  const ext = getExt(filename);

  if (BLOCKED_EXTS.has(ext)) {
    return { ok: false, error: `File type "${ext}" is not allowed`, status: 415 };
  }

  if (!ALLOWED_VIDEO_EXTS.has(ext)) {
    return { ok: false, error: `File type not allowed. Allowed: ${[...ALLOWED_VIDEO_EXTS].join(', ')}`, status: 415 };
  }

  if (buffer.length === 0) {
    return { ok: false, error: 'File is empty', status: 400 };
  }

  if (buffer.length > VIDEO_MAX_BYTES) {
    return { ok: false, error: `File too large (max ${VIDEO_MAX_BYTES / 1024 / 1024} MB)`, status: 413 };
  }

  if (!matchesMagic(buffer, ext)) {
    return { ok: false, error: 'File content does not match its extension', status: 415 };
  }

  return { ok: true };
}

// ── Internals ─────────────────────────────────────────────────────────────────

function getExt(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function matchesMagic(buffer, ext) {
  const sig = MAGIC.find((m) => m.ext === ext);
  if (!sig) return false;
  try {
    return sig.check(buffer);
  } catch {
    return false;
  }
}
