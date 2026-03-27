import Razorpay from "razorpay";
import crypto from "crypto";
import { getSettings } from "@/lib/services/settingsService";
import { updateOrder } from "@/lib/services/orderService";

// POST: Create Razorpay order
export async function POST(req) {
  try {
    const { amount, currency, orderData } = await req.json();

    if (!amount || !orderData) {
      return Response.json({ error: "Amount and order data are required" }, { status: 400 });
    }

    // Fetch payment settings from Prisma
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.razorpay?.enabled) {
      return Response.json({ error: "Razorpay is not enabled" }, { status: 400 });
    }

    if (!paymentSettings.razorpay.keyId || !paymentSettings.razorpay.keySecret) {
      return Response.json({ error: "Razorpay credentials not configured" }, { status: 400 });
    }

    // Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: paymentSettings.razorpay.keyId,
      key_secret: paymentSettings.razorpay.keySecret,
    });

    // Create Razorpay order
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: currency || "INR",
      receipt: `order_${Date.now()}`,
      payment_capture: 1,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Return Razorpay payment details without creating duplicate order.
    // The order will be updated by orderCreate component after payment success.
    return Response.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: paymentSettings.razorpay.keyId,
      razorpayOrderId: razorpayOrder.id,
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    return Response.json({ error: "Failed to create Razorpay order" }, { status: 500 });
  }
}

// PUT: Verify Razorpay payment
export async function PUT(req) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, dbOrderId } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !dbOrderId) {
      return Response.json({ error: "Missing payment verification data" }, { status: 400 });
    }

    // Fetch payment settings from Prisma
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings?.razorpay?.keySecret) {
      return Response.json({ error: "Razorpay secret key not configured" }, { status: 400 });
    }

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", paymentSettings.razorpay.keySecret)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return Response.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    // Update order in Prisma
    const updatedOrder = await updateOrder(dbOrderId, {
      paymentDetails: {
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        status: "completed",
        paidAt: new Date(),
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
  } catch (error) {
    console.error("Razorpay payment verification error:", error);
    return Response.json({ error: "Failed to verify payment" }, { status: 500 });
  }
}
