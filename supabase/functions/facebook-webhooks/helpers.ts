/**
 * Facebook Webhook Helper Utilities
 * Includes signature verification and payload processing
 */

import { logger } from "../_shared/services/logger-service.ts";
import { batchWriteEvents } from "../_shared/services/supabase-service.ts";
import { getEventDetails } from "@event-aggregator/shared/src/services/facebook-service.ts";
import { getPageToken } from "../_shared/services/vault-service.ts";
import { createSlidingWindowLimiter } from "@event-aggregator/shared/validation/rate-limit-validation.js";
import { normalizeEvent } from "@event-aggregator/shared/utils/event-normalizer.js";
import type { NormalizedEvent } from "@event-aggregator/shared/types.ts";

// this is one of many "helper", which are different from utils; 90% of the time,
// helpers are for one file and thus specific for domain stuff/business logic (calculating,
// transforming etc), meanwhile utils are more general and thus used across multiple files.
// helpers are also very encapsulated usually; you should have a "token-expiry" helper
// for token-refresh because otherwise, it'd be 500 lines; better yet, it's easy to
// separate concerns that way into a single file

// this helper is specifically for Facebook webhooks, which have their own signature
// verification process and payload structure. So all webhook-related logic that
// doesn't belong in the main handler goes here

// Rate limiter for webhooks (1 webhook per page per 1000ms)
const webhookRateLimiter = createSlidingWindowLimiter({
  name: "facebook-webhooks",
  maxRequests: 1,
  windowMs: 1_000,
});

/**
 * Check if event type should be processed
 * @param eventType - Event type string (e.g., 'event.create', 'event.update')
 * @returns true if event should be processed
 */
export function shouldProcessEventType(eventType: string): boolean {
  // these event types are the ones we care about; others can be ignored
  const processedTypes = [
    "event.create",
    "event.update",
    "event.delete",
    "post.create",
    "post.update",
    "post.delete",
  ];

  return processedTypes.includes(eventType);
}

/**
 * Check if webhook for page should be rate limited
 * Prevent duplicate processing of same webhook within time window
 * Uses sliding window rate limiting with 1 webhook per 1000ms per page
 *
 * Rate limiting here is specifically for "throttling" or "slowing down" requests
 * to prevent overload or duplicate processing. We keep track of the time we
 * processed a webhook for each page, and if a new webhook comes in too soon,
 * we skip processing it.
 *
 * What it can also mean is actually limiting the number of requests a specific
 * client can make lest they abuse the system to send a billion requests and crash
 * the server, called a "DDOS attack" (Distributed Denial of Service). Not what's
 * happening here, but the principle is similar.
 *
 * @param pageId - Facebook page ID
 * @returns true if rate limited, false if should process
 */
export function isWebhookRateLimited(pageId: string): boolean {
  return !webhookRateLimiter.check(pageId);
}

/**
 * Extract event details from webhook change value
 * Returns normalized event data
 */
export interface NormalizedWebhookEvent {
  // again, this is just type checking no worries; it's an interface because that's the way
  // TypeScript does type checking for objects. It's not compiled to JS, just used when compiling
  // also don't confuse it with interfaces from java or C#, which are whole-sale "contracts"
  eventId?: string;
  pageId: string;
  timestamp: number;
  action: "created" | "updated" | "deleted" | "unknown";
  eventType: string;
  story?: string;
}

/**
 * Normalize webhook change to standard event format
 */
export function normalizeWebhookChange(
  // normalization is just converting data from one format to another, usually to a standard format
  // that our system understands. Here, we're taking the raw webhook change data from Facebook
  // and converting it into a normalized format that our event processing system can work with.
  pageId: string,
  change: {
    field: string;
    value: Record<string, unknown>;
  },
): NormalizedWebhookEvent {
  const value = change.value ?? {};
  const verb = typeof value.verb === "string"
    ? value.verb.toLowerCase()
    : "unknown";
  const published = typeof value.published === "number"
    ? value.published
    : Math.floor(Date.now() / 1000);

  const eventIdCandidates: unknown[] = [
    value.id,
    value.event_id,
    value.eventId,
    value.parent_id,
    value.parentId,
  ];

  const eventObj = value.event;
  if (eventObj && typeof eventObj === "object") {
    eventIdCandidates.push((eventObj as Record<string, unknown>).id);
  }

  const objectObj = value.object;
  if (objectObj && typeof objectObj === "object") {
    eventIdCandidates.push((objectObj as Record<string, unknown>).id);
  }

  const eventId = eventIdCandidates.find((candidate): candidate is string =>
    typeof candidate === "string" && candidate.length > 0
  );

  const actionMap: Record<
    string,
    "created" | "updated" | "deleted" | "unknown"
  > = {
    add: "created",
    create: "created",
    edit: "updated",
    update: "updated",
    delete: "deleted",
    remove: "deleted",
  };

  const eventTypeMap: Record<string, string> = {
    add: "event.create",
    create: "event.create",
    edit: "event.update",
    update: "event.update",
    delete: "event.delete",
    remove: "event.delete",
  };

  const action = actionMap[verb] ?? "unknown";
  const eventType = eventTypeMap[verb] ?? change.field;

  return {
    eventId,
    pageId,
    timestamp: published * 1000, // Convert to milliseconds
    action,
    eventType,
    story: typeof value.story === "string" ? value.story : undefined,
  };
}

