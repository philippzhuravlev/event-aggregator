/**
 * OAuth Callback Handler for Node.js/Vercel
 *
 * This is the replacement for the Deno Edge Function.
 * Handles the OAuth2 flow:
 * 1. Receives authorization code from Facebook
 * 2. Exchanges code for long-lived access token
 * 3. Fetches user's Facebook pages
 * 4. Stores pages and tokens in database
 * 5. Syncs events from pages
 * 6. Redirects to frontend with results
 */

// this used to be a "handler", i.e. "thing that does something" (rather than connect,
// or help etc), but because we've refactored to supabase, it's now a "Edge Function".
// They're run on deno, an upgrade to nodejs, and work similarly to serverless functions
// we had before - basically, functions that run on demand or on a schedule.

// Oauth callback used to be in /supabase/functions/

import { createClient } from "@supabase/supabase-js";
import process from "node:process";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAllRelevantEvents,
  getUserPages,
  setFacebookServiceLogger,
} from "@event-aggregator/shared/services/facebook-service";
import {
  createServiceLoggerFromStructuredLogger,
  createStructuredLogger,
} from "@event-aggregator/shared/services/logger-service";
import type {
  FacebookEvent,
  NormalizedEvent,
  VercelRequest,
  VercelResponse,
} from "@event-aggregator/shared/types";
import { validateOAuthState } from "@event-aggregator/shared/validation";
import { validateOAuthCallbackQuery } from "./schema";
import { getAllowedOrigins } from "@event-aggregator/shared/runtime/node";
import { normalizeEvent } from "@event-aggregator/shared/utils/event-normalizer";
import { randomUUID } from "node:crypto";

type LogLevel = "info" | "warn" | "error" | "debug";

// Enable debug logs in production if VERBOSE_LOGGING is set, otherwise only in non-production
const vercelLogger = createStructuredLogger({
  shouldLogDebug: () => 
    process.env.VERBOSE_LOGGING === "true" || 
    process.env.NODE_ENV !== "production",
});

setFacebookServiceLogger(createServiceLoggerFromStructuredLogger(vercelLogger));

export function logEvent(
  level: LogLevel,
  message: string,
  metadata: Record<string, unknown> = {},
): void {
  switch (level) {
    case "warn":
      vercelLogger.warn(message, metadata);
      break;
    case "error":
      vercelLogger.error(message, null, metadata);
      break;
    case "debug":
      vercelLogger.debug(message, metadata);
      break;
    default:
      vercelLogger.info(message, metadata);
  }
}

export function buildRedirectUrl(
  stateValue: string | null,
  allowedOrigins: readonly string[],
  params: Record<string, string>,
): string | null {
  if (!stateValue) {
    return null;
  }

  const stateValidation = validateOAuthState(stateValue, allowedOrigins);
  if (!stateValidation.valid) {
    return null;
  }

  try {
    const redirectUrl = new URL(stateValue);
    for (const [key, value] of Object.entries(params)) {
      redirectUrl.searchParams.set(key, value);
    }
    return redirectUrl.toString();
  } catch (_error) {
    return null;
  }
}

