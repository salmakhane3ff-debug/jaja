/**
 * POST /api/checkout/upload-receipt
 * ─────────────────────────────────────────────────────────────────────────────
 * Secure receipt image upload for bank-transfer checkout.
 *
 * Security layers (server-side — never trusts client):
 *   1. Rate limit      — 8 uploads / IP / minute
 *   2. Strict parsing  — data URL regex, no loose matching
 *   3. MIME allowlist  — only image/jpeg | image/png | image/webp
 *   4. Size gate       — rejects base64 string > 7 MB before decoding
 *   5. Magic bytes     — verifies actual binary header matches claimed type
 *   6. WAF scan        — scans decoded bytes for embedded script / SVG payloads
 *   7. Sharp re-encode — strips ALL EXIF / metadata; re-renders pixels only
 *   8. UUID filename   — original name never reaches disk
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path   from "path";
import crypto from "crypto";
import sharp  from "sharp";
import { rateLimit } from "@/lib/rateLimit";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_DECODED_BYTES = 5 * 1024 * 1024;          // 5 MB after decode
const MAX_B64_CHARS     = Math.ceil(MAX_DECODED_BYTES / 3) * 4 + 32; // ~7 MB raw b64

// ── Allowed types: MIME → { ext, magic byte check, sharp output format } ─────
const ALLOWED = {
  "image/jpeg": {
    ext:    "jpg",
    magic:  (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    format: "jpeg",
    opts:   { quality: 82, mozjpeg: true },
  },
  "image/png": {
    ext:    "png",
    magic:  (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
    format: "png",
    opts:   { compressionLevel: 6 },
  },
  "image/webp": {
    ext:    "webp",
    // RIFF????WEBP
    magic:  (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
    format: "webp",
    opts:   { quality: 82 },
  },
};

// ── WAF: binary patterns that must never appear in a real image buffer ────────
// These catch polyglot files (e.g. valid JPEG header + PHP/HTML/SVG payload).
const WAF_PATTERNS = [
  Buffer.from("3c736372697074", "hex"),   // <script
  Buffer.from("3c2f736372697074", "hex"), // </script
  Buffer.from("3c737667", "hex"),         // <svg
  Buffer.from("3c21444f4354595045", "hex"), // <!DOCTYPE
  Buffer.from("3c68746d6c", "hex"),       // <html
  Buffer.from("3c696672616d65", "hex"),   // <iframe
  Buffer.from("6f6e6c6f6164", "hex"),     // onload
  Buffer.from("6f6e6572726f72", "hex"),   // onerror
  Buffer.from("6a61766173637269707", "hex"), // javascrip (prefix)
  Buffer.from("3c3f706870", "hex"),       // <?php
  Buffer.from("65766f286576616c28", "hex"), // eval(eval(
];

function wafScan(buf) {
  // Only scan the first 64 KB — the magic pixel data is at the start;
  // any injected payload in a polyglot is typically appended after.
  // We scan the TAIL 32 KB as well to catch appended payloads.
  const head = buf.slice(0, 65536);
  const tail = buf.length > 65536 ? buf.slice(-32768) : Buffer.alloc(0);

  for (const pattern of WAF_PATTERNS) {
    if (head.includes(pattern) || tail.includes(pattern)) return true;
  }
  return false;
}

// ── Helper: get client IP ─────────────────────────────────────────────────────
// Reuse the same logic as rateLimit (CF-Connecting-IP → XFF → x-real-ip)
function getIp(req) {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req) {
  // ── 1. Rate limit: 8 uploads / IP / 60 s ─────────────────────────────────
  const limited = rateLimit(req, "upload-receipt", { max: 8, windowMs: 60_000 });
  if (limited) return limited;

  try {
    // ── 2. Parse JSON body ──────────────────────────────────────────────────
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const { dataUrl } = body ?? {};
    if (!dataUrl || typeof dataUrl !== "string") {
      return NextResponse.json({ error: "Missing dataUrl field." }, { status: 400 });
    }

    // ── 3. Early length gate (before any allocation) ────────────────────────
    if (dataUrl.length > MAX_B64_CHARS + 50 /* header prefix */) {
      return NextResponse.json(
        { error: "File too large. Maximum is 5 MB." },
        { status: 413 }
      );
    }

    // ── 4. Strict data URL parse ────────────────────────────────────────────
    // Exact format: data:<type>;base64,<b64chars>
    // The base64 segment allows only [A-Za-z0-9+/] with optional trailing =
    const match = dataUrl.match(
      /^data:([a-zA-Z0-9][a-zA-Z0-9!#$&\-^_]{0,30}\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_+.]{0,30});base64,([A-Za-z0-9+/]+=*)$/
    );
    if (!match) {
      logSuspicious(req, "malformed-data-url");
      return NextResponse.json(
        { error: "Invalid data URL. Only base64-encoded JPEG, PNG, or WebP are accepted." },
        { status: 400 }
      );
    }

    const claimedMime = match[1].toLowerCase();
    const b64Data     = match[2];

    // ── 5. MIME allowlist ───────────────────────────────────────────────────
    const allowed = ALLOWED[claimedMime];
    if (!allowed) {
      logSuspicious(req, `blocked-mime:${claimedMime}`);
      return NextResponse.json(
        { error: "File type not allowed. Only JPEG, PNG, and WebP are accepted." },
        { status: 415 }
      );
    }

    // ── 6. Decode base64 → binary ───────────────────────────────────────────
    let rawBuffer;
    try {
      rawBuffer = Buffer.from(b64Data, "base64");
    } catch {
      return NextResponse.json({ error: "Failed to decode image data." }, { status: 400 });
    }

    // ── 7. Decoded size check ───────────────────────────────────────────────
    if (rawBuffer.length > MAX_DECODED_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum is 5 MB." },
        { status: 413 }
      );
    }

    // ── 8. Magic byte verification ──────────────────────────────────────────
    if (rawBuffer.length < 12 || !allowed.magic(rawBuffer)) {
      logSuspicious(req, `magic-mismatch:${claimedMime}`);
      return NextResponse.json(
        { error: "File content does not match the declared image type." },
        { status: 415 }
      );
    }

    // ── 9. WAF scan — detect polyglot / embedded payloads ──────────────────
    if (wafScan(rawBuffer)) {
      logSuspicious(req, "waf-pattern-hit");
      return NextResponse.json(
        { error: "File rejected: suspicious content detected." },
        { status: 415 }
      );
    }

    // ── 10. Sharp re-encode — strips ALL EXIF / metadata ───────────────────
    // Re-rendering through sharp discards everything except pixel data:
    // no EXIF GPS, no ICC profiles, no XMP, no appended polyglot chunks.
    let safeBuffer;
    try {
      safeBuffer = await sharp(rawBuffer)
        .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
        [allowed.format](allowed.opts)
        .toBuffer();
    } catch (sharpErr) {
      // sharp throws on non-image data even if magic bytes match (extra safety)
      logSuspicious(req, `sharp-rejected:${sharpErr.message}`);
      return NextResponse.json(
        { error: "Could not process the image. Please try a different file." },
        { status: 415 }
      );
    }

    // ── 11. Save with UUID filename (no original name on disk) ──────────────
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "receipts");
    await mkdir(uploadsDir, { recursive: true });

    const filename = `${crypto.randomUUID()}.${allowed.ext}`;
    const filepath  = path.join(uploadsDir, filename);
    await writeFile(filepath, safeBuffer);

    return NextResponse.json(
      { url: `/uploads/receipts/${filename}` },
      { status: 200 }
    );

  } catch (err) {
    console.error("[upload-receipt] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ── Internal: structured suspicious-request log ───────────────────────────────
function logSuspicious(req, reason) {
  console.warn("[upload-receipt] BLOCKED", {
    reason,
    ip:        getIp(req),
    ua:        req.headers.get("user-agent")?.slice(0, 120) ?? "–",
    ts:        new Date().toISOString(),
  });
}
