/**
 * /api/admin/demo/avatars
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → list uploaded demo avatars (men + women)                          [admin]
 * POST → multipart upload (gender + up to 20 images); each is cropped to a
 *        256×256 WebP q80 and stored in demo/avatars.                       [admin]
 *
 * Demo-only: touches the DemoAvatar library exclusively — no real affiliate or
 * production media is affected.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { listDemoAvatars, addDemoAvatars } from '@/lib/services/demoService';
import { isAcceptedAvatarType, DEMO_AVATAR_MAX_PER_UPLOAD, DEMO_AVATAR_GENDERS } from '@/lib/demoAvatarImage';

export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async () => {
  try {
    return Response.json({ avatars: await listDemoAvatars() });
  } catch (err) {
    console.error('demo/avatars GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});

export const POST = withAdminAuth(async (req) => {
  try {
    const form = await req.formData();
    const gender = String(form.get('gender') || '');
    if (!DEMO_AVATAR_GENDERS.includes(gender)) {
      return Response.json({ error: 'gender must be men or women' }, { status: 400 });
    }

    const files = form.getAll('images').filter((f) => f && typeof f.arrayBuffer === 'function');
    if (files.length === 0) {
      return Response.json({ error: 'Aucune image fournie' }, { status: 400 });
    }
    if (files.length > DEMO_AVATAR_MAX_PER_UPLOAD) {
      return Response.json({ error: `Maximum ${DEMO_AVATAR_MAX_PER_UPLOAD} images par envoi` }, { status: 400 });
    }
    for (const f of files) {
      if (!isAcceptedAvatarType(f.type)) {
        return Response.json({ error: 'Formats acceptés : JPG, PNG, WEBP' }, { status: 400 });
      }
    }

    const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
    const created = await addDemoAvatars(gender, buffers);
    return Response.json({ created, count: created.length }, { status: 201 });
  } catch (err) {
    console.error('demo/avatars POST error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
});
