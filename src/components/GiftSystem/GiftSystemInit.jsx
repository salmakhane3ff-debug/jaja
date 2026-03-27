"use client";

/**
 * GiftSystemInit — renders nothing, lives in the root layout.
 *
 * Responsibilities:
 *  1. Fetch active gifts from /api/gifts once on mount.
 *  2. Listen for "cartUpdated" events.
 *  3. On every cart change:
 *     - Compute the non-gift cart subtotal.
 *     - Add gift items for every active gift whose threshold is met.
 *     - Remove gift items whose threshold is no longer met.
 *  4. If the cart actually changed, write back to localStorage and
 *     dispatch "cartUpdated" (guarded by a syncing flag to prevent loops).
 */

import { useEffect } from "react";

function getImageUrl(images) {
  if (!images) return "";
  if (typeof images === "string") return images;
  if (Array.isArray(images)) {
    const first = images[0];
    if (!first) return "";
    return first?.url || first?.src || (typeof first === "string" ? first : "");
  }
  return "";
}

export default function GiftSystemInit() {
  useEffect(() => {
    let gifts = [];
    let products = [];
    let initialized = false;
    let syncing = false;

    const syncGifts = () => {
      if (!initialized || syncing) return;
      syncing = true;

      try {
        const cart = JSON.parse(localStorage.getItem("cart") || "[]");

        // Non-gift subtotal (gifts themselves are price=0, but exclude them anyway)
        const subtotal = cart.reduce((sum, item) => {
          if (item._isGift) return sum;
          return sum + (parseFloat(item.price) || 0) * (item.quantity || 1);
        }, 0);

        const nonGiftItems = cart.filter((i) => !i._isGift);
        const newGiftItems = [];

        for (const gift of gifts) {
          if (!gift.active) continue;
          if (subtotal < gift.thresholdAmount) continue;

          const product = products.find(
            (p) => p._id === gift.productId || p.id === gift.productId
          );
          if (!product) continue;

          // Avoid duplicates (same gift already present)
          const alreadyIn = newGiftItems.some((i) => i._giftId === gift.id);
          if (alreadyIn) continue;

          newGiftItems.push({
            productId: gift.productId,
            title: product.title,
            quantity: 1,
            price: 0,
            image: getImageUrl(product.images),
            currency: "MAD",
            _isGift: true,
            _giftId: gift.id,
          });
        }

        // Compare existing gift ids vs new gift ids
        const existingIds = cart
          .filter((i) => i._isGift)
          .map((i) => i._giftId)
          .sort()
          .join(",");
        const newIds = newGiftItems
          .map((i) => i._giftId)
          .sort()
          .join(",");

        if (existingIds !== newIds) {
          localStorage.setItem(
            "cart",
            JSON.stringify([...nonGiftItems, ...newGiftItems])
          );
          // Dispatch so CartDrawer / Cart page re-render
          window.dispatchEvent(new CustomEvent("cartUpdated"));
        }
      } finally {
        syncing = false;
      }
    };

    const handleCartUpdate = () => syncGifts();

    const init = async () => {
      try {
        const [giftsRes, productsRes] = await Promise.all([
          fetch("/api/gifts"),
          fetch("/api/product"),
        ]);
        if (giftsRes.ok) gifts = await giftsRes.json();
        if (productsRes.ok) products = await productsRes.json();
        initialized = true;
        syncGifts(); // run once immediately after loading
      } catch (e) {
        console.error("GiftSystemInit:", e);
      }
    };

    window.addEventListener("cartUpdated", handleCartUpdate);
    init();

    return () => window.removeEventListener("cartUpdated", handleCartUpdate);
  }, []);

  return null;
}
