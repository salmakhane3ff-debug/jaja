// Utility to get currency info from store settings or environment
export async function getCurrencyInfo() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/setting?type=store`, {
      cache: "no-store",
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data && data.currencySymbol) {
        return {
          symbol: data.currencySymbol,
          code: data.storeCurrency || "USD",
        };
      }
    }
  } catch (error) {
    console.error("Failed to fetch currency info:", error);
  }
  
  // Fallback to environment variables
  return {
    symbol: process.env.NEXT_PUBLIC_STORE_CURRENCY_SYMBOL || "$",
    code: process.env.NEXT_PUBLIC_STORE_CURRENCY || "USD",
  };
}

// Client-side hook
export async function fetchCurrencyInfo() {
  try {
    const res = await fetch("/api/setting?type=store", {
      cache: "force-cache",
      next: { revalidate: 300 }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.currencySymbol) {
        return {
          symbol: data.currencySymbol,
          code: data.storeCurrency || "USD",
        };
      }
    }
  } catch (error) {
    console.error("Failed to fetch currency info:", error);
  }
  
  return {
    symbol: "$",
    code: "USD",
  };
}
