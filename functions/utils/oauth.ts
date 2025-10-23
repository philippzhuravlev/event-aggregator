import crypto from 'crypto';

// Utilities to help verify signed OAuth 'state' parameters
// Format supported: <url-encoded-payload>|<hex-hmac>

export function computeStateHmac(payload: string, secret: string): string {
  // payload should be the decoded payload (e.g. origin like 'http://localhost:5173')
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyStateHmac(encodedPayload: string, providedSigHex: string, secret: string): boolean {
  try {
    const decoded = decodeURIComponent(encodedPayload);
    const expected = computeStateHmac(decoded, secret);
    // Use timingSafeEqual to avoid leaking via timing attacks
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(providedSigHex || '', 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}