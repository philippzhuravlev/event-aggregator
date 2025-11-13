import { TOKEN_REFRESH_DEFAULTS } from "../config/functions-config.ts";

type TokenStatus = "expired" | "expiring" | "valid";

const { WARNING_DAYS, DEFAULT_EXPIRES_DAYS } = TOKEN_REFRESH_DEFAULTS;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function calculateDaysUntilExpiry(
  expiresAt: Date,
  now: Date = new Date(),
): number {
  const diffInDays = (expiresAt.getTime() - now.getTime()) / MS_PER_DAY;
  return Math.ceil(diffInDays);
}

export function isTokenExpiring(
  daysUntilExpiry: number,
  warningDays: number = WARNING_DAYS,
): boolean {
  return daysUntilExpiry <= warningDays;
}

export function getTokenStatus(
  daysUntilExpiry: number,
  warningDays: number = WARNING_DAYS,
): TokenStatus {
  if (daysUntilExpiry < 0) {
    return "expired";
  }

  if (daysUntilExpiry <= warningDays) {
    return "expiring";
  }

  return "valid";
}

export function calculateExpirationDate(
  expiresInDays: number = DEFAULT_EXPIRES_DAYS,
  now: Date = new Date(),
): Date {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  return expiresAt;
}


