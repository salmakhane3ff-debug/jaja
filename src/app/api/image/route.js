/**
 * /api/image
 * ─────────────────────────────────────────────────────────────────────────────
 * Image library CRUD — Prisma-backed replacement for the retired MongoDB
 * /api/image endpoint.  Stores records in the `images` table and files in
 * /public/uploads/.
 *
 * GET              → list all image records  [{ _id, name, url }]
 * POST (multipart) → upload file → save to /public/uploads/ → DB record
 * DELETE { _id }   → remove DB record (file stays on disk — safe default)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync }      from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import { getWatermarkSettings, applyWatermark } from '@/lib/services/watermarkService.js';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { validateImage, validateVideo } from '@/lib/uploadSecurity';
import { rateLimit } from '@/lib/rateLimit';
import { optimizeImageBuffer } from '@/lib/imageOptimize';

// ── Route segment config ──────────────────────────────────────────────────────
// Raise Next.js body size limit to 200 MB so large video uploads aren't
// rejected before they even reach the handler. Nginx must also be configured
// with `client_max_body_size 200M` to match.
export const maxDuration = 120; // seconds — allow time for large uploads
// bodyParser is disabled by default for App Router (uses Web Streams) — no need to set it.

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapImage(row) {
  if (!row) return null;
  return { _id: row.id, name: row.name, url: row.url, createdAt: row.createdAt };
}

// ── GET → list all images ────────────────────────────────────────────────────

export const GET = withAdminAuth(async () => {
  try {
    const rows = await prisma.image.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return Response.json(rows.map(mapImage));
  } catch (err) {
    console.error('[/api/image GET]', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
});

// ── POST multipart/form-data → upload + save record ──────────────────────────

export const POST = withAdminAuth(async (req) => {
  const limited = rateLimit(req, 'upload', { max: 60, windowMs: 60_000 });
  if (limited) return limited;
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    let buffer = Buffer.from(await file.arrayBuffer());

    // ── Security: validate extension + magic bytes + size ─────────────────────
    const isVideo = file.type?.startsWith('video/') ||
      /\.(mp4|webm|mov|ogg)$/i.test(file.name);
    const validation = isVideo
      ? validateVideo(buffer, file.name)
      : validateImage(buffer, file.name);
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: validation.status });
    }

    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const fileName  = `${Date.now()}-${safeName}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath  = path.join(uploadDir, fileName);

    if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true });

    // Image-only post-processing (skip videos entirely).
    if (!file.type.startsWith('video/')) {
      // PERF: compress + resize BEFORE watermarking so the watermark is applied
      // to the final dimensions and not wasted on pixels we're about to drop.
      buffer = await optimizeImageBuffer(buffer, file.name);

      try {
        const wm = await getWatermarkSettings();
        if (wm?.isEnabled) buffer = await applyWatermark(buffer, wm);
      } catch (wmErr) {
        console.warn('[watermark] Skipped:', wmErr.message);
      }
    }

    await writeFile(filePath, buffer);

    const url = `/uploads/${fileName}`;
    const row = await prisma.image.create({
      data: { name: file.name, url },
    });

    return Response.json(mapImage(row), { status: 201 });
  } catch (err) {
    console.error('[/api/image POST]', err);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
});

// ── DELETE { _id } ────────────────────────────────────────────────────────────

export const DELETE = withAdminAuth(async (req) => {
  try {
    const { _id, id } = await req.json();
    const imageId = _id || id;

    if (!imageId) {
      return Response.json({ error: '_id is required' }, { status: 400 });
    }

    await prisma.image.delete({ where: { id: imageId } });
    return Response.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') {
      return Response.json({ error: 'Image not found' }, { status: 404 });
    }
    console.error('[/api/image DELETE]', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
});