/**
 * Main handler for OAuth callback requests
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Generate a request ID for tracking this request through logs
  const requestId = randomUUID();
  const startTime = Date.now();

  // Log incoming request
  logEvent("info", "OAuth callback request received", {
    requestId,
    method: req.method,
    url: req.url,
    host: req.headers.host,
    userAgent: req.headers["user-agent"],
    origin: req.headers.origin,
  });

  // Set CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    logEvent("debug", "CORS preflight request", { requestId });
    res.status(200).send("OK");
    return;
  }

  // Only accept GET requests (redirects from Facebook)
  if (req.method !== "GET") {
    logEvent("warn", "OAuth callback received non-GET request", {
      requestId,
      method: req.method,
    });
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const host = req.headers.host || process.env.VERCEL_URL || "localhost";
  const protocol = process.env.NODE_ENV === "development"
    ? "http://"
    : "https://";
  const requestOrigin = `${protocol}${host}`;
  const allowedOrigins = getAllowedOrigins(requestOrigin);

  try {
    const url = new URL(`${requestOrigin}${req.url}`);

    logEvent("debug", "Processing OAuth callback", {
      requestId,
      requestOrigin,
      queryParams: Object.fromEntries(url.searchParams.entries()),
    });

    // Validate query parameters
    const validation = validateOAuthCallbackQuery(url);
    if (!validation.success) {
      logEvent("warn", "OAuth callback query validation failed", {
        requestId,
        error: validation.error,
        queryParams: Object.fromEntries(url.searchParams.entries()),
      });
      // If error param is present, it's from Facebook - redirect back to frontend with error
      const errorParam = url.searchParams.get("error");
      const stateParam = url.searchParams.get("state");
      if (errorParam) {
        const redirectUrl = buildRedirectUrl(stateParam, allowedOrigins, {
          error: errorParam,
        });
        if (redirectUrl) {
          res.redirect(redirectUrl);
          return;
        }
      }
      // Otherwise return validation error as JSON
      res.status(400).json({
        error: validation.error || "Invalid OAuth callback",
      });
      return;
    }

    const { code, state } = validation.data!;

    // Validate state parameter (CSRF protection) using dynamic allowed origins
    const stateValidation = validateOAuthState(state, allowedOrigins);
    if (!stateValidation.valid) {
      logEvent("warn", "OAuth callback state rejected", {
        requestId,
        reason: stateValidation.error,
        stateLength: state?.length ?? 0,
      });
      const redirectUrl = buildRedirectUrl(state, allowedOrigins, {
        error: stateValidation.error || "Invalid state",
      });
      if (redirectUrl) {
        res.redirect(redirectUrl);
        return;
      }

      res.status(400).json({
        error: stateValidation.error || "Invalid state",
      });
      return;
    }

    const frontendOrigin = stateValidation.origin!;
    res.setHeader("Access-Control-Allow-Origin", frontendOrigin);
    res.setHeader("Vary", "Origin");

    // Get environment variables directly from process.env (Vercel injects them)
    const facebookAppId = process.env.FACEBOOK_APP_ID;
    const facebookAppSecret = process.env.FACEBOOK_APP_SECRET;
    const oauthCallbackUrl = process.env.OAUTH_CALLBACK_URL ||
      `${protocol}${host}/api/oauth-callback`;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!facebookAppId || !facebookAppSecret) {
      logEvent("error", "Missing Facebook credentials", { requestId });
      throw new Error("Missing Facebook credentials");
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      logEvent("error", "Missing Supabase credentials", { requestId });
      throw new Error("Missing Supabase credentials");
    }

    logEvent("debug", "Starting OAuth token exchange", {
      requestId,
      oauthCallbackUrl,
      hasAppId: !!facebookAppId,
      hasAppSecret: !!facebookAppSecret,
    });

    // Step 1: Exchange code for short-lived token
    logEvent("info", "Exchanging authorization code for token", { requestId });
    const shortLivedToken = await exchangeCodeForToken(
      code,
      facebookAppId,
      facebookAppSecret,
      oauthCallbackUrl,
    );

    // Step 2: Exchange for long-lived token (60 days)
    logEvent("info", "Exchanging for long-lived token", { requestId });
    const longLivedToken = await exchangeForLongLivedToken(
      shortLivedToken,
      facebookAppId,
      facebookAppSecret,
    );

    // Step 3: Get user's pages
    logEvent("info", "Fetching user's Facebook pages", { requestId });
    const pages = await getUserPages(longLivedToken);
    logEvent("debug", "Fetched Facebook pages", {
      requestId,
      pageCount: pages.length,
    });

    if (pages.length === 0) {
      logEvent("info", "OAuth callback found no Facebook pages", {
        requestId,
        facebookUserId: validation.data?.code ? "redacted" : undefined,
      });
      const redirectUrl = buildRedirectUrl(
        state,
        allowedOrigins,
        {
          error:
            "No Facebook pages found. Please make sure you have admin access to at least one page.",
        },
      );
      if (redirectUrl) {
        res.redirect(redirectUrl);
      } else {
        res.redirect(
          `${frontendOrigin}?error=${
            encodeURIComponent(
              "No Facebook pages found. Please make sure you have admin access to at least one page.",
            )
          }`,
        );
      }
      return;
    }

    // Step 4: Store pages and tokens in Supabase using Vault
    logEvent("info", "Storing pages and tokens in Supabase", {
      requestId,
      pageCount: pages.length,
    });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let pagesStored = 0;
    let pagesFailed = 0;
    let eventsAdded = 0;
    let eventSyncFailures = 0;

    for (const page of pages) {
      logEvent("debug", "Processing page", {
        requestId,
        pageId: page.id,
        pageName: page.name,
      });
      try {
        // Store page and token using the store_page_token function
        // which handles both vault encryption and page table updates
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 60);

        const pageToken = page.access_token || longLivedToken;

        // Call the store_page_token SQL function
        // This stores the token in Vault and updates the pages table
        const { data: pageId, error: storeError } = await supabase.rpc(
          "store_page_token",
          {
            p_page_id: parseInt(page.id, 10),
            p_page_name: page.name,
            p_access_token: pageToken,
            p_expiry: expiresAt.toISOString(),
          },
        );

        if (storeError) {
          logEvent("error", "Failed to store page token in Supabase", {
            requestId,
            pageId: page.id,
            pageName: page.name,
            error: storeError?.message ?? storeError,
          });
          pagesFailed++;
          continue;
        }

        pagesStored++;
        logEvent("debug", "Successfully stored page token", {
          requestId,
          pageId: page.id,
          pageName: page.name,
        });

        // Step 5: Sync events for this page
        try {
          logEvent("debug", "Fetching events for page", {
            requestId,
            pageId: page.id,
          });
          const events = await getAllRelevantEvents(page.id, pageToken);
          logEvent("debug", "Fetched events for page", {
            requestId,
            pageId: page.id,
            eventCount: events.length,
          });

          if (events.length > 0) {
            // Normalize and store events in database using the correct schema
            const normalizedEvents = events.reduce<
              Array<{
                event_id: string;
                page_id: number;
                event_data: NormalizedEvent["event_data"];
              }>
            >((acc, event: FacebookEvent) => {
              try {
                const normalized = normalizeEvent(event, page.id);
                acc.push({
                  event_id: normalized.event_id,
                  page_id: normalized.page_id,
                  event_data: normalized.event_data,
                });
              } catch (normalizeError) {
                logEvent("warn", "Skipping event due to invalid page id", {
                  pageId: page.id,
                  eventId: event.id,
                  error: normalizeError instanceof Error
                    ? normalizeError.message
                    : normalizeError,
                });
              }
              return acc;
            }, []);

            const { error: eventsError } = await supabase
              .from("events")
              .upsert(normalizedEvents, { onConflict: ["page_id", "event_id"] });

            if (eventsError) {
              logEvent("error", "Failed to upsert events in Supabase", {
                requestId,
                pageId: page.id,
                eventCount: events.length,
                error: eventsError.message,
              });
              eventSyncFailures += events.length;
            } else {
              eventsAdded += events.length;
              logEvent("debug", "Successfully upserted events", {
                requestId,
                pageId: page.id,
                eventCount: events.length,
              });
            }
          }
        } catch (eventError) {
          logEvent("error", "Error syncing events for page", {
            requestId,
            pageId: page.id,
            error: eventError instanceof Error ? eventError.message : eventError,
            stack: eventError instanceof Error ? eventError.stack : undefined,
          });
          eventSyncFailures++;
        }
      } catch (pageError) {
        pagesFailed++;
        logEvent("error", "Unhandled error processing page", {
          requestId,
          pageId: page.id,
          error: pageError instanceof Error ? pageError.message : pageError,
          stack: pageError instanceof Error ? pageError.stack : undefined,
        });
      }
    }

    // Redirect back to frontend with success
    const redirectParams: Record<string, string> = {
      success: "true",
      pages: String(pagesStored),
      events: String(eventsAdded),
    };
    if (pagesFailed > 0) {
      redirectParams.pagesFailed = String(pagesFailed);
    }
    if (eventSyncFailures > 0) {
      redirectParams.eventErrors = String(eventSyncFailures);
    }

    const successRedirectUrl = buildRedirectUrl(state, allowedOrigins, redirectParams) ??
      `${frontendOrigin}?success=true&pages=${pagesStored}&events=${eventsAdded}`;

    const duration = Date.now() - startTime;
    logEvent("info", "OAuth callback completed", {
      requestId,
      pagesStored,
      pagesFailed,
      eventsAdded,
      eventSyncFailures,
      durationMs: duration,
    });

    res.redirect(successRedirectUrl);
  } catch (error) {
    // Log error for debugging (in Vercel, this goes to function logs)
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logEvent("error", "OAuth callback failed", {
      requestId,
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
      durationMs: duration,
    });

    // Try to redirect to frontend with error if we have the URL
    try {
      const url = new URL(`${requestOrigin}${req.url}`);
      const stateParam = url.searchParams.get("state");
      const redirectUrl = buildRedirectUrl(stateParam, allowedOrigins, {
        error: errorMsg,
      });
      if (redirectUrl) {
        res.redirect(redirectUrl);
        return;
      }
    } catch (_urlError) {
      // If URL parsing fails, continue to JSON error response
    }

    // Fallback to JSON error
    res.status(500).json({ error: errorMsg });
  }
}

export default handler;
