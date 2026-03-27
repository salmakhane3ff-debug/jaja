import crypto from "crypto";
import { getSettings } from "@/lib/services/settingsService";
import { updateOrder } from "@/lib/services/orderService";
import prisma from "@/lib/prisma";

// Verify Razorpay webhook signature
function verifyRazorpaySignature(payload, signature, secretKey) {
  const expectedSignature = crypto.createHmac("sha256", secretKey).update(payload).digest("hex");
  return expectedSignature === signature;
}

// POST: Handle Razorpay webhook notifications
export async function POST(req) {
  try {
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.razorpay?.keySecret) {
      return Response.json({ error: "Razorpay secret key not configured" }, { status: 400 });
    }

    const body = await req.text();
    const webhookData = JSON.parse(body);
    const signature = req.headers.get("x-razorpay-signature");

    if (signature) {
      const isValid = verifyRazorpaySignature(body, signature, paymentSettings.razorpay.keySecret);
      if (!isValid) {
        console.error("Invalid Razorpay webhook signature");
        return Response.json({ error: "Invalid signature" }, { status: 400 });
      }
    }

    const { event, payload } = webhookData;

    if (event === "payment.captured") {
      const payment = payload.payment.entity;

      // Find order by Razorpay order ID stored in paymentDetails JSONB
      const dbOrder = await prisma.order.findFirst({
        where: { paymentDetails: { path: ["razorpayOrderId"], equals: payment.order_id } },
      });

      if (dbOrder) {
        await updateOrder(dbOrder.id, {
          paymentDetails: {
            status: "completed",
            paidAt: new Date(),
            razorpayPaymentId: payment.id,
            paymentMethod: payment.method,
            bankReference: payment.acquirer_data?.bank_transaction_id,
          },
          status: "success",
        });
        console.log(`Order ${payment.order_id} payment captured via webhook`);
      }
    } else if (event === "payment.failed") {
      const payment = payload.payment.entity;

      const dbOrder = await prisma.order.findFirst({
        where: { paymentDetails: { path: ["razorpayOrderId"], equals: payment.order_id } },
      });

      if (dbOrder) {
        await updateOrder(dbOrder.id, {
          paymentDetails: { status: "failed", failureReason: payment.error_description },
          status: "failed",
        });
        console.log(`Order ${payment.order_id} payment failed via webhook`);
      }
    }

    return Response.json({ message: "Webhook processed successfully", event });
  } catch (error) {
    console.error("Razorpay webhook processing error:", error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
