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
} from "@event-aggregator/shared/services/facebook-service";
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

type LogLevel = "info" | "warn" | "error" | "debug";

export function logEvent(
  level: LogLevel,
  message: string,
  metadata: Record<string, unknown> = {},
): void {
  // Supabase (and Vercel) will happily ingest JSON strings, so we keep it mega simple.
  // Edge functions log out to the dashboard, CLI (`supabase functions logs`) and whatever drain you configure.
  // Their docs basically say: use console.* for quick debugging, format as JSON for structured goodness,
  // and wire up a log drain (Logflare, Datadog, etc.) when you want the fancy dashboards. So… here we are.
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...metadata,
  };

  const text = JSON.stringify(payload);
  switch (level) {
    case "warn":
      console.warn(text);
      break;
    case "error":
      console.error(text);
      break;
    case "debug":
      console.debug(text);
      break;
    default:
      console.log(text);
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
  // Set CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.status(200).send("OK");
    return;
  }

  // Only accept GET requests (redirects from Facebook)
  if (req.method !== "GET") {
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

    // Validate query parameters
    const validation = validateOAuthCallbackQuery(url);
    if (!validation.success) {
      logEvent("warn", "OAuth callback query validation failed", {
        error: validation.error,
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
        reason: stateValidation.error,
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
      throw new Error("Missing Facebook credentials");
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    // Step 1: Exchange code for short-lived token
    const shortLivedToken = await exchangeCodeForToken(
      code,
      facebookAppId,
      facebookAppSecret,
      oauthCallbackUrl,
    );

    // Step 2: Exchange for long-lived token (60 days)
    const longLivedToken = await exchangeForLongLivedToken(
      shortLivedToken,
      facebookAppId,
      facebookAppSecret,
    );

    // Step 3: Get user's pages
    const pages = await getUserPages(longLivedToken);

    if (pages.length === 0) {
      logEvent("info", "OAuth callback found no Facebook pages", {
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let pagesStored = 0;
    let pagesFailed = 0;
    let eventsAdded = 0;
    let eventSyncFailures = 0;

    for (const page of pages) {
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
            pageId: page.id,
            error: storeError?.message ?? storeError,
          });
          pagesFailed++;
          continue;
        }

        pagesStored++;

        // Step 5: Sync events for this page
        try {
          const events = await getAllRelevantEvents(page.id, pageToken);

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
              .upsert(normalizedEvents);

            if (eventsError) {
              logEvent("error", "Failed to upsert events in Supabase", {
                pageId: page.id,
                error: eventsError.message,
              });
              eventSyncFailures += events.length;
            } else {
              eventsAdded += events.length;
            }
          }
        } catch (eventError) {
          logEvent("error", "Error syncing events for page", {
            pageId: page.id,
            error: eventError instanceof Error ? eventError.message : eventError,
          });
          eventSyncFailures++;
        }
      } catch (pageError) {
        pagesFailed++;
        logEvent("error", "Unhandled error processing page", {
          pageId: page.id,
          error: pageError instanceof Error ? pageError.message : pageError,
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

    logEvent("info", "OAuth callback completed", {
      pagesStored,
      pagesFailed,
      eventsAdded,
      eventSyncFailures,
    });

    res.redirect(successRedirectUrl);
  } catch (error) {
    // Log error for debugging (in Vercel, this goes to function logs)
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logEvent("error", "OAuth callback failed", {
      error: errorMsg,
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
