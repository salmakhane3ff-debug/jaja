/**
 * PATCH /api/order/receipt
 * ─────────────────────────────────────────────────────────────────────────────
 * Public (no admin auth) — lets a customer attach a payment receipt to their
 * own pending order on the success page.
 *
 * Security:  orderId is a UUID that only the customer has from their session.
 *            We additionally verify the order is still in "pending" status so
 *            it can't be used to overwrite a confirmed/shipped order.
 *
 * Body: { orderId, screenshotUrl }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

export async function PATCH(req) {
  // Rate-limit: 10 uploads per IP per minute
  const limited = rateLimit(req, "order_receipt", { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const { orderId, screenshotUrl } = await req.json();

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }
    if (!screenshotUrl || typeof screenshotUrl !== "string") {
      return NextResponse.json({ error: "Missing screenshotUrl" }, { status: 400 });
    }

    // Find the order — must exist and still be pending
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { sessionId: orderId }],
        status: { in: ["pending", "failed"] },
      },
      select: { id: true, paymentDetails: true, paymentStatus: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found or already confirmed" }, { status: 404 });
    }

    // Merge screenshot into paymentDetails JSON
    const existing = (order.paymentDetails && typeof order.paymentDetails === "object")
      ? order.paymentDetails
      : {};

    const uploadedAt = new Date().toISOString();

    await prisma.order.update({
      where: { id: order.id },
      data:  {
        paymentStatus:  "under_review",
        paymentDetails: {
          ...existing,
          bankScreenshot:  screenshotUrl,
          receiptUploadedAt: uploadedAt,
        },
      },
    });

    return NextResponse.json({ ok: true, uploadedAt });
  } catch (err) {
    console.error("PATCH /api/order/receipt error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
