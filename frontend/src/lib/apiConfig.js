/**
 * API Configuration
 * Centralized API endpoint management
 *
 * Provides consistent API endpoint across all components
 */

export const getDefaultBackendUrl = () => {
  // Prefer the browser's origin at runtime so built assets use the page's host
  // (this ensures the UI will call the local backend when served locally).
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }

  // Fallback to localhost for non-browser environments
  return 'http://localhost:8000';
};

// Prefer env override; otherwise localhost in local browser, production API elsewhere
export const BACKEND_BASE_URL = process.env.REACT_APP_BACKEND_URL || getDefaultBackendUrl();

// API endpoint for auth and general API calls
export const API_ENDPOINT = `${BACKEND_BASE_URL}/api`;

// Export for debugging
export const getApiConfig = () => ({
  backendUrl: BACKEND_BASE_URL,
  apiEndpoint: API_ENDPOINT,
  env: process.env.REACT_APP_ENV || 'unknown',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
});

// Debug log in development
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 API Configuration:', getApiConfig());
}

export default API_ENDPOINT;
