"use client";
import { PayPalButtons } from "@paypal/react-paypal-js";

export default function PayPalButton({ amount, currency, onSuccess, onError }) {
  const createOrder = (data, actions) => {
    return actions.order.create({
      purchase_units: [
        {
          amount: {
            value: amount.toFixed(2),
            currency_code: currency,
          },
        },
      ],
    });
  };

  const onApprove = async (data, actions) => {
    try {
      const details = await actions.order.capture();
      onSuccess(details);
    } catch (error) {
      console.error("PayPal capture error:", error);
      onError("Payment capture failed");
    }
  };

  const onErrorHandler = (err) => {
    console.error("PayPal error:", err);
    onError("PayPal payment failed");
  };

  return (
    <PayPalButtons
      createOrder={createOrder}
      onApprove={onApprove}
      onError={onErrorHandler}
      style={{
        layout: "vertical",
        color: "gold",
        shape: "rect",
        label: "paypal",
      }}
    />
  );
}
