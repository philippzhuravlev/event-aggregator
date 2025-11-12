/**
 * URL Builder Utilities
 * Handles URL construction, validation, and origin checking logic
 */

// So this is a util, a helper function that is neither "what to do" (handler) nor
// "how to connect to an external service" (service). It just does pure logic that
// either makes sense to compartmentalize or is used in multiple places.

// This is kind of a url builder util in that it helps with constructing and 
// validating URLs. In reality, its main purpose is to validate origins for CORS
// and OAuth flows, making sure that only allowed origins can interact with our API.

// We need to support both Deno (Supabase Functions) and Node.js (Vercel Functions)
// environments here. Since Deno has built-in URL class support, we only need
// to polyfill URL for Node.js.

import process from "node:process";

// Build dynamic allowed origins based on environment
const WEB_APP_URL = process.env.WEB_APP_URL || "http://localhost:3000";

/**
 * Dynamic allowed origins that support both dev and production
 * Gets the current deployment URL from VERCEL_URL env var if available
 * Also accepts any event-aggregator-* deployment URL
 */
export function isAllowedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    // Localhost for development
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("localhost:") ||
      hostname.startsWith("127.0.0.1:")
    ) {
      return true;
    }

    // Exact matches for known production domains
    if (hostname === "event-aggregator-nine.vercel.app") {
      return true;
    }

    // Custom WEB_APP_URL
    if (hostname === new URL(WEB_APP_URL).hostname) {
      return true;
    }

    // Accept any event-aggregator-* vercel.app deployment URL
    // Pattern: event-aggregator-<anything>-<org>.vercel.app
    if (
      hostname.startsWith("event-aggregator-") && hostname.endsWith(".vercel.app")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Dynamic allowed origins array that support both dev and production
 * Gets the current deployment URL from VERCEL_URL env var if available
 */
export function getAllowedOrigins(currentOrigin?: string): string[] {
  const origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "https://event-aggregator-nine.vercel.app",
    WEB_APP_URL,
  ];

  // Add current Vercel deployment URL if available
  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`);
  }

  if (currentOrigin) {
    origins.push(currentOrigin);
  }

  // Remove duplicates
  return [...new Set(origins)];
}
