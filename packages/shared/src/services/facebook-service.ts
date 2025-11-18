/// <reference lib="dom" />

import { EVENT_SYNC_DEFAULTS } from "../config/functions-config.ts";
import {
  ERROR_CODES,
  SERVER_ERROR_RANGE,
} from "../config/validation-config.ts";
import { FACEBOOK as FACEBOOK_CONFIG } from "../config/service-config.ts";
import type {
  FacebookErrorResponse,
  FacebookEvent,
  FacebookPage,
  PaginatedEventResponse,
  PaginatedPageResponse,
} from "../types.ts";

export interface FacebookServiceLogger {
  info?(message: string, metadata?: Record<string, unknown>): void;
  warn?(message: string, metadata?: Record<string, unknown>): void;
  error?(
    message: string,
    error?: Error | null,
    metadata?: Record<string, unknown>,
  ): void;
  debug?(message: string, metadata?: Record<string, unknown>): void;
}

const defaultLogger: Required<FacebookServiceLogger> = {
  info(message, metadata) {
    if (metadata) {
      console.log(message, metadata);
    } else {
      console.log(message);
    }
  },
  warn(message, metadata) {
    if (metadata) {
      console.warn(message, metadata);
    } else {
      console.warn(message);
    }
  },
  error(message, error, metadata) {
    console.error(message, error ?? undefined, metadata);
  },
  debug(message, metadata) {
    if (metadata) {
      console.debug(message, metadata);
    } else {
      console.debug(message);
    }
  },
};

let activeLogger: Required<FacebookServiceLogger> = defaultLogger;

export function setFacebookServiceLogger(
  logger?: FacebookServiceLogger,
): void {
  if (!logger) {
    activeLogger = defaultLogger;
    return;
  }

  activeLogger = {
    info: logger.info ?? defaultLogger.info,
    warn: logger.warn ?? defaultLogger.warn,
    error: logger.error ?? defaultLogger.error,
    debug: logger.debug ?? defaultLogger.debug,
  };
}

const logInfo = (
  message: string,
  metadata?: Record<string, unknown>,
) => activeLogger.info(message, metadata);

const logWarn = (
  message: string,
  metadata?: Record<string, unknown>,
) => activeLogger.warn(message, metadata);

const logError = (
  message: string,
  error?: Error | null,
  metadata?: Record<string, unknown>,
) => activeLogger.error(message, error ?? null, metadata);

const logDebug = (
  message: string,
  metadata?: Record<string, unknown>,
) => activeLogger.debug(message, metadata);

