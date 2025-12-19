// Supabase Edge Function Configuration
// @supabase-auth: none  - Disable JWT verification, use custom auth via sync-token
// This allows us to use token-based authentication (SYNC_TOKEN) instead of JWT

import {
  batchWriteEvents,
  createSupabaseClient,
  getActivePages,
} from "../_shared/services/supabase-service.ts";
import { logger } from "../_shared/services/logger-service.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  extractBearerToken,
  getRateLimitExceededResponse,
  handleCORSPreflight,
  TokenBucketRateLimiter,
  verifyBearerToken,
} from "../packages/shared/dist/validation/index.js";
import {
  HTTP_STATUS,
  RATE_LIMITS,
} from "../packages/shared/dist/runtime/deno.js";
import type { ExpiringToken, SynchronizedEvent } from "./types.ts";
import { SyncResult } from "./types.ts";
import { syncSinglePage } from "./helpers.ts";

type SyncEventsDeps = {
  getActivePages: typeof getActivePages;
  syncSinglePage: typeof syncSinglePage;
  batchWriteEvents: typeof batchWriteEvents;
};

const defaultSyncEventsDeps: SyncEventsDeps = {
  getActivePages,
  syncSinglePage,
  batchWriteEvents,
};

let currentSyncEventsDeps: SyncEventsDeps = { ...defaultSyncEventsDeps };

/**
 * Set sync events dependencies for testing
 * @param overrides - Partial dependencies to override
 */
export function setSyncEventsDeps(
  overrides: Partial<SyncEventsDeps>,
): void {
  currentSyncEventsDeps = { ...currentSyncEventsDeps, ...overrides };
}

/**
 * Reset sync events dependencies to defaults
 */
export function resetSyncEventsDeps(): void {
  currentSyncEventsDeps = { ...defaultSyncEventsDeps };
}

// NB: "Handlers" like execute business logic; they "do something", like
// syncing events or refreshing tokens, etc. Meanwhile "Services" connect
// something to an existing service, e.g. facebook or supabase vault

// Syncing events means getting events from facebook and putting them
// into our supabase database. We have two ways of doing this: manually
// via an http endpoint (handleManualSync) or automatically via a cron
// job (handleScheduledSync). Both use the same underlying function
// syncAllPageEvents which does the actual work, which also includes
// processing event cover images and normalizing event data - could have
// been split into separate functions honestly

// Rate limiter for sync endpoint: 10 calls per day per token
// See RATE_LIMITS.SYNC_ENDPOINT for configuration
const syncRateLimiter = new TokenBucketRateLimiter();
syncRateLimiter.configure(
  RATE_LIMITS.SYNC_ENDPOINT.capacity,
  RATE_LIMITS.SYNC_ENDPOINT.refillRate,
);

const SYNC_TOKEN_ENV_KEYS = [
  "SYNC_TOKEN",
  "SYNC_KEY",
  "API_SYNC_KEY",
] as const;

export const SYNC_TOKEN_HEADER = "authorization";

type SyncTokenEnvironmentKey = (typeof SYNC_TOKEN_ENV_KEYS)[number];

function resolveSyncToken():
  | { key: SyncTokenEnvironmentKey; value: string }
  | null {
  for (const key of SYNC_TOKEN_ENV_KEYS) {
    const value = Deno.env.get(key);
    if (value) {
      return { key, value };
    }
  }
  return null;
}

/**
 * Sync events, simple as. We have a manual and cron version
 */
export async function syncAllPageEvents(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<SyncResult> {
  // Get all active pages from Supabase
  const pages = await currentSyncEventsDeps.getActivePages(supabase);

  if (pages.length === 0) {
    logger.info("No active pages to sync");
    return {
      success: true,
      pagesProcessed: 0,
      eventsAdded: 0,
      eventsUpdated: 0,
      errors: [],
      timestamp: new Date().toISOString(),
    };
  }

  let totalEvents = 0;
  const eventsToSync: SynchronizedEvent[] = [];
  const expiringTokens: ExpiringToken[] = [];

  // Sync all pages in parallel using Promise.all. That's the excellent utility
  // of Promise in JS/TS
  const syncResults = await Promise.all(
    pages.map((page) =>
      currentSyncEventsDeps.syncSinglePage(page, supabase, expiringTokens)
    ),
  );

  // Collect all events from all pages
  const errors: Array<{ pageId: string; error: string }> = [];
  for (const result of syncResults) {
    eventsToSync.push(...result.events);
    totalEvents += result.events.length;
    if (result.error) {
      errors.push({ pageId: result.pageId, error: result.error });
    }
  }

  // Batch write all events
  if (eventsToSync.length > 0) {
    await currentSyncEventsDeps.batchWriteEvents(supabase, eventsToSync);
    logger.info("Sync completed successfully", {
      totalEvents,
      totalPages: pages.length,
      expiringTokens: expiringTokens.length,
    });
  }

  // Log expiring tokens summary
  if (expiringTokens.length > 0) {
    logger.warn("Multiple tokens expiring soon", {
      count: expiringTokens.length,
    });
  }

  return {
    success: true,
    pagesProcessed: pages.length,
    eventsAdded: totalEvents,
    eventsUpdated: 0,
    errors,
    timestamp: new Date().toISOString(),
  };
}

// Handler
export async function handleSyncEvents(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCORSPreflight();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return createErrorResponse(
      "Method not allowed",
      HTTP_STATUS.METHOD_NOT_ALLOWED,
    );
  }

  try {
    // Verify Bearer token for authorization
    const authHeader = req.headers.get("authorization");
    const tokenInfo = resolveSyncToken();

    if (!tokenInfo) {
      logger.error(
        "Missing sync token configuration",
        null,
        { envKeys: SYNC_TOKEN_ENV_KEYS },
      );
      return createErrorResponse(
        "Server configuration error",
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    const token = extractBearerToken(authHeader);
    const expectedToken = tokenInfo.value;
    const isAuthorized = typeof token === "string" &&
      verifyBearerToken(token, expectedToken);

    if (!isAuthorized) {
      logger.warn("Unauthorized sync-events request", {
        error: "Invalid or missing bearer token",
        envKey: tokenInfo.key,
      });
      return createErrorResponse(
        "Unauthorized",
        HTTP_STATUS.UNAUTHORIZED,
      );
    }

    // Rate limiting check: 10 calls per day per token
    const tokenId = token ?? "unknown";
    const isRateLimited = !syncRateLimiter.check(tokenId);

    if (isRateLimited) {
      logger.warn(`Sync endpoint rate limit exceeded for token: ${tokenId}`);
      return getRateLimitExceededResponse();
    }

    // Initialize Supabase client
    // Try remote first (for local development), fallback to local Supabase vars
    const supabaseUrl = Deno.env.get("REMOTE_SUPABASE_URL") ||
      Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("REMOTE_SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseKey) {
      return createErrorResponse(
        "Missing Supabase configuration",
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    logger.info("Manual sync started");
    const result = await syncAllPageEvents(supabase);
    logger.info("Manual sync completed successfully", {
      eventsAdded: result.eventsAdded,
      pagesProcessed: result.pagesProcessed,
      errors: result.errors.length,
    });

    return createSuccessResponse(result);
  } catch (error) {
    logger.error("Manual sync failed", error instanceof Error ? error : null);
    return createErrorResponse(
      "Failed to sync events from Facebook",
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

// Start server when executed directly (Supabase runtime)
if (import.meta.main) {
  Deno.serve(handleSyncEvents);
}
