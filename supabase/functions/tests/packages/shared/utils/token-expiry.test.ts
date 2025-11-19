import { assertEquals } from "std/assert/mod.ts";
import {
  calculateDaysUntilExpiry,
  calculateExpirationDate,
  getTokenStatus,
  isTokenExpiring,
} from "@event-aggregator/shared/utils/token-expiry.js";

Deno.test("calculateDaysUntilExpiry rounds up to next whole day", () => {
  const now = new Date("2024-01-01T00:00:00.000Z");
  const expiresInHours = new Date("2024-01-02T05:00:00.000Z");
  const expiresInPast = new Date("2023-12-31T20:00:00.000Z");

  assertEquals(calculateDaysUntilExpiry(expiresInHours, now), 2);
  assertEquals(calculateDaysUntilExpiry(expiresInPast, now), 0);
});

Deno.test("isTokenExpiring respects warning window overrides", () => {
  assertEquals(isTokenExpiring(3, 7), true);
  assertEquals(isTokenExpiring(10, 7), false);
  assertEquals(isTokenExpiring(2, 2), true);
});

Deno.test("getTokenStatus differentiates valid, expiring, and expired tokens", () => {
  assertEquals(getTokenStatus(-1), "expired");
  assertEquals(getTokenStatus(1, 3), "expiring");
  assertEquals(getTokenStatus(10, 3), "valid");
});

Deno.test("calculateExpirationDate offsets from provided base date", () => {
  const now = new Date("2024-02-10T12:00:00.000Z");
  const expiresAt = calculateExpirationDate(10, now);
  assertEquals(expiresAt.toISOString(), "2024-02-20T12:00:00.000Z");
});

