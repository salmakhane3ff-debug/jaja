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

import prisma from '@/lib/prisma';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { rateLimit } from '@/lib/rateLimit';
// The ingest pipeline (validate -> optimize -> watermark -> saveMedia ->
// thumbnails -> images row) lives in one service so the product-URL importer
// reuses it instead of growing a second uploader.
import { ingestImageBuffer, mapImageRow } from '@/lib/services/imageIngestService.js';

// ── Route segment config ──────────────────────────────────────────────────────
// Raise Next.js body size limit to 200 MB so large video uploads aren't
// rejected before they even reach the handler. Nginx must also be configured
// with `client_max_body_size 200M` to match.
export const maxDuration = 120; // seconds — allow time for large uploads
// bodyParser is disabled by default for App Router (uses Web Streams) — no need to set it.

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── GET → list all images ────────────────────────────────────────────────────

export const GET = withAdminAuth(async () => {
  try {
    const rows = await prisma.image.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return Response.json(rows.map(mapImageRow));
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const isVideo = file.type?.startsWith('video/') ||
      /\.(mp4|webm|mov|ogg)$/i.test(file.name);

    const res = await ingestImageBuffer(buffer, { originalName: file.name, isVideo });
    if (!res.ok) {
      return Response.json({ error: res.error }, { status: res.status });
    }

    return Response.json(res.record, { status: 201 });
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
