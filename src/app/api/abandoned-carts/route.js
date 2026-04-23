import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAdminAuth } from "@/lib/middleware/withAdminAuth";

// ── POST /api/abandoned-carts ─────────────────────────────────────────────────
// Called from checkout/address page when the user enters a valid phone.
// Upserts by phone so duplicate submissions are idempotent.
export async function POST(req) {
  try {
    const body = await req.json();
    const { phone, fullName, email, city, items, cartTotal, page } = body;

    const cleanPhone  = (phone || "").toString().trim();
    if (!cleanPhone || cleanPhone.replace(/\D/g, "").length < 8) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }

    const VALID_PAGES  = ["address", "payment", "confirm"];
    const safePage     = VALID_PAGES.includes(page) ? page : "address";
    const safeItems    = Array.isArray(items) ? items : [];
    const safeTotal    = parseFloat(cartTotal) || 0;
    const safeCount    = safeItems.filter((i) => !i.isFreeGift && !i._isGift).length;

    // Upsert: update existing row for this phone, or create a new one.
    // Always keep the furthest page (address < payment < confirm).
    const PAGE_RANK = { address: 0, payment: 1, confirm: 2 };
    const existing = await prisma.abandonedCart.findFirst({
      where: { phone: cleanPhone, recovered: false },
      select: { id: true, pageAbandoned: true, orderId: true },
    });

    let cartId = existing?.id ?? null;

    if (existing) {
      const existingRank = PAGE_RANK[existing.pageAbandoned] ?? 0;
      const newRank      = PAGE_RANK[safePage] ?? 0;
      await prisma.abandonedCart.update({
        where: { id: existing.id },
        data: {
          fullName:      fullName  || null,
          email:         email     || null,
          city:          city      || null,
          items:         safeItems,
          cartTotal:     safeTotal,
          itemCount:     safeCount,
          pageAbandoned: newRank >= existingRank ? safePage : existing.pageAbandoned,
          updatedAt:     new Date(),
        },
      });
    } else {
      const created = await prisma.abandonedCart.create({
        data: {
          phone:         cleanPhone,
          fullName:      fullName  || null,
          email:         email     || null,
          city:          city      || null,
          items:         safeItems,
          cartTotal:     safeTotal,
          itemCount:     safeCount,
          pageAbandoned: safePage,
        },
      });
      cartId = created.id;
    }

    // ── Ensure abandoned cart always has its own dedicated orderId ───────────
    // Rule: NEVER link by phone. Each abandoned cart session owns one draft order.
    // Reuse the same orderId across all steps (address → payment → confirm).
    const alreadyHasOrder = existing?.orderId;

    if (!alreadyHasOrder && cartId) {
      // No orderId yet — create a fresh draft order for this session.
      // Items stored in paymentDetails.draftItems (avoids FK risk on stale productIds).
      try {
        const draft = await prisma.order.create({
          data: {
            customerName:    fullName || cleanPhone,
            customerPhone:   cleanPhone,
            customerEmail:   email    || null,
            shippingAddress: { city: city || "" },
            status:          "pending",
            paymentStatus:   "pending",
            paymentDetails:  {
              paymentMethod: "bank_transfer",
              total:         safeTotal,
              cartTotal:     safeTotal,
              draftItems:    safeItems,
            },
            sessionId: `draft_${cleanPhone}_${Date.now()}`,
          },
        });
        await prisma.abandonedCart.update({
          where: { id: cartId },
          data:  { orderId: draft.id },
        });
      } catch (e) {
        console.warn("[abandoned-carts] draft order creation failed:", e.message);
      }

    } else if (existing?.orderId && cartId) {
      // Session already has an orderId — keep it. Only update draftItems if the
      // order is still a draft (not confirmed/paid and no real screenshot attached).
      try {
        const order = await prisma.order.findUnique({
          where:  { id: existing.orderId },
          select: { status: true, paymentDetails: true },
        });
        if (order) {
          const locked = ["confirmed", "paid"].includes(order.status);
          const pd     = (order.paymentDetails && typeof order.paymentDetails === "object")
            ? order.paymentDetails : {};
          if (!locked && !pd.bankScreenshot) {
            await prisma.order.update({
              where: { id: existing.orderId },
              data:  {
                paymentDetails: { ...pd, draftItems: safeItems, total: safeTotal, cartTotal: safeTotal },
              },
            });
          }
        }
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/abandoned-carts error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── GET /api/abandoned-carts ──────────────────────────────────────────────────
// Admin only — returns abandoned carts, newest first.
async function _GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const showAll = searchParams.get("all") === "1";
    const page    = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit   = 50;
    const skip    = (page - 1) * limit;

    const where = showAll ? {} : { recovered: false };

    const [carts, total] = await Promise.all([
      prisma.abandonedCart.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.abandonedCart.count({ where }),
    ]);

    return NextResponse.json({ carts, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("GET /api/abandoned-carts error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export const GET = withAdminAuth(_GET);

// ── PATCH /api/abandoned-carts ────────────────────────────────────────────────
// Mark carts as recovered after a successful order.
// Body: { phone, orderId? } — marks all non-recovered carts for this phone as
// recovered and stores the orderId so the admin can send the success page link.
// Public: called client-side from confirm page after order success.
export async function PATCH(req) {
  try {
    const body    = await req.json();
    const phone   = (body?.phone   || "").toString().trim();
    const orderId = (body?.orderId || "").toString().trim() || null;
    if (!phone) return NextResponse.json({ ok: true }); // no-op

    await prisma.abandonedCart.updateMany({
      where: { phone, recovered: false },
      data:  {
        recovered: true,
        ...(orderId ? { orderId } : {}),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/abandoned-carts error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── PUT /api/abandoned-carts ──────────────────────────────────────────────────
// Admin: generate a draft order for a cart that has no orderId yet.
// Body: { cartId }  →  returns { orderId }
async function _PUT(req) {
  try {
    const { cartId } = await req.json();
    if (!cartId) return NextResponse.json({ error: "Missing cartId" }, { status: 400 });

    const cart = await prisma.abandonedCart.findUnique({
      where:  { id: cartId },
      select: { id: true, orderId: true, phone: true, fullName: true, email: true, city: true, items: true, cartTotal: true },
    });
    if (!cart) return NextResponse.json({ error: "Cart not found" }, { status: 404 });

    // Already has one — return it
    if (cart.orderId) return NextResponse.json({ orderId: cart.orderId });

    // Create draft order
    const safeItems = Array.isArray(cart.items) ? cart.items : [];
    const draft = await prisma.order.create({
      data: {
        customerName:    cart.fullName || cart.phone,
        customerPhone:   cart.phone,
        customerEmail:   cart.email   || null,
        shippingAddress: { city: cart.city || "" },
        status:          "pending",
        paymentStatus:   "pending",
        paymentDetails:  {
          paymentMethod: "bank_transfer",
          total:         cart.cartTotal || 0,
          cartTotal:     cart.cartTotal || 0,
          draftItems:    safeItems,
        },
        sessionId: `draft_${cart.phone}_${Date.now()}`,
      },
    });

    await prisma.abandonedCart.update({
      where: { id: cartId },
      data:  { orderId: draft.id },
    });

    return NextResponse.json({ orderId: draft.id });
  } catch (err) {
    console.error("PUT /api/abandoned-carts error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export const PUT = withAdminAuth(_PUT);

// ── DELETE /api/abandoned-carts?id=xxx ───────────────────────────────────────
// Admin: delete a single abandoned cart record.
async function _DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await prisma.abandonedCart.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/abandoned-carts error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export const DELETE = withAdminAuth(_DELETE);