const GRAPH_BASE_URL =
  `${FACEBOOK_CONFIG.BASE_URL}/${FACEBOOK_CONFIG.API_VERSION}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTokenExpiredError(
  status: number,
  data: FacebookErrorResponse,
): boolean {
  if (data?.error?.code === ERROR_CODES.FACEBOOK_TOKEN_INVALID) {
    return true;
  }
  return status === 401;
}

function isRetryableError(status: number): boolean {
  return status === ERROR_CODES.FACEBOOK_RATE_LIMIT ||
    (status >= SERVER_ERROR_RANGE.MIN && status <= SERVER_ERROR_RANGE.MAX);
}

async function withRetry<T>(
  apiCall: () => Promise<Response>,
  maxRetries: number = FACEBOOK_CONFIG.MAX_RETRIES,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await apiCall();

      if (!response) {
        throw new Error("No response received from Facebook API");
      }

      if (!response.ok) {
        let data: FacebookErrorResponse;
        try {
          data = await response.json() as FacebookErrorResponse;
        } catch (jsonError) {
          throw new Error(
            `JSON parse error: ${
              jsonError instanceof Error ? jsonError.message : String(jsonError)
            }`,
          );
        }

        if (isTokenExpiredError(response.status, data)) {
          const errorCode = data?.error?.code ?? "unknown";
          logError("Facebook token expired or invalid", null, {
            errorCode,
            status: response.status,
          });
          throw new Error(`Facebook token invalid (${errorCode})`);
        }

        const apiError = new Error(
          `Facebook API error: ${response.status} - ${
            data?.error?.message ?? "Unknown error"
          }`,
        );

        if (isRetryableError(response.status) && attempt < maxRetries) {
          const delayMs = FACEBOOK_CONFIG.RETRY_DELAY_MS *
            Math.pow(2, attempt - 1);
          logWarn("Facebook API error - retrying with backoff", {
            status: response.status,
            delayMs,
            attempt,
            maxRetries,
          });
          await sleep(delayMs);
          continue;
        }

        // Non-retryable error or last attempt for retryable error - throw immediately
        logError(
          "Facebook API responded with an error",
          null,
          {
            status: response.status,
            message: data?.error?.message,
          },
        );
        throw apiError;
      }

      try {
        return await response.json() as T;
      } catch (jsonError) {
        throw new Error(
          `JSON parse error: ${
            jsonError instanceof Error ? jsonError.message : String(jsonError)
          }`,
        );
      }
    } catch (error) {
      const isTokenError = error instanceof Error &&
        error.message.includes("token");
      const isApiError = error instanceof Error &&
        error.message.startsWith("Facebook API error:");
      const isNoResponseError = error instanceof Error &&
        error.message === "No response received from Facebook API";
      const isJsonParseError = error instanceof Error &&
        error.message.startsWith("JSON parse error:");

      // Token errors should be thrown immediately
      if (isTokenError) {
        throw error;
      }

      // No response errors should be thrown immediately (not retryable)
      if (isNoResponseError) {
        throw error;
      }

      // JSON parse errors should be thrown immediately (not retryable)
      if (isJsonParseError) {
        throw error;
      }

      // For API errors, check if they're retryable
      if (isApiError && error instanceof Error) {
        // Extract status code from error message: "Facebook API error: 400 - ..."
        const statusMatch = error.message.match(/Facebook API error: (\d+)/);
        if (statusMatch) {
          const status = parseInt(statusMatch[1], 10);
          // Non-retryable API errors should be thrown immediately
          if (!isRetryableError(status)) {
            throw error;
          }
          // Retryable API error on last attempt - throw the error
          if (attempt === maxRetries) {
            throw error;
          }
        }
        // API error without status code - treat as network error and retry
        // (fall through to network error retry logic)
      }

      // For network errors or other non-API errors, retry if we have attempts left
      if (attempt < maxRetries) {
        const delayMs = FACEBOOK_CONFIG.RETRY_DELAY_MS *
          Math.pow(2, attempt - 1);
        logWarn("Facebook API request failed - retrying", {
          error: error instanceof Error ? error.message : String(error),
          attempt,
          maxRetries,
        });
        await sleep(delayMs);
        continue;
      }
    }
  }

  // Only reach here if we've exhausted retries for network errors
  throw new Error("Facebook API retry attempts exhausted");
}

export async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string,
): Promise<string> {
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });

  const data = await withRetry<{ access_token: string }>(async () => {
    return await fetch(
      `${FACEBOOK_CONFIG.BASE_URL}/oauth/access_token?${params}`,
    );
  });

  if (!data.access_token) {
    throw new Error("No access token received from Facebook");
  }

  logInfo("Exchanged authorization code for short-lived token");
  return data.access_token;
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string,
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const data = await withRetry<{ access_token: string }>(async () => {
    return await fetch(
      `${FACEBOOK_CONFIG.BASE_URL}/oauth/access_token?${params}`,
    );
  });

  if (!data.access_token) {
    throw new Error("No long-lived token received from Facebook");
  }

  logInfo("Exchanged short-lived token for long-lived token");
  return data.access_token;
}

export async function getUserPages(
  accessToken: string,
): Promise<FacebookPage[]> {
  let allPages: FacebookPage[] = [];
  let nextUrl: string | null = `${GRAPH_BASE_URL}/me/accounts`;

  while (nextUrl) {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: "id,name,access_token",
      limit: String(FACEBOOK_CONFIG.PAGINATION_LIMIT),
    });

    const currentUrl: string = nextUrl.includes("?")
      ? nextUrl
      : `${nextUrl}?${params}`;

    const response: PaginatedPageResponse = await withRetry<
      PaginatedPageResponse
    >(async () => {
      return await fetch(currentUrl);
    });

    const pages = response.data ?? [];
    allPages = allPages.concat(pages);

    nextUrl = response.paging?.next ?? null;
  }

  logInfo("Fetched Facebook user pages", { count: allPages.length });
  return allPages;
}

export async function getPageEvents(
  pageId: string,
  accessToken: string,
  timeFilter: "upcoming" | "past" = "upcoming",
): Promise<FacebookEvent[]> {
  let allEvents: FacebookEvent[] = [];
  let nextUrl: string | null = `${GRAPH_BASE_URL}/${pageId}/events`;

  while (nextUrl) {
    const params = new URLSearchParams({
      access_token: accessToken,
      time_filter: timeFilter,
      fields: "id,name,description,start_time,end_time,place,cover{source}",
      limit: String(FACEBOOK_CONFIG.PAGINATION_LIMIT),
    });

    const currentUrl: string = nextUrl.includes("?")
      ? nextUrl
      : `${nextUrl}?${params}`;

    try {
      const response: PaginatedEventResponse = await withRetry<
        PaginatedEventResponse
      >(async () => {
        return await fetch(currentUrl);
      });

      const events = response.data ?? [];
      allEvents = allEvents.concat(events);

      logDebug("Fetched Facebook page events batch", {
        pageId,
        timeFilter,
        batchCount: events.length,
      });

      nextUrl = response.paging?.next ?? null;
    } catch (error) {
      logError(
        "Error fetching Facebook page events",
        error instanceof Error ? error : null,
        { pageId, timeFilter },
      );
      throw error;
    }
  }

  logInfo("Fetched Facebook page events", {
    pageId,
    timeFilter,
    totalCount: allEvents.length,
  });
  return allEvents;
}

export async function getEventDetails(
  eventId: string,
  accessToken: string,
): Promise<FacebookEvent> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "id,name,description,start_time,end_time,place,cover{source}",
  });

  const response = await withRetry<FacebookEvent>(async () => {
    return await fetch(`${GRAPH_BASE_URL}/${eventId}?${params}`);
  });

  logDebug("Fetched Facebook event details", {
    eventId,
  });

  return response;
}

export async function getAllRelevantEvents(
  pageId: string,
  accessToken: string,
  daysBack: number = EVENT_SYNC_DEFAULTS.PAST_EVENTS_DAYS,
): Promise<FacebookEvent[]> {
  const upcomingEvents = await getPageEvents(pageId, accessToken, "upcoming");
  const pastEvents = await getPageEvents(pageId, accessToken, "past");

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffTime = cutoffDate.getTime();

  const recentPastEvents = pastEvents.filter((event) => {
    if (!event.start_time) {
      return false;
    }
    const eventTime = new Date(event.start_time).getTime();
    return eventTime >= cutoffTime;
  });

  const allEvents = [...upcomingEvents, ...recentPastEvents];
  const uniqueEvents = Array.from(
    new Map(allEvents.map((event) => [event.id, event])).values(),
  );

  logInfo("Aggregated relevant Facebook events", {
    pageId,
    upcomingCount: upcomingEvents.length,
    recentPastCount: recentPastEvents.length,
    totalUnique: uniqueEvents.length,
    daysBack,
  });

  return uniqueEvents;
}

export type {
  FacebookCover,
  FacebookErrorResponse,
  FacebookEvent,
  FacebookPage,
  FacebookPagePictureData,
  FacebookPlace,
  FacebookPlaceLocation,
  PaginatedEventResponse,
  PaginatedPageResponse,
} from "../types.ts";
