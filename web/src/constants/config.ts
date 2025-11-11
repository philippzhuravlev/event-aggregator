/**
 * Frontend configuration constants
 * Environment variables and application settings
 *
 * Note: In the browser (Vite), use import.meta.env
 * Environment variables must be prefixed with VITE_ to be accessible in the browser
 */

/**
 * Backend API base URL
 * Falls back to '/api' for relative routing
 */
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "/api";

/**
 * Feature flag: Use Supabase for data access
 */
export const USE_SUPABASE = String(
    import.meta.env?.VITE_USE_SUPABASE || "",
).toLowerCase() === "true";

/**
 * Feature flag: Use backend API instead of direct Supabase calls
 */
export const USE_BACKEND_API = String(
    import.meta.env?.VITE_USE_BACKEND_API || "",
).toLowerCase() === "true";

/**
 * Pagination: Default number of events per page
 */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * API request timeout in milliseconds
 */
export const API_TIMEOUT_MS = 10000;

/**
 * Application environment
 */
export const NODE_ENV = import.meta.env.MODE;

/**
 * Check if running in development mode
 */
export const isDevelopment = NODE_ENV === "development";

/**
 * Check if running in production mode
 */
export const isProduction = NODE_ENV === "production";
