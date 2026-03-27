import crypto from "crypto";
import { getSettings } from "@/lib/services/settingsService";
import { updateOrder } from "@/lib/services/orderService";
import prisma from "@/lib/prisma";

// Verify Paytm webhook signature
function verifyPaytmSignature(payload, signature, merchantKey) {
  const expectedSignature = crypto.createHmac("sha256", merchantKey).update(payload).digest("hex");
  return expectedSignature === signature;
}

// POST: Handle Paytm webhook notifications
export async function POST(req) {
  try {
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.paytm?.merchantKey) {
      return Response.json({ error: "Paytm merchant key not configured" }, { status: 400 });
    }

    const body = await req.text();
    const webhookData = JSON.parse(body);
    const signature = req.headers.get("x-paytm-signature");

    if (signature) {
      const isValid = verifyPaytmSignature(body, signature, paymentSettings.paytm.merchantKey);
      if (!isValid) {
        console.error("Invalid Paytm webhook signature");
        return Response.json({ error: "Invalid signature" }, { status: 400 });
      }
    }

    const { ORDERID, TXNID, STATUS, RESPCODE, RESPMSG, PAYMENTMODE, BANKTXNID } = webhookData;

    if (STATUS === "TXN_SUCCESS") {
      // Find order by Paytm order ID stored in paymentDetails JSONB
      const dbOrder = await prisma.order.findFirst({
        where: { paymentDetails: { path: ["paytmOrderId"], equals: ORDERID } },
      });

      if (dbOrder) {
        await updateOrder(dbOrder.id, {
          paymentDetails: {
            status: "completed",
            paidAt: new Date(),
            paytmTxnId: TXNID,
            paymentMethod: PAYMENTMODE,
            bankReference: BANKTXNID,
            responseCode: RESPCODE,
            responseMessage: RESPMSG,
          },
          status: "success",
        });
        console.log(`Order ${ORDERID} payment successful via webhook`);
      }
    } else if (STATUS === "TXN_FAILURE") {
      const dbOrder = await prisma.order.findFirst({
        where: { paymentDetails: { path: ["paytmOrderId"], equals: ORDERID } },
      });

      if (dbOrder) {
        await updateOrder(dbOrder.id, {
          paymentDetails: {
            status: "failed",
            failureReason: RESPMSG || "Payment failed",
            responseCode: RESPCODE,
            responseMessage: RESPMSG,
          },
          status: "failed",
        });
        console.log(`Order ${ORDERID} payment failed via webhook`);
      }
    }

    return Response.json({ message: "Webhook processed successfully", status: STATUS });
  } catch (error) {
    console.error("Paytm webhook processing error:", error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
