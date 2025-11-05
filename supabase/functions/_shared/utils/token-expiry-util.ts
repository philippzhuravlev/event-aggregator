import { TOKEN_REFRESH } from "./constants-util.ts";

// So this is a util, a helper function that is neither "what to do" (handler) nor
// "how to connect to an external service" (service). It just does pure logic that
// either makes sense to compartmentalize or is used in multiple places.

// I long debated whether to make this a service or handler, but ultimately it's
// a util because it's a __derived__ property of token-refresh. It doesn't do anything
// on its own, but it helps other parts of the app do their job. It's business logic
// that said, it really sucks and I hate it. It feels like a handler, but alas

/**
 * Calculate days until a token expires
 * @param expiresAt - Token expiration date
 * @param now - Current date (defaults to now, but can be overridden for testing)
 * @returns Number of days until expiry (negative if already expired)
 */
export function calculateDaysUntilExpiry(
  expiresAt: Date,
  now: Date = new Date(),
): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((expiresAt.getTime() - now.getTime()) / msPerDay);

  // so we export a raw number, sure, but then the amazing toDate() method can convert it to a
  // proper "Date" object
}

/**
 * Check if a token is expiring soon based on warning threshold
 * @param daysUntilExpiry - Days until token expires
 * @param warningDays - Warning threshold in days (defaults to TOKEN_REFRESH.WARNING_DAYS)
 * @returns True if token is expiring soon or already expired
 */
export function isTokenExpiring(
  daysUntilExpiry: number,
  warningDays: number = TOKEN_REFRESH.WARNING_DAYS,
): boolean {
  return daysUntilExpiry <= warningDays;
}

/**
 * Determine token status based on days until expiry
 * @param daysUntilExpiry - Days until token expires
 * @param warningDays - Warning threshold in days (defaults to TOKEN_REFRESH.WARNING_DAYS)
 * @returns Token status: 'expired' | 'expiring' | 'valid'
 */
export function getTokenStatus(
  daysUntilExpiry: number,
  warningDays: number = TOKEN_REFRESH.WARNING_DAYS,
): "expired" | "expiring" | "valid" {
  if (daysUntilExpiry < 0) {
    return "expired";
  }
  if (daysUntilExpiry <= warningDays) {
    return "expiring";
  }
  return "valid";
}

/**
 * Calculate token expiration date from now
 * @param expiresInDays - Number of days until expiration (defaults to TOKEN_REFRESH.DEFAULT_EXPIRES_DAYS)
 * @param now - Current date (defaults to now, but can be overridden for testing)
 * @returns Expiration date
 */
export function calculateExpirationDate(
  expiresInDays: number = TOKEN_REFRESH.DEFAULT_EXPIRES_DAYS,
  now: Date = new Date(),
): Date {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  return expiresAt;
}
