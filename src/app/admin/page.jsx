"use client";

import { useEffect, useState } from "react";
import { Users, ShoppingBag, DollarSign, TrendingUp, Package, Clock } from "lucide-react";
import { Spinner } from "@heroui/react";
import formatDate from "@/utils/formatDate";
import { useCurrency } from "@/hooks/useCurrency";

export default function DashboardPage() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { symbol: currencySymbol } = useCurrency();

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [ordersRes, productsRes] = await Promise.all([fetch("/api/order"), fetch("/api/product")]);
      const ordersData = await ordersRes.json();
      const productsData = await productsRes.json();

      // Filter and deduplicate orders (same logic as orders page)
      const filteredOrders = (Array.isArray(ordersData) ? ordersData : []).filter(order => {
        // Only show orders that have proper structure (new system)
        return order.products?.items && Array.isArray(order.products.items);
      });
      
      // Group by sessionId and email+phone to remove duplicates
      const orderMap = new Map();
      
      filteredOrders.forEach(order => {
        const key = order.sessionId || `${order.email}-${order.phone}-${order.paymentDetails?.total}`;
        const existing = orderMap.get(key);
        
        if (!existing || new Date(order.updatedAt) > new Date(existing.updatedAt)) {
          orderMap.set(key, order);
        }
      });
      
      // Convert back to array and sort by creation date (newest first)
      const uniqueOrders = Array.from(orderMap.values())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      setOrders(uniqueOrders);
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err) {
      console.error("Failed to fetch analytics data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Sort orders by newest first
  const filteredOrders = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Get today's date in YYYY-MM-DD format for comparison
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  // Filter today's data - only count successful orders for revenue calculations
  const todaysOrders = filteredOrders.filter((order) => {
    const orderDate = new Date(order.createdAt);
    return orderDate >= todayStart && orderDate < todayEnd;
  });

  // Filter successful orders for accurate revenue calculation
  const todaysSuccessfulOrders = todaysOrders.filter((order) => {
    return order.status === "success" || 
           order.paymentDetails?.status === "paid" || 
           order.paymentDetails?.paymentStatus === "success";
  });

  // Today's analytics
  const totalTodaysOrders = todaysOrders.length;
  const totalTodaysSuccessOrders = todaysSuccessfulOrders.length;
  const todaysRevenue = todaysSuccessfulOrders.reduce((sum, o) => sum + (o.paymentDetails?.total || 0), 0);
  const todaysCustomers = new Set(todaysOrders.map((o) => o.email)).size;
  const todaysSuccessCustomers = new Set(todaysSuccessfulOrders.map((o) => o.email)).size;
  const todaysAverageOrderValue = todaysSuccessfulOrders.length > 0 ? todaysRevenue / todaysSuccessfulOrders.length : 0;

  // Total analytics (all time)
  const totalAllOrders = filteredOrders.length;
  const totalAllSuccessOrders = filteredOrders.filter((order) => {
    return order.status === "success" || 
           order.paymentDetails?.status === "paid" || 
           order.paymentDetails?.paymentStatus === "success";
  }).length;
  const totalAllRevenue = filteredOrders.filter(o => o.status === "success" || o.paymentDetails?.status === "paid" || o.paymentDetails?.paymentStatus === "success").reduce((sum, o) => sum + (o.paymentDetails?.total || 0), 0);
  const totalAllCustomers = new Set(filteredOrders.map((o) => o.email)).size;

  const recentOrders = filteredOrders.slice(0, 5);
  const latestProducts = [...products].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <div className="text-center">
          <Spinner color="secondary" variant="gradient" size="md" />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6 p-6 bg-gray-50/30 min-h-screen">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Welcome back! 👋</h1>
            <p className="text-blue-100 text-sm sm:text-base">Here's what's happening with your store today.</p>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2 backdrop-blur-sm">
            <Clock size={16} />
            <span className="text-sm">{new Date().toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid - Today's Data */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Today Success Orders" 
          value={totalTodaysSuccessOrders} 
          icon={<ShoppingBag size={20} />} 
          color="blue" 
          subtitle={`${totalTodaysOrders} total today`} 
        />
        <StatCard
          title="Today Revenue"
          value={`${currencySymbol}${todaysRevenue.toLocaleString()}`}
          icon={<DollarSign size={20} />}
          color="green"
          subtitle={`${currencySymbol}${totalAllRevenue.toLocaleString()} all time`}
        />
        <StatCard 
          title="Today Avg Order Value" 
          value={`${currencySymbol}${todaysAverageOrderValue.toLocaleString()}`} 
          icon={<TrendingUp size={20} />} 
          color="purple" 
          subtitle={`From ${totalTodaysSuccessOrders} success orders`} 
        />
        <StatCard 
          title="Today Success Customers" 
          value={todaysSuccessCustomers} 
          icon={<Users size={20} />} 
          color="orange" 
          subtitle={`${todaysCustomers} total today`} 
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent Products */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Recent Products</h2>
            <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1">
              <Package size={12} />
              {latestProducts.length} items
            </div>
          </div>
          <div className="space-y-4">
            {latestProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Package size={24} className="text-gray-400" />
                </div>
                <h3 className="text-sm font-medium text-gray-900 mb-1">No products yet</h3>
                <p className="text-xs text-gray-500">Add your first product to see it here</p>
              </div>
            ) : (
              latestProducts.map((product) => (
                <div key={product._id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                    {product.images?.[0] ? (
                      <img src={product.images[0]} alt={product.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={16} className="text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 text-sm truncate">{product.title}</h3>
                    <p className="text-xs text-gray-500 truncate">{product.shortDescription || "No description"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 text-sm">
                      {currencySymbol}{product.salePrice || product.regularPrice}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(product.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
            <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1">
              <ShoppingBag size={12} />
              {recentOrders.length} orders
            </div>
          </div>
          <div className="space-y-4">
            {recentOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <ShoppingBag size={24} className="text-gray-400" />
                </div>
                <h3 className="text-sm font-medium text-gray-900 mb-1">No orders yet</h3>
                <p className="text-xs text-gray-500">Your recent orders will appear here</p>
              </div>
            ) : (
              recentOrders.map((order) => (
                <div key={order._id} className="space-y-3">
                  {/* Order Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium text-xs">
                        {order.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Order #{order._id?.slice(-6)}</span>
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            order.status === "success" || order.paymentDetails?.status === "paid" || order.paymentDetails?.paymentStatus === "success"
                              ? "bg-green-100 text-green-700"
                              : order.status === "failed" || order.paymentDetails?.status === "failed" || order.paymentDetails?.paymentStatus === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {order.status === "success" || order.paymentDetails?.status === "paid" || order.paymentDetails?.paymentStatus === "success" 
                            ? "success" 
                            : order.status === "failed" || order.paymentDetails?.status === "failed" || order.paymentDetails?.paymentStatus === "failed"
                            ? "failed"
                            : "pending"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900 text-sm">
                        {currencySymbol}{order.paymentDetails?.total}
                      </p>
                      <p className="text-xs text-gray-500">{formatDate(order.createdAt)}</p>
                    </div>
                  </div>

                  {/* Products in Order */}
                  <div className="space-y-2 pl-8">
                    {order.products?.items?.map((item, index) => (
                      <div key={index} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                          {item.images?.[0] ? (
                            <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package size={12} className="text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 text-xs truncate">{item.title}</h4>
                          <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900 text-xs">
                            {currencySymbol}{item.sellingPrice}
                          </p>
                        </div>
                      </div>
                    )) || <div className="text-xs text-gray-500 italic">No product details available</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Modern StatCard Component ---- */
function StatCard({ title, value, icon, color, subtitle }) {
  const colorClasses = {
    blue: "text-blue-600 bg-blue-50",
    green: "text-green-600 bg-green-50",
    purple: "text-purple-600 bg-purple-50",
    orange: "text-orange-600 bg-orange-50",
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl ${colorClasses[color]} flex items-center justify-center`}>{icon}</div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
}
