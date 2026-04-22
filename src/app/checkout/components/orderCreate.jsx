import { getStoredUtmSource } from '@/utils/utmTracking';

export default async function orderCreate({ products, paymentDetails, billingDetails, status = "success", extraData = {} }) {
  try {
    // Get utm_source for the order
    const utmSource = getStoredUtmSource();
    console.log('UTM source for order:', utmSource);
    
    // Check if there's a pending order to update
    const pendingOrderId = localStorage.getItem("pendingOrderId");
    console.log('Pending order ID from localStorage:', pendingOrderId);
    
    if (pendingOrderId) {
      // Update existing pending order with payment details
      const updatePayload = {
        _id: pendingOrderId,
        paymentDetails: {
          paymentMethod: paymentDetails.paymentMethod,
          total: paymentDetails.total,
          status: paymentDetails.status,
          paymentStatus: paymentDetails.status === "paid" ? "success" : "failed",
          paymentIntentId: paymentDetails.paymentIntentId || null,
          razorpayOrderId: paymentDetails.razorpayOrderId || null,
          paypalOrderId: paymentDetails.paypalOrderId || null,
          cashfreeOrderId: paymentDetails.cashfreeOrderId || null,
          cashfreeTransactionId: paymentDetails.cashfreeTransactionId || null,
          currencySymbol: paymentDetails.currencySymbol || null,
          ...paymentDetails, // include all payment details
        },
        status: paymentDetails.status === "paid" ? "success" : "failed",
        utm_source: utmSource,
        ...extraData,
      };

      const res = await fetch("/api/order", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatePayload),
      });

      if (res.ok) {
        const updatedOrder = await res.json();
        console.log('Pending order updated successfully:', updatedOrder._id);
        // Clear pending order ID
        localStorage.removeItem("pendingOrderId");

        // Mark abandoned cart as recovered (fire-and-forget)
        try {
          const addr = JSON.parse(localStorage.getItem("checkoutAddress") || "null");
          if (addr?.phone) {
            fetch("/api/abandoned-carts", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phone: addr.phone }),
              keepalive: true,
            }).catch(() => {});
          }
        } catch {}

        return {
          orderId: pendingOrderId,
          sessionId: updatedOrder.sessionId || updatedOrder._id,
          success: true
        };
      } else {
        const errorText = await res.text();
        console.error('Failed to update pending order:', res.status, errorText);
        throw new Error(`Failed to update pending order: ${res.status} ${errorText}`);
      }
    } else {
      // Fallback: Create new order if no pending order exists
      console.log('No pending order found, creating new order');
      console.log('Billing details:', billingDetails);
      console.log('Products:', products);
      
      const payload = {
        name: billingDetails?.customer?.fullName,
        email: billingDetails?.customer?.email || '',
        phone: billingDetails?.customer?.phone || '',
        shipping: {
          address: billingDetails?.address,
          name: billingDetails?.customer?.fullName,
          phone: billingDetails?.customer?.phone,
        },
        products: {
          items: products.map((item) => ({
            productId: item._id,
            title: item.title,
            quantity: item.quantity,
            price: item.salePrice || item.regularPrice,
            sellingPrice: item.salePrice || item.regularPrice,
            regularPrice: item.regularPrice,
            images: item.images,
            variants: item.variants || [],
          })),
        },
        paymentDetails: {
          paymentMethod: paymentDetails.paymentMethod,
          total: paymentDetails.total,
          status: paymentDetails.status,
          paymentStatus: paymentDetails.status === "paid" ? "success" : "failed",
          paymentIntentId: paymentDetails.paymentIntentId || null,
          razorpayOrderId: paymentDetails.razorpayOrderId || null,
          paypalOrderId: paymentDetails.paypalOrderId || null,
          cashfreeOrderId: paymentDetails.cashfreeOrderId || null,
          cashfreeTransactionId: paymentDetails.cashfreeTransactionId || null,
          currencySymbol: paymentDetails.currencySymbol || null,
          ...paymentDetails, // include all payment details
        },
        status: paymentDetails.status === "paid" ? "success" : "failed",
        utm_source: utmSource,
        sessionId: Date.now().toString() + Math.random().toString(36).substr(2, 9), // Generate unique session ID
        ...extraData, // optional metadata (storeId, userId, etc.)
      };

      const res = await fetch("/api/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      console.log('Order creation response status:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Order creation failed:', res.status, errorText);
        throw new Error(`Failed to create order: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      console.log('New order created successfully:', data._id);

      // Mark abandoned cart as recovered (fire-and-forget)
      try {
        const addr = JSON.parse(localStorage.getItem("checkoutAddress") || "null");
        if (addr?.phone) {
          fetch("/api/abandoned-carts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: addr.phone }),
            keepalive: true,
          }).catch(() => {});
        }
      } catch {}

      return {
        orderId: data._id,
        sessionId: data.sessionId || data._id,
        success: true
      };
    }
  } catch (error) {
    console.error("Order creation error:", error.message || error);
    return {
      orderId: null,
      sessionId: null,
      success: false,
      error: error.message || error
    };
  }
}
