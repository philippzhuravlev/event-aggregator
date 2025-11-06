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

// Build dynamic CORS headers based on environment
const WEB_APP_URL = Deno.env.get("WEB_APP_URL") || "http://localhost:3000";

/**
 * Checks if the given origin is allowed for OAuth and CORS requests
 * Accepts both production and development origins, including Vercel preview deployments
 *
 * @param origin - The origin URL to validate
 * @returns boolean - True if the origin is allowed, false otherwise
 */
export function isAllowedOrigin(origin: string): boolean {
  // Parse the URL to extract the hostname
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
