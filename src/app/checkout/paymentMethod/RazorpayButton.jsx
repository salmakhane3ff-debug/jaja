"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { CreditCard, Loader2 } from "lucide-react";

export default function RazorpayButton({ amount, currency, orderData, onSuccess, onError }) {
  const [loading, setLoading] = useState(false);

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async () => {
    setLoading(true);

    try {
      // Load Razorpay script
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error("Failed to load Razorpay script");
      }

      // Create order on backend
      const orderResponse = await fetch("/api/payment/razorpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency, orderData }),
      });

      const orderResult = await orderResponse.json();

      if (!orderResult.success) {
        throw new Error(orderResult.error || "Failed to create order");
      }

      // Configure Razorpay options
      const options = {
        key: orderResult.keyId,
        amount: orderResult.amount,
        currency: orderResult.currency,
        name: "Shop Gold",
        description: "Shop Gold Purchase",
        order_id: orderResult.orderId,
        handler: async (response) => {
          console.log("Razorpay payment successful, calling onSuccess with payment details");
          
          // Call success handler with payment details directly
          // The orderCreate component will handle order creation/update
          onSuccess && onSuccess({
            paymentDetails: {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              amount: orderResult.amount / 100, // Convert from paise to rupees
              currency: orderResult.currency,
              status: "completed",
            }
          });
        },
        prefill: {
          name: orderData.name,
          email: orderData.email,
          contact: orderData.phone,
        },
        notes: {
          address: orderData.address || "",
        },
        theme: {
          color: "#3B82F6",
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
            onError && onError("Payment cancelled by user");
          },
        },
      };

      // Open Razorpay checkout
      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch (error) {
      console.error("Razorpay payment error:", error);
      onError && onError(error.message);
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePayment}
      disabled={loading}
      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors"
      startContent={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
    >
      {loading ? "Processing..." : `Pay ₹${amount} with Razorpay`}
    </Button>
  );
}