"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { CreditCard, Loader2 } from "lucide-react";

export default function PayUButton({ amount, currency, orderData, onSuccess, onError }) {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);

    try {
      // Create order on backend
      const orderResponse = await fetch("/api/payment/payu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency, orderData }),
      });

      const orderResult = await orderResponse.json();

      if (!orderResult.success) {
        throw new Error(orderResult.error || "Failed to create order");
      }

      // Create form and submit to PayU
      const form = document.createElement("form");
      form.method = "POST";
      form.action = orderResult.payuUrl;
      form.style.display = "none";

      // Add all PayU parameters as hidden inputs
      Object.keys(orderResult.payuData).forEach(key => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = orderResult.payuData[key];
        form.appendChild(input);
      });

      // Add dbOrderId for tracking
      const dbOrderIdInput = document.createElement("input");
      dbOrderIdInput.type = "hidden";
      dbOrderIdInput.name = "udf1";
      dbOrderIdInput.value = orderResult.dbOrderId;
      form.appendChild(dbOrderIdInput);

      document.body.appendChild(form);
      form.submit();

      // Note: PayU will redirect to success/failure pages
      // The actual success/error handling will happen on those pages

    } catch (error) {
      console.error("PayU payment error:", error);
      onError && onError(error.message);
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePayment}
      disabled={loading}
      className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg transition-colors"
      startContent={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
    >
      {loading ? "Redirecting..." : `Pay ₹${amount} with PayU`}
    </Button>
  );
}