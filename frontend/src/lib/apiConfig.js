/**
 * API Configuration
 * Centralized API endpoint management
 * 
 * Provides consistent API endpoint across all components
 */

// Get backend URL from environment variable or use production endpoint
export const BACKEND_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.resoline.com';

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
