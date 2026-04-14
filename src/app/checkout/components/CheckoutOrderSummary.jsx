"use client";
import { useState, useEffect } from "react";
import ProductData from "./Product";
import StripeCardForm from "../paymentMethod/StripeCardForm";
import PayPalButton from "../paymentMethod/PayPalButton";
import { useLanguage } from "@/context/LanguageContext";
import orderCreate from "./orderCreate";
import { usePaymentSettings } from "../PaymentContext";
import { getAvailablePaymentGateways, gatewayInfo } from "@/utils/paymentValidation";

export default function CheckoutOrderSummary({ billingDetails, setErrors }) {
  const { items: products, loading } = ProductData();
  const { formatPrice, t } = useLanguage();
  const [storeSettings, setStoreSettings] = useState(null);
  const [availableGateways, setAvailableGateways] = useState([]);
  const paymentSettings = usePaymentSettings();

  // Early return if billingDetails is not available
  if (!billingDetails) {
    return (
      <div className="w-full rounded-2xl p-6 lg:p-8 border border-indigo-100 bg-white shadow-sm h-min">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t("checkout_loading")}</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/setting?type=store", {});
        const data = await res.json();
        setStoreSettings(data);
      } catch (err) {
        console.error("Failed to fetch store settings:", err);
      }
    };
    fetchSettings();
  }, []);

  // Update available gateways when payment settings change
  useEffect(() => {
    if (paymentSettings) {
      const available = getAvailablePaymentGateways(paymentSettings);
      setAvailableGateways(available);
    }
  }, [paymentSettings]);

  const storeCurrency = "MAD";

  const getDiscountDetails = () => {
    let totalMRP = 0;
    let discountOnMRP = 0;
    
    // Calculate MRP and discount using product data (skip free gifts)
    products.forEach(item => {
      if (item.isFreeGift) return;
      const itemMRP = item.regularPrice || item.salePrice || 0;
      const itemPrice = item.salePrice || item.regularPrice || 0;

      totalMRP += itemMRP * item.quantity;
      discountOnMRP += (itemMRP - itemPrice) * item.quantity;
    });

    // ✅ Buy 2 Get 1 Free logic - Discount lowest priced items (global calculation)
    let buy2Get1Discount = 0;
    const totalQuantity = products.reduce((total, item) => total + item.quantity, 0);
    const freeItemsCount = Math.floor(totalQuantity / 3) || 0; // Total free items across all products

    if (freeItemsCount > 0) {
      // Create array of all individual items with their prices (expanded by quantity)
      const allItems = [];
      products.forEach(item => {
        const itemPrice = Number(item.salePrice || item.regularPrice) || 0;
        for (let i = 0; i < item.quantity; i++) {
          allItems.push({
            productId: item._id,
            title: item.title,
            price: itemPrice
          });
        }
      });

      // Sort by price (ascending) to get cheapest items first
      allItems.sort((a, b) => (a.price || 0) - (b.price || 0));

      // Apply discount to the cheapest items
      for (let i = 0; i < freeItemsCount && i < allItems.length; i++) {
        buy2Get1Discount += Number(allItems[i].price) || 0;
      }
    }

    const subtotal = products.reduce((acc, p) => acc + Number(p.salePrice || p.regularPrice) * p.quantity, 0);
    const totalAmount = subtotal - buy2Get1Discount;

    return { totalMRP, discountOnMRP, buy2Get1Discount, subtotal, totalAmount };
  };

  const { totalMRP, discountOnMRP, buy2Get1Discount, subtotal, totalAmount } = getDiscountDetails();

  const costDetails = {
    subtotal: subtotal,
    shipping: 0,
    tax: 0,
    get total() {
      return totalAmount + this.shipping + this.tax;
    },
  };

  // Common order data for all payment gateways
  const orderDataForPayment = {
    name: `${billingDetails?.customer?.fullName || ''}`,
    email: billingDetails?.customer?.email || '',
    phone: billingDetails?.customer?.phone || '',
    address: `${billingDetails?.address?.address1 || ''}, ${billingDetails?.address?.city || ''}, ${billingDetails?.address?.state || ''} ${billingDetails?.address?.zip || ''}`,
    company: billingDetails?.customer?.company || '',
    country: billingDetails?.address?.country || '',
    notes: billingDetails?.notes || '',
  };

  // Common success handler for payment gateways
  const handlePaymentSuccess = async (paymentDetails, paymentMethod) => {
    const orderResponse = await orderCreate({
      products,
      billingDetails,
      paymentDetails: {
        paymentMethod: paymentMethod,
        total: costDetails.total,
        currencySymbol: "MAD",
        status: "paid",
        ...paymentDetails,
      },
    });

    if (orderResponse && orderResponse.success && orderResponse.orderId) {
      // Store order details for success page
      localStorage.setItem("lastOrderId", orderResponse.orderId);
      localStorage.setItem("lastSessionId", orderResponse.sessionId || orderResponse.orderId);
      
      // Clear cart items after successful payment
      localStorage.removeItem("buyNow");
      localStorage.removeItem("cart");
      
      // Create URL with order details as search parameters
      const successUrl = new URL('/checkout/success', window.location.origin);
      successUrl.searchParams.set('sessionId', orderResponse.sessionId || orderResponse.orderId);
      successUrl.searchParams.set('orderId', orderResponse.orderId);
      
      // Add payment-specific identifiers if available
      if (paymentDetails.paymentIntentId) {
        successUrl.searchParams.set('payment_intent', paymentDetails.paymentIntentId);
      }
      if (paymentDetails.razorpayOrderId) {
        successUrl.searchParams.set('razorpay_order_id', paymentDetails.razorpayOrderId);
      }
      if (paymentDetails.paypalOrderId) {
        successUrl.searchParams.set('paypal_order_id', paymentDetails.paypalOrderId);
      }
      if (paymentDetails.cashfreeOrderId) {
        successUrl.searchParams.set('cashfree_order_id', paymentDetails.cashfreeOrderId);
      }
      
      console.log('Redirecting to success page with URL:', successUrl.toString());
      window.location.href = successUrl.toString();
    } else {
      console.error('Order creation failed:', orderResponse);
      setErrors("Failed to create order after payment.");
      window.location.href = "/checkout/failure";
    }
  };

  // Common error handler
  const handlePaymentError = async (error) => {
    console.error("Payment error:", error);
    
    // Update pending order status to failed
    const pendingOrderId = localStorage.getItem("pendingOrderId");
    if (pendingOrderId) {
      try {
        await fetch("/api/order", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            _id: pendingOrderId,
            paymentDetails: {
              paymentMethod: "failed",
              total: costDetails.total,
              status: "failed",
              paymentStatus: "failed",
              error: error.message || "Payment failed",
            },
            status: "failed",
          }),
        });
      } catch (updateError) {
        console.error("Failed to update order status:", updateError);
      }
    }
    
    setErrors(error);
    window.location.href = "/checkout/failure";
  };

  // Count enabled and properly configured payment methods
  const enabledMethods = availableGateways.length;
  const activePaymentGateway = availableGateways.length > 0 ? availableGateways[0] : null;

  return (
    <div className="w-full rounded-2xl p-6 lg:p-8 border border-indigo-100 bg-white shadow-sm h-min">
      <h3 className="text-xl font-semibold mb-6 text-indigo-900">{t("checkout_order_summary")}</h3>

      {/* Product Summary */}
      <div className="border-b pb-4 text-sm text-gray-700 space-y-4">
        <div className="flex justify-between font-medium text-gray-900">
          <span>{t("product_details")}</span>
          <span>{t("cart_subtotal").replace("{count}", "")}</span>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">{t("checkout_loading")}</p>
        ) : products.length === 0 ? (
          <p className="text-gray-500 text-sm">{t("cart_empty")}</p>
        ) : (
          products.map((item) => (
            <div key={item._id} className="flex justify-between items-start gap-4">
              <div className="flex gap-3 items-start">
                <img src={item.image} alt={item.title} className="w-16 rounded-md" />
                <div>
                  <p className="font-medium text-gray-900">{item.title}</p>
                  {item.isFreeGift && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-[#6e57b2] px-2 py-0.5 rounded-full mt-0.5">
                      🎁 + 1 article GRATUIT
                    </span>
                  )}
                  <p className="text-xs text-gray-500">{t("product_quantity")}: {item.quantity}</p>
                  {item.color && <p className="text-xs text-gray-500">{t("product_color")}: {item.color}</p>}
                  {item.size && <p className="text-xs text-gray-500">{t("product_size")}: {item.size}</p>}
                </div>
              </div>
              <div className="text-right font-medium">
                {item.isFreeGift
                  ? <span className="text-[#6e57b2] font-black text-sm">GRATUIT</span>
                  : <span className="text-gray-900">{formatPrice((item.salePrice || item.regularPrice) * item.quantity)}</span>
                }
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cost Summary */}
      <div className="py-4 border-b text-sm text-gray-700 space-y-2">
        <div className="flex justify-between">
          <span>{t("cart_total_mrp")}</span>
          <span>{formatPrice(totalMRP.toFixed(0))}</span>
        </div>
        {discountOnMRP > 0 && (
          <div className="flex justify-between text-green-600">
            <span>{t("cart_discount_mrp")}</span>
            <span>-{formatPrice(discountOnMRP.toFixed(0))}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>{t("checkout_subtotal")}</span>
          <span>{formatPrice((totalMRP - discountOnMRP).toFixed(0))}</span>
        </div>
        {buy2Get1Discount > 0 && (
          <div className="flex justify-between text-blue-600">
            <span>{t("cart_coupon_applied")}</span>
            <span>-{formatPrice(buy2Get1Discount.toFixed(0))}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>{t("checkout_shipping")}</span>
          <span>{formatPrice(costDetails.shipping.toFixed(0))}</span>
        </div>
        <div className="flex justify-between font-bold text-gray-900 text-base">
          <span>{t("cart_total")}</span>
          <span>{formatPrice(costDetails.total.toFixed(0))}</span>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <h1 className="text-sm font-semibold">{t("checkout_payment_method")}</h1>

        {/* Direct Payment Method - No Tabs */}
        {activePaymentGateway && (
          <div className="space-y-4">
            {/* Show payment method name */}
            <div className="text-sm text-gray-600 mb-3">
              {t("checkout_pay_with")} {gatewayInfo[activePaymentGateway]?.name}
            </div>

            {/* Stripe */}
            {activePaymentGateway === "stripe" && (
              <StripeCardForm
                billingDetails={billingDetails}
                setErrors={setErrors}
                amount={costDetails.total}
                currency={storeCurrency}
                currencySymbol={"MAD"}
                onSuccess={async (paymentIntent) => {
                  await handlePaymentSuccess(
                    {
                      paymentIntentId: paymentIntent?.id,
                      paymentStatus: paymentIntent?.status,
                    },
                    "stripe"
                  );
                }}
                onError={handlePaymentError}
              />
            )}

            {/* PayPal */}
            {activePaymentGateway === "paypal" && (
              <PayPalButton
                amount={costDetails.total}
                currency={storeCurrency}
                onSuccess={async (details) => {
                  await handlePaymentSuccess(
                    {
                      paypalOrderId: details.id,
                      paypalStatus: details.status,
                    },
                    "paypal"
                  );
                }}
                onError={handlePaymentError}
              />
            )}

          </div>
        )}

        {/* No payment gateway configured message */}
        {!activePaymentGateway && (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <p className="text-gray-600 text-sm">{t("checkout_no_payment_methods")}</p>
            <p className="text-gray-500 text-xs mt-1">{t("checkout_configure_payment")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
