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
import { validateOAuthState } from "../_shared/validation/index";
import { validateOAuthCallbackQuery } from "./schema";
import type { VercelRequest, VercelResponse } from "../_shared/types";

/**
 * Main handler for OAuth callback requests
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200).send("OK");
    return;
  }

  // Only accept GET requests (redirects from Facebook)
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const url = new URL(`http://localhost${req.url}`);

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

    // Validate state parameter (CSRF protection)
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://event-aggregator-nine.vercel.app",
      // Add your production domain here
    ];

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

    // Get environment variables
    const env = req.env || process.env;
    const facebookAppId = env.FACEBOOK_APP_ID;
    const facebookAppSecret = env.FACEBOOK_APP_SECRET;
    const oauthCallbackUrl = env.OAUTH_CALLBACK_URL ||
      "https://event-aggregator-nine.vercel.app/api/oauth-callback";
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!facebookAppId || !facebookAppSecret) {
      throw new Error("Missing Facebook credentials");
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    console.log("[OAuth] Exchanging code for token...", {
      code: code.substring(0, 10) + "...",
    });

    // Step 1: Exchange code for short-lived token
    const shortLivedToken = await exchangeCodeForToken(
      code,
      facebookAppId,
      facebookAppSecret,
      oauthCallbackUrl,
    );

    console.log(
      "[OAuth] Got short-lived token, exchanging for long-lived token...",
    );

    // Step 2: Exchange for long-lived token (60 days)
    const longLivedToken = await exchangeForLongLivedToken(
      shortLivedToken,
      facebookAppId,
      facebookAppSecret,
    );

    console.log("[OAuth] Got long-lived token, fetching user pages...");

    // Step 3: Get user's pages
    const pages = await getUserPages(longLivedToken);
    console.log(`[OAuth] Found ${pages.length} pages`);

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

    // Step 4: Store pages and tokens in Supabase
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let pagesStored = 0;
    let eventsAdded = 0;

    for (const page of pages) {
      try {
        // Store page and token
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 60);

        const { error: upsertError } = await supabase
          .from("facebook_pages")
          .upsert(
            {
              page_id: parseInt(page.id, 10),
              page_name: page.name,
              access_token: page.access_token || longLivedToken,
              expires_at: expiresAt.toISOString(),
              token_refreshed_at: new Date().toISOString(),
              is_active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "page_id" },
          ) as unknown as { error: Error | null };

        if (upsertError) {
          console.warn(`[OAuth] Failed to store page ${page.id}:`, upsertError);
          continue;
        }

        pagesStored++;

        // Step 5: Sync events for this page
        console.log(`[OAuth] Syncing events for page ${page.id}...`);
        const pageToken = page.access_token || longLivedToken;
        const events = await getAllRelevantEvents(page.id, pageToken);

        if (events.length > 0) {
          // Store events in database
          const { error: eventsError } = await supabase
            .from("events")
            .upsert(
              events.map((event) => ({
                event_id: event.id,
                page_id: parseInt(page.id, 10),
                title: event.name,
                description: event.description || "",
                start_time: event.start_time,
                end_time: event.end_time || null,
                location: event.place?.name || null,
                image_url: event.cover?.source || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })),
              { onConflict: "event_id" },
            ) as unknown as { error: Error | null };

          if (!eventsError) {
            eventsAdded += events.length;
          }
        }
      } catch (pageError) {
        console.error(`[OAuth] Error processing page ${page.id}:`, pageError);
        // Continue with next page
      }
    }

    console.log(
      `[OAuth] Success! Stored ${pagesStored} pages and ${eventsAdded} events`,
    );

    // Redirect back to frontend with success
    res.redirect(
      `${frontendOrigin}?success=true&pages=${pagesStored}&events=${eventsAdded}`,
    );
  } catch (error) {
    console.error("[OAuth] Error:", error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    // Try to redirect to frontend with error if we have a state
    const url = new URL(`http://localhost${req.url}`);
    const stateParam = url.searchParams.get("state");
    if (stateParam) {
      res.redirect(`${stateParam}?error=${encodeURIComponent(errorMsg)}`);
      return;
    }

    // Fallback to JSON error
    res.status(500).json({ error: errorMsg });
  }
}

export default handler;
