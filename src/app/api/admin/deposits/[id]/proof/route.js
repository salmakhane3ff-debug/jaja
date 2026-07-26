/**
 * GET /api/admin/deposits/[id]/proof
 * Streams a deposit transfer proof to an authenticated admin (private storage;
 * never a public URL). Marked no-store so it is never cached by proxies.
 */
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';
import { getDepositProofForAdmin } from '@/lib/services/depositService';

export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async (_req, ctx) => {
  try {
    const { id } = await ctx.params;
    const file = await getDepositProofForAdmin(id);
    if (!file) return new Response('Not found', { status: 404 });
    return new Response(file.buffer, {
      status: 200,
      headers: {
        'Content-Type':        file.contentType,
        'Content-Length':      String(file.buffer.length),
        'Cache-Control':       'no-store, private',
        'Content-Disposition': 'inline',
      },
    });
  } catch (err) {
    console.error('admin/deposits proof error:', err);
    return new Response('Server error', { status: 500 });
  }
});
