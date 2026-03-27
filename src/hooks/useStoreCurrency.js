import { useState, useEffect } from 'react';

export function useStoreCurrency() {
  const [currencyInfo, setCurrencyInfo] = useState({
    symbol: '$',
    code: 'USD',
    loading: true
  });

  useEffect(() => {
    const fetchCurrency = async () => {
      try {
        const res = await fetch('/api/setting?type=store');
        if (res.ok) {
          const data = await res.json();
          setCurrencyInfo({
            symbol: data?.currencySymbol || '$',
            code: data?.storeCurrency || 'USD',
            loading: false
          });
        } else {
          setCurrencyInfo({
            symbol: '$',
            code: 'USD',
            loading: false
          });
        }
      } catch (error) {
        console.error('Failed to fetch currency info:', error);
        setCurrencyInfo({
          symbol: '$',
          code: 'USD',
          loading: false
        });
      }
    };

    fetchCurrency();
  }, []);

  return currencyInfo;
}