"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { CreditCard, Loader2 } from "lucide-react";

export default function CashfreeButton({ amount, currency, orderData, onSuccess, onError }) {
  const [loading, setLoading] = useState(false);

  // Generate a valid customer_id from email (alphanumeric with underscores/hyphens)
  const generateCustomerId = (email) => {
    if (!email) {
      return `customer_${Date.now()}`;
    }
    // Replace invalid characters with underscores and ensure it's alphanumeric
    return email
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 50); // Limit length
  };

  const loadCashfreeCheckout = () => {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.Cashfree) {
        resolve(true);
        return;
      }

      // Remove any existing script to avoid conflicts
      const existingScript = document.querySelector('script[src*="cashfree"]');
      if (existingScript) {
        existingScript.remove();
      }

      const loadScript = (src) => {
        return new Promise((resolveScript, rejectScript) => {
          const script = document.createElement("script");
          script.src = src;
          script.async = true;
          script.defer = true;
          
          script.onload = () => {
            // Wait a bit for the script to initialize
            setTimeout(() => {
              if (window.Cashfree) {
                console.log("Cashfree SDK loaded successfully from:", src);
                resolveScript(true);
              } else {
                console.error("Cashfree object not found after script load");
                rejectScript(new Error("Cashfree SDK failed to initialize"));
              }
            }, 200);
          };
          
          script.onerror = (error) => {
            console.error("Failed to load Cashfree script from:", src, error);
            rejectScript(new Error(`Failed to load script from ${src}`));
          };
          
          document.head.appendChild(script);
        });
      };

      // Try multiple script URLs
      const scriptUrls = [
        "https://sdk.cashfree.com/js/v3/cashfree.js",
        "https://sdk.cashfree.com/js/ui/2.0.0/cashfree.sandbox.js",
        "https://sdk.cashfree.com/js/v3/checkout.js"
      ];

      // Try loading scripts one by one
      const tryNextScript = (index) => {
        if (index >= scriptUrls.length) {
          reject(new Error("Failed to load Cashfree checkout script from all sources"));
          return;
        }

        loadScript(scriptUrls[index])
          .then(() => {
            resolve(true);
          })
          .catch((error) => {
            console.warn(`Failed to load from ${scriptUrls[index]}, trying next...`);
            tryNextScript(index + 1);
          });
      };

      tryNextScript(0);
    });
  };

  const handlePayment = async () => {
    setLoading(true);

    try {
      // Load Cashfree Checkout script
      await loadCashfreeCheckout();

      // Prepare order data with valid customer_id
      const processedOrderData = {
        ...orderData,
        // Generate a valid customer_id if email is provided
        customerId: generateCustomerId(orderData.email || orderData.customerId),
        // Keep original email for other purposes
        customerEmail: orderData.email
      };

      // Create order on backend
      const orderResponse = await fetch("/api/payment/cashfree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency, orderData: processedOrderData }),
      });

      const orderResult = await orderResponse.json();

      if (!orderResult.success) {
        throw new Error(orderResult.error || "Failed to create order");
      }

      // Configure Cashfree Checkout with proper initialization
      if (!window.Cashfree) {
        throw new Error("Cashfree SDK not available");
      }

      // Initialize Cashfree
      const cashfree = window.Cashfree({
        mode: "sandbox", // Change to "production" for live
      });

      // Checkout options for the latest API
      const checkoutOptions = {
        paymentSessionId: orderResult.paymentSessionId,
        redirectTarget: "_modal", // Opens in modal
      };

      // Handle payment result with the latest Checkout.js
      cashfree.checkout(checkoutOptions).then(async (result) => {
        if (result.error) {
          console.error("Cashfree payment error:", result.error);
          onError && onError(result.error.message || "Payment failed");
          setLoading(false);
          return;
        }

        // Check if payment was successful
        if (result.redirect || result.paymentDetails) {
          console.log("Cashfree payment successful, calling onSuccess with payment details");
          
          // Call success handler with payment details directly
          // The orderCreate component will handle order creation/update
          onSuccess && onSuccess({
            paymentDetails: {
              orderId: orderResult.orderId,
              cfOrderId: orderResult.cfOrderId,
              cashfreeOrderId: orderResult.orderId,
              cashfreeTransactionId: orderResult.cfOrderId,
              amount: amount,
              currency: currency || "INR",
              status: "completed",
              paymentSessionId: orderResult.paymentSessionId,
            }
          });
        }

        setLoading(false);
      }).catch((error) => {
        console.error("Cashfree checkout error:", error);
        onError && onError(error.message || "Payment initialization failed");
        setLoading(false);
      });

    } catch (error) {
      console.error("Cashfree payment error:", error);
      onError && onError(error.message);
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePayment}
      disabled={loading}
      className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 rounded-lg transition-colors"
      startContent={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
    >
      {loading ? "Processing..." : `Pay ₹${amount} with Cashfree`}
    </Button>
  );
}