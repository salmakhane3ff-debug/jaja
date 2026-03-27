"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Product from "./product";
import { Skeleton } from "@heroui/skeleton";

// Skeleton loading component for product page
function ProductSkeleton() {
  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Main Product Section */}
      <div className="bg-white">
        <div className="container mx-auto px-4 md:px-8 lg:px-16 py-4 md:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
            {/* Left: Product Gallery Skeleton */}
            <div className="space-y-4">
              <Skeleton className="w-full h-96 md:h-[500px] rounded-lg" />
              <div className="flex gap-2">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="w-16 h-16 md:w-20 md:h-20 rounded-lg" />
                ))}
              </div>
            </div>

            {/* Right: Product Details Skeleton */}
            <div className="space-y-4">
              {/* Title */}
              <Skeleton className="w-full h-8 rounded" />
              <Skeleton className="w-3/4 h-6 rounded" />

              {/* Rating */}
              <div className="flex items-center gap-2">
                <Skeleton className="w-16 h-6 rounded" />
                <Skeleton className="w-24 h-4 rounded" />
              </div>

              {/* Price */}
              <div className="border-t border-b border-gray-200 py-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-12 h-5 rounded" />
                  <Skeleton className="w-24 h-8 rounded" />
                </div>
                <Skeleton className="w-32 h-4 rounded" />
                <Skeleton className="w-28 h-4 rounded" />
                <Skeleton className="w-40 h-5 rounded" />
              </div>

              {/* Stock Status */}
              <Skeleton className="w-20 h-8 rounded" />

              {/* Offers */}
              <div className="space-y-2">
                <Skeleton className="w-16 h-5 rounded" />
                <Skeleton className="w-full h-4 rounded" />
                <Skeleton className="w-full h-4 rounded" />
              </div>

              {/* Size Selector */}
              <div className="space-y-2">
                <Skeleton className="w-12 h-5 rounded" />
                <div className="flex gap-2">
                  {[...Array(4)].map((_, index) => (
                    <Skeleton key={index} className="w-12 h-10 rounded" />
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <Skeleton className="w-20 h-5 rounded" />
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded" />
                  <Skeleton className="w-8 h-6 rounded" />
                  <Skeleton className="w-9 h-9 rounded" />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <Skeleton className="w-full h-12 rounded-full" />
                <Skeleton className="w-full h-12 rounded-full" />
              </div>

              {/* Wishlist & Share */}
              <div className="flex gap-3">
                <Skeleton className="flex-1 h-10 rounded-lg" />
                <Skeleton className="flex-1 h-10 rounded-lg" />
              </div>

              {/* Trust Badges */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-200">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="w-full h-6 rounded" />
                ))}
              </div>

              {/* Description */}
              <div className="space-y-2 pt-4 border-t border-gray-200">
                <Skeleton className="w-32 h-5 rounded" />
                <Skeleton className="w-full h-4 rounded" />
                <Skeleton className="w-full h-4 rounded" />
                <Skeleton className="w-3/4 h-4 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Related Products Section Skeleton */}
      <div className="py-8 bg-white">
        <div className="container mx-auto px-4 md:px-8 lg:px-16">
          <Skeleton className="w-48 h-8 mb-4 rounded" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="w-full aspect-square rounded-lg" />
                <Skeleton className="w-full h-4 rounded" />
                <Skeleton className="w-3/4 h-4 rounded" />
                <Skeleton className="w-1/2 h-5 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Component for product not found
function ProductNotFound() {
  return (
    <div className="container mx-auto px-4 md:px-20 py-12 sm:py-20 text-center">
      <div className="max-w-md mx-auto">
        <div className="mb-6 sm:mb-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
              />
            </svg>
          </div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 mb-3 sm:mb-4">Product Not Found</h1>
          <p className="text-xs sm:text-sm text-gray-600 mb-6 sm:mb-8">Sorry, the product you're looking for doesn't exist or has been removed.</p>
          <div className="space-y-3 sm:space-y-4">
            <a className="text-xs text-gray-700" href="/products" aria-label="All Products">
              Browse All Products
            </a>
            <br />
            <a href="/" className="inline-block text-gray-600 hover:text-gray-800 text-xs sm:text-sm font-medium transition-colors duration-200">
              Return to Home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const params = useParams();
  const { id } = params;
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const res = await fetch(`/api/product/${id}`, );

        if (!res.ok) {
          setError(true);
          return;
        }

        const data = await res.json();

        if (!data || Object.keys(data).length === 0) {
          setError(true);
          return;
        }

        setProduct(data);
      } catch (err) {
        console.error("Error fetching product:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  if (loading) {
    return <ProductSkeleton />;
  }

  if (error || !product) {
    return <ProductNotFound />;
  }

  return <Product data={product} />;
}
