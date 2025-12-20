import {
  checkTokenExpiry,
  markTokenExpired,
} from "../_shared/services/supabase-service.ts";
import { getAllRelevantEvents } from "@event-aggregator/shared/src/services/facebook-service.ts";
import { getPageToken } from "../_shared/services/vault-service.ts";
import { logger } from "../_shared/services/logger-service.ts";
import {
  EVENT_SYNC,
  TOKEN_REFRESH,
} from "@event-aggregator/shared/runtime/deno.js";
import { normalizeEvent } from "@event-aggregator/shared/utils/event-normalizer.js";
import type {
  DatabasePage,
  NormalizedEvent,
} from "@event-aggregator/shared/types.ts";
import { ExpiringToken, PageSyncResult } from "./types.ts";
import { downloadAndUploadImage } from "../_shared/services/image-service.ts";

type SyncSinglePageDeps = {
  checkTokenExpiry: typeof checkTokenExpiry;
  markTokenExpired: typeof markTokenExpired;
  getPageToken: typeof getPageToken;
  getAllRelevantEvents: typeof getAllRelevantEvents;
  normalizeEvent: typeof normalizeEvent;
};

const defaultSyncDeps: SyncSinglePageDeps = {
  checkTokenExpiry,
  markTokenExpired,
  getPageToken,
  getAllRelevantEvents,
  normalizeEvent,
};

let currentSyncDeps: SyncSinglePageDeps = { ...defaultSyncDeps };

export function setSyncSinglePageDeps(
  overrides: Partial<SyncSinglePageDeps>,
) {
  currentSyncDeps = { ...currentSyncDeps, ...overrides };
}

export function resetSyncSinglePageDeps() {
  currentSyncDeps = { ...defaultSyncDeps };
}

// this is one of many "helper", which are different from utils; 90% of the time,
// helpers are for one file and thus specific for domain stuff/business logic (calculating,
// transforming etc), meanwhile utils are more general and thus used across multiple files.
// helpers are also very encapsulated usually; you should have a "token-expiry" helper
// for token-refresh because otherwise, it'd be 500 lines; better yet, it's easy to
// separate concerns that way into a single file

// these helpers specifically handle syncing events for a single page, including checking
// token expiry, retrieving tokens from vault, calling facebook api, normalizing
// event data, and handling errors

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
    const tokenStatus = await currentSyncDeps.checkTokenExpiry(
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
    const accessToken = await currentSyncDeps.getPageToken(
      supabase,
      String(page.page_id),
    );
    if (!accessToken) {
      logger.error("No access token found for page", null, {
        pageId: String(page.page_id),
        pageName: page.page_name,
      });
      return { events: [], pageId: String(page.page_id), error: null };
    }

    logger.debug("Access token retrieved", {
      pageId: page.page_id,
      pageName: page.page_name,
    });

    logger.info("Syncing events for page", {
      pageId: page.page_id,
      pageName: page.page_name,
    });

    // 3. Get events from Facebook API
    let events;
    try {
      events = await currentSyncDeps.getAllRelevantEvents(
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
        await currentSyncDeps.markTokenExpired(supabase, String(page.page_id));
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
    const EVENT_IMAGES_BUCKET = "event-images"; // Bucket name for storing event images
    
    for (const event of events) {
      // Extract cover image URL if available and download/store it in Supabase Storage
      // This avoids CORS and tracking protection issues with Facebook CDN URLs
      let coverImageUrl: string | undefined;

      if (event.cover && event.cover.source) {
        logger.debug("Event has cover image", {
          eventId: event.id,
          coverUrl: event.cover.source,
        });
        
        try {
          // Generate a file path for the image: events/{year}/{eventId}.jpg
          const year = new Date().getFullYear();
          // Extract file extension from URL, handling query parameters
          const urlWithoutQuery = event.cover.source.split('?')[0];
          const fileExtension = urlWithoutQuery.split('.').pop()?.toLowerCase() || 'jpg';
          // Ensure we have a valid image extension
          const validExtension = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension) 
            ? fileExtension 
            : 'jpg';
          const filePath = `events/${year}/${event.id}.${validExtension}`;
          logger.debug("Uploading cover image to Supabase Storage", {
            pageId: page.page_id,
            eventId: event.id,
            bucket: EVENT_IMAGES_BUCKET,
            path: filePath,
          });
          
          // Download from Facebook and upload to Supabase Storage
          const uploadResult = await downloadAndUploadImage(
            supabase,
            event.cover.source,
            EVENT_IMAGES_BUCKET,
            filePath,
            {
              upsert: true, // Allow overwriting if image already exists
              cacheControl: "31536000", // Cache for 1 year
            }
          );
          
          coverImageUrl = uploadResult.url;
          logger.info("Downloaded and stored event cover image", {
            eventId: event.id,
            originalUrl: event.cover.source,
            storedUrl: coverImageUrl,
          });
        } catch (error) {
          // If image download/upload fails, log error but continue with event sync
          // Fall back to Facebook URL (may not work due to tracking protection, but better than nothing)
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;
          logger.error("Failed to download and store event cover image, using Facebook URL", 
            error instanceof Error ? error : null,
            {
              eventId: event.id,
              coverUrl: event.cover.source,
              errorMessage,
              errorStack,
            });
          coverImageUrl = event.cover.source;
        }
      }

      const normalized: NormalizedEvent = currentSyncDeps.normalizeEvent(
        event,
        String(page.page_id),
        (coverImageUrl ?? null) as null | undefined,
      );
      logger.debug("Normalized event payload", {
        pageId: normalized.page_id,
        eventId: normalized.event_id,
        startTime: normalized.event_data.start_time,
        cover: normalized.event_data.cover?.source ?? null,
      });
      pageEventData.push(normalized);
    }

    logger.info("Prepared events for page", {
      pageId: page.page_id,
      eventCount: pageEventData.length,
    });

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
