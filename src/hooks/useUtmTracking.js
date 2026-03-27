"use client";

import { useState, useEffect } from 'react';
import { getStoredUtmData, initializeUtmTracking } from '@/utils/utmTracking';

/**
 * Custom hook for UTM tracking
 * @returns {object} UTM data and utility functions
 */
export function useUtmTracking() {
  const [utmData, setUtmData] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize tracking and get current data
    const currentUtm = initializeUtmTracking();
    const storedUtm = getStoredUtmData();
    
    // Use current UTM if available, otherwise use stored
    const finalUtm = Object.keys(currentUtm).length > 0 ? currentUtm : storedUtm;
    
    setUtmData(finalUtm);
    setIsLoading(false);
  }, []);

  const refreshUtmData = () => {
    const storedUtm = getStoredUtmData();
    setUtmData(storedUtm);
  };

  return {
    utmData,
    isLoading,
    refreshUtmData,
    hasUtmData: Object.keys(utmData).length > 0
  };
}