/**
 * Frontend configuration constants
 * Environment variables and application settings
 *
 * Note: In the browser (Vite), use import.meta.env
 * Environment variables must be prefixed with VITE_ to be accessible in the browser
 */

import { createBrowserRuntimeConfig } from "@event-aggregator/shared/runtime/browser";
import {
    API_TIMEOUT_MS,
    DEFAULT_PAGE_SIZE,
} from "@event-aggregator/shared/config/index";

const browserEnv =
  typeof import.meta !== "undefined" && import.meta?.env
    ? import.meta.env
    : {};

const WEB_RUNTIME_CONFIG = createBrowserRuntimeConfig(browserEnv);

/**
 * Backend API base URL
 * Falls back to '/api' for relative routing
 */
export const BACKEND_URL = WEB_RUNTIME_CONFIG.backendUrl;

/**
 * Feature flag: Use Supabase for data access
 */
export const USE_SUPABASE = WEB_RUNTIME_CONFIG.useSupabase;

/**
 * Feature flag: Use backend API instead of direct Supabase calls
 */
export const USE_BACKEND_API = WEB_RUNTIME_CONFIG.useBackendApi;

export { API_TIMEOUT_MS, DEFAULT_PAGE_SIZE };

/**
 * Application environment
 */
export const NODE_ENV = WEB_RUNTIME_CONFIG.nodeEnv;

/**
 * Check if running in development mode
 */
export const isDevelopment = WEB_RUNTIME_CONFIG.isDevelopment;

/**
 * Check if running in production mode
 */
export const isProduction = WEB_RUNTIME_CONFIG.isProduction;

export { WEB_RUNTIME_CONFIG };
