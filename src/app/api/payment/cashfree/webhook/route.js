import crypto from "crypto";
import { getSettings } from "@/lib/services/settingsService";
import { updateOrder } from "@/lib/services/orderService";
import prisma from "@/lib/prisma";

// Verify Cashfree webhook signature
function verifyCashfreeSignature(payload, signature, timestamp, secretKey) {
  const signatureData = `${payload}${timestamp}`;
  const expectedSignature = crypto.createHmac("sha256", secretKey).update(signatureData).digest("base64");
  return expectedSignature === signature;
}

// POST: Handle Cashfree webhook notifications
export async function POST(req) {
  try {
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.cashfree?.secretKey) {
      return Response.json({ error: "Cashfree secret key not configured" }, { status: 400 });
    }

    const body = await req.text();
    const webhookData = JSON.parse(body);
    const signature = req.headers.get("x-webhook-signature");
    const timestamp = req.headers.get("x-webhook-timestamp");

    if (signature && timestamp) {
      const isValid = verifyCashfreeSignature(body, signature, timestamp, paymentSettings.cashfree.secretKey);
      if (!isValid) {
        console.error("Invalid Cashfree webhook signature");
        return Response.json({ error: "Invalid signature" }, { status: 400 });
      }
    }

    const { type, data } = webhookData;

    if (type === "PAYMENT_SUCCESS_WEBHOOK") {
      const { order } = data;

      // Find order by Cashfree order ID stored in paymentDetails JSONB
      const dbOrder = await prisma.order.findFirst({
        where: { paymentDetails: { path: ["cfOrderId"], equals: order.cf_order_id } },
      });

      if (dbOrder) {
        await updateOrder(dbOrder.id, {
          paymentDetails: {
            status: "completed",
            paidAt: new Date(),
            orderStatus: order.order_status,
            cfTransactionId: data.payment?.cf_payment_id,
            paymentMethod: data.payment?.payment_method,
            bankReference: data.payment?.bank_reference,
          },
          status: "success",
        });
        console.log(`Order ${order.order_id} payment confirmed via webhook`);
      }
    } else if (type === "PAYMENT_FAILED_WEBHOOK") {
      const { order } = data;

      const dbOrder = await prisma.order.findFirst({
        where: { paymentDetails: { path: ["cfOrderId"], equals: order.cf_order_id } },
      });

      if (dbOrder) {
        await updateOrder(dbOrder.id, {
          paymentDetails: {
            status: "failed",
            orderStatus: order.order_status,
            failureReason: data.payment?.payment_message,
          },
          status: "failed",
        });
        console.log(`Order ${order.order_id} payment failed via webhook`);
      }
    }

    return Response.json({ message: "Webhook processed successfully", type });
  } catch (error) {
    console.error("Cashfree webhook processing error:", error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
