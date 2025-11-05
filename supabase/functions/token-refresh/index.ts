import { createClient } from "@supabase/supabase-js";
import {
  exchangeForLongLivedToken,
  logger,
  sendTokenRefreshFailedAlert,
} from "../_shared/services/index.ts";
import { calculateDaysUntilExpiry } from "../_shared/utils/index.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  TokenBucketRateLimiter,
} from "../_shared/validation/index.ts";
import { PageToken, RefreshResult } from "./types.ts";

// this used to be a "handler", i.e. "thing that does something" (rather than connect,
// or help etc), but because we've refactored to supabase, it's now a "Edge Function".
// They're run on deno, an upgrade to nodejs, and work similarly to serverless functions
// we had before - basically, functions that run on demand or on a schedule.

// this function handles refreshing facebook page access tokens that are about to expire.

// Rate limiter for token refresh: max 24 refreshes per day per page (roughly 1 per hour)
const tokenRefreshLimiter = new TokenBucketRateLimiter();

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

async function refreshExpiredTokens(
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

  try {
    // Get all active pages with tokens
    const { data: pages, error: queryError } = await supabase
      .from("facebook_pages")
      .select("page_id, access_token, expires_at")
      .eq("is_active", true)
      .not("access_token", "is", null);

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
      try {
        // Rate limit: max 24 refreshes per day per page (1 per hour)
        const isLimited = !tokenRefreshLimiter.check(
          page.page_id,
          1,
          24,
          86400000,
        );

        if (isLimited) {
          logger.debug(`Token refresh rate limited for page ${page.page_id}`);
          results.push({
            pageId: page.page_id,
            success: false,
            error: "Rate limited - too many refresh attempts today",
          });
          failedCount++;
          continue;
        }

        if (!page.expires_at) {
          logger.warn(`No expiry data found for page ${page.page_id}`);
          continue;
        }

        const expiresAt = new Date(page.expires_at);
        const now = new Date();
        const daysUntilExpiry = calculateDaysUntilExpiry(expiresAt, now);

        // Only refresh if expires within 7 days
        if (daysUntilExpiry > 7) {
          logger.debug(`Token for page ${page.page_id} not expiring soon`, {
            daysUntilExpiry,
          });
          continue;
        }

        if (daysUntilExpiry <= 0) {
          logger.warn(`Token for page ${page.page_id} already expired!`);
          await sendTokenRefreshFailedAlert(
            page.page_id,
            "Token already expired - immediate refresh needed",
          );
          results.push({
            pageId: page.page_id,
            success: false,
            error: "Token already expired",
          });
          failedCount++;
          continue;
        }

        // Token expires soon - refresh it
        logger.info(`Refreshing token for page ${page.page_id}`, {
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
            page.access_token,
            appId,
            appSecret,
          );

          // Calculate new expiry (Facebook long-lived tokens expire in ~60 days)
          const sixtyDaysFromNow = new Date();
          sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

          // Store new token in database
          const { error: updateError } = await (supabase
            .from("facebook_pages")
            .update({
              access_token: newToken,
              expires_at: sixtyDaysFromNow.toISOString(),
              token_refreshed_at: new Date().toISOString(),
            })
            // deno-lint-ignore no-explicit-any
            .eq("page_id", page.page_id) as any);

          if (updateError) {
            throw new Error(
              `Failed to update page token: ${updateError.message}`,
            );
          }

          logger.info(`Successfully refreshed token for page ${page.page_id}`, {
            newExpiresAt: sixtyDaysFromNow.toISOString(),
          });

          results.push({
            pageId: page.page_id,
            success: true,
            expiresInDays: 60,
          });
          refreshedCount++;
        } catch (refreshError) {
          const errorMsg = refreshError instanceof Error
            ? refreshError.message
            : "Unknown error";

          logger.error(
            `Token refresh failed for page ${page.page_id}`,
            refreshError instanceof Error ? refreshError : null,
            {
              pageId: page.page_id,
            },
          );

          await sendTokenRefreshFailedAlert(
            page.page_id,
            errorMsg,
          );

          results.push({
            pageId: page.page_id,
            success: false,
            error: errorMsg,
          });
          failedCount++;
        }
      } catch (pageError) {
        const errorMsg = pageError instanceof Error
          ? pageError.message
          : "Unknown error";

        logger.error(
          `Error processing page ${page.page_id}`,
          pageError instanceof Error ? pageError : null,
          {
            pageId: page.page_id,
          },
        );

        await sendTokenRefreshFailedAlert(
          page.page_id,
          errorMsg,
        );

        results.push({
          pageId: page.page_id,
          success: false,
          error: errorMsg,
        });
        failedCount++;
      }
    }

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
async function handleTokenRefresh(
  req: Request,
): Promise<Response> {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
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

// Start server
Deno.serve(handleTokenRefresh);
