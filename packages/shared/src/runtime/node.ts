import process from "node:process";

export {
  CONTENT_TYPES,
  ERROR_CODES,
  FACEBOOK,
  FACEBOOK_API,
  FACEBOOK_ORIGIN,
  HTTP_HEADERS,
  HTTP_STATUS,
  IMAGE_SERVICE,
  PAGINATION,
  RATE_LIMITS,
  REQUEST_SIZE_LIMITS,
  SERVER_ERROR_RANGE,
  TIME,
  TOKEN_REFRESH_DEFAULTS,
  API_TIMEOUT_MS,
  DEFAULT_PAGE_SIZE,
} from "../config/index.ts";

import {
  createBaseCorsHeaders,
  createCorsHeaders,
  createEventSyncConfig,
  createTokenExpiryConfig,
  createTokenRefreshConfig,
  resolveAllowedOrigins,
  resolveCorsOrigin,
  resolveEnvironmentFlags,
  resolveOAuthCallbackUrl,
  resolveWebAppUrl,
  type EnvGetter,
} from "./base.ts";

const envGetter: EnvGetter = (key) => process.env[key];

export const TOKEN_REFRESH = createTokenRefreshConfig(envGetter);

export const TOKEN_EXPIRY_CONFIG = createTokenExpiryConfig(TOKEN_REFRESH);

export const EVENT_SYNC = createEventSyncConfig();

export const CORS_HEADERS = createBaseCorsHeaders();

export const getCORSHeaders = (requestOrigin?: string) => {
  const origin = requestOrigin ?? resolveCorsOrigin(envGetter);
  return createCorsHeaders(origin);
};

const WEB_APP_URL = resolveWebAppUrl(envGetter);
const OAUTH_CALLBACK_URL = resolveOAuthCallbackUrl(envGetter);

export const URLS = {
  WEB_APP: WEB_APP_URL,
  OAUTH_CALLBACK: OAUTH_CALLBACK_URL,
} as const;

export const ALLOWED_ORIGINS = resolveAllowedOrigins(envGetter, WEB_APP_URL);

const ENVIRONMENT_FLAGS = resolveEnvironmentFlags(envGetter);

export const IS_PRODUCTION = ENVIRONMENT_FLAGS.isProduction;
export const IS_DEVELOPMENT = ENVIRONMENT_FLAGS.isDevelopment;
export const IS_TESTING = ENVIRONMENT_FLAGS.isTesting;

