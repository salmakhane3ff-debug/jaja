"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, X, Settings, User, ChevronDown, Globe, HelpCircle, LogOut, ShoppingCart, Eye, Home, Tags, Plus, LayoutGrid, BarChart2 } from "lucide-react";

const Header = ({ sidebarOpen, setSidebarOpen }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Quick navigation links from sidebar
  const quickLinks = [
    { href: "/admin", icon: <Home size={14} />, label: "Dashboard" },
    { href: "/admin/product", icon: <Tags size={14} />, label: "Products" },
    { href: "/admin/product/new", icon: <Plus size={14} />, label: "Add Product" },
    { href: "/admin/orders", icon: <ShoppingCart size={14} />, label: "Orders" },
    { href: "/admin/analytics", icon: <BarChart2 size={14} />, label: "Analytics" },
  ];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "DELETE" });
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      // Fallback to direct redirect
      window.location.href = "/login";
    }
  };

  const visitStore = () => {
    window.open("/", "_blank");
  };

  return (
    <div
      className={`h-12 w-full fixed top-0 z-50 flex justify-between items-center px-3 sm:px-4 lg:px-6 transition-all duration-300 ${
        isScrolled ? "bg-white/70 backdrop-blur-md" : "bg-white"
      } border-b border-gray-200`}
    >
      {/* Left Section */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile Menu Button */}
        <button
          className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <span className="sr-only">Toggle sidebar</span>
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        {/* Logo */}
        <Link href="/admin" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
            <ShoppingCart size={14} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 hidden sm:block">Shop Gold</h1>
          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium hidden lg:inline">Admin</span>
        </Link>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Visit Store Button */}
        <button
          onClick={visitStore}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          title="Visit Store"
        >
          <Eye size={14} />
          <span className="hidden md:inline">Visit Store</span>
        </button>

        {/* Settings */}
        <Link href="/admin/settings" className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors" title="Settings">
          <Settings size={16} />
        </Link>

        {/* User Menu */}
        <div className="relative">
          <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
              <User size={12} className="text-white" />
            </div>
            <ChevronDown size={14} className="text-gray-400 hidden sm:block" />
          </button>

          {/* User Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
              <div className="p-3 border-b border-gray-100">
                <p className="font-medium text-gray-900 text-sm">Admin User</p>
                <p className="text-xs text-gray-500">admin@shopgold.com</p>
              </div>
              <div className="py-1">
                <Link href="/admin" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Home size={14} />
                  Dashboard
                </Link>
                <Link href="/admin/product" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Tags size={14} />
                  Products
                </Link>
                <Link href="/admin/orders" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <ShoppingCart size={14} />
                  Orders
                </Link>
                <Link href="/admin/analytics" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <BarChart2 size={14} />
                  Analytics
                </Link>
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <Link href="/admin/profile" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <User size={14} />
                    Profile
                  </Link>
                  <Link href="/admin/settings" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Settings size={14} />
                    Settings
                  </Link>
                  <button onClick={visitStore} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Globe size={14} />
                    Visit Store
                  </button>
                </div>
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <button onClick={handleLogout} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                    <LogOut size={14} />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Click outside handler */}
      {showUserMenu && <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />}
    </div>
  );
};

export default Header;
