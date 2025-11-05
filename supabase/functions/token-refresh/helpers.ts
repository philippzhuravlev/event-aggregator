import { TOKEN_REFRESH } from "../_shared/utils/constants-util.ts";

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
