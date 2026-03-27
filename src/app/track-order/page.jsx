"use client";

import { useState, useEffect } from "react";
import { Input, Button } from "@heroui/react";
import { Package, Search, CheckCircle, Truck, Clock, Home } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

export default function TrackOrderPage() {
  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState(null);
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderSettings, setOrderSettings] = useState({
    dispatchAfterHours: 12,
    inTransitAfterHours: 24,
    outForDeliveryAfterHours: 36,
    deliveredAfterHours: 48,
    autoUpdateStatus: true,
  });
  const { symbol: currencySymbol, currency } = useCurrency();

  // Fetch order settings on component mount
  useEffect(() => {
    fetchOrderSettings();
  }, []);

  const fetchOrderSettings = async () => {
    try {
      const res = await fetch("/api/order-settings");
      if (res.ok) {
        const data = await res.json();
        setOrderSettings({
          dispatchAfterHours: data.dispatchAfterHours || 12,
          inTransitAfterHours: data.inTransitAfterHours || 24,
          outForDeliveryAfterHours: data.outForDeliveryAfterHours || 36,
          deliveredAfterHours: data.deliveredAfterHours || 48,
          autoUpdateStatus: data.autoUpdateStatus !== false,
        });
      }
    } catch (error) {
      console.error("Failed to fetch order settings:", error);
      // Use default settings if fetch fails
    }
  };

  const handleTrack = async (e) => {
    e.preventDefault();
    setError("");
    setOrder(null);
    setAllOrders([]);

    if (!orderId && !phone) {
      setError("Please enter either Order ID or Phone Number");
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (orderId) params.append("orderId", orderId);
      if (phone) params.append("phone", phone);

      const res = await fetch(`/api/order?${params.toString()}`);
      const data = await res.json();

      console.log("API Response:", data);

      if (res.ok && Array.isArray(data) && data.length > 0) {
        let foundOrder = null;

        // Scenario 1: Both Order ID and Phone Number provided
        if (orderId && phone) {
          foundOrder = data.find((order) => (order.sessionId === orderId || order._id === orderId) && (order.phone === phone || order.shipping?.phone === phone));

          if (!foundOrder) {
            setError("No order found with the provided Order ID and Phone Number combination.");
            setLoading(false);
            return;
          }
        }
        // Scenario 2: Only Order ID provided
        else if (orderId && !phone) {
          foundOrder = data.find((order) => order.sessionId === orderId || order._id === orderId);

          if (!foundOrder) {
            setError("No order found with the provided Order ID.");
            setLoading(false);
            return;
          }
        }
        // Scenario 3: Only Phone Number provided
        else if (!orderId && phone) {
          // Filter all orders matching the phone number
          const phoneOrders = data.filter((order) => order.phone === phone || order.shipping?.phone === phone);

          if (phoneOrders.length === 0) {
            setError("No orders found for the provided Phone Number.");
            setLoading(false);
            return;
          }

          // Sort orders by creation date (newest first)
          const sortedOrders = phoneOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          // Set the most recent order as main order
          foundOrder = sortedOrders[0];

          // If multiple orders exist, store all for display
          if (sortedOrders.length > 1) {
            setAllOrders(sortedOrders);
            setError(`Found ${sortedOrders.length} orders for this phone number. Showing the most recent order below. You can click on any order to view its details.`);
          }
        }

        if (foundOrder) {
          setOrder(foundOrder);
          console.log("Found order:", foundOrder);
        }
      } else {
        if (orderId && phone) {
          setError("No order found with the provided Order ID and Phone Number combination.");
        } else if (orderId) {
          setError("Order not found. Please check your Order ID.");
        } else if (phone) {
          setError("No orders found for the provided Phone Number.");
        }
      }
    } catch (err) {
      console.error("Track order error:", err);
      setError("Failed to track order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getOrderStatus = (orderDate) => {
    if (!orderDate) return { status: "", message: "Order will be dispatch soon", statusIndex: 0 };

    const orderTime = new Date(orderDate).getTime();
    const currentTime = new Date().getTime();
    const hoursElapsed = (currentTime - orderTime) / (1000 * 60 * 60);

    // Use dynamic settings for status determination
    if (hoursElapsed < orderSettings.dispatchAfterHours) {
      return {
        status: "",
        message: "Order will be dispatch soon",
        statusIndex: 0,
      };
    } else if (hoursElapsed < orderSettings.inTransitAfterHours) {
      return {
        status: "dispatched",
        message: "Your order has been dispatched",
        statusIndex: 1,
      };
    } else if (hoursElapsed < orderSettings.outForDeliveryAfterHours) {
      return {
        status: "in-transit",
        message: "Your order is in transit",
        statusIndex: 2,
      };
    } else if (hoursElapsed < orderSettings.deliveredAfterHours) {
      return {
        status: "out-for-delivery",
        message: "Your order is out for delivery",
        statusIndex: 3,
      };
    } else {
      return {
        status: "delivered",
        message: "Your order has been delivered",
        statusIndex: 4,
      };
    }
  };

  const statusSteps = [
    { label: "Order Placed", icon: CheckCircle, status: "", message: "Order will be dispatch soon" },
    { label: "Dispatched", icon: Package, status: "dispatched", message: "Order has been dispatched from warehouse" },
    { label: "In Transit", icon: Truck, status: "in-transit", message: "Order is on the way to your location" },
    { label: "Out for Delivery", icon: Clock, status: "out-for-delivery", message: "Order is out for delivery" },
    { label: "Delivered", icon: Home, status: "delivered", message: "Order has been delivered successfully" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 md:px-20">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <Package className="w-16 h-16 mx-auto text-gray-800 mb-4" />
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Track Your Order</h1>
          <p className="text-gray-600">Enter your order ID or phone number to track your order status</p>
        </div>

        {/* Search Form */}
        {/* Search Form */}
        <form onSubmit={handleTrack} className="bg-white rounded-xl md:rounded-2xl p-4 md:p-6 lg:p-8 shadow-sm mb-6 md:mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-20 mb-4 md:mb-6 relative">
            <Input label="Order ID" placeholder="e.g., ORD123456" value={orderId} onChange={(e) => setOrderId(e.target.value)} labelPlacement="outside" size="md" className="text-sm md:text-base" />

            {/* OR Divider */}
            <div className="hidden md:flex absolute left-1/2 top-1/2 pt-4 transform -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="bg-white px-3 py-1 rounded-full border border-gray-300 text-sm font-medium text-gray-600 shadow-sm">OR</div>
            </div>

            {/* Mobile OR Divider */}
            <div className="md:hidden flex items-center justify-center my-2">
              <div className="flex-1 h-px bg-gray-300"></div>
              <div className="px-4 text-sm font-medium text-gray-600">OR</div>
              <div className="flex-1 h-px bg-gray-300"></div>
            </div>

            <Input
              label="Phone Number"
              type="tel"
              placeholder="e.g., +1234567890"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              labelPlacement="outside"
              size="md"
              className="text-sm md:text-base"
            />
          </div>

          <Button type="submit" size="lg" isLoading={loading} className="w-full bg-gray-900 text-white font-medium" startContent={!loading && <Search className="w-4 h-4" />}>
            {loading ? "Tracking..." : "Track Order"}
          </Button>

          {error && <p className={`mt-4 text-sm text-center ${error.includes("Found") && error.includes("orders") ? "text-blue-600" : "text-red-600"}`}>{error}</p>}
        </form>

        {/* Multiple Orders List (when searching by phone) */}
        {allOrders.length > 1 && (
          <div className="bg-white rounded-xl md:rounded-2xl p-4 md:p-6 lg:p-8 shadow-sm mb-6 md:mb-8">
            <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4 md:mb-6">All Orders for this Phone Number</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allOrders.map((orderItem, index) => (
                <div
                  key={orderItem._id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md ${
                    order && order._id === orderItem._id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setOrder(orderItem)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-sm md:text-base text-gray-900">Order #{orderItem.sessionId || orderItem._id?.slice(-8) || "N/A"}</p>
                      <p className="text-xs md:text-sm text-gray-600">{new Date(orderItem.createdAt).toLocaleDateString()}</p>
                      {/* Show phone number if available */}
                      {(orderItem.phone || orderItem.shipping?.phone) && <p className="text-xs text-gray-500">Phone: {orderItem.phone || orderItem.shipping?.phone}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm md:text-base text-gray-900">
                        {orderItem.paymentDetails?.currencySymbol || currencySymbol}
                        {orderItem.paymentDetails?.total || orderItem.amount || "0"}
                      </p>
                      <p className="text-xs text-gray-500">{getOrderStatus(orderItem.createdAt).status.charAt(0).toUpperCase() + getOrderStatus(orderItem.createdAt).status.slice(1)}</p>
                    </div>
                  </div>
                  {index === 0 && <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Most Recent</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order Status */}
        {order && (
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            {/* Order Info */}
            <div className="mb-8 pb-6 border-b">
              <div className="flex justify-between items-start flex-wrap gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Order #{order.sessionId || order._id || "N/A"}</h2>
                  <p className="text-sm text-gray-600">Placed on {new Date(order.createdAt).toLocaleDateString()}</p>
                  {/* Transaction ID */}
                  {(order.sessionId ||
                    order.paymentDetails?.paymentIntentId ||
                    order.paymentDetails?.razorpayOrderId ||
                    order.paymentDetails?.paypalOrderId ||
                    order.paymentDetails?.cashfreeOrderId) && (
                    <p className="text-xs text-gray-500 mt-1">
                      <span className="font-medium">Transaction ID:</span>{" "}
                      {order.sessionId ||
                        order.paymentDetails?.paymentIntentId ||
                        order.paymentDetails?.razorpayOrderId ||
                        order.paymentDetails?.paypalOrderId ||
                        order.paymentDetails?.cashfreeOrderId ||
                        order._id}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Total Amount</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {order.paymentDetails?.currencySymbol || currencySymbol}
                    {order.paymentDetails?.total || order.amount || "0"}
                  </p>
                </div>
              </div>

              {/* Current Status Message */}
              {(() => {
                const currentStatus = getOrderStatus(order.createdAt);
                return (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <p className="text-blue-800 font-medium text-center">{currentStatus.message}</p>
                  </div>
                );
              })()}
            </div>

            {/* Status Timeline */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Order Status</h3>
              <div className="relative">
                {statusSteps.map((step, index) => {
                  const currentStatus = getOrderStatus(order.createdAt);
                  const isCompleted = index < currentStatus.statusIndex;
                  const isCurrent = index === currentStatus.statusIndex;
                  const Icon = step.icon;

                  return (
                    <div key={index} className="flex items-center mb-8 last:mb-0">
                      {/* Icon */}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${isCompleted || isCurrent ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                        <Icon className="w-6 h-6" />
                      </div>

                      {/* Label */}
                      <div className="ml-4 flex-1">
                        <p className={`font-semibold ${isCompleted || isCurrent ? "text-gray-900" : "text-gray-400"}`}>{step.label}</p>
                        {isCurrent && <p className="text-sm text-green-600 mt-1">Current Status</p>}
                        {(isCompleted || isCurrent) && <p className="text-xs text-gray-500 mt-1">{step.message}</p>}
                      </div>

                      {/* Connector Line */}
                      {index < statusSteps.length - 1 && (
                        <div
                          className={`absolute left-6 w-0.5 h-8 ${isCompleted ? "bg-green-500" : "bg-gray-200"}`}
                          style={{
                            top: `${(index + 1) * 80}px`,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Customer Info */}
            {(order.name || order.phone || order.email) && (
              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Customer Information</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  {order.name && (
                    <p>
                      <span className="font-medium">Name:</span> {order.name}
                    </p>
                  )}
                  {order.email && (
                    <p>
                      <span className="font-medium">Email:</span> {order.email}
                    </p>
                  )}
                  {(order.phone || order.shipping?.phone) && (
                    <p>
                      <span className="font-medium">Phone:</span> {order.phone || order.shipping?.phone || "Not provided"}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Shipping Info */}
            {order.shipping?.address && (
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-3">Shipping Address</h3>
                <p className="text-sm text-gray-600">
                  {order.shipping.address.address1}
                  {order.shipping.address.address2 && (
                    <>
                      <br />
                      {order.shipping.address.address2}
                    </>
                  )}
                  <br />
                  {order.shipping.address.city}, {order.shipping.address.state} {order.shipping.address.zip}
                  <br />
                  {order.shipping.address.country}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
