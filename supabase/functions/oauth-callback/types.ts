/**
 * OAuth Callback Types
 * Request interface and response types for OAuth flow
 */

/**
 * HTTP Request object for Deno Edge Functions
 */
export interface Request {
  method: string;
  url: string;
}
