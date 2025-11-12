import {
  DEFAULT_ALLOWED_ORIGINS,
  URL_DEFAULTS,
} from "../config/validation-config.js";
import {
  EVENT_SYNC_DEFAULTS,
  EVENT_SYNC_SCHEDULE,
  TOKEN_REFRESH_DEFAULTS,
  TOKEN_REFRESH_SCHEDULE,
} from "../config/functions-config.js";

export type EnvGetter = (key: string) => string | undefined;

const DEFAULT_ENVIRONMENT = "development";

const BOOLEAN_TRUE_VALUES = new Set(["true", "1", "yes"]);

const ACCESS_CONTROL_ALLOW_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
const ACCESS_CONTROL_ALLOW_HEADERS = "Content-Type, Authorization";

export interface TokenRefreshOptions {
  includeSchedule?: boolean;
  alertEmailEnvKey?: string;
  defaultAlertEmail?: string;
}

export interface EventSyncOptions {
  includeSchedule?: boolean;
}

export interface EnvironmentFlagOptions {
  fallbackEnv?: string;
}

export interface WebhookOptions {
  verifyTokenEnvKey?: string;
  defaultVerifyToken?: string;
}

export const stringToBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return false;
  }

  return BOOLEAN_TRUE_VALUES.has(value.toLowerCase());
};

export const resolveEnvValue = (
  getEnv: EnvGetter,
  key: string,
  fallback?: string,
): string | undefined => {
  const value = getEnv(key);
  return value ?? fallback;
};

export const createTokenRefreshConfig = (
  getEnv: EnvGetter,
  options: TokenRefreshOptions = {},
) => {
  const { includeSchedule = false, alertEmailEnvKey = "TOKEN_ALERT_EMAIL" } =
    options;

  const alertEmail = resolveEnvValue(
    getEnv,
    alertEmailEnvKey,
    options.defaultAlertEmail,
  );

  return {
    ...TOKEN_REFRESH_DEFAULTS,
    ...(includeSchedule ? TOKEN_REFRESH_SCHEDULE : {}),
    ALERT_EMAIL: alertEmail,
  } as const;
};

export const createTokenExpiryConfig = (tokenRefresh: {
  WARNING_DAYS: number;
  DEFAULT_EXPIRES_DAYS: number;
  ALERT_EMAIL?: string;
}) =>
  ({
    warningDays: tokenRefresh.WARNING_DAYS,
    defaultExpiresDays: tokenRefresh.DEFAULT_EXPIRES_DAYS,
    alertEmail: tokenRefresh.ALERT_EMAIL,
  }) as const;

export const createEventSyncConfig = (
  options: EventSyncOptions = {},
) =>
  ({
    ...EVENT_SYNC_DEFAULTS,
    ...(options.includeSchedule ? EVENT_SYNC_SCHEDULE : {}),
  }) as const;

export const resolveWebAppUrl = (
  getEnv: EnvGetter,
  fallback = URL_DEFAULTS.WEB_APP,
) => resolveEnvValue(getEnv, "WEB_APP_URL", fallback) ?? fallback;

export const resolveOAuthCallbackUrl = (
  getEnv: EnvGetter,
  fallback = URL_DEFAULTS.OAUTH_CALLBACK,
) => resolveEnvValue(getEnv, "OAUTH_CALLBACK_URL", fallback) ?? fallback;

export const resolveAllowedOrigins = (
  getEnv: EnvGetter,
  webAppUrl?: string,
) => {
  const origins = new Set<string>(DEFAULT_ALLOWED_ORIGINS);
  const resolvedWebAppUrl = webAppUrl ?? resolveWebAppUrl(getEnv);

  if (resolvedWebAppUrl) {
    origins.add(resolvedWebAppUrl);
  }

  return [...origins] as const;
};

export const resolveCorsOrigin = (
  getEnv: EnvGetter,
  fallback?: string,
) => {
  const defaultOrigin =
    fallback ?? DEFAULT_ALLOWED_ORIGINS[DEFAULT_ALLOWED_ORIGINS.length - 1];
  return resolveEnvValue(getEnv, "WEB_APP_URL", defaultOrigin) ?? defaultOrigin;
};

export const createCorsHeaders = (origin: string) =>
  ({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ACCESS_CONTROL_ALLOW_METHODS,
    "Access-Control-Allow-Headers": ACCESS_CONTROL_ALLOW_HEADERS,
  }) as const;

export const createBaseCorsHeaders = () =>
  ({
    "Access-Control-Allow-Methods": ACCESS_CONTROL_ALLOW_METHODS,
    "Access-Control-Allow-Headers": ACCESS_CONTROL_ALLOW_HEADERS,
  }) as const;

export const resolveEnvironmentFlags = (
  getEnv: EnvGetter,
  options: EnvironmentFlagOptions = {},
) => {
  const env =
    resolveEnvValue(getEnv, "ENVIRONMENT") ??
    resolveEnvValue(getEnv, "NODE_ENV") ??
    options.fallbackEnv ??
    DEFAULT_ENVIRONMENT;

  return {
    env,
    isProduction: env === "production",
    isDevelopment: env === "development",
    isTesting: env === "test",
  } as const;
};

export const createWebhookConfig = (
  getEnv: EnvGetter,
  options: WebhookOptions = {},
) => {
  const {
    verifyTokenEnvKey = "FACEBOOK_WEBHOOK_VERIFY_TOKEN",
    defaultVerifyToken = "verify_me",
  } = options;

  const verifyToken = resolveEnvValue(
    getEnv,
    verifyTokenEnvKey,
    defaultVerifyToken,
  ) ?? defaultVerifyToken;

  return {
    VERIFY_TOKEN: verifyToken,
    VERIFY_TOKEN_PARAM: "hub.verify_token",
    CHALLENGE_PARAM: "hub.challenge",
    MODE_PARAM: "hub.mode",
    MODE_SUBSCRIBE: "subscribe",
  } as const;
};

