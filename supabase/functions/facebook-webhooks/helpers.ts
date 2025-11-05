/**
 * Facebook Webhook Helper Utilities
 * Includes signature verification and payload processing
 */

import { logger } from "../_shared/services/logger-service.ts";

// this is one of many "helper", which are different from utils; 90% of the time,
// helpers are for one file and thus specific for domain stuff/business logic (calculating,
// transforming etc), meanwhile utils are more general and thus used across multiple files.
// helpers are also very encapsulated usually; you should have a "token-expiry" helper
// for token-refresh because otherwise, it'd be 500 lines; better yet, it's easy to
// separate concerns that way into a single file

// this helper is specifically for Facebook webhooks, which have their own signature
// verification process and payload structure. So all webhook-related logic that
// doesn't belong in the main handler goes here

/**
 * Verify Facebook webhook signature using HMAC-SHA256
 * @param payload - Raw request body as string
 * @param signature - X-Hub-Signature-256 header value (format: sha256=hexdigest)
 * @param appSecret - Facebook App Secret
 * @returns true if signature is valid, false otherwise
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string,
): Promise<boolean> {
  try {
    if (!signature || !signature.startsWith("sha256=")) {
      logger.warn("Invalid signature format");
      return false;
    }

    // Extract the hex digest from the header
    // again, header = something buried within the HTTP request that contains metadata,
    // like content type, authorization, user agent, etc. Here, we're looking for the
    // "X-Hub-Signature-256" header, a surprise tool that'll help us later;)
    const expectedSignature = signature.substring(7); // Remove "sha256=" prefix

    // Compute HMAC-SHA256 of payload with app secret
    // Again, HMAC is "Hash-based Message Authentication Code", a fancy word for sending a
    // hash of the message along with the message to verify integrity and authenticity, lest
    // someone tamper with it in transit. The SHA-256 part is just the hashing algorithm used.
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature_bytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload),
    );

    // Convert to hex string
    // to give an example of a hex string, "hello" in ascii is "68 65 6c 6c 6f" in hex
    const computed_signature = Array.from(new Uint8Array(signature_bytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Timing-safe comparison
    // this is important to prevent timing attacks, where an attacker measures the time it takes
    // to compare two strings to guess the correct signature byte-by-byte. "Timeing-safe" means
    // we always take the same amount of time to compare, regardless of where the first mismatch is.
    return timingSafeCompare(computed_signature, expectedSignature);
  } catch (error) {
    logger.error(
      "Webhook signature verification error",
      error instanceof Error ? error : null,
    );
    return false;
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal, false otherwise
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

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
 * Rate limit check for webhook processing
 * Prevent duplicate processing of same webhook within time window
 */
interface RateLimitState {
  lastWebhookTimestamp: number;
  minIntervalMs: number;
}

const rateLimitState: Map<string, RateLimitState> = new Map();

/**
 * Check if webhook for page should be rate limited
 * @param pageId - Facebook page ID
 * @param minIntervalMs - Minimum interval between webhooks (ms), default 1000
 * @returns true if rate limited, false if should process
 */
export function isWebhookRateLimited(
  pageId: string,
  minIntervalMs: number = 1000,
): boolean {
  // rate limiting here is specifically for "throttling" or "slowing down" requests
  // to prevent overload or duplicate processing. Here, we keep track of the last time
  // we processed a webhook for each page, and if a new webhook comes in too soon,
  // we skip processing it. What it can also mean is actually limiting the number of requests
  // a specific client can make lest they abuse the system to send a billion request and crash
  // the server, called a "DDOS attack" (Distributed Denial of Service). Not what's happening here

  // The way this is done is we store the last processed timestamp for each page in a map (or
  // dictionary). When a new webhook comes in, we check the current time against the last
  // processed time. If the difference is less than the minimum interval, we consider it
  // rate limited and skip processing. Otherwise, we update the last processed time and
  // allow processing to continue.

  const now = Date.now();
  const state = rateLimitState.get(pageId);

  if (!state) {
    // First webhook for this page
    // i.e. we haven't seen any webhooks for this page yet, so we just store the timestamp
    rateLimitState.set(pageId, {
      lastWebhookTimestamp: now,
      minIntervalMs,
    });
    return false;
  }

  // Check if enough time has passed
  const timeSinceLastWebhook = now - state.lastWebhookTimestamp;
  if (timeSinceLastWebhook < minIntervalMs) {
    logger.debug(`Webhook rate limited for page ${pageId}`, {
      timeSinceLastWebhook,
      minIntervalMs,
    });
    return true;
  }

  // Update timestamp
  state.lastWebhookTimestamp = now;
  return false;
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
