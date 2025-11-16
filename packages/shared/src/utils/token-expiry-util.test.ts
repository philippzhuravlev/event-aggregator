import { describe, expect, it } from "vitest";
import {
  calculateDaysUntilExpiry,
  calculateExpirationDate,
  getTokenStatus,
  isTokenExpiring,
} from "./token-expiry-util.ts";

describe("token-expiry-util", () => {
  it("calculates days until expiry using ceil semantics", () => {
    const now = new Date("2024-01-01T00:00:00Z");
    const expiresAt = new Date("2024-01-05T00:00:01Z");

    const days = calculateDaysUntilExpiry(expiresAt, now);

    expect(days).toBe(5);
  });

  it("identifies when a token is expiring", () => {
    expect(isTokenExpiring(3, 5)).toBe(true);
    expect(isTokenExpiring(6, 5)).toBe(false);
  });

  it("derives token status from days until expiry", () => {
    expect(getTokenStatus(-1, 7)).toBe("expired");
    expect(getTokenStatus(5, 7)).toBe("expiring");
    expect(getTokenStatus(8, 7)).toBe("valid");
  });

  it("calculates a new expiration date relative to now", () => {
    const now = new Date("2024-02-01T00:00:00Z");
    const expiresAt = calculateExpirationDate(10, now);

    expect(expiresAt.toISOString()).toBe("2024-02-11T00:00:00.000Z");
  });
});