/**
 * Process webhook changes and store in database
 * @param pageId - Facebook page ID
 * @param changes - Array of webhook changes
 * @param supabase - Supabase client
 * @returns Object with counts of processed and failed events
 */
export async function processWebhookChanges(
  pageId: string,
  changes: Array<{ field: string; value: Record<string, unknown> }>,
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  const eventsToUpsert: NormalizedEvent[] = [];
  let cachedAccessToken: string | null | undefined;

  const resolveAccessToken = async (): Promise<string | null> => {
    if (cachedAccessToken !== undefined) {
      return cachedAccessToken;
    }
    cachedAccessToken = await getPageToken(supabase, pageId);
    if (!cachedAccessToken) {
      logger.warn("No access token found for page when processing webhook", {
        pageId,
      });
    }
    return cachedAccessToken;
  };

  for (const change of changes) {
    try {
      const normalized = normalizeWebhookChange(pageId, change);

      if (
        normalized.eventType &&
        !shouldProcessEventType(normalized.eventType)
      ) {
        logger.debug("Skipping webhook event type", {
          eventType: normalized.eventType,
          pageId,
        });
        continue;
      }

      const eventId = resolveEventId(change.value, normalized.eventId);
      if (!eventId) {
        logger.warn("Webhook change missing event id", {
          pageId,
          valueKeys: Object.keys(change.value ?? {}),
        });
        failed++;
        continue;
      }

      if (normalized.action === "deleted") {
        const { error: deleteError } = await supabase
          .from("events")
          .delete()
          .eq("page_id", parseInt(pageId, 10))
          .eq("event_id", eventId);

        if (deleteError) {
          throw new Error(
            `Failed to delete event ${eventId}: ${deleteError.message}`,
          );
        }

        logger.debug("Deleted event from webhook change", {
          pageId,
          eventId,
        });
        processed++;
        continue;
      }

      const accessToken = await resolveAccessToken();
      if (!accessToken) {
        failed++;
        continue;
      }

      let eventDetails;
      try {
        eventDetails = await getEventDetails(eventId, accessToken);
      } catch (fetchError) {
        logger.error(
          "Failed to fetch event details for webhook change",
          fetchError instanceof Error ? fetchError : null,
          {
            pageId,
            eventId,
          },
        );
        failed++;
        continue;
      }

      if (!eventDetails) {
        logger.warn("Event details not returned for webhook change", {
          pageId,
          eventId,
        });
        failed++;
        continue;
      }

      eventsToUpsert.push(normalizeEvent(eventDetails, pageId));
    } catch (changeError) {
      logger.error(
        "Error processing webhook change",
        changeError instanceof Error ? changeError : null,
        {
          pageId,
        },
      );
      failed++;
    }
  }

  if (eventsToUpsert.length > 0) {
    try {
      await batchWriteEvents(supabase, eventsToUpsert);
      processed += eventsToUpsert.length;
    } catch (storeError) {
      logger.error(
        "Failed to persist webhook events",
        storeError instanceof Error ? storeError : null,
        { pageId, count: eventsToUpsert.length },
      );
      failed += eventsToUpsert.length;
    }
  }

  return { processed, failed };
}

function resolveEventId(
  value: Record<string, unknown>,
  fallback?: string,
): string | undefined {
  const candidates: unknown[] = [
    value.id,
    value.event_id,
    value.eventId,
    value.parent_id,
    value.parentId,
  ];

  const nestedEvent = value.event;
  if (nestedEvent && typeof nestedEvent === "object") {
    candidates.push((nestedEvent as Record<string, unknown>).id);
  }

  const nestedObject = value.object;
  if (nestedObject && typeof nestedObject === "object") {
    candidates.push((nestedObject as Record<string, unknown>).id);
  }

  if (fallback) {
    candidates.push(fallback);
  }

  return candidates.find((candidate): candidate is string =>
    typeof candidate === "string" && candidate.length > 0
  );
}
