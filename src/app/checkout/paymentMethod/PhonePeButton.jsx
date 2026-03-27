"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { Smartphone, Loader2 } from "lucide-react";

export default function PhonePeButton({ amount, currency, orderData, onSuccess, onError }) {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);

    try {
      // Create order on backend
      const orderResponse = await fetch("/api/payment/phonepe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency, orderData }),
      });

      const orderResult = await orderResponse.json();

      if (!orderResult.success) {
        throw new Error(orderResult.error || "Failed to create order");
      }

      // Redirect to PhonePe payment page
      window.location.href = orderResult.redirectUrl;

      // Note: PhonePe will redirect back to success/failure pages
      // The actual success/error handling will happen on those pages

    } catch (error) {
      console.error("PhonePe payment error:", error);
      onError && onError(error.message);
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePayment}
      disabled={loading}
      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 rounded-lg transition-colors"
      startContent={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
    >
      {loading ? "Redirecting..." : `Pay ₹${amount} with PhonePe`}
    </Button>
  );
}