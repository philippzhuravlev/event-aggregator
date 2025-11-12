import type { HmacVerificationResult } from "../types.ts";

type CryptoLike = {
  subtle: Pick<
    typeof import("node:crypto").webcrypto.subtle,
    "importKey" | "sign"
  >;
};

let cachedCrypto: CryptoLike | null = null;

const resolveCrypto = async (): Promise<CryptoLike> => {
  if (cachedCrypto) {
    return cachedCrypto;
  }

  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto?.subtle) {
    cachedCrypto = globalThis.crypto as unknown as CryptoLike;
    return cachedCrypto;
  }

  try {
    const nodeCrypto = await import("node:crypto");
    if (nodeCrypto?.webcrypto?.subtle) {
      cachedCrypto = nodeCrypto.webcrypto as unknown as CryptoLike;
      return cachedCrypto;
    }
  } catch {
    // ignore, will throw below
  }

  throw new Error("Web Crypto API is not available in this environment");
};

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

async function computeHmac(payload: string, secret: string): Promise<string> {
  const cryptoApi = await resolveCrypto();

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const payloadData = encoder.encode(payload);

  const key = await cryptoApi.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await cryptoApi.subtle.sign("HMAC", key, payloadData);

  return Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeHmacSignature(
  payload: string,
  secret: string,
  signatureFormat: "sha256=hex" | "hex" = "sha256=hex",
): Promise<string> {
  const signature = await computeHmac(payload, secret);
  return signatureFormat === "sha256=hex" ? `sha256=${signature}` : signature;
}

export async function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
  signatureFormat: "sha256=hex" | "hex" = "sha256=hex",
): Promise<HmacVerificationResult> {
  if (!payload) {
    return { valid: false, error: "Missing payload" };
  }

  if (!signature) {
    return { valid: false, error: "Missing signature" };
  }

  if (!secret) {
    return { valid: false, error: "Missing secret" };
  }

  try {
    let expectedSignature = signature;
    if (signatureFormat === "sha256=hex") {
      if (!signature.startsWith("sha256=")) {
        return {
          valid: false,
          error: "Invalid signature format: missing 'sha256=' prefix",
        };
      }
      expectedSignature = signature.substring(7);
    }

    const computedSignature = await computeHmac(payload, secret);
    const valid = timingSafeCompare(computedSignature, expectedSignature);

    return {
      valid,
      computedSignature,
      error: valid ? undefined : "Signature does not match",
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error
        ? error.message
        : "Signature verification failed",
    };
  }
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

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

export function getAuthErrorResponse(statusCode: number = 401): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    },
  );
}
/**
 * Placeholder for shared auth validation utilities.
 */
export {};
