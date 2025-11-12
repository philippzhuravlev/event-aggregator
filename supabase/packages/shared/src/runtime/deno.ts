declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

export {
  CONTENT_TYPES,
  DEFAULT_ALLOWED_ORIGINS,
  ERROR_CODES,
  EVENT_SYNC_DEFAULTS,
  EVENT_SYNC_SCHEDULE,
  FACEBOOK,
  FACEBOOK_API,
  FACEBOOK_ORIGIN,
  HTTP_HEADERS,
  HTTP_STATUS,
  IMAGE_SERVICE,
  PAGINATION,
  RATE_LIMITS,
  SERVER_ERROR_RANGE,
  TIME,
  TOKEN_REFRESH_DEFAULTS,
  TOKEN_REFRESH_SCHEDULE,
  URL_DEFAULTS,
  API_TIMEOUT_MS,
  DEFAULT_PAGE_SIZE,
} from "../config/index.js";

import {
  createCorsHeaders,
  createEventSyncConfig,
  createTokenExpiryConfig,
  createTokenRefreshConfig,
  createWebhookConfig,
  resolveAllowedOrigins,
  resolveCorsOrigin,
  resolveEnvironmentFlags,
  resolveOAuthCallbackUrl,
  resolveWebAppUrl,
  type EnvGetter,
} from "./base.js";

const envGetter: EnvGetter = (key) => Deno.env.get(key);

export const TOKEN_REFRESH = createTokenRefreshConfig(envGetter, {
  includeSchedule: true,
});

export const TOKEN_EXPIRY_CONFIG = createTokenExpiryConfig(TOKEN_REFRESH);

export const EVENT_SYNC = createEventSyncConfig({ includeSchedule: true });

export const WEBHOOK = createWebhookConfig(envGetter);

const CORS_ORIGIN = resolveCorsOrigin(envGetter);

export const CORS_HEADERS = createCorsHeaders(CORS_ORIGIN);

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

