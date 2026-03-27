import crypto from "crypto";
import { getSettings } from "@/lib/services/settingsService";
import { updateOrder } from "@/lib/services/orderService";

// POST: Create Paytm order
export async function POST(req) {
  try {
    const { amount, currency, orderData } = await req.json();

    if (!amount || !orderData) {
      return Response.json({ error: "Amount and order data are required" }, { status: 400 });
    }

    // Fetch payment settings from Prisma
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.paytm?.enabled) {
      return Response.json({ error: "Paytm is not enabled" }, { status: 400 });
    }

    if (!paymentSettings.paytm.merchantId || !paymentSettings.paytm.merchantKey) {
      return Response.json({ error: "Paytm credentials not configured" }, { status: 400 });
    }

    const orderId = `ORDER_${Date.now()}`;

    // Paytm API URL
    const paytmUrl =
      paymentSettings.paytm.mode === "production"
        ? "https://securegw.paytm.in/theia/api/v1/initiateTransaction"
        : "https://securegw-stage.paytm.in/theia/api/v1/initiateTransaction";

    const requestBody = {
      body: {
        requestType: "Payment",
        mid: paymentSettings.paytm.merchantId,
        websiteName: paymentSettings.paytm.website || "WEBSTAGING",
        orderId: orderId,
        txnAmount: {
          value: amount.toString(),
          currency: currency || "INR",
        },
        userInfo: {
          custId: orderData.email || `customer_${Date.now()}`,
          email: orderData.email,
          firstName: orderData.name.split(" ")[0] || "Customer",
          lastName: orderData.name.split(" ").slice(1).join(" ") || "",
          mobile: orderData.phone || "",
        },
        callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/payment/paytm/callback`,
      },
    };

    // Generate checksum
    const bodyString = JSON.stringify(requestBody.body);
    const checksum = crypto
      .createHash("sha256")
      .update(bodyString + paymentSettings.paytm.merchantKey)
      .digest("hex");

    const response = await fetch(paytmUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...requestBody,
        head: { signature: checksum },
      }),
    });

    const paytmResponse = await response.json();

    if (paytmResponse.body.resultInfo.resultStatus === "S") {
      const paytmFormUrl =
        paymentSettings.paytm.mode === "production"
          ? "https://securegw.paytm.in/theia/api/v1/showPaymentPage"
          : "https://securegw-stage.paytm.in/theia/api/v1/showPaymentPage";

      // Return Paytm payment details without creating duplicate order.
      // The order will be updated by orderCreate component after payment success.
      return Response.json({
        success: true,
        paytmUrl: paytmFormUrl,
        orderId: orderId,
        txnToken: paytmResponse.body.txnToken,
        amount: amount,
        mid: paymentSettings.paytm.merchantId,
      });
    } else {
      return Response.json({ error: "Failed to create Paytm payment" }, { status: 400 });
    }
  } catch (error) {
    console.error("Paytm order creation error:", error);
    return Response.json({ error: "Failed to create Paytm order" }, { status: 500 });
  }
}

// PUT: Verify Paytm payment
export async function PUT(req) {
  try {
    const { orderId, dbOrderId } = await req.json();

    if (!orderId || !dbOrderId) {
      return Response.json({ error: "Missing payment verification data" }, { status: 400 });
    }

    // Fetch payment settings from Prisma
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.paytm?.merchantId || !paymentSettings?.paytm?.merchantKey) {
      return Response.json({ error: "Paytm credentials not configured" }, { status: 400 });
    }

    // Paytm status check URL
    const statusUrl =
      paymentSettings.paytm.mode === "production"
        ? "https://securegw.paytm.in/v3/order/status"
        : "https://securegw-stage.paytm.in/v3/order/status";

    const statusRequestBody = {
      body: {
        mid: paymentSettings.paytm.merchantId,
        orderId: orderId,
      },
    };

    const statusBodyString = JSON.stringify(statusRequestBody.body);
    const statusChecksum = crypto
      .createHash("sha256")
      .update(statusBodyString + paymentSettings.paytm.merchantKey)
      .digest("hex");

    const statusResponse = await fetch(statusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...statusRequestBody,
        head: { signature: statusChecksum },
      }),
    });

    const statusData = await statusResponse.json();

    if (statusData.body.resultInfo.resultStatus === "TXN_SUCCESS") {
      // Update order in Prisma
      const updatedOrder = await updateOrder(dbOrderId, {
        paymentDetails: {
          paytmTxnId: statusData.body.txnId,
          status: "completed",
          paidAt: new Date(),
          paytmStatus: statusData.body.resultInfo.resultStatus,
          gatewayName: statusData.body.gatewayName,
        },
        status: "success",
      });

      if (!updatedOrder) {
        return Response.json({ error: "Order not found" }, { status: 404 });
      }

      return Response.json({
        success: true,
        message: "Payment verified successfully",
        order: updatedOrder,
      });
    } else {
      return Response.json({ error: "Payment not completed" }, { status: 400 });
    }
  } catch (error) {
    console.error("Paytm payment verification error:", error);
    return Response.json({ error: "Failed to verify payment" }, { status: 500 });
  }
}
