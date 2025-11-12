import { createClient } from "@supabase/supabase-js";
import {
  batchWriteEvents,
  getActivePages,
  logger,
} from "../_shared/services/index.ts";
import {
  TokenBucketRateLimiter,
  createErrorResponse,
  createSuccessResponse,
  extractBearerToken,
  getRateLimitExceededResponse,
  handleCORSPreflight,
  HTTP_STATUS,
  verifyBearerToken,
} from "../_shared/validation/index.ts";
import { RATE_LIMITS } from "../_shared/utils/constants-util.ts";
import { SyncResult } from "./types.ts";
import { syncSinglePage } from "./helpers.ts";

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

/**
 * Sync events, simple as. We have a manual and cron version
 */
async function syncAllPageEvents(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<SyncResult> {
  // Get all active pages from Supabase
  const pages = await getActivePages(supabase);

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
  // deno-lint-ignore no-explicit-any
  const eventsToSync: any[] = [];
  // deno-lint-ignore no-explicit-any
  const expiringTokens: any[] = [];

  // Sync all pages in parallel using Promise.all. That's the excellent utility
  // of Promise in JS/TS
  const syncResults = await Promise.all(
    pages.map((page) => syncSinglePage(page, supabase, expiringTokens)),
  );

  // Collect all events from all pages
  // deno-lint-ignore no-explicit-any
  const errors: any[] = [];
  for (const result of syncResults) {
    eventsToSync.push(...result.events);
    totalEvents += result.events.length;
    if (result.error) {
      errors.push({ pageId: result.pageId, error: result.error });
    }
  }

  // Batch write all events
  if (eventsToSync.length > 0) {
    await batchWriteEvents(supabase, eventsToSync);
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

Deno.serve(async (req: Request) => {
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
    const expectedToken = Deno.env.get("SYNC_TOKEN");

    if (!expectedToken) {
      logger.error("Missing SYNC_TOKEN environment variable", null);
      return createErrorResponse(
        "Server configuration error",
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    const token = extractBearerToken(authHeader);
    const isAuthorized =
      typeof token === "string" && verifyBearerToken(token, expectedToken);

    if (!isAuthorized) {
      logger.warn("Unauthorized sync-events request", {
        error: "Invalid or missing bearer token",
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseKey) {
      return createErrorResponse(
        "Missing Supabase configuration",
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    logger.info("Manual sync started");
    const result = await syncAllPageEvents(supabase);
    logger.info("Manual sync completed successfully", {
      // deno-lint-ignore no-explicit-any
      totalEvents: (result as any).totalEvents,
      // deno-lint-ignore no-explicit-any
      totalPages: (result as any).totalPages,
    });

    return createSuccessResponse(result);
  } catch (error) {
    logger.error("Manual sync failed", error instanceof Error ? error : null);
    return createErrorResponse(
      "Failed to sync events from Facebook",
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
});
