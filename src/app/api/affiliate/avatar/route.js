/**
 * POST /api/affiliate/avatar
 * Upload affiliate profile picture → save to /public/uploads/ → update DB
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync }       from 'fs';
import path                 from 'path';
import { withAffiliateAuth } from '@/lib/middleware/withAffiliateAuth';
import { updateAffiliateProfile } from '@/lib/services/affiliateSystemService';
import { optimizeImageBuffer } from '@/lib/imageOptimize';

async function postHandler(req, _ctx, decoded) {
  try {
    const formData = await req.formData();
    const file     = formData.get('file');

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    // Only accept images
    if (!file.type.startsWith('image/')) {
      return Response.json({ error: 'Seules les images sont acceptées' }, { status: 400 });
    }

    // Max 2 MB (pre-compression)
    const MAX_SIZE = 2 * 1024 * 1024;
    let buffer     = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_SIZE) {
      return Response.json({ error: 'Image trop lourde (max 2 Mo)' }, { status: 400 });
    }

    // PERF: resize + recompress so 40×40 avatars don't ship multi-MB originals.
    buffer = await optimizeImageBuffer(buffer, file.name);

    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const fileName  = `avatar-${decoded.affiliateId}-${Date.now()}-${safeName}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath  = path.join(uploadDir, fileName);

    if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, buffer);

    const avatarUrl  = `/uploads/${fileName}`;
    const affiliate  = await updateAffiliateProfile(decoded.affiliateId, { avatarUrl });
    return Response.json({ affiliate, avatarUrl });
  } catch (err) {
    console.error('Affiliate avatar upload error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const POST = withAffiliateAuth(postHandler);
