import crypto from "crypto";
import { getSettings } from "@/lib/services/settingsService";
import { updateOrder } from "@/lib/services/orderService";
import prisma from "@/lib/prisma";

// Verify PhonePe webhook signature
function verifyPhonePeSignature(payload, signature, saltKey, saltIndex) {
  const saltKeyHash = crypto.createHash("sha256").update(saltKey).digest("hex");
  const checkString = payload + "/pg/v1/status/" + saltKeyHash;
  const expectedSignature =
    crypto.createHash("sha256").update(checkString).digest("hex") + "###" + saltIndex;
  return expectedSignature === signature;
}

// POST: Handle PhonePe webhook notifications
export async function POST(req) {
  try {
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.phonepe?.saltKey) {
      return Response.json({ error: "PhonePe salt key not configured" }, { status: 400 });
    }

    const body = await req.text();
    const webhookData = JSON.parse(body);
    const signature = req.headers.get("x-verify");

    if (signature) {
      const isValid = verifyPhonePeSignature(
        body,
        signature,
        paymentSettings.phonepe.saltKey,
        paymentSettings.phonepe.saltIndex || "1"
      );
      if (!isValid) {
        console.error("Invalid PhonePe webhook signature");
        return Response.json({ error: "Invalid signature" }, { status: 400 });
      }
    }

    const { response } = webhookData;

    if (response?.success === true) {
      const { data } = response;

      // Find order by PhonePe merchant transaction ID in paymentDetails JSONB
      const dbOrder = await prisma.order.findFirst({
        where: {
          paymentDetails: { path: ["phonepeMerchantTransactionId"], equals: data.merchantTransactionId },
        },
      });

      if (dbOrder) {
        await updateOrder(dbOrder.id, {
          paymentDetails: {
            status: "completed",
            paidAt: new Date(),
            phonepeTransactionId: data.transactionId,
            paymentMethod: data.paymentInstrument?.type,
            responseCode: data.responseCode,
          },
          status: "success",
        });
        console.log(`Order ${data.merchantTransactionId} payment successful via webhook`);
      }
    } else if (response?.success === false) {
      const { data } = response;

      const dbOrder = await prisma.order.findFirst({
        where: {
          paymentDetails: { path: ["phonepeMerchantTransactionId"], equals: data.merchantTransactionId },
        },
      });

      if (dbOrder) {
        await updateOrder(dbOrder.id, {
          paymentDetails: {
            status: "failed",
            failureReason: data.responseCodeDescription || "Payment failed",
            responseCode: data.responseCode,
          },
          status: "failed",
        });
        console.log(`Order ${data.merchantTransactionId} payment failed via webhook`);
      }
    }

    return Response.json({ message: "Webhook processed successfully", success: response?.success });
  } catch (error) {
    console.error("PhonePe webhook processing error:", error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
