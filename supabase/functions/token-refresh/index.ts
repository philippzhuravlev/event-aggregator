import { exchangeForLongLivedToken } from "../_shared/services/facebook-service.ts";
import { logger } from "../_shared/services/logger-service.ts";
import { sendTokenRefreshFailedAlert } from "../_shared/services/mail-service.ts";
import { createSupabaseClient } from "../_shared/services/supabase-service.ts";
import { calculateDaysUntilExpiry } from "@event-aggregator/shared/utils/token-expiry.js";
import {
  createErrorResponse,
  createSuccessResponse,
  TokenBucketRateLimiter,
} from "@event-aggregator/shared/validation/index.js";
import { RATE_LIMITS } from "@event-aggregator/shared/runtime/deno.js";
import { PageToken, RefreshResult } from "./types.ts";

type PageTokenWithExpiry = PageToken & {
  token_expiry?: string | null;
};

// this used to be a "handler", i.e. "thing that does something" (rather than connect,
// or help etc), but because we've refactored to supabase, it's now a "Edge Function".
// They're run on deno, an upgrade to nodejs, and work similarly to serverless functions
// we had before - basically, functions that run on demand or on a schedule.

// this function handles refreshing facebook page access tokens that are about to expire.

// Rate limiter for token refresh: max 24 refreshes per day per page (roughly 1 per hour)
// See RATE_LIMITS.TOKEN_REFRESH for configuration
const tokenRefreshLimiter = new TokenBucketRateLimiter();
tokenRefreshLimiter.configure(
  RATE_LIMITS.TOKEN_REFRESH.capacity,
  RATE_LIMITS.TOKEN_REFRESH.refillRate,
);

/**
 * Token Refresh Handler
 * Scheduled cron job (runs every 24 hours)
 * Refreshes tokens that expire within 7 days to prevent service disruption
 *
 * Flow:
 * 1. Query all active pages with tokens
 * 2. Check token expiry status for each page
 * 3. If expires within 7 days, call Facebook API to refresh
 * 4. Store new token in database
 * 5. Send alert if refresh fails
 */

