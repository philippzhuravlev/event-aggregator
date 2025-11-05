// this used to be a "handler", i.e. "thing that does something" (rather than connect,
// or help etc), but because we've refactored to supabase, it's now a "Edge Function".
// They're run on deno, an upgrade to nodejs, and work similarly to serverless functions
// we had before - basically, functions that run on demand or on a schedule.

import { validateOAuthCallbackQuery } from "./schema.ts";
import { Request } from "./types.ts";
import {
  BruteForceProtection,
  createErrorResponse,
} from "../_shared/validation/index.ts";

// Brute force protection: 5 failed attempts lock out IP for 15 minutes
const bruteForceProtection = new BruteForceProtection(5, 600000, 900000);

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const url = new URL(req.url);

    // Extract client IP from request headers
    const forwarded = req.headers.get("x-forwarded-for");
    const cfIp = req.headers.get("cf-connecting-ip");
    const clientIp = (forwarded?.split(",")[0].trim()) || cfIp || "unknown";

    // Brute force protection: check if IP is locked out
    if (bruteForceProtection.isLocked(clientIp)) {
      return createErrorResponse(
        "Too many failed attempts. Please try again later.",
        429,
      );
    }

    // Validate query parameters using schema
    const validation = validateOAuthCallbackQuery(url);
    if (!validation.success) {
      // Record failed attempt
      bruteForceProtection.recordFailure(clientIp);

      // If error param is present, it's from Facebook - return error to frontend
      const errorParam = url.searchParams.get("error");
      const stateParam = url.searchParams.get("state");
      if (errorParam && stateParam) {
        const redirectUrl = `${stateParam}?error=${
          encodeURIComponent(errorParam)
        }`;
        return new Response(null, {
          status: 302,
          headers: {
            Location: redirectUrl,
          },
        });
      }
      // Otherwise it's a validation error
      return createErrorResponse(
        validation.error || "Invalid OAuth callback",
        400,
      );
    }

    // Record successful attempt (clears failure counter)
    bruteForceProtection.recordSuccess(clientIp);

    const { code, state } = validation.data!;

    // Call your backend to exchange code for tokens and sync events
    // For local dev, Edge Functions can't access localhost
    // In production, set BACKEND_URL environment variable
    // @ts-ignore - Deno runtime available in Supabase Edge Functions
    const backendBaseUrl = typeof Deno !== "undefined" && Deno.env
      ? (Deno.env.get("BACKEND_URL") || "http://localhost:8080")
      : "http://localhost:8080";
    const backendUrl = `${backendBaseUrl}/facebook-callback?code=${
      encodeURIComponent(code)
    }&state=${encodeURIComponent(state)}`;

    console.log(`Calling backend at: ${backendUrl}`);

    const backendResponse = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const backendText = await backendResponse.text();
    console.log(
      `Backend response status: ${backendResponse.status}, body: ${backendText}`,
    );

    let backendData;
    try {
      backendData = JSON.parse(backendText);
    } catch (_e) {
      console.error(`Failed to parse backend response: ${backendText}`);
      const redirectUrl = `${state}?error=${
        encodeURIComponent("Backend response parsing failed")
      }`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectUrl,
        },
      });
    }

    if (!backendResponse.ok) {
      const redirectUrl = `${state}?error=${
        encodeURIComponent(backendData.error || "Backend error")
      }`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectUrl,
        },
      });
    }

    // Redirect back to frontend with success
    const { pages_count = 0, events_count = 0 } = backendData;
    const redirectUrl =
      `${state}?success=true&pages=${pages_count}&events=${events_count}`;
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
