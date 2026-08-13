/**
 * API Configuration
 * Local UI talks to the production API unless REACT_APP_USE_LOCAL_API=true.
 */

export const PRODUCTION_BACKEND_URL = 'https://api.resoline.in';
export const LOCAL_BACKEND_URL = 'http://localhost:8000';

function resolveBackendUrl() {
  if (process.env.REACT_APP_USE_LOCAL_API === 'true') {
    return LOCAL_BACKEND_URL;
  }
  const fromEnv = String(process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/$/, '');
  if (fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)) {
    return fromEnv;
  }
  return PRODUCTION_BACKEND_URL;
}

export const BACKEND_BASE_URL = resolveBackendUrl();
export const API_ENDPOINT = `${BACKEND_BASE_URL}/api`;

export const getApiConfig = () => ({
  backendUrl: BACKEND_BASE_URL,
  apiEndpoint: API_ENDPOINT,
  env: process.env.REACT_APP_ENV || 'unknown',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
});

if (process.env.NODE_ENV === 'development') {
  console.log('🔧 API Configuration:', getApiConfig());
}

export default API_ENDPOINT;
