/**
 * Node.js-compatible HMAC and authentication utilities
 * Replaces Deno crypto API with Node.js crypto
 */

import crypto from "node:crypto";
import { Buffer } from "node:buffer";

// This used to be called "middleware", which lies in the middle between http request
// and business logic. But since we're using deno in edge functions without a full framework,
// it's not technically "middleware" and more of what middleware usually is 95% of the time:
// validation.

// So you might say "wait, don't we already have "oauth" validation? The truth is
// that they're different; auth is often in regards to standing between endpoints
// and making sure they're the right guy (thru HMAC, or "Hash Message Authentication
// Code" and the SHA256 hashing algorithm). Oauth is still about authentication but
// it's about __sending you back to the right domain__, not making sure that the
// message has been tampered with

/**
 * Timing-safe comparison of two strings to prevent timing attacks
 */
export function timingSafeCompare(a: string, b: string): boolean {
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Verify HMAC-SHA256 signature
 * @param payload - The payload that was signed
 * @param providedSigHex - The signature to verify (hex format)
 * @param secret - The secret key used for HMAC
 * @param format - The format of the provided signature ('hex', 'sha256=hex', etc.)
 */
export function verifyHmacSignature(
  payload: string,
  providedSigHex: string,
  secret: string,
  format: "hex" | "sha256=hex" = "hex",
): { valid: boolean } {
  try {
    // Create HMAC
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    const expectedSig = hmac.digest("hex");

    // Handle different signature formats
    let sigToCompare = providedSigHex;
    if (format === "sha256=hex") {
      sigToCompare = providedSigHex.replace("sha256=", "");
    }

    // Timing-safe comparison
    try {
      const valid = timingSafeCompare(expectedSig, sigToCompare);
      return { valid };
    } catch {
      // If length doesn't match, they're different
      return { valid: false };
    }
  } catch (_error) {
    return { valid: false };
  }
}

/**
 * Compute HMAC-SHA256 signature
 */
export function computeHmacSignature(
  payload: string,
  secret: string,
): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return hmac.digest("hex");
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Verify a Bearer token against expected value
 */
export function verifyBearerToken(
  token: string,
  expectedToken: string,
): boolean {
  try {
    return timingSafeCompare(token, expectedToken);
  } catch {
    return false;
  }
}

export interface HmacVerificationResult {
  valid: boolean;
  error?: string;
}

export function getAuthErrorResponse(statusCode: number = 401): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    },
  );
}
