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
} from "../_shared/services/facebook-service";
import type { FacebookEvent } from "../_shared/types";
import { validateOAuthState } from "../_shared/validation";
import { validateOAuthCallbackQuery } from "./schema";
import type { VercelRequest, VercelResponse } from "../_shared/types";
import { getAllowedOrigins } from "../_shared/utils/url-builder-util";
import { normalizeEvent } from "@event-aggregator/shared/utils/event-normalizer";

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

  try {
    // Get the host from request headers or use the VERCEL_URL environment variable
    const host = req.headers.host || process.env.VERCEL_URL || "localhost";
    const protocol = process.env.NODE_ENV === "development"
      ? "http://"
      : "https://";
    const requestOrigin = `${protocol}${host}`;
    const url = new URL(`${requestOrigin}${req.url}`);

    // Validate query parameters
    const validation = validateOAuthCallbackQuery(url);
    if (!validation.success) {
      // If error param is present, it's from Facebook - redirect back to frontend with error
      const errorParam = url.searchParams.get("error");
      const stateParam = url.searchParams.get("state");
      if (errorParam && stateParam) {
        res.redirect(`${stateParam}?error=${encodeURIComponent(errorParam)}`);
        return;
      }
      // Otherwise return validation error as JSON
      res.status(400).json({
        error: validation.error || "Invalid OAuth callback",
      });
      return;
    }

    const { code, state } = validation.data!;

    // Validate state parameter (CSRF protection) using dynamic allowed origins
    const allowedOrigins = getAllowedOrigins(requestOrigin);
    const stateValidation = validateOAuthState(state, allowedOrigins);
    if (!stateValidation.valid) {
      res.redirect(
        `${state}?error=${
          encodeURIComponent(stateValidation.error || "Invalid state")
        }`,
      );
      return;
    }

    const frontendOrigin = stateValidation.origin!;

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
      res.redirect(
        `${frontendOrigin}?error=${
          encodeURIComponent(
            "No Facebook pages found. Please make sure you have admin access to at least one page.",
          )
        }`,
      );
      return;
    }

    // Step 4: Store pages and tokens in Supabase using Vault
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let pagesStored = 0;
    let eventsAdded = 0;

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
          continue;
        }

        pagesStored++;

        // Step 5: Sync events for this page
        try {
          const events = await getAllRelevantEvents(page.id, pageToken);

          if (events.length > 0) {
            // Normalize and store events in database using the correct schema
            const normalizedEvents = events.map((event: FacebookEvent) => {
              const normalized = normalizeEvent(event, page.id);
              return {
                event_id: normalized.event_id,
                page_id: normalized.page_id,
                event_data: normalized.event_data,
              };
            });

            const { error: eventsError } = await supabase
              .from("events")
              .upsert(normalizedEvents);

            if (eventsError) {
              // Silent fail
            } else {
              eventsAdded += events.length;
            }
          }
        } catch (eventError) {
          console.error(`Error syncing events for page ${page.id}:`, eventError);
        }
      } catch (pageError) {
        // Continue with next page
      }
    }

    // Redirect back to frontend with success
    res.redirect(
      `${frontendOrigin}?success=true&pages=${pagesStored}&events=${eventsAdded}`,
    );
  } catch (error) {
    // Log error for debugging (in Vercel, this goes to function logs)
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    // Try to redirect to frontend with error if we have the URL
    try {
      const host = req.headers.host || process.env.VERCEL_URL || "localhost";
      const protocol = process.env.NODE_ENV === "development"
        ? "http://"
        : "https://";
      const url = new URL(`${protocol}${host}${req.url}`);
      const stateParam = url.searchParams.get("state");
      if (stateParam) {
        res.redirect(`${stateParam}?error=${encodeURIComponent(errorMsg)}`);
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
