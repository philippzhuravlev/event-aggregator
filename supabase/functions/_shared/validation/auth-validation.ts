/**
 * Authentication & Signature Verification Utilities
 * Centralized crypto functions for HMAC verification across handlers
 *
 * Usage:
 * - Webhook signature verification: verifyHmacSignature(payload, sig, secret, 'sha256=hex')
 * - OAuth state verification: verifyHmacSignature(encoded, sig, secret, 'hex')
 */

import { logger } from "../services/logger-service.ts";
import { HmacVerificationResult } from "../types.ts";

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
 * Timing-safe string comparison to prevent timing attacks
 * Compares strings in constant time regardless of where they differ
 *
 * This is important to prevent timing attacks, where an attacker measures the time it takes
 * to compare two strings to guess the correct signature byte-by-byte. "Timing-safe" means
 * we always take the same amount of time to compare, regardless of where the first mismatch is.
 *
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal, false otherwise
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Verify HMAC-SHA256 signature
 * Single function for both webhook signatures and OAuth state verification
 *
 * @param payload - Raw payload (request body or encoded state)
 * @param signature - Signature to verify
 * @param secret - Secret key for HMAC computation
 * @param signatureFormat - Format of the signature header
 *   - 'sha256=hex': Facebook webhook format (e.g., "sha256=abc123...")
 *   - 'hex': Plain hex format (e.g., "abc123...")
 * @returns { valid, computedSignature?, error? }
 *
 * @example
 * // Webhook signature verification
 * const result = await verifyHmacSignature(
 *   rawBody,
 *   'sha256=abc123...',
 *   appSecret,
 *   'sha256=hex'
 * )
 *
 * @example
 * // OAuth state signature verification
 * const result = await verifyHmacSignature(
 *   encodedState,
 *   'abc123...',
 *   appSecret,
 *   'hex'
 * )
 */
export async function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
  signatureFormat: "sha256=hex" | "hex" = "sha256=hex",
): Promise<HmacVerificationResult> {
  try {
    if (!payload) {
      return {
        valid: false,
        error: "Missing payload",
      };
    }

    if (!signature) {
      return {
        valid: false,
        error: "Missing signature",
      };
    }

    if (!secret) {
      return {
        valid: false,
        error: "Missing secret",
      };
    }

    // Extract the hex digest from the signature based on format
    // again, header = something buried within the HTTP request that contains metadata,
    // like content type, authorization, user agent, etc. Here, we're looking for the
    // "X-Hub-Signature-256" header, a surprise tool that'll help us later ;)
    let expectedSignature: string;
    if (signatureFormat === "sha256=hex") {
      // Facebook webhook format: "sha256=hexdigest"
      if (!signature.startsWith("sha256=")) {
        return {
          valid: false,
          error: "Invalid signature format: missing 'sha256=' prefix",
        };
      }
      expectedSignature = signature.substring(7); // Remove "sha256=" prefix
    } else {
      // Plain hex format
      expectedSignature = signature;
    }

    // Compute HMAC-SHA256 of payload with secret
    // Again, HMAC is "Hash-based Message Authentication Code", a fancy word for sending a
    // hash of the message along with the message to verify integrity and authenticity, lest
    // someone tamper with it in transit. The SHA-256 part is just the hashing algorithm used.
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const payloadData = encoder.encode(payload);

    // Create HMAC key
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    // Sign the payload
    const signatureBytes = await crypto.subtle.sign("HMAC", key, payloadData);

    // Convert to hex string
    // to give an example of a hex string, "hello" in ascii is "68 65 6c 6c 6f" in hex
    const computedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Timing-safe comparison
    // this is important to prevent timing attacks, where an attacker measures the time it takes
    // to compare two strings to guess the correct signature byte-by-byte. "Timing-safe" means
    // we always take the same amount of time to compare, regardless of where the first mismatch is.
    const isValid = timingSafeCompare(computedSignature, expectedSignature);

    if (!isValid) {
      logger.debug("HMAC signature verification failed", {
        format: signatureFormat,
        payloadLength: payload.length,
        expectedLength: expectedSignature.length,
        computedLength: computedSignature.length,
      });
    }

    return {
      valid: isValid,
      computedSignature,
      error: isValid ? undefined : "Signature does not match",
    };
  } catch (error) {
    logger.error(
      "HMAC signature verification error",
      error instanceof Error ? error : null,
    );
    return {
      valid: false,
      error: error instanceof Error
        ? error.message
        : "Signature verification failed",
    };
  }
}

/**
 * Extract Bearer token from Authorization header
 * @param authHeader - Authorization header value (e.g., "Bearer token123")
 * @returns Token string or null if invalid
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  return token || null;
}

/**
 * Verify Bearer token
 * @param authHeader - Authorization header value
 * @param expectedToken - Expected token (optional, for validation)
 * @returns { valid, token?, error? }
 */
export function verifyBearerToken(
  authHeader: string | null,
  expectedToken?: string,
): { valid: boolean; token?: string; error?: string } {
  if (!authHeader) {
    return {
      valid: false,
      error: "Missing Authorization header",
    };
  }

  const token = extractBearerToken(authHeader);
  if (!token) {
    return {
      valid: false,
      error: "Invalid Authorization header format (expected 'Bearer token')",
    };
  }

  if (expectedToken && token !== expectedToken) {
    return {
      valid: false,
      error: "Invalid token",
    };
  }

  return {
    valid: true,
    token,
  };
}

/**
 * Create a standardized auth error response
 * @param errorType - Type of auth error
 * @returns Response object with appropriate status code and message
 */
export function getAuthErrorResponse(
  errorType: "missing" | "invalid" | "expired" = "invalid",
): Response {
  const statusCode = errorType === "missing" ? 400 : 401;
  const messages = {
    missing: "Missing authentication credentials",
    invalid: "Invalid authentication credentials",
    expired: "Authentication credentials have expired",
  };

  return new Response(
    JSON.stringify({
      error: messages[errorType],
    }),
    {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    },
  );
}
