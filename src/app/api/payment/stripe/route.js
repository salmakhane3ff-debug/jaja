import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getSettings } from "@/lib/services/settingsService";

export async function POST(request) {
  try {
    const { amount, currency, customer } = await request.json();

    if (!amount || !currency || !customer?.email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch payment settings from Prisma
    const paymentSettings = await getSettings("payment");

    if (!paymentSettings || !paymentSettings.stripe?.enabled || !paymentSettings.stripe?.secretKey) {
      return NextResponse.json(
        {
          error: "Stripe payment gateway not configured",
          debug: {
            settingsFound: !!paymentSettings,
            stripeEnabled: paymentSettings?.stripe?.enabled,
            secretKeyPresent: !!paymentSettings?.stripe?.secretKey,
          },
        },
        { status: 400 }
      );
    }

    // Initialize Stripe with admin-configured key
    const stripe = new Stripe(paymentSettings.stripe.secretKey, {
      apiVersion: "2023-08-16",
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      receipt_email: customer.email,
      metadata: {
        integration_check: "custom_card_payment",
      },
      payment_method_options: {
        card: {
          request_three_d_secure: "any",
        },
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Stripe Payment Intent Error:", error);
    return NextResponse.json(
      {
        error: "Failed to create payment intent",
        details: error.message,
        type: error.type,
        code: error.code,
      },
      { status: 500 }
    );
  }
}
