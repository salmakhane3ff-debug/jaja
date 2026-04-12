"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter
} from "@heroui/drawer";
import ProductLabel from "@/components/ProductLabel";
import { Skeleton } from "@heroui/skeleton";
import { ShoppingBag, Trash2, Plus, Minus, ArrowRight, Heart, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

const CURRENCY = "MAD";

export default function CartPage() {
  const [cartItems, setCartItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState({});
  const { formatPrice, t } = useLanguage();

  useEffect(() => {
    const localCart = JSON.parse(localStorage.getItem("cart") || "[]");
    setCartItems(localCart);

    // Gift items are not manually selectable — skip them
    const initialSelection = {};
    localCart.forEach(item => {
      if (!item._isGift) initialSelection[item.productId] = true;
    });
    setSelectedItems(initialSelection);

    const fetchProducts = async () => {
      try {
        const cartProductIds = localCart
          .map((item) => item.productId)
          .filter(Boolean);

        if (cartProductIds.length === 0) {
          setProducts([]);
          setLoading(false);
          return;
        }

        // WHY: ?ids= fetches ONLY the products in the cart instead of the entire
        // catalogue. Old approach downloaded ~4 MB of JSON then filtered 2-3 matches
        // in the browser. This new approach downloads <10 KB for a typical cart.
        const idsQuery = cartProductIds.join(',');
        const res = await fetch(`/api/products?ids=${idsQuery}`, {
          cache: "force-cache",
          next: { revalidate: 120 },
        });
        if (!res.ok) throw new Error("Failed to fetch products");

        const matchedProducts = await res.json();
        setProducts(matchedProducts);
      } catch (error) {
        console.error("Error loading cart products:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const getProductDetails = (productId) => products.find((p) => p._id === productId);

  const handleRemove = (productId) => {
    const updatedCart = cartItems.filter((item) => item.productId !== productId);
    localStorage.setItem("cart", JSON.stringify(updatedCart));
    setCartItems(updatedCart);
    
    // Dispatch cart update event for header count
    window.dispatchEvent(new CustomEvent("cartUpdated"));
    
    // Remove from selected items
    const newSelectedItems = { ...selectedItems };
    delete newSelectedItems[productId];
    setSelectedItems(newSelectedItems);
  };

  const handleItemSelection = (productId, isSelected) => {
    setSelectedItems(prev => ({
      ...prev,
      [productId]: isSelected
    }));
  };

  const handleSelectAll = (selectAll) => {
    const newSelection = {};
    cartItems.forEach(item => {
      if (!item._isGift) newSelection[item.productId] = selectAll;
    });
    setSelectedItems(newSelection);
  };

  const handleQuantityChange = (productId, newQuantity) => {
    if (newQuantity < 1) return;
    
    const updatedCart = cartItems.map((item) =>
      item.productId === productId ? { ...item, quantity: newQuantity } : item
    );
    localStorage.setItem("cart", JSON.stringify(updatedCart));
    setCartItems(updatedCart);
    
    // Dispatch cart update event for header count
    window.dispatchEvent(new CustomEvent("cartUpdated"));
  };

  const getTotalItems = () => {
    if (!cartItems || cartItems.length === 0) return 0;
    return cartItems.reduce((total, item) => {
      const quantity = item?.quantity || 0;
      const isSelected = selectedItems[item.productId];
      return total + (isSelected ? quantity : 0);
    }, 0);
  };

  const getTotalPrice = () => {
    if (!cartItems || cartItems.length === 0) return 0;
    return cartItems.reduce((total, item) => {
      const price = item?.price || 0;
      const quantity = item?.quantity || 0;
      const isSelected = selectedItems[item.productId];
      return total + (isSelected ? (price * quantity) : 0);
    }, 0);
  };

  const getDiscountDetails = () => {
    let totalMRP = 0;
    let discountOnMRP = 0;
    
    // Calculate MRP and discount using product data (only for selected items)
    cartItems.forEach(item => {
      const isSelected = selectedItems[item.productId];
      if (!isSelected) return; // Skip unselected items
      
      const product = getProductDetails(item.productId);
      const itemMRP = Number(product?.regularPrice) || Number(item.price) || 0; // Use product's regular price as MRP
      const itemPrice = Number(item.price) || 0; // Cart item's sale price
      
      totalMRP += itemMRP * item.quantity;
      discountOnMRP += (itemMRP - itemPrice) * item.quantity;
    });

    // ✅ Buy 2 Get 1 Free logic - Discount lowest priced items (only for selected items)
    let buy2Get1Discount = 0;
    const totalQuantity = getTotalItems();
    const freeItemsCount = Math.floor(totalQuantity / 3) || 0; // Total free items across all selected products

    if (freeItemsCount > 0) {
      // Create array of all individual items with their prices (expanded by quantity, only selected items)
      const allItems = [];
      cartItems.forEach(item => {
        const isSelected = selectedItems[item.productId];
        if (!isSelected) return; // Skip unselected items
        
        const itemPrice = Number(item.price) || 0;
        for (let i = 0; i < item.quantity; i++) {
          allItems.push({
            productId: item.productId,
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

    const totalAmount = getTotalPrice() - buy2Get1Discount;

    return { totalMRP, discountOnMRP, buy2Get1Discount, totalAmount };
  };

  const handleBuyNow = () => {
    // Selected regular items + all gift items
    const selectedCartItems = cartItems.filter(
      item => selectedItems[item.productId] || item._isGift
    );
    
    const buyNowData = selectedCartItems.map((item) => ({
      productId: item.productId,
      title: item.title,
      quantity: item._isGift || item.free ? 1 : item.quantity,
      color: item.color || null,
      size: item.size || null,
      image: item.image,
      price: item._isGift || item.free ? 0 : item.price,
      currency: "MAD",
      isFreeGift: !!(item._isGift || item.free),
    }));

    localStorage.setItem("buyNow", JSON.stringify(buyNowData));
    window.location.href = "/checkout/address";
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-20 py-4 sm:py-6 md:py-12">
        {/* Header */}
        <div className="mb-4 sm:mb-6 md:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 sm:mb-4">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-medium text-gray-900">{t("cart_page_title")}</h1>
            {!loading && cartItems.length > 0 && (
              <div className="flex items-center gap-2 sm:gap-3">
                <input
                  type="checkbox"
                  id="selectAllCart"
                  checked={cartItems.every(item => selectedItems[item.productId])}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="selectAllCart" className="text-xs sm:text-sm text-gray-600">{t("cart_select_all")}</label>
              </div>
            )}
          </div>
          {!loading && cartItems.length > 0 && (
            <p className="text-xs sm:text-sm text-gray-600">
              {t("cart_items_selected").replace("{selected}", getTotalItems()).replace("{total}", cartItems.reduce((total, item) => total + item.quantity, 0))}
            </p>
          )}
        </div>

        {loading ? (
          /* Loading Skeleton */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <div className="space-y-4 sm:space-y-6">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="flex gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-xl sm:rounded-2xl">
                      <Skeleton className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg sm:rounded-xl flex-shrink-0" />
                      <div className="flex-1 space-y-2 sm:space-y-3">
                        <Skeleton className="h-3 sm:h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-6 sm:h-8 w-24 sm:w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <Skeleton className="h-5 sm:h-6 w-24 sm:w-32 mb-3 sm:mb-4" />
                <div className="space-y-2 sm:space-y-3">
                  <Skeleton className="h-3 sm:h-4 w-full" />
                  <Skeleton className="h-3 sm:h-4 w-3/4" />
                  <Skeleton className="h-10 sm:h-12 w-full mt-4 sm:mt-6" />
                </div>
              </div>
            </div>
          </div>
        ) : cartItems.length === 0 ? (
          /* Empty Cart */
          <div className="flex flex-col items-center justify-center py-12 sm:py-16 lg:py-20 text-center">
            <div className="bg-white rounded-2xl sm:rounded-3xl p-8 sm:p-10 lg:p-12 mb-6 sm:mb-8 shadow-sm max-w-md mx-auto">
              <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <ShoppingBag className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 text-gray-400" />
              </div>
              <h2 className="text-lg sm:text-xl font-medium text-gray-900 mb-2 sm:mb-3">{t("cart_empty_title")}</h2>
              <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-8 max-w-xs sm:max-w-md mx-auto leading-relaxed">
                {t("cart_empty_desc")}
              </p>
              <Link href="/">
                <Button 
                  size="lg" 
                  className="bg-gray-900 text-white h-10 sm:h-12 px-6 sm:px-8 rounded-xl sm:rounded-2xl font-medium text-sm sm:text-base"
                  startContent={<ShoppingBag className="w-4 h-4" />}
                >
                  {t("cart_start_shopping")}
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          /* Cart Content */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4 sm:mb-6">{t("cart_items_heading")}</h3>
                <div className="space-y-3 sm:space-y-4">
                  {cartItems.map((item, index) => {
                    const product    = getProductDetails(item.productId);
                    if (!product) return null;
                    const isFreeItem = !!item._isGift || !!item.free;
                    const imageUrl   = item.image || product.images?.[0] || "https://placehold.co/400x500?text=No+Image";

                    return (
                      <div
                        key={`${item.productId}-${index}`}
                        className={`rounded-xl sm:rounded-2xl overflow-hidden transition-colors ${
                          isFreeItem
                            ? "border-2 border-pink-200 bg-pink-50/30"
                            : `flex gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 hover:bg-gray-100 ${
                                selectedItems[item.productId] ? "" : "opacity-50 bg-gray-100"
                              }`
                        }`}
                      >
                        {/* Free Gift banner */}
                        {isFreeItem && (
                          <div className="bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-1.5 flex items-center gap-2">
                            <span className="text-sm">🎁</span>
                            <span className="text-xs font-bold text-white tracking-wide">
                              {t("gift_free_label")}
                            </span>
                          </div>
                        )}

                        <div className={`flex gap-3 sm:gap-4 ${isFreeItem ? "p-3 sm:p-4" : ""}`}>
                          {/* Checkbox — hidden for gift items */}
                          <div className="flex items-start pt-2 sm:pt-3">
                            {isFreeItem ? (
                              <div className="w-4 h-4" />
                            ) : (
                              <input
                                type="checkbox"
                                checked={selectedItems[item.productId] || false}
                                onChange={(e) => handleItemSelection(item.productId, e.target.checked)}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                              />
                            )}
                          </div>

                          {/* Product Image */}
                          <Link href={`/products/${item.productId}`} className="flex-shrink-0">
                            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg sm:rounded-xl overflow-hidden bg-white">
                              <img
                                src={imageUrl}
                                alt={item.title}
                                className="w-full h-full object-cover hover:scale-105 transition-transform"
                              />
                              {product.productLabel && !isFreeItem && (
                                <div className="absolute -top-1 -right-1">
                                  <ProductLabel label={product.productLabel} size="xs" />
                                </div>
                              )}
                            </div>
                          </Link>

                          {/* Product Details */}
                          <div className="flex-1 min-w-0">
                            <Link href={`/products/${item.productId}`}>
                              <h4 className="text-xs sm:text-sm font-medium text-gray-900 line-clamp-2 hover:text-gray-700 transition-colors leading-tight">
                                {item.title}
                              </h4>
                            </Link>

                            <div className="mt-2 sm:mt-3 space-y-2 sm:space-y-0">
                              {/* Price */}
                              <div className={`text-sm sm:text-base font-semibold ${isFreeItem ? "text-pink-600" : "text-gray-900"}`}>
                                {isFreeItem ? `0 ${CURRENCY}` : formatPrice((item.price * item.quantity).toFixed(0))}
                              </div>

                              {/* Quantity + Actions */}
                              <div className="flex items-center justify-between sm:justify-start sm:gap-4">
                                {isFreeItem ? (
                                  <div className="flex items-center bg-pink-100 rounded-lg border border-pink-200 px-3 py-1.5">
                                    <span className="text-xs font-medium text-pink-700">✕ 1</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center bg-white rounded-lg sm:rounded-xl border border-gray-200">
                                    <button
                                      onClick={() => handleQuantityChange(item.productId, item.quantity - 1)}
                                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-l-lg sm:rounded-l-xl transition-colors"
                                      disabled={item.quantity <= 1}
                                    >
                                      <Minus className="w-3 h-3 text-gray-600" />
                                    </button>
                                    <span className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-900 min-w-[2rem] sm:min-w-[3rem] text-center">
                                      {item.quantity}
                                    </span>
                                    <button
                                      onClick={() => handleQuantityChange(item.productId, item.quantity + 1)}
                                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-r-lg sm:rounded-r-xl transition-colors"
                                    >
                                      <Plus className="w-3 h-3 text-gray-600" />
                                    </button>
                                  </div>
                                )}

                                {/* Remove — gift items use X, regular use trash */}
                                {isFreeItem ? (
                                  <button
                                    onClick={() => handleRemove(item.productId)}
                                    className="p-2 text-pink-400 hover:bg-pink-50 rounded-lg transition-colors"
                                    title="Remove gift"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleRemove(item.productId)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg sm:rounded-xl transition-colors"
                                    title="Remove item"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 sticky top-4 sm:top-6">
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4 sm:mb-6">{t("cart_order_summary")}</h3>
                
                {(() => {
                  const { totalMRP, discountOnMRP, buy2Get1Discount, totalAmount } = getDiscountDetails();

                  return (
                    <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-gray-600">{t("cart_total_mrp")}</span>
                        <span className="font-medium text-gray-900">{formatPrice(totalMRP.toFixed(0))}</span>
                      </div>
                      {discountOnMRP > 0 && (
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="text-gray-600">{t("cart_discount_mrp")}</span>
                          <span className="font-medium text-green-600">-{formatPrice(discountOnMRP.toFixed(0))}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-gray-600">{t("cart_subtotal").replace("{count}", getTotalItems())}</span>
                        <span className="font-medium text-gray-900">{formatPrice((totalMRP - discountOnMRP).toFixed(0))}</span>
                      </div>
                      {buy2Get1Discount > 0 && (
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="text-gray-600">{t("cart_coupon_applied")}</span>
                          <span className="font-medium text-blue-600">-{formatPrice(buy2Get1Discount.toFixed(0))}</span>
                        </div>
                      )}

                      <div className="border-t border-gray-100 pt-3 sm:pt-4">
                        <div className="flex justify-between">
                          <span className="text-sm sm:text-base font-medium text-gray-900">{t("cart_total")}</span>
                          <span className="text-base sm:text-lg font-semibold text-gray-900">{formatPrice(totalAmount.toFixed(0))}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <Button
                  size="lg"
                  onClick={handleBuyNow}
                  className="w-full bg-gray-900 text-white h-10 sm:h-12 rounded-xl sm:rounded-2xl font-medium mb-3 sm:mb-4 text-sm sm:text-base"
                  endContent={<ArrowRight className="w-4 h-4" />}
                >
                  {t("cart_proceed_checkout")}
                </Button>

                <Link href="/">
                  <Button
                    variant="flat"
                    size="lg"
                    className="w-full bg-gray-100 text-gray-700 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-medium text-sm sm:text-base"
                  >
                    {t("cart_continue_shopping")}
                  </Button>
                </Link>

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}