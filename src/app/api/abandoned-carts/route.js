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

    // ── Ensure abandoned cart always has an orderId ───────────────────────────
    // Reuse existing orderId if already set, otherwise resolve one:
    //   1. Latest real order for this phone → link to it
    //   2. No real order → create a draft order immediately (even at address stage)
    //      Items stored in paymentDetails.draftItems (no FK risk, success page reads them)
    const alreadyHasOrder = existing?.orderId;
    if (!alreadyHasOrder && cartId) {
      const latestOrder = await prisma.order.findFirst({
        where:   { customerPhone: cleanPhone },
        orderBy: { createdAt: "desc" },
        select:  { id: true },
      });

      if (latestOrder) {
        await prisma.abandonedCart.update({
          where: { id: cartId },
          data:  { orderId: latestOrder.id },
        });
      } else {
        // Create a draft order — no nested items (avoids FK issues with stale productIds).
        // Items are kept in paymentDetails.draftItems for display on the success page.
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
                draftItems:    safeItems,   // used by /api/order/status for display
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
      }
    } else if (existing?.orderId && cartId) {
      // Cart already has orderId — update draftItems so success page shows latest cart
      try {
        const order = await prisma.order.findUnique({
          where:  { id: existing.orderId },
          select: { paymentDetails: true },
        });
        if (order) {
          const pd = (order.paymentDetails && typeof order.paymentDetails === "object")
            ? order.paymentDetails : {};
          // Only update if it's still a draft (no real screenshot attached)
          if (!pd.bankScreenshot) {
            await prisma.order.update({
              where: { id: existing.orderId },
              data:  {
                paymentDetails: {
                  ...pd,
                  draftItems: safeItems,
                  total:      safeTotal,
                  cartTotal:  safeTotal,
                },
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
