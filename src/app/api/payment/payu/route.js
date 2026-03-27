import crypto from "crypto";
import { getSettings } from "@/lib/services/settingsService";
import { updateOrder } from "@/lib/services/orderService";

function generateHash(data, salt) {
  return crypto.createHash("sha512").update(data + salt).digest("hex");
}

// POST: Create PayU order
export async function POST(req) {
  try {
    const { amount, orderData } = await req.json();

    if (!amount || !orderData) {
      return Response.json({ error: "Amount and order data are required" }, { status: 400 });
    }

    // Fetch payment settings from Prisma
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.payu?.enabled) {
      return Response.json({ error: "PayU is not enabled" }, { status: 400 });
    }

    if (!paymentSettings.payu.merchantId || !paymentSettings.payu.merchantKey || !paymentSettings.payu.merchantSalt) {
      return Response.json({ error: "PayU credentials not configured" }, { status: 400 });
    }

    const txnId = `TXN_${Date.now()}`;

    // Return PayU payment details without creating duplicate order.
    // The order will be updated by orderCreate component after payment success.
    const payuData = {
      key: paymentSettings.payu.merchantId,
      txnid: txnId,
      amount: amount.toString(),
      productinfo: "Shop Gold Purchase",
      firstname: orderData.name.split(" ")[0] || "Customer",
      email: orderData.email,
      phone: orderData.phone || "",
      surl: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/checkout/success?gateway=payu&txnid=${txnId}`,
      furl: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/checkout/failure?gateway=payu&txnid=${txnId}`,
      service_provider: "payu_paisa",
    };

    const hashString = `${payuData.key}|${payuData.txnid}|${payuData.amount}|${payuData.productinfo}|${payuData.firstname}|${payuData.email}|||||||||||${paymentSettings.payu.merchantSalt}`;
    const hash = generateHash(hashString, "");

    const payuUrl =
      paymentSettings.payu.mode === "live"
        ? "https://secure.payu.in/_payment"
        : "https://test.payu.in/_payment";

    return Response.json({
      success: true,
      payuUrl: payuUrl,
      payuData: {
        ...payuData,
        hash: hash,
      },
      payuTransactionId: txnId,
      txnId: txnId,
    });
  } catch (error) {
    console.error("PayU order creation error:", error);
    return Response.json({ error: "Failed to create PayU order" }, { status: 500 });
  }
}

// PUT: Verify PayU payment
export async function PUT(req) {
  try {
    const { txnid, status, payuMoneyId, dbOrderId } = await req.json();

    if (!txnid || !dbOrderId) {
      return Response.json({ error: "Missing payment verification data" }, { status: 400 });
    }

    // Fetch payment settings from Prisma
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.payu?.merchantSalt) {
      return Response.json({ error: "PayU merchant salt not configured" }, { status: 400 });
    }

    // Update order in Prisma
    const updatedOrder = await updateOrder(dbOrderId, {
      paymentDetails: {
        payuMoneyId: payuMoneyId,
        payuStatus: status,
        status: status === "success" ? "completed" : "failed",
        ...(status === "success" ? { paidAt: new Date() } : {}),
        updatedAt: new Date(),
      },
      status: status === "success" ? "success" : "failed",
    });

    if (!updatedOrder) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    return Response.json({
      success: status === "success",
      message: status === "success" ? "Payment completed successfully" : "Payment failed",
      order: updatedOrder,
      status: status,
    });
  } catch (error) {
    console.error("PayU payment verification error:", error);
    return Response.json({ error: "Failed to verify payment" }, { status: 500 });
  }
}
