"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { Wallet, Loader2 } from "lucide-react";

export default function PaytmButton({ amount, currency, orderData, onSuccess, onError }) {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);

    try {
      // Create order on backend
      const orderResponse = await fetch("/api/payment/paytm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency, orderData }),
      });

      const orderResult = await orderResponse.json();

      if (!orderResult.success) {
        throw new Error(orderResult.error || "Failed to create order");
      }

      // Create form and submit to Paytm
      const form = document.createElement("form");
      form.method = "POST";
      form.action = orderResult.paytmUrl;
      form.style.display = "none";

      // Add Paytm parameters as hidden inputs
      const params = {
        MID: orderResult.mid,
        ORDER_ID: orderResult.orderId,
        TXN_AMOUNT: orderResult.amount.toString(),
        CUST_ID: orderData.email || `customer_${Date.now()}`,
        TXN_TOKEN: orderResult.txnToken,
      };

      Object.keys(params).forEach(key => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = params[key];
        form.appendChild(input);
      });

      // Add dbOrderId for tracking
      const dbOrderIdInput = document.createElement("input");
      dbOrderIdInput.type = "hidden";
      dbOrderIdInput.name = "DB_ORDER_ID";
      dbOrderIdInput.value = orderResult.dbOrderId;
      form.appendChild(dbOrderIdInput);

      document.body.appendChild(form);
      form.submit();

      // Note: Paytm will redirect to success/failure pages
      // The actual success/error handling will happen on those pages

    } catch (error) {
      console.error("Paytm payment error:", error);
      onError && onError(error.message);
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePayment}
      disabled={loading}
      className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 rounded-lg transition-colors"
      startContent={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
    >
      {loading ? "Redirecting..." : `Pay ₹${amount} with Paytm`}
    </Button>
  );
}