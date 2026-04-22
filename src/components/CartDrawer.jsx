"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter } from "@heroui/drawer";
import ProductLabel from "@/components/ProductLabel";
import { ShoppingBag, Trash2, Plus, Minus, ArrowRight, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { fetchCached } from "@/lib/dataCache";
import { thumbUrl }    from "@/lib/thumbnailUrl";

const CURRENCY = "MAD";

export default function CartDrawer({ isOpen, onClose }) {
  const [cartItems, setCartItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState({});
  const [activeGifts, setActiveGifts] = useState([]);
  const { t, formatPrice } = useLanguage();

  useEffect(() => {
    if (isOpen) loadCartData();
  }, [isOpen]);

  // Reload whenever cart is mutated while the drawer is open
  useEffect(() => {
    if (!isOpen) return;
    const onUpdate = () => loadCartData();
    window.addEventListener("cartUpdated", onUpdate);
    return () => window.removeEventListener("cartUpdated", onUpdate);
  }, [isOpen]);

  const loadCartData = async () => {
    setLoading(true);
    const localCart = JSON.parse(localStorage.getItem("cart") || "[]");
    setCartItems(localCart);

    // Only non-gift items start as selected
    const initialSelection = {};
    localCart.forEach((item) => {
      if (!item._isGift) initialSelection[item.productId] = true;
    });
    setSelectedItems(initialSelection);

    try {
      const [allProducts, giftsRaw] = await Promise.all([
        fetchCached("/api/products"),
        fetchCached("/api/gifts"),
      ]);
      const cartProductIds = localCart.map((item) => item.productId);
      const giftsData = Array.isArray(giftsRaw) ? giftsRaw.filter((g) => g.active) : [];
      const giftProductIds = giftsData.map((g) => g.productId).filter(Boolean);
      const matchedProducts = allProducts.filter(
        (p) => cartProductIds.includes(p._id) || giftProductIds.includes(p._id)
      );
      setProducts(matchedProducts);
      setActiveGifts(giftsData);
    } catch (error) {
      console.error("Error loading cart products:", error);
    } finally {
      setLoading(false);
    }
  };

  const getProductDetails = (productId) => products.find((p) => p._id === productId);

  const handleRemove = (productId) => {
    // Also remove the linked cadeau if the parent paid item is removed
    const cadeauId = productId + "::cadeau";
    const updatedCart = cartItems.filter(
      (item) => item.productId !== productId && item.productId !== cadeauId
    );
    localStorage.setItem("cart", JSON.stringify(updatedCart));
    setCartItems(updatedCart);
    window.dispatchEvent(new CustomEvent("cartUpdated"));
    const newSelectedItems = { ...selectedItems };
    delete newSelectedItems[productId];
    setSelectedItems(newSelectedItems);
  };

  const handleItemSelection = (productId, isSelected) => {
    setSelectedItems((prev) => ({ ...prev, [productId]: isSelected }));
  };

  const handleSelectAll = (selectAll) => {
    const newSelection = {};
    cartItems.forEach((item) => {
      if (!item._isGift) newSelection[item.productId] = selectAll;
    });
    setSelectedItems(newSelection);
  };

  const handleQuantityChange = (productId, newQuantity) => {
    if (newQuantity < 1) return;

    // ── 2+1 bundle sync ────────────────────────────────────────────────────────
    // The cadeau item for this product has id = productId + "::cadeau"
    const cadeauId = productId + "::cadeau";

    let updated = cartItems.map((item) =>
      item.productId === productId ? { ...item, quantity: newQuantity } : item
    );

    if (newQuantity < 2) {
      // Less than 2 paid units → remove the cadeau entirely
      updated = updated.filter((item) => item.productId !== cadeauId);
    } else {
      // Maintain ratio: 1 cadeau per 2 paid units
      const expectedCadeauQty = Math.floor(newQuantity / 2);
      const cadeauIndex = updated.findIndex((item) => item.productId === cadeauId);
      if (cadeauIndex !== -1) {
        updated[cadeauIndex] = { ...updated[cadeauIndex], quantity: expectedCadeauQty };
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    localStorage.setItem("cart", JSON.stringify(updated));
    setCartItems(updated);
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
      return total + (isSelected ? price * quantity : 0);
    }, 0);
  };

  const getDiscountDetails = () => {
    let totalMRP = 0;
    let discountOnMRP = 0;

    cartItems.forEach((item) => {
      const isSelected = selectedItems[item.productId];
      if (!isSelected) return;
      const product = getProductDetails(item.productId);
      const itemMRP = Number(product?.regularPrice) || Number(item.price) || 0;
      const itemPrice = Number(item.price) || 0;
      totalMRP += itemMRP * item.quantity;
      discountOnMRP += (itemMRP - itemPrice) * item.quantity;
    });

    let buy2Get1Discount = 0;
    const totalQuantity = getTotalItems();
    const freeItemsCount = Math.floor(totalQuantity / 3) || 0;

    if (freeItemsCount > 0) {
      const allItems = [];
      cartItems.forEach((item) => {
        const isSelected = selectedItems[item.productId];
        if (!isSelected) return;
        const itemPrice = Number(item.price) || 0;
        for (let i = 0; i < item.quantity; i++) {
          allItems.push({ productId: item.productId, title: item.title, price: itemPrice });
        }
      });
      allItems.sort((a, b) => (a.price || 0) - (b.price || 0));
      for (let i = 0; i < freeItemsCount && i < allItems.length; i++) {
        buy2Get1Discount += Number(allItems[i].price) || 0;
      }
    }

    totalMRP = Number(totalMRP) || 0;
    discountOnMRP = Number(discountOnMRP) || 0;
    buy2Get1Discount = Number(buy2Get1Discount) || 0;
    const totalAmount = Number(getTotalPrice() - buy2Get1Discount) || 0;

    return { totalMRP, discountOnMRP, buy2Get1Discount, totalAmount, freeItemsCount: Number(freeItemsCount) || 0 };
  };

  // Non-gift subtotal (used for threshold progress bar)
  const getNonGiftSubtotal = () =>
    cartItems.reduce((sum, item) => {
      if (item._isGift) return sum;
      const isSelected = selectedItems[item.productId];
      if (!isSelected) return sum;
      return sum + (parseFloat(item.price) || 0) * (item.quantity || 1);
    }, 0);

  const handleCheckout = () => {
    // Selected regular items + all gift items
    const selectedCartItems = cartItems.filter(
      (item) => selectedItems[item.productId] || item._isGift
    );
    const buyNowData = selectedCartItems.map((item) => {
      const isGift = !!(item._isGift || item.free);
      return {
        productId: item.productId,
        title: isGift && !item.title?.includes("CADEAU GRATUIT")
          ? item.title + " (CADEAU GRATUIT)"
          : item.title,
        quantity: item.quantity,
        variants: item.variants || [],
        image: item.image,
        price: isGift ? 0 : item.price,
        currency: "MAD",
        isFreeGift: isGift,
      };
    });

    localStorage.setItem("buyNow", JSON.stringify(buyNowData));
    onClose();

    const savedAddress = localStorage.getItem("checkoutBillingDetails");
    if (savedAddress) {
      try {
        const addressData = JSON.parse(savedAddress);
        const isAddressComplete =
          addressData.customer?.fullName &&
          addressData.customer?.phone &&
          addressData.address?.address1 &&
          addressData.address?.city &&
          addressData.address?.state &&
          addressData.address?.zip;
        window.location.href = isAddressComplete ? "/checkout/payment" : "/checkout/address";
      } catch {
        window.location.href = "/checkout/address";
      }
    } else {
      window.location.href = "/checkout/address";
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      placement="right"
      size="lg"
      classNames={{
        backdrop: "bg-black/50",
        base: "max-w-md max-w-[80%] md:max-w-[22%]",
      }}
    >
      <DrawerContent>
        <DrawerHeader className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">{t("cart_title")}</h2>
            {!loading && cartItems.length > 0 && (
              <span className="bg-gray-900 text-white text-xs px-2 py-1 rounded-full">
                {getTotalItems()} {t("cart_of")} {cartItems.reduce((total, item) => total + item.quantity, 0)} {t("cart_items")}
              </span>
            )}
          </div>
        </DrawerHeader>

        <DrawerBody className="px-0">
          {!loading && cartItems.length > 0 && (
            <div className="flex items-center gap-2 ml-6">
              <input
                type="checkbox"
                id="selectAll"
                checked={cartItems.filter((i) => !i._isGift).every((item) => selectedItems[item.productId])}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="selectAll" className="text-xs text-gray-600">
                {t("cart_select_all")}
              </label>
            </div>
          )}

          {loading ? (
            <div className="px-2 space-y-4">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="flex gap-3 p-3 bg-gray-50 rounded-xl animate-pulse">
                  <div className="w-16 h-16 bg-gray-200 rounded-lg"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    <div className="h-6 bg-gray-200 rounded w-24"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <ShoppingBag className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t("cart_empty")}</h3>
              <p className="text-gray-600 text-sm mb-6">{t("cart_empty_message")}</p>
              <Button onPress={onClose} className="bg-gray-900 text-white px-6">
                {t("cart_continue_shopping")}
              </Button>
            </div>
          ) : (
            <div className="px-2 space-y-4">
              {cartItems.map((item, index) => {
                const product  = getProductDetails(item.productId);
                // Gift items with synthetic IDs (::cadeau) won't match a product — use cart item data
                if (!product && !item._isGift) return null;
                const _rawImage = item.image || product?.images?.[0] || "";
                // PERF: cart thumbnail is 56px (w-14) — sm (80px WebP) is the right size.
                const imageUrl  = thumbUrl(_rawImage, "sm") || _rawImage || "https://placehold.co/400x500?text=No+Image";
                const isFreeItem = !!item.free || !!item._isGift;

                return (
                  <div
                    key={`${item.productId}-${index}`}
                    className={`bg-white rounded-lg shadow transition-all duration-200 overflow-hidden
                      ${isFreeItem
                        ? item._isGift
                          ? "border-2 border-[#6e57b2] bg-[#f3f0ff]"
                          : "border-2 border-pink-300 bg-pink-50/30"
                        : `border border-gray-200 ${selectedItems[item.productId] ? "" : "opacity-50 bg-gray-50"}`
                      }`}
                  >
                    {/* Free Gift / Reward banner */}
                    {isFreeItem && (
                      <div className={`px-3 py-1.5 flex items-center gap-1.5 ${item._isGift ? "bg-[#6e57b2]" : "bg-gradient-to-r from-pink-500 to-rose-500"}`}>
                        <span className="text-xs">🎁</span>
                        <span className="text-xs font-bold text-white tracking-wide">
                          {item._isGift ? "+ 1 article GRATUIT" : t("spin_free_label")}
                        </span>
                      </div>
                    )}

                    <div className="p-3">
                      <div className="flex gap-3">
                        {/* Checkbox — hidden for free items (always selected) */}
                        <div className="flex items-start pt-2">
                          {isFreeItem ? (
                            <div className="w-4 h-4" /> /* spacer */
                          ) : (
                            <input
                              type="checkbox"
                              checked={selectedItems[item.productId] || false}
                              onChange={(e) => handleItemSelection(item.productId, e.target.checked)}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                            />
                          )}
                        </div>

                        <Link href={`/products/${item.productId}`} onClick={onClose}>
                          <div className="relative w-14 h-14 rounded-md overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-100">
                            <img src={imageUrl} alt={item.title} className="w-full h-full object-cover" />
                            {product?.productLabel && !isFreeItem && (
                              <div className="absolute -top-1 -right-1">
                                <ProductLabel label={product.productLabel} size="xs" />
                              </div>
                            )}
                          </div>
                        </Link>

                        <div className="flex-1 min-w-0 space-y-2">
                          <Link href={`/products/${item.productId}`} onClick={onClose}>
                            <h4 className="text-xs font-medium text-gray-900 line-clamp-1 hover:text-blue-600 transition-colors leading-tight">
                              {item.title}
                            </h4>
                          </Link>

                          {/* Price Section */}
                          <div className="space-y-1">
                            {isFreeItem ? (
                              <div className="flex items-center gap-1.5">
                                {item._isGift ? (
                                  <span className="font-black text-[#6e57b2] text-sm">GRATUIT</span>
                                ) : (
                                  <span className="font-bold text-pink-600 text-sm">0 {CURRENCY}</span>
                                )}
                              </div>
                            ) : null}
                            {!isFreeItem && ((() => {
                              const itemMRP = Number(product?.regularPrice) || Number(item.price) || 0;
                              const itemPrice = Number(item.price) || 0;
                              const totalPrice = itemPrice * item.quantity;
                              const totalMRP = itemMRP * item.quantity;
                              const discount = totalMRP - totalPrice;

                              const totalQuantity = getTotalItems();
                              const freeItemsCount = Math.floor(totalQuantity / 3) || 0;
                              let itemBuy2Get1Discount = 0;

                              if (freeItemsCount > 0) {
                                const allItems = [];
                                cartItems.forEach((cartItem) => {
                                  const isItemSelected = selectedItems[cartItem.productId];
                                  if (!isItemSelected) return;
                                  const price = Number(cartItem.price) || 0;
                                  for (let i = 0; i < cartItem.quantity; i++) {
                                    allItems.push({ productId: cartItem.productId, price });
                                  }
                                });
                                allItems.sort((a, b) => (a.price || 0) - (b.price || 0));
                                let discountedUnits = 0;
                                for (let i = 0; i < freeItemsCount && i < allItems.length; i++) {
                                  if (allItems[i].productId === item.productId) discountedUnits++;
                                }
                                itemBuy2Get1Discount = Number(discountedUnits * itemPrice) || 0;
                              }

                              return (
                                <>
                                  {discount > 0 && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-gray-400 line-through">
                                        {formatPrice(Number(totalMRP).toFixed(0))}
                                      </span>
                                      <span className="text-xs text-green-600 font-medium bg-green-50 px-1 rounded">
                                        -{formatPrice(Number(discount).toFixed(0))}
                                      </span>
                                    </div>
                                  )}
                                  <div className="font-semibold text-gray-900 text-sm">
                                    {formatPrice(Number(totalPrice - itemBuy2Get1Discount).toFixed(0))}
                                    {itemBuy2Get1Discount > 0 && (
                                      <span className="text-xs text-blue-600 ml-1 font-normal">
                                        ({t("cart_saved")} {formatPrice(Number(itemBuy2Get1Discount).toFixed(0))})
                                      </span>
                                    )}
                                  </div>
                                </>
                              );
                            })())}
                          </div>

                          {/* Quantity Controls */}
                          <div className="flex items-center justify-between">
                            {isFreeItem ? (
                              /* Free items: locked at qty 1, no +/- */
                              <div className="flex items-center bg-indigo-50 rounded-md border border-indigo-200 px-3 py-1.5">
                                <span className="text-xs font-medium text-indigo-700">✕ 1</span>
                              </div>
                            ) : (
                              <div className="flex items-center bg-gray-50 rounded-md border border-gray-200">
                                <button
                                  onClick={() => handleQuantityChange(item.productId, item.quantity - 1)}
                                  className="p-1.5 hover:bg-gray-100 rounded-l-md transition-colors"
                                  disabled={item.quantity <= 1}
                                >
                                  <Minus className="w-3 h-3 text-gray-600" />
                                </button>
                                <span className="px-2 py-1.5 text-xs font-medium text-gray-900 min-w-[1.5rem] text-center">
                                  {item.quantity}
                                </span>
                                <button
                                  onClick={() => handleQuantityChange(item.productId, item.quantity + 1)}
                                  className="p-1.5 hover:bg-gray-100 rounded-r-md transition-colors"
                                >
                                  <Plus className="w-3 h-3 text-gray-600" />
                                </button>
                              </div>
                            )}
                            {/* Free items: small dismiss button; normal items: red trash */}
                            {isFreeItem ? (
                              <button
                                onClick={() => handleRemove(item.productId)}
                                className="p-1.5 text-indigo-400 hover:bg-indigo-50 rounded-md transition-colors text-xs"
                                title="Remove free reward"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRemove(item.productId)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                title={t("cart_remove_item")}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Buy 2 Get 1 Free Badge */}
                      {(() => {
                        const totalQuantity = getTotalItems();
                        const freeItemsCount = Math.floor(totalQuantity / 3) || 0;
                        let discountedUnits = 0;

                        if (freeItemsCount > 0) {
                          const allItems = [];
                          cartItems.forEach((cartItem) => {
                            const isItemSelected = selectedItems[cartItem.productId];
                            if (!isItemSelected) return;
                            const price = Number(cartItem.price) || 0;
                            for (let i = 0; i < cartItem.quantity; i++) {
                              allItems.push({ productId: cartItem.productId, price });
                            }
                          });
                          allItems.sort((a, b) => (a.price || 0) - (b.price || 0));
                          for (let i = 0; i < freeItemsCount && i < allItems.length; i++) {
                            if (allItems[i].productId === item.productId) discountedUnits++;
                          }
                        }

                        return null;
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Gift Progress Bars */}
          {activeGifts.length > 0 && (
            <div className="px-2 space-y-2">
              {activeGifts.map((gift) => {
                const subtotal   = getNonGiftSubtotal();
                const threshold  = gift.thresholdAmount;
                const isUnlocked = subtotal >= threshold;
                const pct        = Math.min(100, Math.round((subtotal / threshold) * 100));
                const remaining  = Math.ceil(threshold - subtotal);
                const giftProduct = products.find(
                  (p) => p._id === gift.productId || p.id === gift.productId
                );
                const giftImage = giftProduct?.images?.[0]?.url || giftProduct?.images?.[0] || null;
                return (
                  <div
                    key={gift.id}
                    className={`rounded-xl border px-3 py-2.5 text-xs ${
                      isUnlocked
                        ? "bg-green-50 border-green-200"
                        : "bg-pink-50 border-pink-100"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Gift image — always visible */}
                      <div className={`w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border-2 ${
                        isUnlocked ? "border-green-300" : "border-pink-200"
                      } ${!isUnlocked ? "opacity-80 grayscale-[30%]" : ""}`}>
                        {giftImage ? (
                          <img src={giftImage} alt={giftProduct?.title || "Cadeau"} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-pink-100 text-2xl">🎁</div>
                        )}
                      </div>

                      {/* Text + progress */}
                      <div className="flex-1 min-w-0">
                        {/* Gift name always shown */}
                        {giftProduct?.title && (
                          <p className={`font-semibold text-[11px] leading-tight mb-0.5 truncate ${
                            isUnlocked ? "text-green-700" : "text-gray-700"
                          }`}>
                            🎁 {giftProduct.title}
                          </p>
                        )}

                        {/* Status message */}
                        {isUnlocked ? (
                          <p className="text-green-600 font-medium text-[11px]">{t("gift_progress_unlocked")}</p>
                        ) : (
                          <p className="text-pink-600 font-medium text-[11px]">
                            Ajoutez encore <span className="font-bold">{remaining} {CURRENCY}</span> pour débloquer
                          </p>
                        )}

                        {/* Progress bar */}
                        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden mt-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-500 ${
                              isUnlocked ? "bg-green-500" : "bg-pink-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-0.5 text-gray-400 text-[10px]">
                          <span>{Math.round(subtotal)} {CURRENCY}</span>
                          <span>{threshold} {CURRENCY}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Price Summary */}
          <div className="px-2">
            {(() => {
              const { totalMRP, discountOnMRP, buy2Get1Discount, totalAmount, freeItemsCount } = getDiscountDetails();
              return (
                <div className="w-full bg-white rounded-lg border border-gray-200 shadow-sm p-3 space-y-2">
                  <div className="flex justify-between text-xs text-gray-700">
                    <span>{t("cart_total_mrp")}</span>
                    <span className="font-medium">{formatPrice(Number(totalMRP).toFixed(0))}</span>
                  </div>
                  {Number(discountOnMRP) > 0 && (
                    <div className="flex justify-between text-xs text-green-600">
                      <span>{t("cart_discount_on_mrp")}</span>
                      <span className="font-medium">-{formatPrice(Number(discountOnMRP).toFixed(0))}</span>
                    </div>
                  )}
                  {Number(discountOnMRP) > 0 && (
                    <div className="flex justify-between text-xs text-gray-700">
                      <span>{t("cart_total_price")}</span>
                      <span className="font-semibold">{formatPrice(Number(totalMRP - discountOnMRP).toFixed(0))}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center border-t border-gray-200 pt-2 mt-2">
                    <span className="text-sm font-semibold text-gray-900">{t("cart_total_amount")}</span>
                    <span className="text-sm font-bold text-gray-900">{formatPrice(Number(totalAmount).toFixed(0))}</span>
                  </div>
                  <div className="text-xs text-gray-500 text-center">
                    {t("cart_items_selected")
                      .replace("{selected}", getTotalItems())
                      .replace("{total}", cartItems.reduce((total, item) => total + item.quantity, 0))}
                  </div>
                </div>
              );
            })()}
          </div>
        </DrawerBody>

        {!loading && cartItems.length > 0 && getTotalItems() > 0 && (
          <DrawerFooter className="flex-col gap-3 pt-3 border-t border-gray-200">
            <Button
              onPress={handleCheckout}
              className="w-full bg-gray-900 text-white h-11 rounded-lg font-semibold text-sm mt-2 shadow-sm hover:bg-gray-800 transition-colors"
            >
              {t("cart_pay_now")}
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
