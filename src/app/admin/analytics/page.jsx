"use client";

import { useEffect, useState } from "react";
import { Table, TableHeader, TableBody, TableColumn, TableRow, TableCell, Spinner, Input, Select, SelectItem, Chip, Pagination } from "@heroui/react";
import { TrendingUp, ShoppingBag, DollarSign, Users, ChevronDown, BarChart3, Clock, Filter, Search, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import formatDate from "@/utils/formatDate";
import { useStoreCurrency } from "@/hooks/useStoreCurrency";

export default function AnalyticsPage() {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("desc"); // desc = newest first
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(10);
  const { symbol: currencySymbol, currency } = useStoreCurrency();

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    filterOrders();
  }, [orders, searchTerm, dateFilter, statusFilter, sortOrder]);

  const getOrderStatus = (order) => {
    if (order.paymentDetails?.status) {
      switch (order.paymentDetails.status.toLowerCase()) {
        case "paid":
        case "completed":
        case "success":
        case "succeeded":
          return "Success";
        case "pending":
        case "processing":
          return "Pending";
        case "failed":
        case "error":
          return "Failed";
        case "cancelled":
          return "Cancelled";
        default:
          return "Pending";
      }
    }
    // Also check paymentStatus field
    if (order.paymentDetails?.paymentStatus) {
      switch (order.paymentDetails.paymentStatus.toLowerCase()) {
        case "paid":
        case "completed":
        case "success":
        case "succeeded":
          return "Success";
        case "pending":
        case "processing":
          return "Pending";
        case "failed":
        case "error":
          return "Failed";
        case "cancelled":
          return "Cancelled";
        default:
          return "Pending";
      }
    }
    return "Pending";
  };

  const filterOrders = () => {
    let filtered = orders;

    // Filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter((order) => {
        const status = getOrderStatus(order);
        return status.toLowerCase() === statusFilter.toLowerCase();
      });
    }

    // Filter by search term (name, email, phone)
    if (searchTerm) {
      filtered = filtered.filter(
        (order) =>
          order.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.phone?.includes(searchTerm) ||
          order.sessionId?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by date
    filtered = filterByDate(filtered);

    // Sort orders
    filtered = filtered.sort((a, b) => (sortOrder === "desc" ? new Date(b.createdAt) - new Date(a.createdAt) : new Date(a.createdAt) - new Date(b.createdAt)));

    setFilteredOrders(filtered);
    setPage(1); // Reset to first page when filtering
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch("/api/order");
      const data = await res.json();

      // Filter and deduplicate orders (same logic as orders page)
      const filteredOrders = (Array.isArray(data) ? data : []).filter((order) => {
        // Only show orders that have proper structure (new system)
        return order.products?.items && Array.isArray(order.products.items);
      });

      // Group by sessionId and email+phone to remove duplicates
      const orderMap = new Map();

      filteredOrders.forEach((order) => {
        const key = order.sessionId || `${order.email}-${order.phone}-${order.paymentDetails?.total}`;
        const existing = orderMap.get(key);

        if (!existing || new Date(order.updatedAt) > new Date(existing.updatedAt)) {
          orderMap.set(key, order);
        }
      });

      // Convert back to array and sort by creation date (newest first)
      const uniqueOrders = Array.from(orderMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      setOrders(uniqueOrders);
    } catch (err) {
      console.error("Failed to fetch analytics data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Filter orders by date
  const filterByDate = (orders) => {
    if (dateFilter === "all") return orders;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    let cutoff;
    switch (dateFilter) {
      case "today":
        cutoff = startOfToday;
        break;
      case "yesterday":
        return orders.filter((o) => {
          const orderDate = new Date(o.createdAt);
          return orderDate >= startOfYesterday && orderDate < startOfToday;
        });
      case "7":
        cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        break;
      case "30":
        cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        break;
      case "90":
        cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        break;
      default:
        return orders;
    }

    return orders.filter((o) => new Date(o.createdAt) >= cutoff);
  };

  // Apply filters & sorting
  const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);
  const paginatedOrders = filteredOrders.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // Calculate order statistics filtered by date
  const dateFilteredOrders = filterByDate(orders);
  const successOrders = dateFilteredOrders.filter(order => getOrderStatus(order).toLowerCase() === "success");
  const pendingOrders = dateFilteredOrders.filter(order => getOrderStatus(order).toLowerCase() === "pending");
  const failedOrders = dateFilteredOrders.filter(order => getOrderStatus(order).toLowerCase() === "failed");
  
  const totalOrders = filteredOrders.length;
  const totalRevenue = successOrders.reduce((sum, o) => sum + (o.paymentDetails?.total || 0), 0);
  const uniqueCustomers = new Set(dateFilteredOrders.map((o) => o.email)).size;
  const averageOrderValue = successOrders.length > 0 ? totalRevenue / successOrders.length : 0;

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
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-600 text-sm mt-1">Overview of all your orders and revenue insights</p>
          </div>

          {/* Filters and Actions */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="success">Success</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
            
            <div className="relative">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All time</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex gap-3">
          <Input
            placeholder="Search by customer name, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            startContent={<Search className="w-4 h-4 text-gray-400" />}
            className="flex-1"
            classNames={{
              input: "text-sm",
              inputWrapper: "border border-gray-200 bg-white",
            }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Orders" 
          value={dateFilteredOrders.length} 
          subtitle={`${successOrders.length} Success • ${pendingOrders.length} Pending • ${failedOrders.length} Failed`}
          icon={<ShoppingBag size={20} />} 
          color="blue" 
          trend="+12%" 
        />
        <StatCard 
          title="Total Revenue" 
          value={`${currencySymbol}${totalRevenue.toLocaleString()}`} 
          subtitle={`From ${successOrders.length} successful orders`}
          icon={<DollarSign size={20} />} 
          color="green" 
          trend="+8%" 
        />
        <StatCard 
          title="Average Order Value" 
          value={`${currencySymbol}${averageOrderValue.toFixed(2)}`} 
          subtitle={`Based on successful orders only`}
          icon={<TrendingUp size={20} />} 
          color="orange" 
          trend="+5%" 
        />
        <StatCard 
          title="Unique Customers" 
          value={uniqueCustomers} 
          subtitle={`${successOrders.length} completed purchases`}
          icon={<Users size={20} />} 
          color="purple" 
          trend="+23%" 
        />
      </div>

      {/* All Orders */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                <ShoppingBag size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">All Orders</h3>
                <p className="text-sm text-gray-500">
                  {statusFilter === "all" ? "All orders from your store" : 
                   statusFilter === "success" ? "Successful orders from your store" :
                   statusFilter === "pending" ? "Pending orders from your store" :
                   "Failed orders from your store"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-1">
              <ShoppingBag size={12} className="text-blue-600" />
              {filteredOrders.length} orders
            </div>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag size={24} className="text-gray-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-900 mb-1">No orders found</h3>
            <p className="text-xs text-gray-500">
              {statusFilter === "all" ? "Once you receive orders, they will appear here for analysis." :
               statusFilter === "success" ? "Once you receive successful orders, they will appear here." :
               statusFilter === "pending" ? "Once you have pending orders, they will appear here." :
               "Once you have failed orders, they will appear here."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            {/* Mobile Cards View */}
            <div className="block lg:hidden">
              <div className="p-4">
                <div className="space-y-3">
                  {paginatedOrders.map((order) => {
                    const status = getOrderStatus(order);
                    const statusConfig = {
                      success: { color: "from-green-500 to-emerald-500", chipColor: "success" },
                      pending: { color: "from-yellow-500 to-orange-500", chipColor: "warning" },
                      failed: { color: "from-red-500 to-pink-500", chipColor: "danger" }
                    };
                    const config = statusConfig[status.toLowerCase()] || statusConfig.pending;
                    
                    return (
                      <div key={order._id} className="flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors border border-gray-100">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${config.color} flex items-center justify-center text-white font-medium text-sm flex-shrink-0`}>
                          {order.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 text-sm truncate">{order.name}</h4>
                          <p className="text-gray-500 text-xs mb-1 truncate">{order.email}</p>
                          <p className="text-gray-400 text-xs truncate">{order.products?.items?.[0]?.title || "No products"}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900 text-sm mb-1">
                            {order.paymentDetails?.currencySymbol || currencySymbol}
                            {order.paymentDetails?.total?.toLocaleString() || "0"}
                          </p>
                          <Chip size="sm" color={config.chipColor} className="text-xs">
                            {status}
                          </Chip>
                          <p className="text-xs text-gray-500 mt-1">{formatDate(order.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block">
              <Table
                shadow="none"
                aria-label="All Orders Table"
                classNames={{
                  wrapper: "shadow-none border-none rounded-none",
                  th: "bg-gray-50 text-gray-700 font-medium py-4",
                  td: "py-4",
                }}
                bottomContent={
                  filteredOrders.length > rowsPerPage ? (
                    <div className="w-full flex justify-center p-4 border-t border-gray-200">
                      <Pagination isCompact showControls color="primary" page={page} total={totalPages} onChange={(page) => setPage(page)} />
                    </div>
                  ) : null
                }
              >
                <TableHeader>
                  <TableColumn>Customer</TableColumn>
                  <TableColumn>Product</TableColumn>
                  <TableColumn>Amount</TableColumn>
                  <TableColumn>Status</TableColumn>
                  <TableColumn className="hidden md:table-cell">Date</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No orders found">
                  {paginatedOrders.map((order) => {
                    const status = getOrderStatus(order);
                    const statusConfig = {
                      success: { color: "from-green-500 to-emerald-500", chipColor: "success" },
                      pending: { color: "from-yellow-500 to-orange-500", chipColor: "warning" },
                      failed: { color: "from-red-500 to-pink-500", chipColor: "danger" }
                    };
                    const config = statusConfig[status.toLowerCase()] || statusConfig.pending;
                    
                    return (
                      <TableRow key={order._id} className="hover:bg-gray-50 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${config.color} flex items-center justify-center text-white font-medium text-xs flex-shrink-0`}>
                              {order.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 text-sm">{order.name}</p>
                              <p className="text-xs text-gray-500">{order.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-600 text-sm">{order.products?.items?.[0]?.title || "No products"}</TableCell>
                        <TableCell className="font-semibold text-gray-900 text-sm">
                          {order.paymentDetails?.currencySymbol || currencySymbol}
                          {order.paymentDetails?.total?.toLocaleString() || "0"}
                        </TableCell>
                        <TableCell>
                          <Chip size="sm" color={config.chipColor} className="text-xs font-medium">
                            {status}
                          </Chip>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-gray-600 text-sm">{formatDate(order.createdAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Pagination */}
            {filteredOrders.length > rowsPerPage && (
              <div className="block lg:hidden p-4 border-t border-gray-200">
                <Pagination isCompact showControls color="primary" page={page} total={totalPages} onChange={(page) => setPage(page)} className="flex justify-center" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Modern StatCard Component ---- */
function StatCard({ title, value, subtitle, icon, color, trend }) {
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
        {trend && (
          <div className="flex items-center gap-1 text-green-600 bg-green-50 rounded-full px-2 py-1">
            <TrendingUp size={12} />
            <span className="text-xs font-medium">{trend}</span>
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mb-2">{value}</p>
        {subtitle && (
          <p className="text-xs text-gray-500 leading-relaxed">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
