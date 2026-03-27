/**
 * Simple UTM Source Tracking
 * Only tracks utm_source parameter from URL
 */

/**
 * Get utm_source from current URL
 * @returns {string|null} - The utm_source value or null
 */
export function getUtmSourceFromUrl() {
  if (typeof window === 'undefined') return null;
  
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('utm_source');
}

/**
 * Store utm_source in localStorage
 * @param {string} utmSource - The utm_source to store
 */
export function storeUtmSource(utmSource) {
  if (utmSource && typeof window !== 'undefined') {
    try {
      localStorage.setItem('utm_source', utmSource);
      console.log('UTM source stored:', utmSource);
    } catch (error) {
      console.error('Failed to store UTM source:', error);
    }
  }
}

/**
 * Get stored utm_source from localStorage
 * @returns {string} - Stored utm_source or 'direct'
 */
export function getStoredUtmSource() {
  if (typeof window === 'undefined') return 'direct';
  
  try {
    return localStorage.getItem('utm_source') || 'direct';
  } catch (error) {
    console.error('Failed to get UTM source:', error);
    return 'direct';
  }
}

/**
 * Initialize UTM tracking - check URL and store if found
 */
export function initUtmTracking() {
  const utmSource = getUtmSourceFromUrl();
  if (utmSource) {
    storeUtmSource(utmSource);
  }
}