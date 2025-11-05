import { getAllRelevantEvents } from "../_shared/services/facebook-service.ts";
import {
  checkTokenExpiry,
  markTokenExpired,
} from "../_shared/services/supabase-service.ts";
import { getPageToken } from "../_shared/services/vault-service.ts";
import { normalizeEvent } from "../_shared/utils/event-normalizer-util.ts";
import { EVENT_SYNC, TOKEN_REFRESH } from "../_shared/utils/constants-util.ts";
import { logger } from "../_shared/services/logger-service.ts";
import { DatabasePage } from "../_shared/types.ts";

// this is one of many "helper", which are different from utils; 90% of the time,
// helpers are for one file and thus specific for domain stuff/business logic (calculating,
// transforming etc), meanwhile utils are more general and thus used across multiple files.
// helpers are also very encapsulated usually; you should have a "token-expiry" helper
// for token-refresh because otherwise, it'd be 500 lines; better yet, it's easy to
// separate concerns that way into a single file

// these helpers specifically handle syncing events for a single page, including checking
// token expiry, retrieving tokens from vault, calling facebook api, normalizing
// event data, and handling errors

interface PageSyncResult {
  events: unknown[];
  pageId: string;
  error: string | null;
}

interface ExpiringToken {
  pageId: number;
  pageName: string;
  daysUntilExpiry: number;
  expiresAt: Date | null;
}

/**
 * Sync events for a single page
 * Handles token expiry checking, vault retrieval, Facebook API calls, and event normalization
 * @param page - Database page record
 * @param supabase - Supabase client
 * @param expiringTokens - Array to collect expiring tokens for reporting
 * @returns Result object with events, pageId, and optional error
 */
export async function syncSinglePage(
  page: DatabasePage,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  expiringTokens: ExpiringToken[],
): Promise<PageSyncResult> {
  try {
    // 1. Check if token is expiring soon (within 7 days)
    const tokenStatus = await checkTokenExpiry(
      supabase,
      String(page.page_id),
      TOKEN_REFRESH.WARNING_DAYS,
    );
    if (tokenStatus.isExpiring) {
      logger.warn("Token expiring soon", {
        pageId: page.page_id,
        pageName: page.page_name,
        daysUntilExpiry: tokenStatus.daysUntilExpiry,
        expiresAt: tokenStatus.expiresAt
          ? tokenStatus.expiresAt.toISOString()
          : null,
      });
      expiringTokens.push({
        pageId: page.page_id,
        pageName: page.page_name,
        daysUntilExpiry: tokenStatus.daysUntilExpiry,
        expiresAt: tokenStatus.expiresAt,
      });
    }

    // 2. Get access token from Supabase Vault
    const accessToken = await getPageToken(supabase, String(page.page_id));
    if (!accessToken) {
      logger.error("No access token found for page", null, {
        pageId: String(page.page_id),
        pageName: page.page_name,
      });
      return { events: [], pageId: String(page.page_id), error: null };
    }

    logger.info("Syncing events for page", {
      pageId: page.page_id,
      pageName: page.page_name,
    });

    // 3. Get events from Facebook API
    let events;
    try {
      events = await getAllRelevantEvents(
        String(page.page_id),
        accessToken,
        EVENT_SYNC.PAST_EVENTS_DAYS,
      );
    } catch (error) {
      // 4. Check if it's a token expiry error (Facebook returns error code 190)
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      if (errorMessage.includes("190") || errorMessage.includes("token")) {
        logger.error(
          "Token expired for page - marking as inactive",
          error instanceof Error ? error : null,
          {
            pageId: String(page.page_id),
            pageName: page.page_name,
          },
        );
        // Mark the page as having expired token
        await markTokenExpired(supabase, String(page.page_id));
        return { events: [], pageId: String(page.page_id), error: null };
      }
      // If not token error, throw it
      throw error;
    }

    logger.info("Events fetched from Facebook", {
      pageId: page.page_id,
      pageName: page.page_name,
      eventCount: events.length,
    });

    // 5. Process all events for this page
    const pageEventData = [];
    for (const event of events) {
      // Extract cover image URL if available
      // Note: For production, pass the Supabase client to this function to enable
      // downloading and storing images in Supabase Storage instead of using Facebook URLs
      let coverImageUrl: string | null = null;

      if (event.cover && event.cover.source) {
        logger.debug("Event has cover image", {
          eventId: event.id,
          coverUrl: event.cover.source,
        });
        // Use Facebook's URL directly; to upload to Storage, pass supabase client as parameter
        coverImageUrl = event.cover.source;
      }

      const normalized = normalizeEvent(
        event,
        String(page.page_id),
        coverImageUrl,
      );
      pageEventData.push(normalized);
    }

    return { events: pageEventData, pageId: String(page.page_id), error: null };
  } catch (error) {
    logger.error(
      "Failed to sync events for page",
      error instanceof Error ? error : null,
      {
        pageId: String(page.page_id),
        pageName: page.page_name,
      },
    );
    return {
      events: [],
      pageId: String(page.page_id),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
