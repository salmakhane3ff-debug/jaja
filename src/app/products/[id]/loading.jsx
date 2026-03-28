"use client";

import { Skeleton } from "@heroui/skeleton";

export default function Loading() {
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
              <Skeleton className="w-full h-8 rounded" />
              <Skeleton className="w-3/4 h-6 rounded" />

              <div className="flex items-center gap-2">
                <Skeleton className="w-16 h-6 rounded" />
                <Skeleton className="w-24 h-4 rounded" />
              </div>

              <div className="border-t border-b border-gray-200 py-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-12 h-5 rounded" />
                  <Skeleton className="w-24 h-8 rounded" />
                </div>
                <Skeleton className="w-32 h-4 rounded" />
                <Skeleton className="w-28 h-4 rounded" />
                <Skeleton className="w-40 h-5 rounded" />
              </div>

              <Skeleton className="w-20 h-8 rounded" />

              <div className="space-y-2">
                <Skeleton className="w-16 h-5 rounded" />
                <Skeleton className="w-full h-4 rounded" />
                <Skeleton className="w-full h-4 rounded" />
              </div>

              <div className="space-y-2">
                <Skeleton className="w-12 h-5 rounded" />
                <div className="flex gap-2">
                  {[...Array(4)].map((_, index) => (
                    <Skeleton key={index} className="w-12 h-10 rounded" />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Skeleton className="w-20 h-5 rounded" />
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded" />
                  <Skeleton className="w-8 h-6 rounded" />
                  <Skeleton className="w-9 h-9 rounded" />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <Skeleton className="w-full h-12 rounded-full" />
                <Skeleton className="w-full h-12 rounded-full" />
              </div>

              <div className="flex gap-3">
                <Skeleton className="flex-1 h-10 rounded-lg" />
                <Skeleton className="flex-1 h-10 rounded-lg" />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-200">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="w-full h-6 rounded" />
                ))}
              </div>

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
