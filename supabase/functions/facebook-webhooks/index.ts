import { createClient } from "@supabase/supabase-js";
import { logger } from "../_shared/services/logger-service.ts";
import {
  extractEventChanges,
  extractPageIdFromEntry,
  FacebookWebhookPayload,
  hasEventChanges,
  validateWebhookPayload,
  validateWebhookSubscription,
} from "./schema.ts";
import {
  isWebhookRateLimited,
  processWebhookChanges,
  verifyWebhookSignature,
} from "./helpers.ts";
import { sendEventSyncFailedAlert } from "../_shared/services/mail-service.ts";

// this used to be a "handler", i.e. "thing that does something" (rather than connect,
// or help etc), but because we've refactored to supabase, it's now a "Edge Function".
// They're run on deno, an upgrade to nodejs, and work similarly to serverless functions
// we had before - basically, functions that run on demand or on a schedule.

// What this handler does is that it receives real-time notifications from Facebook when events change
// instead of polling every 12 hours. This is done thru facebook's dedicated Facebook App Webhooks service.
// A webhook is just a fancy word for an HTTP endpoint that receives POST requests whenever something happens
// on a page we subscribed to (like event created/updated/deleted). What's sent is a "payload", just a json
// object with details about what changed.

/**
 * Facebook Webhooks Handler
 * Receives real-time event updates from Facebook (Webhooks API v18.0)
 *
 * GET - Webhook subscription verification (called by Facebook)
 * POST - Webhook event payload (real-time events from Facebook)
 *
 * Flow:
 * 1. Verify webhook signature using HMAC-SHA256
 * 2. Parse and validate webhook payload
 * 3. Extract page ID and event changes
 * 4. Normalize events to standard format
 * 5. Store events in database
 */

const WEBHOOK_VERIFY_TOKEN = Deno.env.get("FACEBOOK_WEBHOOK_VERIFY_TOKEN") ||
  "verify_me";

// so you know what HTTP is - it's a protocol ("system") for transferring data over the web.
// within HTTP, there are different "methods" that indicate what kind of action you want to perform.
// The most common methods are GET and POST.
// - GET is used to request data from a server
// - POST is used to send data to a server.
// HTTP also has "headers" - these are like metadata that provide additional information about the
// request or response. Note that request are whole-sake objects containing these methods, headers etc

// Alright lesson 2: What is a "webhook"? A webhook is basically just an HTTP endpoint (a URL)
// that listens for incoming HTTP requests (usually POST) from another service when something
// happens. It's a way for one system to notify another system in real-time. In this case,
// the webhook is used to receive event updates from Facebook, but like GitHub also have them

function handleWebhookGet(url: URL): Response {
  // Facebook calls GET during webhook setup to verify the endpoint
  // When you set up a webhook subscription with Facebook, they need to verify that
  // you actually own the endpoint you're providing. So during setup, Facebook calls GET
  // on the webhook URL with a "hub.challenge" parameter that you must respond to with the same value.
  const validation = validateWebhookSubscription(url);

  if (!validation.valid) {
    logger.warn("Webhook subscription validation failed", {
      error: validation.error,
    });
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify the token matches our expected verify token
  // these are "tokens" - basically long random strings used to authenticate/verify requests
  // to ensure that the request is coming from a trusted source (in this case, Facebook)
  const token = url.searchParams.get("hub.verify_token");
  if (token !== WEBHOOK_VERIFY_TOKEN) {
    logger.warn("Webhook verify token mismatch");
    return new Response(JSON.stringify({ error: "Invalid verify token" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  logger.info("Webhook subscription verified");
  return new Response(validation.challenge);
}

async function handleWebhookPost(
  req: Request,
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<Response> {
  try {
    const appSecret = Deno.env.get("FACEBOOK_APP_SECRET");
    if (!appSecret) {
      throw new Error("Missing FACEBOOK_APP_SECRET");
    }

    // Get request body
    const rawBody = await req.text();

    // Verify webhook signature
    const signature = req.headers.get("x-hub-signature-256");
    if (!signature) {
      logger.warn("Missing webhook signature header");
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isValidSignature = await verifyWebhookSignature(
      rawBody,
      signature,
      appSecret,
    );

    if (!isValidSignature) {
      logger.warn("Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse and validate payload
    let payload: FacebookWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      logger.warn("Failed to parse webhook payload");
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const validation = await validateWebhookPayload(payload);
    if (!validation.valid || !validation.data) {
      logger.warn("Invalid webhook payload", {
        error: validation.error,
      });
      return new Response(
        JSON.stringify({ error: validation.error }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Process each entry
    let eventsProcessed = 0;
    let eventsFailed = 0;

    for (const entry of validation.data.entry) {
      try {
        const pageId = extractPageIdFromEntry(entry);

        // Rate limit check
        if (isWebhookRateLimited(pageId)) {
          logger.debug(`Webhook rate limited for page ${pageId}`);
          continue;
        }

        if (!hasEventChanges(entry)) {
          logger.debug(`No event changes in webhook for page ${pageId}`);
          continue;
        }

        const changes = extractEventChanges(entry);
        const result = await processWebhookChanges(pageId, changes, supabase);
        eventsProcessed += result.processed;
        eventsFailed += result.failed;
      } catch (entryError) {
        logger.error(
          `Error processing webhook entry`,
          entryError instanceof Error ? entryError : null,
        );
        eventsFailed++;
      }
    }

    logger.info("Webhook processing complete", {
      eventsProcessed,
      eventsFailed,
    });

    return new Response(
      JSON.stringify({
        success: true,
        eventsProcessed,
        eventsFailed,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    logger.error(
      "Webhook handler error",
      error instanceof Error ? error : null,
    );

    // Send alert about webhook processing failure
    await sendEventSyncFailedAlert(
      error instanceof Error ? error.message : "Unknown error",
      { source: "facebook_webhook" },
    );

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

async function handleWebhook(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // GET requests - subscription verification
  if (req.method === "GET") {
    return handleWebhookGet(url);
  }

  // POST requests - event payload
  if (req.method === "POST") {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    return await handleWebhookPost(req, supabase);
  }

  // All other methods
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(handleWebhook);
