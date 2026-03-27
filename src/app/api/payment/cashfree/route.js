import crypto from "crypto";
import { getSettings } from "@/lib/services/settingsService";
import { updateOrder } from "@/lib/services/orderService";

// Generate Cashfree signature for API requests
function generateCashfreeSignature(postData, timestamp, appId, secretKey) {
  const signatureData = `${postData}${timestamp}`;
  return crypto.createHmac("sha256", secretKey).update(signatureData).digest("base64");
}

// Generate a valid customer_id from email (alphanumeric with underscores/hyphens)
function generateCustomerId(email) {
  if (!email) {
    return `customer_${Date.now()}`;
  }
  return email
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 50);
}

// POST: Create Cashfree order using Payment Gateway API
export async function POST(req) {
  try {
    const { amount, currency, orderData } = await req.json();

    if (!amount || !orderData) {
      return Response.json({ error: "Amount and order data are required" }, { status: 400 });
    }

    // Fetch payment settings from Prisma
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.cashfree?.enabled) {
      return Response.json({ error: "Cashfree is not enabled" }, { status: 400 });
    }

    if (!paymentSettings.cashfree.appId || !paymentSettings.cashfree.secretKey) {
      return Response.json({ error: "Cashfree credentials not configured" }, { status: 400 });
    }

    // Cashfree API URLs - Latest v5 (2025-01-01)
    const baseUrl =
      paymentSettings.cashfree.mode === "production"
        ? "https://api.cashfree.com/pg"
        : "https://sandbox.cashfree.com/pg";

    const orderId = `order_${Date.now()}`;

    const cashfreeOrderPayload = {
      order_id: orderId,
      order_amount: amount,
      order_currency: currency || "INR",
      customer_details: {
        customer_id: orderData.customerId || generateCustomerId(orderData.email),
        customer_name: orderData.name,
        customer_email: orderData.customerEmail || orderData.email,
        customer_phone: orderData.phone || "9999999999",
      },
      order_meta: {
        return_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/checkout/success?gateway=cashfree&order_id=${orderId}`,
        notify_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/payment/cashfree/webhook`,
      },
    };

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const postData = JSON.stringify(cashfreeOrderPayload);
    const cfSignature = generateCashfreeSignature(
      postData,
      timestamp,
      paymentSettings.cashfree.appId,
      paymentSettings.cashfree.secretKey
    );

    const response = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "2025-01-01",
        "x-client-id": paymentSettings.cashfree.appId,
        "x-client-secret": paymentSettings.cashfree.secretKey,
        "x-request-id": `req_${Date.now()}`,
        "x-cf-signature": cfSignature,
        "x-timestamp": timestamp,
      },
      body: postData,
    });

    const cashfreeResponse = await response.json();

    if (response.ok && cashfreeResponse.order_status === "ACTIVE") {
      // Return Cashfree payment details without creating duplicate order.
      // The order will be updated by orderCreate component after payment success.
      return Response.json({
        success: true,
        orderId: orderId,
        cfOrderId: cashfreeResponse.cf_order_id,
        paymentSessionId: cashfreeResponse.payment_session_id,
        orderToken: cashfreeResponse.order_token,
        amount: amount,
        currency: currency || "INR",
        cashfreeOrderId: orderId,
        cashfreeTransactionId: cashfreeResponse.cf_order_id,
        checkoutUrl: `${baseUrl}/checkout/hosted?order_token=${cashfreeResponse.order_token}`,
      });
    } else {
      console.error("Cashfree order creation failed:", cashfreeResponse);
      return Response.json(
        { error: cashfreeResponse.message || "Failed to create Cashfree order" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Cashfree order creation error:", error);
    return Response.json({ error: "Failed to create Cashfree order" }, { status: 500 });
  }
}

// PUT: Verify Cashfree payment using Payment Gateway API
export async function PUT(req) {
  try {
    const { orderId, dbOrderId } = await req.json();

    if (!orderId || !dbOrderId) {
      return Response.json({ error: "Missing order verification data" }, { status: 400 });
    }

    // Fetch payment settings from Prisma
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.cashfree?.appId || !paymentSettings?.cashfree?.secretKey) {
      return Response.json({ error: "Cashfree credentials not configured" }, { status: 400 });
    }

    const baseUrl =
      paymentSettings.cashfree.mode === "production"
        ? "https://api.cashfree.com/pg"
        : "https://sandbox.cashfree.com/pg";

    // Get order status from Cashfree
    const response = await fetch(`${baseUrl}/orders/${orderId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "2025-01-01",
        "x-client-id": paymentSettings.cashfree.appId,
        "x-client-secret": paymentSettings.cashfree.secretKey,
        "x-request-id": `req_${Date.now()}`,
      },
    });

    const orderStatus = await response.json();

    if (response.ok && orderStatus.order_status === "PAID") {
      // Get payment details
      const paymentsResponse = await fetch(`${baseUrl}/orders/${orderId}/payments`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-version": "2025-01-01",
          "x-client-id": paymentSettings.cashfree.appId,
          "x-client-secret": paymentSettings.cashfree.secretKey,
          "x-request-id": `req_${Date.now()}`,
        },
      });

      const paymentsData = await paymentsResponse.json();
      const payment = paymentsData[0];

      // Update order in Prisma
      const updatedOrder = await updateOrder(dbOrderId, {
        paymentDetails: {
          cfTransactionId: payment?.cf_payment_id,
          status: "completed",
          paidAt: new Date(),
          orderStatus: orderStatus.order_status,
          paymentMethod: payment?.payment_method,
          bankReference: payment?.bank_reference,
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
      return Response.json(
        { error: `Payment not completed. Status: ${orderStatus.order_status}` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Cashfree payment verification error:", error);
    return Response.json({ error: "Failed to verify payment" }, { status: 500 });
  }
}
