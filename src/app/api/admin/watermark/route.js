/**
 * /api/admin/watermark
 * GET  — fetch current watermark settings
 * PUT  — save watermark settings
 * POST ?action=preview   — apply watermark to uploaded test image, return base64
 * POST ?action=apply-all — reprocess all /public/uploads images
 */

import path from 'path';
import fs   from 'fs';
import {
  getWatermarkSettings,
  saveWatermarkSettings,
  applyWatermark,
  processFileWithWatermark,
} from '@/lib/services/watermarkService.js';
import _prisma from '@/lib/prisma.js';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const GET = withAdminAuth(async () => {
  try {
    const s = await getWatermarkSettings();
    return Response.json(s);
  } catch (err) {
    console.error('[watermark GET]', err);
    return Response.json({ error: 'Failed to load settings' }, { status: 500 });
  }
});

export const PUT = withAdminAuth(async (req) => {
  try {
    const body = await req.json();
    // Strip id/timestamps before saving
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = body;
    const s = await saveWatermarkSettings(data);
    return Response.json(s);
  } catch (err) {
    console.error('[watermark PUT]', err);
    return Response.json({ error: 'Failed to save settings' }, { status: 500 });
  }
});

export const POST = withAdminAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    // ── Preview: apply watermark to a test image ──────────────────────────
    if (action === 'preview') {
      const formData = await req.formData();
      const file     = formData.get('file');
      if (!file) return Response.json({ error: 'No file' }, { status: 400 });

      const buffer   = Buffer.from(await file.arrayBuffer());
      const settings = await getWatermarkSettings();
      const out      = await applyWatermark(buffer, { ...settings, isEnabled: true });
      const b64      = out.toString('base64');
      const mime     = file.type || 'image/jpeg';

      return Response.json({ dataUrl: `data:${mime};base64,${b64}` });
    }

    // ── Apply to all existing uploads ─────────────────────────────────────
    if (action === 'apply-all') {
      const settings = await getWatermarkSettings();
      if (!settings.isEnabled) {
        return Response.json({ error: 'Watermark is disabled' }, { status: 400 });
      }

      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        return Response.json({ processed: 0 });
      }

      const files = fs.readdirSync(uploadDir).filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
      });

      let processed = 0;
      for (const file of files) {
        try {
          await processFileWithWatermark(path.join(uploadDir, file), settings);
          processed++;
        } catch (e) {
          console.warn(`[watermark] Skipped ${file}:`, e.message);
        }
      }

      return Response.json({ processed, total: files.length });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[watermark POST]', err);
    return Response.json({ error: 'Operation failed' }, { status: 500 });
  }
});
