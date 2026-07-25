/**
 * GET /api/admin/identity/[id]/[side]   (side = 'front' | 'back')
 * Streams ONE private CIN image to an authenticated admin. This is the ONLY way
 * a document is ever served — never a public URL, never to an affiliate. The
 * response is marked no-store so it is never cached by proxies/browsers.
 */
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { getCinFileForAdmin } from '@/lib/services/identityService';

export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async (_req, ctx) => {
  try {
    const { id, side } = await ctx.params;
    if (side !== 'front' && side !== 'back') {
      return new Response('Bad request', { status: 400 });
    }
    const file = await getCinFileForAdmin(id, side);
    if (!file) return new Response('Not found', { status: 404 });

    return new Response(file.buffer, {
      status: 200,
      headers: {
        'Content-Type':  file.contentType,
        'Content-Length': String(file.buffer.length),
        'Cache-Control': 'no-store, private',
        'Content-Disposition': 'inline',
      },
    });
  } catch (err) {
    console.error('admin/identity file stream error:', err);
    return new Response('Server error', { status: 500 });
  }
});