export async function refreshExpiredTokens(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<{
  refreshed: number;
  failed: number;
  results: RefreshResult[];
}> {
  const results: RefreshResult[] = [];
  let refreshedCount = 0;
  let failedCount = 0;

  async function recordFailure(
    pageId: string,
    reason: string,
    options: {
      logLevel?: "warn" | "error";
      alertMessage?: string;
      includeAlert?: boolean;
      error?: unknown;
    } = {},
  ): Promise<void> {
    const {
      logLevel = "error",
      alertMessage,
      includeAlert = true,
      error,
    } = options;

    const metadata = { pageId, reason };
    if (logLevel === "warn") {
      logger.warn(reason, {
        ...metadata,
        error: error instanceof Error ? error.message : error ?? undefined,
      });
    } else {
      logger.error(
        reason,
        error instanceof Error ? error : null,
        error instanceof Error
          ? metadata
          : { ...metadata, error: error ?? undefined },
      );
    }

    if (includeAlert) {
      await sendTokenRefreshFailedAlert(
        pageId,
        alertMessage ?? reason,
      );
    }

    results.push({
      pageId,
      success: false,
      error: reason,
    });
    failedCount++;
  }

  try {
    // Get all active pages with tokens
    const { data: pages, error: queryError } = await supabase
      .from("pages")
      .select(
        "page_id, page_name, token_expiry, token_status, page_access_token_id",
      )
      .eq("token_status", "active")
      .not("page_access_token_id", "is", null);

    if (queryError) {
      throw new Error(`Failed to fetch pages: ${queryError.message}`);
    }

    if (!pages || pages.length === 0) {
      logger.info("No active pages found for token refresh");
      return { refreshed: 0, failed: 0, results: [] };
    }

    logger.info(`Found ${pages.length} active pages - checking token expiry`);

    // Check each page's token expiry
    for (const page of pages as PageToken[]) {
      const pageId = String(page.page_id);
      try {
        const { data: tokenData, error: tokenError } = await supabase.rpc(
          "get_page_access_token",
          { page_id_input: page.page_id },
        );

        if (tokenError) {
          const errorMsg =
            `Failed to retrieve token for page ${pageId}: ${tokenError.message}`;
          await recordFailure(pageId, "Failed to read existing token", {
            error: tokenError,
            alertMessage: errorMsg,
          });
          continue;
        }

        const tokenRecord = Array.isArray(tokenData) ? tokenData[0] : tokenData;
        const accessToken = tokenRecord?.token ?? "";

        if (!accessToken) {
          await recordFailure(pageId, "No stored token found", {
            logLevel: "warn",
            alertMessage: "No stored access token found for page",
          });
          continue;
        }

        const pageRecord = page as PageTokenWithExpiry & {
          page_name?: string | null;
        };
        const pageExpiry = pageRecord.token_expiry ?? null;
        const pageName = pageRecord.page_name ?? "Unknown Page";
        const expirySource = tokenRecord?.expiry ?? pageExpiry;
        let expiresAt: Date | null = null;
        if (expirySource) {
          const parsedExpiry = new Date(expirySource);
          if (!Number.isNaN(parsedExpiry.getTime())) {
            expiresAt = parsedExpiry;
          }
        }

        if (!expiresAt) {
          await recordFailure(pageId, "Missing token expiry metadata", {
            logLevel: "warn",
            includeAlert: false,
          });
          continue;
        }

        const now = new Date();
        const daysUntilExpiry = calculateDaysUntilExpiry(expiresAt, now);

        // Only refresh if expires within 7 days
        if (daysUntilExpiry > 7) {
          logger.debug(`Token for page ${pageId} not expiring soon`, {
            daysUntilExpiry,
          });
          continue;
        }

        if (daysUntilExpiry <= 0) {
          await recordFailure(pageId, "Token already expired", {
            logLevel: "warn",
            alertMessage: "Token already expired - immediate refresh needed",
          });
          continue;
        }

        // Rate limit: max 24 refreshes per day per page (1 per hour)
        const isLimited = !tokenRefreshLimiter.check(pageId);

        if (isLimited) {
          logger.debug(`Token refresh rate limited for page ${pageId}`);
          results.push({
            pageId,
            success: false,
            error: "Rate limited - too many refresh attempts today",
          });
          failedCount++;
          continue;
        }

        // Token expires soon - refresh it
        logger.info(`Refreshing token for page ${pageId}`, {
          daysUntilExpiry,
        });

        // Call Facebook API to refresh token using exchangeForLongLivedToken
        try {
          const appId = Deno.env.get("FACEBOOK_APP_ID");
          const appSecret = Deno.env.get("FACEBOOK_APP_SECRET");

          if (!appId || !appSecret) {
            throw new Error("Missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET");
          }

          const newToken = await exchangeForLongLivedToken(
            accessToken,
            appId,
            appSecret,
          );

          // Calculate new expiry (Facebook long-lived tokens expire in ~60 days)
          const sixtyDaysFromNow = new Date();
          sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

          // Store new token in database via RPC to keep Vault in sync
          const { error: storeError } = await supabase.rpc(
            "store_page_token",
            {
              p_page_id: page.page_id,
              p_page_name: pageName,
              p_access_token: newToken,
              p_expiry: sixtyDaysFromNow.toISOString(),
            },
          );

          if (storeError) {
            throw new Error(
              `Failed to store refreshed token: ${
                storeError.message ?? storeError
              }`,
            );
          }

          logger.info(`Successfully refreshed token for page ${pageId}`, {
            newExpiresAt: sixtyDaysFromNow.toISOString(),
          });

          results.push({
            pageId,
            success: true,
            expiresInDays: 60,
          });
          refreshedCount++;
        } catch (refreshError) {
          const errorMsg = refreshError instanceof Error
            ? refreshError.message
            : "Unknown error";

          await recordFailure(pageId, errorMsg, {
            error: refreshError,
          });
        }
      } catch (pageError) {
        const errorMsg = pageError instanceof Error
          ? pageError.message
          : "Unknown error";

        await recordFailure(pageId, errorMsg, {
          error: pageError,
        });
      }
    }

    logger.info("Token refresh sweep finished", {
      refreshedCount,
      failedCount,
    });

    return {
      refreshed: refreshedCount,
      failed: failedCount,
      results,
    };
  } catch (error) {
    logger.error(
      "Token refresh job failed",
      error instanceof Error ? error : null,
    );

    throw error;
  }
}

// Handler for manual invocation or webhook trigger
export async function handleTokenRefresh(
  req: Request,
): Promise<Response> {
  // Only allow POST requests
  if (req.method !== "POST") {
    return createErrorResponse(
      "Method not allowed",
      405,
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);
    const result = await refreshExpiredTokens(supabase);

    return createSuccessResponse({
      message: "Token refresh job completed",
      ...result,
    }, 200);
  } catch (error) {
    logger.error(
      "Token refresh handler error",
      error instanceof Error ? error : null,
    );

    return createErrorResponse(
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}

// Start server when executed directly (Supabase runtime)
if (import.meta.main) {
  Deno.serve(handleTokenRefresh);
}
