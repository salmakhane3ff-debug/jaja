/**
 * giftUtils.js — shared gift eligibility logic.
 *
 * Used by:
 *  - product.jsx  (Buy Now flow)
 *  - checkout/address/page.jsx  (safety recalculation on mount)
 *
 * Format of gift items written to buyNow / used in checkout:
 *  { productId, title, quantity:1, color:null, size:null,
 *    image, price:0, currency:"MAD",
 *    isFreeGift:true, minOrderAmount:<threshold> }
 */

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

/**
 * Fetch active gifts from the API, calculate eligibility against
 * `nonGiftItems`, and return the merged array:
 *   [...nonGiftItems, ...eligibleGiftItems]
 *
 * Safe to call from Buy Now and checkout — never throws, always returns
 * at least `nonGiftItems` unchanged on error.
 *
 * @param {Array} nonGiftItems  Items WITHOUT any gift entries (price > 0 products).
 * @returns {Promise<Array>}    nonGiftItems + any newly earned gift items.
 */
export async function applyGiftsToItems(nonGiftItems) {
  try {
    const [giftsRes, productsRes] = await Promise.all([
      fetch("/api/gifts"),
      fetch("/api/products"),
    ]);

    if (!giftsRes.ok || !productsRes.ok) return nonGiftItems;

    const gifts   = await giftsRes.json();
    const products = await productsRes.json();

    // Subtotal of the real (non-gift) items
    const subtotal = nonGiftItems.reduce(
      (sum, item) => sum + (parseFloat(item.price) || 0) * (item.quantity || 1),
      0,
    );

    const giftItems = [];

    for (const gift of gifts) {
      if (!gift.active) continue;
      if (subtotal < gift.thresholdAmount) continue;

      const product = products.find(
        (p) => p._id === gift.productId || p.id === gift.productId,
      );
      if (!product) continue;

      // Deduplicate by gift id
      if (giftItems.some((g) => g._giftId === gift.id)) continue;

      giftItems.push({
        productId:      gift.productId,
        title:          product.title,
        quantity:       1,
        color:          null,
        size:           null,
        image:          getImageUrl(product.images),
        price:          0,
        currency:       "MAD",
        isFreeGift:     true,
        minOrderAmount: gift.thresholdAmount,
        // Keep internal id so callers can deduplicate on re-runs
        _giftId:        gift.id,
      });
    }

    return [...nonGiftItems, ...giftItems];
  } catch (err) {
    console.error("applyGiftsToItems:", err);
    return nonGiftItems; // never break the Buy Now / checkout flow
  }
}
