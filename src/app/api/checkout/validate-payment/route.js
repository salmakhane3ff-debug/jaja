/**
 * POST /api/checkout/validate-payment
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side guard: verifies the chosen payment method is allowed by ALL
 * products in the cart before an order is created.
 *
 * Body:
 *   {
 *     productIds:    string[]   – list of product UUIDs in the cart
 *     paymentMethod: string     – "cod" | "prepaid" | "cod_deposit"
 *   }
 *
 * Response:
 *   200 { ok: true }
 *   400 { ok: false, error: string, blockedProducts: string[] }
 *   500 { ok: false, error: string }
 *
 * Rules:
 *   - paymentMethod "cod" or "cod_deposit" → product.allowCOD must be true
 *   - paymentMethod "prepaid"              → product.allowPrepaid must be true
 *   - Products without a matching row (deleted, etc.) are passed through
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '@/lib/prisma';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { productIds, paymentMethod } = body;

    if (!Array.isArray(productIds) || !productIds.length) {
      return Response.json({ ok: false, error: 'productIds required' }, { status: 400 });
    }
    if (!paymentMethod) {
      return Response.json({ ok: false, error: 'paymentMethod required' }, { status: 400 });
    }

    // Fetch only the fields we need — minimal query
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, title: true, allowCOD: true, allowPrepaid: true },
    });

    const isCOD     = paymentMethod === 'cod' || paymentMethod === 'cod_deposit';
    const isPrepaid = paymentMethod === 'prepaid';

    const blocked = products.filter((p) => {
      if (isCOD     && p.allowCOD     === false) return true;
      if (isPrepaid && p.allowPrepaid === false) return true;
      return false;
    });

    if (blocked.length > 0) {
      return Response.json(
        {
          ok: false,
          error: 'بعض المنتجات في سلتك لا تدعم طريقة الدفع المختارة',
          blockedProducts: blocked.map((p) => p.title),
        },
        { status: 400 }
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[validate-payment]', err?.message ?? err);
    return Response.json({ ok: false, error: 'حدث خطأ أثناء التحقق' }, { status: 500 });
  }
}
