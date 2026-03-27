"use client";

import React, { useEffect, useMemo, useState } from "react";

export default function Footer() {
  const [storeSettings, setStoreSettings] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/setting?type=store", {
          cache: "force-cache",
          next: { revalidate: 300 } // Cache for 5 minutes
        });
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          setStoreSettings(data);
        }
      } catch (err) {
        console.error("Failed to load store settings:", err);
      }
    };

    fetchSettings();
  }, []);

  const storeName = useMemo(() => storeSettings?.footerTextLogo || storeSettings?.storeName || "Shop Gold", [storeSettings]);

  return (
    <footer className="relative bg-gray-50">
      {/* Main Footer Content */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 md:py-8 sm:py-12">
          <div className="flex flex-col items-center gap-4 py-6">
            {/* Logo */}
            {storeSettings?.footerLogo ? (
              <img src={storeSettings.footerLogo} alt={storeName} className="h-10 w-auto object-contain" />
            ) : (
              <h3 className="text-xl font-bold text-gray-900">{storeName}</h3>
            )}

            {/* Description */}
            <p className="text-gray-600 text-xs sm:text-sm leading-relaxed max-w-md text-center">
              {storeSettings?.footerAbout || storeSettings?.websiteDescription || "Discover premium products with unmatched quality. Your satisfaction is our priority, and excellence is our standard."}
            </p>
          </div>
        </div>
      </div>{" "}
      {/* Bottom Bar */}
      <div className="bg-gray-100 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0">
            <p className="text-xs text-gray-500 text-center">{storeSettings?.copyrightText || `© ${new Date().getFullYear()} ${storeName}. All rights reserved.`}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
