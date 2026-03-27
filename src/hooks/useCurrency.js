"use client";

import { useState, useEffect } from "react";

export const useCurrency = () => {
  const [currency, setCurrency] = useState({
    currency: "INR",
    symbol: "₹"
  });

  useEffect(() => {
    // Get currency from localStorage
    const getCachedCurrency = () => {
      try {
        const cachedCurrency = localStorage.getItem("store_currency");
        if (cachedCurrency) {
          const parsed = JSON.parse(cachedCurrency);
          setCurrency({
            currency: parsed.currency || "INR",
            symbol: parsed.symbol || "₹"
          });
        }
      } catch (error) {
        console.error("Failed to get cached currency:", error);
        setCurrency({ currency: "INR", symbol: "₹" });
      }
    };

    // Get initial currency
    getCachedCurrency();

    // Listen for storage changes (when currency is updated in settings)
    const handleStorageChange = (e) => {
      if (e.key === "store_currency") {
        getCachedCurrency();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    
    // Also listen for custom events for same-tab updates
    const handleCurrencyUpdate = () => {
      getCachedCurrency();
    };
    
    window.addEventListener("currencyUpdated", handleCurrencyUpdate);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("currencyUpdated", handleCurrencyUpdate);
    };
  }, []);

  const updateCurrency = (newCurrency, newSymbol) => {
    const currencyData = {
      currency: newCurrency,
      symbol: newSymbol,
      lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem("store_currency", JSON.stringify(currencyData));
    setCurrency({ currency: newCurrency, symbol: newSymbol });
    
    // Dispatch custom event for same-tab updates
    window.dispatchEvent(new CustomEvent("currencyUpdated"));
  };

  return {
    ...currency,
    updateCurrency
  };
};