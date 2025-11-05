/**
 * Facebook Webhook Event Validation Schema
 * Validates and types Facebook webhook payload structure
 */

/**
 * Single event object from Facebook webhook
 */
export interface FacebookWebhookEvent {
  time: number; // Unix timestamp
  type: string; // Event type (e.g., 'event.create', 'event.update', 'event.delete')
  id?: string; // Event ID
  object?: {
    id?: string;
    type?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown; // Facebook includes additional fields
}

/**
 * Complete webhook payload structure
 */
export interface FacebookWebhookPayload {
  object: "page" | "user"; // Always "page" for page webhooks
  entry: Array<{
    id: string; // Page ID
    time: number;
    messaging?: Array<{
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message?: { text: string; [key: string]: unknown };
      [key: string]: unknown;
    }>;
    changes?: Array<{
      value: {
        from: { name: string; id: string };
        object: string;
        verb: string;
        published: number;
        story?: string;
        [key: string]: unknown;
      };
      field: string;
    }>;
  }>;
}

/**
 * Webhook subscription validation request (GET)
 */
export interface WebhookValidationRequest {
  "hub.mode": "subscribe";
  "hub.challenge": string;
  "hub.verify_token": string;
}

/**
 * Validate webhook subscription request (GET challenge)
 */
export function validateWebhookSubscription(
  url: URL,
): { valid: boolean; challenge?: string; error?: string } {
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const token = url.searchParams.get("hub.verify_token");

  if (!mode || !challenge || !token) {
    return {
      valid: false,
      error: "Missing required webhook validation parameters",
    };
  }

  if (mode !== "subscribe") {
    return {
      valid: false,
      error: "Invalid hub.mode",
    };
  }

  // Token verification happens at handler level (pass expected token)
  return {
    valid: true,
    challenge,
  };
}

/**
 * Validate webhook event payload (POST)
 */
export function validateWebhookPayload(
  body: unknown,
): {
  valid: boolean;
  data?: FacebookWebhookPayload;
  error?: string;
} {
  try {
    if (!body || typeof body !== "object") {
      return {
        valid: false,
        error: "Invalid request body",
      };
    }

    const payload = body as Record<string, unknown>;

    // Check required fields
    if (!payload.object) {
      return {
        valid: false,
        error: "Missing 'object' field",
      };
    }

    if (payload.object !== "page" && payload.object !== "user") {
      return {
        valid: false,
        error: "Invalid 'object' value - must be 'page' or 'user'",
      };
    }

    if (!Array.isArray(payload.entry)) {
      return {
        valid: false,
        error: "Missing or invalid 'entry' array",
      };
    }

    // Validate entry structure
    for (const entry of payload.entry) {
      if (!entry || typeof entry !== "object") {
        return {
          valid: false,
          error: "Invalid entry in array",
        };
      }

      const entryObj = entry as Record<string, unknown>;

      if (!entryObj.id) {
        return {
          valid: false,
          error: "Entry missing required 'id' field",
        };
      }

      if (typeof entryObj.id !== "string") {
        return {
          valid: false,
          error: "Entry 'id' must be a string",
        };
      }

      if (typeof entryObj.time !== "number" && entryObj.time !== undefined) {
        return {
          valid: false,
          error: "Entry 'time' must be a number if present",
        };
      }
    }

    return {
      valid: true,
      data: payload as unknown as FacebookWebhookPayload,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error
        ? error.message
        : "Unknown validation error",
    };
  }
}

/**
 * Extract page ID from webhook entry
 */
export function extractPageIdFromEntry(
  entry: FacebookWebhookPayload["entry"][0],
): string {
  return entry.id;
}

/**
 * Check if webhook payload contains event changes
 */
export function hasEventChanges(
  entry: FacebookWebhookPayload["entry"][0],
): boolean {
  return Array.isArray(entry.changes) && entry.changes.length > 0;
}

/**
 * Extract event creation changes from webhook
 */
export function extractEventChanges(
  entry: FacebookWebhookPayload["entry"][0],
): Array<{
  field: string;
  event: FacebookWebhookEvent;
}> {
  if (!Array.isArray(entry.changes)) {
    return [];
  }

  return entry.changes
    .filter((change) => change.field === "events") // Only process event changes
    .map((change) => {
      const changeValue = change.value as Record<string, unknown>;
      const fromObj = changeValue.from as Record<string, unknown> || {};

      return {
        field: change.field,
        event: {
          time: Math.floor(Date.now() / 1000),
          type: (changeValue.verb as string) || "event.update",
          id: fromObj.id as string | undefined,
          object: {
            id: fromObj.id as string | undefined,
            type: "event",
            story: changeValue.story,
            published: changeValue.published,
          },
        } as unknown as FacebookWebhookEvent,
      };
    });
}
