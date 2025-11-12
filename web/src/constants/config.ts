/**
 * Frontend configuration constants
 * Environment variables and application settings
 *
 * Note: In the browser (Vite), use import.meta.env
 * Environment variables must be prefixed with VITE_ to be accessible in the browser
 */

import { createBrowserConfig } from "@utils/runtime/browser";

const BROWSER_CONFIG = createBrowserConfig(import.meta.env);

/**
 * Backend API base URL
 * Falls back to '/api' for relative routing
 */
export const BACKEND_URL = BROWSER_CONFIG.backendUrl;

/**
 * Feature flag: Use Supabase for data access
 */
export const USE_SUPABASE = BROWSER_CONFIG.useSupabase;

/**
 * Feature flag: Use backend API instead of direct Supabase calls
 */
export const USE_BACKEND_API = BROWSER_CONFIG.useBackendApi;

export { API_TIMEOUT_MS, DEFAULT_PAGE_SIZE } from "@utils/constants";

/**
 * Application environment
 */
export const NODE_ENV = BROWSER_CONFIG.nodeEnv;

/**
 * Check if running in development mode
 */
export const isDevelopment = BROWSER_CONFIG.isDevelopment;

/**
 * Check if running in production mode
 */
export const isProduction = BROWSER_CONFIG.isProduction;

export { BROWSER_CONFIG };
