/**
 * Facebook Webhook Helper Utilities
 * Includes signature verification and payload processing
 */

import { logger } from "../_shared/services/index.ts";
import { SlidingWindowRateLimiter } from "../_shared/validation/index.ts";

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
const webhookRateLimiter = new SlidingWindowRateLimiter();
webhookRateLimiter.initialize("facebook-webhooks", 1, 1000);



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
  return !webhookRateLimiter.check("facebook-webhooks", pageId);
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
  const value = change.value;
  const verb = (value.verb as string) || "unknown";
  const published = (value.published as number) ||
    Math.floor(Date.now() / 1000);

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

  return {
    eventId: (value.id as string) || undefined,
    pageId,
    timestamp: published * 1000, // Convert to milliseconds
    action: actionMap[verb] || "unknown",
    eventType: change.field,
    story: (value.story as string) || undefined,
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
  changes: Array<
    { field: string; event: { type: string; object?: Record<string, unknown> } }
  >,
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  for (const change of changes) {
    try {
      if (!shouldProcessEventType(change.event.type)) {
        logger.debug(`Skipping event type: ${change.event.type}`);
        continue;
      }

      // Normalize webhook event to standard format
      const normalized = normalizeWebhookChange(pageId, {
        field: change.field,
        value: change.event.object || {},
      });

      // Store in database - use insert with onConflict to upsert
      const eventData = {
        page_id: normalized.pageId,
        external_id: normalized.eventId ||
          `${normalized.pageId}-${normalized.timestamp}`,
        title: normalized.story || `Event ${normalized.action}`,
        description: `Facebook ${normalized.action} event`,
        start_time: new Date(normalized.timestamp).toISOString(),
        end_time: new Date(normalized.timestamp + 3600000).toISOString(),
        source: "facebook_webhook",
        created_at: new Date().toISOString(),
      };

      const { error: storeError } = await (supabase
        .from("events")
        // deno-lint-ignore no-explicit-any
        .upsert(eventData as any, { onConflict: "external_id" }) as any);

      if (storeError) {
        throw new Error(`Failed to store event: ${storeError.message}`);
      }

      logger.debug(`Processed webhook event for page ${pageId}`, {
        eventType: change.event.type,
        action: normalized.action,
      });

      processed++;
    } catch (changeError) {
      logger.error(
        `Error processing webhook change`,
        changeError instanceof Error ? changeError : null,
      );
      failed++;
    }
  }

  return { processed, failed };
}
