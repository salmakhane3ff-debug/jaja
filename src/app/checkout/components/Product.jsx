"use client";
import { useEffect, useState } from "react";

export default function useBuyNowProducts() {
  const [fetchedProducts, setFetchedProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const local = JSON.parse(localStorage.getItem("buyNow") || "[]");

    async function fetchData() {
      try {
        const productRes = await fetch("/api/products", {
      
        });
        const allProducts = await productRes.json();

        const ids = local.map((item) => item.productId);
        const filteredProducts = allProducts.filter((p) => ids.includes(p._id));

        // DB-matched items
        const dbItems = filteredProducts.map((product) => {
          const localItem = local.find((i) => i.productId === product._id);
          const isFreeGift = !!(localItem?.isFreeGift || localItem?._isGift);
          return {
            ...product,
            quantity: localItem?.quantity || 1,
            color: localItem?.color || null,
            size: localItem?.size || null,
            image: localItem?.image || product.images?.[0],
            isFreeGift,
            salePrice:    isFreeGift ? 0 : (localItem?.price ?? product.salePrice),
            regularPrice: isFreeGift ? 0 : (localItem?.price ?? product.regularPrice),
          };
        });

        // Gift items not found in DB (synthetic ::cadeau IDs) — use localStorage data directly
        const matchedIds = new Set(filteredProducts.map((p) => p._id));
        const orphanGifts = local
          .filter((i) => (i._isGift || i.isFreeGift) && !matchedIds.has(i.productId))
          .map((i) => ({
            _id:         i.productId,
            title:       i.title,
            image:       i.image || "",
            images:      [i.image || ""],
            quantity:    i.quantity || 1,
            color:       i.color || null,
            size:        i.size || null,
            isFreeGift:  true,
            salePrice:   0,
            regularPrice: 0,
            price:       0,
          }));

        setFetchedProducts([...dbItems, ...orphanGifts]);
      } catch (err) {
        console.error("Error fetching products:", err);
        setFetchedProducts([]);
      } finally {
        setLoading(false);
      }
    }

    if (local.length > 0) fetchData();
    else setLoading(false);
  }, []);

  return {
    items: fetchedProducts,
    loading,
  };
}
