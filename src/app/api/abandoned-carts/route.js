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

    // ── Link abandoned cart to an order ──────────────────────────────────────
    // Only attempt if cart doesn't already have an orderId.
    const alreadyHasOrder = existing?.orderId;
    if (!alreadyHasOrder && cartId) {
      // 1. Find the most recent existing order for this phone
      const latestOrder = await prisma.order.findFirst({
        where: { customerPhone: cleanPhone },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (latestOrder) {
        // Link to existing order
        await prisma.abandonedCart.update({
          where: { id: cartId },
          data:  { orderId: latestOrder.id },
        });
      } else if (safePage === "confirm" && safeItems.length > 0) {
        // 2. No existing order — create a minimal draft order so the admin
        //    can send the customer a success-page link to complete payment.
        try {
          const paidItems = safeItems.filter((i) => i.productId && !(i.isFreeGift || i._isGift));
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
              },
              sessionId: `draft_${cleanPhone}_${Date.now()}`,
              items: {
                create: paidItems.map((item) => ({
                  productId:       item.productId,
                  quantity:        item.quantity || 1,
                  price:           item.price    || 0,
                  productSnapshot: {
                    title:   item.title  || "",
                    images:  Array.isArray(item.images) ? item.images : [],
                    variants: item.variants || [],
                  },
                })),
              },
            },
          });
          await prisma.abandonedCart.update({
            where: { id: cartId },
            data:  { orderId: draft.id },
          });
        } catch {
          // Silently skip if draft creation fails (e.g. stale productId FK error)
        }
      }
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
