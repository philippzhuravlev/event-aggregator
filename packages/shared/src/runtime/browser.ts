import { API_TIMEOUT_MS, DEFAULT_PAGE_SIZE } from "../config/index.js";
import { stringToBoolean } from "./base.js";

export interface BrowserEnvLike {
  MODE?: string;
  NODE_ENV?: string;
  VITE_BACKEND_URL?: string;
  VITE_USE_SUPABASE?: string | boolean;
  VITE_USE_BACKEND_API?: string | boolean;
}

export interface BrowserRuntimeConfig {
  backendUrl: string;
  useSupabase: boolean;
  useBackendApi: boolean;
  nodeEnv: string;
  isDevelopment: boolean;
  isProduction: boolean;
  apiTimeoutMs: number;
  defaultPageSize: number;
}

const DEFAULT_BACKEND_URL = "/api";
const DEFAULT_ENVIRONMENT = "development";

export const createBrowserRuntimeConfig = (
  env: BrowserEnvLike,
  options: { fallbackBackendUrl?: string } = {},
): BrowserRuntimeConfig => {
  const nodeEnv = env.MODE ?? env.NODE_ENV ?? DEFAULT_ENVIRONMENT;

  const backendUrl =
    (typeof env.VITE_BACKEND_URL === "string" && env.VITE_BACKEND_URL.trim()) ||
    options.fallbackBackendUrl ||
    DEFAULT_BACKEND_URL;

  return {
    backendUrl,
    useSupabase: stringToBoolean(env.VITE_USE_SUPABASE),
    useBackendApi: stringToBoolean(env.VITE_USE_BACKEND_API),
    nodeEnv,
    isDevelopment: nodeEnv === "development",
    isProduction: nodeEnv === "production",
    apiTimeoutMs: API_TIMEOUT_MS,
    defaultPageSize: DEFAULT_PAGE_SIZE,
  };
};

