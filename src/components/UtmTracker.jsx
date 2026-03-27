"use client";

import { useEffect } from 'react';
import { initUtmTracking } from '@/utils/utmTracking';

/**
 * Simple UTM Tracker Component
 * Checks for utm_source in URL and stores it
 */
export default function UtmTracker() {
  useEffect(() => {
    // Check for utm_source on page load
    initUtmTracking();
  }, []);

  // This component doesn't render anything
  return null;
}