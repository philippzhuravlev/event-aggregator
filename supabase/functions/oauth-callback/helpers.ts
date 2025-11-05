/**
 * OAuth state parameter HMAC utilities for CSRF protection
 *
 * The state parameter is used in OAuth 2.0 to prevent CSRF attacks.
 * We sign it with an HMAC to ensure it hasn't been tampered with.
 * Format: <url-encoded-payload>|<hex-hmac>
 *
 * Example:
 * - Payload: "http://localhost:3000" (the origin to redirect back to)
 * - HMAC: computed with app secret
 * - Result: "http%3A%2F%2Flocalhost%3A3000|a1b2c3d4..."
 */

// this is one of many "helper", which are different from utils; 90% of the time,
// helpers are for one file and thus specific for domain stuff/business logic (calculating,
// transforming etc), meanwhile utils are more general and thus used across multiple files.
// helpers are also very encapsulated usually; you should have a "token-expiry" helper
// for token-refresh because otherwise, it'd be 500 lines; better yet, it's easy to
// separate concerns that way into a single file

import { verifyHmacSignature } from "../_shared/validation/auth-validation.ts";

/**
 * Compute HMAC-SHA256 for OAuth state parameter
 * @param payload - The decoded payload (e.g., origin like 'http://localhost:5173')
 * @param secret - The app secret for HMAC computation
 * @returns Hex-encoded HMAC signature
 */
export async function computeStateHmac(
  payload: string,
  secret: string,
): Promise<string> {
  // Deno Web Crypto API - available globally
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const payloadData = encoder.encode(payload);

  // Create HMAC-SHA256 key
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // Sign the payload
  const signature = await crypto.subtle.sign("HMAC", key, payloadData);

  // Convert ArrayBuffer to hex string
  const view = new Uint8Array(signature);
  return Array.from(view)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify HMAC-SHA256 signature for OAuth state parameter
 * Uses centralized verification from auth-validation.ts
 * @param encodedPayload - The URL-encoded payload from state parameter
 * @param providedSigHex - The signature provided in the state (hex format)
 * @param secret - The app secret for verification
 * @returns True if signature is valid, false otherwise
 */
export async function verifyStateHmac(
  encodedPayload: string,
  providedSigHex: string,
  secret: string,
): Promise<boolean> {
  try {
    // Decode the payload first
    const decoded = decodeURIComponent(encodedPayload);

    // Use centralized HMAC verification (hex format, not 'sha256=hex')
    const result = await verifyHmacSignature(decoded, providedSigHex, secret, "hex");
    return result.valid;
  } catch {
    return false;
  }
}

/**
 * Format state parameter with signature
 * @param payload - The payload to sign (e.g., origin)
 * @param secret - The app secret
 * @returns Formatted state: "encoded_payload|hex_signature"
 */
export async function formatStateParam(
  payload: string,
  secret: string,
): Promise<string> {
  const encoded = encodeURIComponent(payload);
  const signature = await computeStateHmac(payload, secret);
  return `${encoded}|${signature}`;
}

/**
 * Parse and verify state parameter
 * @param stateParam - The full state parameter from OAuth callback
 * @param secret - The app secret
 * @returns { isValid: boolean, payload: string | null }
 */
export async function parseAndVerifyStateParam(
  stateParam: string,
  secret: string,
): Promise<{ isValid: boolean; payload: string | null }> {
  try {
    const [encoded, sig] = stateParam.split("|");
    if (!encoded || !sig) {
      return { isValid: false, payload: null };
    }

    const isValid = await verifyStateHmac(encoded, sig, secret);
    if (!isValid) {
      return { isValid: false, payload: null };
    }

    const payload = decodeURIComponent(encoded);
    return { isValid: true, payload };
  } catch {
    return { isValid: false, payload: null };
  }
}
