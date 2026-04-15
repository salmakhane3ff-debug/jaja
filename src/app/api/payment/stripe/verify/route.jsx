// app/api/payment/stripe/verify/route.js
import Stripe from "stripe";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }
    const stripe = new Stripe(key, { apiVersion: "2023-08-16" });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return NextResponse.json({
      id: session.id,
      payment_status: session.payment_status,
      customer_email: session.customer_email,
      amount_total: session.amount_total,
      currency: session.currency,
      payment_intent: session.payment_intent,
      metadata: session.metadata,
    });
  } catch (error) {
    console.error("Stripe Verification Error:", error.message);
    return NextResponse.json({ error: "Failed to verify session", details: error.message }, { status: 500 });
  }
}
