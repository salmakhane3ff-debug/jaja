import crypto from "crypto";
import { getSettings } from "@/lib/services/settingsService";
import { updateOrder } from "@/lib/services/orderService";
import prisma from "@/lib/prisma";

// Verify PayU webhook hash
function verifyPayUSignature(payload, hash, salt) {
  const expectedHash = crypto.createHash("sha512").update(payload + salt).digest("hex");
  return expectedHash === hash;
}

// POST: Handle PayU webhook notifications
export async function POST(req) {
  try {
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.payu?.salt) {
      return Response.json({ error: "PayU salt not configured" }, { status: 400 });
    }

    // PayU sends form-encoded data
    const formData = await req.formData();
    const webhookData = {};
    for (const [key, value] of formData.entries()) {
      webhookData[key] = value;
    }

    if (webhookData.hash) {
      const payloadString = `${webhookData.key}|${webhookData.txnid}|${webhookData.amount}|${webhookData.productinfo}|${webhookData.firstname}|${webhookData.email}|||||||||||${webhookData.status}|${webhookData.udf1}|${webhookData.udf2}|${webhookData.udf3}|${webhookData.udf4}|${webhookData.udf5}|${webhookData.field6}|${webhookData.field7}|${webhookData.field8}|${webhookData.field9}|${webhookData.field10}|`;
      const isValid = verifyPayUSignature(payloadString, webhookData.hash, paymentSettings.payu.salt);
      if (!isValid) {
        console.error("Invalid PayU webhook signature");
        return Response.json({ error: "Invalid signature" }, { status: 400 });
      }
    }

    if (webhookData.status === "success") {
      // Find order by PayU transaction ID stored in paymentDetails JSONB
      const dbOrder = await prisma.order.findFirst({
        where: { paymentDetails: { path: ["payuTxnId"], equals: webhookData.txnid } },
      });

      if (dbOrder) {
        await updateOrder(dbOrder.id, {
          paymentDetails: {
            status: "completed",
            paidAt: new Date(),
            payuPaymentId: webhookData.mihpayid,
            paymentMethod: webhookData.mode,
            bankReference: webhookData.bank_ref_num,
          },
          status: "success",
        });
        console.log(`Order ${webhookData.txnid} payment successful via webhook`);
      }
    } else if (webhookData.status === "failure") {
      const dbOrder = await prisma.order.findFirst({
        where: { paymentDetails: { path: ["payuTxnId"], equals: webhookData.txnid } },
      });

      if (dbOrder) {
        await updateOrder(dbOrder.id, {
          paymentDetails: {
            status: "failed",
            failureReason: webhookData.error_Message || "Payment failed",
          },
          status: "failed",
        });
        console.log(`Order ${webhookData.txnid} payment failed via webhook`);
      }
    }

    return Response.json({ message: "Webhook processed successfully", status: webhookData.status });
  } catch (error) {
    console.error("PayU webhook processing error:", error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
