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

        const finalProducts = filteredProducts.map((product) => {
          const localItem = local.find((i) => i.productId === product._id);
          const isFreeGift = !!(localItem?.isFreeGift);
          return {
            ...product,
            quantity: localItem?.quantity || 1,
            color: localItem?.color || null,
            size: localItem?.size || null,
            image: localItem?.image || product.images?.[0],
            isFreeGift,
            // Gift items are always 0; normal items use the cart price (includes discount)
            salePrice:    isFreeGift ? 0 : (localItem?.price ?? product.salePrice),
            regularPrice: isFreeGift ? 0 : (localItem?.price ?? product.regularPrice),
          };
        });

        setFetchedProducts(finalProducts);
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
