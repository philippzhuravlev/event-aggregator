import { assertEquals } from "std/assert/mod.ts";
import { validateHealthCheckResponse } from "../../health-check/schema.ts";

Deno.test("validateHealthCheckResponse returns errors for missing top-level fields", () => {
  const result = validateHealthCheckResponse({});

  assertEquals(result.isValid, false);
  assertEquals(result.errors.length, 4);
  assertEquals(result.errors.includes("Missing required field: system"), true);
  assertEquals(result.errors.includes("Missing required field: tokens"), true);
  assertEquals(result.errors.includes("Missing required field: overall"), true);
  assertEquals(result.errors.includes("Missing required field: alerts"), true);
});

Deno.test("validateHealthCheckResponse returns error for missing system.status", () => {
  const result = validateHealthCheckResponse({
    system: { supabase: { status: "ok" } },
    tokens: { healthy: [], expiring_soon: [], expired: [], totalPages: 0 },
    overall: { status: "healthy", timestamp: "2024-01-01", uptime: 0, version: "1.0.0" },
    alerts: { expiryWarningsSent: 0, criticalAlerts: [] },
  });

  assertEquals(result.isValid, false);
  assertEquals(result.errors.includes("system.status is required"), true);
});

Deno.test("validateHealthCheckResponse returns error for missing system.supabase", () => {
  const result = validateHealthCheckResponse({
    system: { status: "ok" },
    tokens: { healthy: [], expiring_soon: [], expired: [], totalPages: 0 },
    overall: { status: "healthy", timestamp: "2024-01-01", uptime: 0, version: "1.0.0" },
    alerts: { expiryWarningsSent: 0, criticalAlerts: [] },
  });

  assertEquals(result.isValid, false);
  assertEquals(result.errors.includes("system.supabase is required"), true);
});

Deno.test("validateHealthCheckResponse returns error for non-array tokens.healthy", () => {
  const result = validateHealthCheckResponse({
    system: { status: "ok", supabase: { status: "ok" } },
    tokens: { healthy: "not-array", expiring_soon: [], expired: [], totalPages: 0 },
    overall: { status: "healthy", timestamp: "2024-01-01", uptime: 0, version: "1.0.0" },
    alerts: { expiryWarningsSent: 0, criticalAlerts: [] },
  });

  assertEquals(result.isValid, false);
  assertEquals(result.errors.includes("tokens.healthy must be an array"), true);
});

Deno.test("validateHealthCheckResponse returns error for non-array tokens.expiring_soon", () => {
  const result = validateHealthCheckResponse({
    system: { status: "ok", supabase: { status: "ok" } },
    tokens: { healthy: [], expiring_soon: "not-array", expired: [], totalPages: 0 },
    overall: { status: "healthy", timestamp: "2024-01-01", uptime: 0, version: "1.0.0" },
    alerts: { expiryWarningsSent: 0, criticalAlerts: [] },
  });

  assertEquals(result.isValid, false);
  assertEquals(result.errors.includes("tokens.expiring_soon must be an array"), true);
});

Deno.test("validateHealthCheckResponse returns error for non-array tokens.expired", () => {
  const result = validateHealthCheckResponse({
    system: { status: "ok", supabase: { status: "ok" } },
    tokens: { healthy: [], expiring_soon: [], expired: "not-array", totalPages: 0 },
    overall: { status: "healthy", timestamp: "2024-01-01", uptime: 0, version: "1.0.0" },
    alerts: { expiryWarningsSent: 0, criticalAlerts: [] },
  });

  assertEquals(result.isValid, false);
  assertEquals(result.errors.includes("tokens.expired must be an array"), true);
});

Deno.test("validateHealthCheckResponse returns error for non-number tokens.totalPages", () => {
  const result = validateHealthCheckResponse({
    system: { status: "ok", supabase: { status: "ok" } },
    tokens: { healthy: [], expiring_soon: [], expired: [], totalPages: "not-number" },
    overall: { status: "healthy", timestamp: "2024-01-01", uptime: 0, version: "1.0.0" },
    alerts: { expiryWarningsSent: 0, criticalAlerts: [] },
  });

  assertEquals(result.isValid, false);
  assertEquals(result.errors.includes("tokens.totalPages must be a number"), true);
});

Deno.test("validateHealthCheckResponse returns error for missing overall.status", () => {
  const result = validateHealthCheckResponse({
    system: { status: "ok", supabase: { status: "ok" } },
    tokens: { healthy: [], expiring_soon: [], expired: [], totalPages: 0 },
    overall: { timestamp: "2024-01-01", uptime: 0, version: "1.0.0" },
    alerts: { expiryWarningsSent: 0, criticalAlerts: [] },
  });

  assertEquals(result.isValid, false);
  assertEquals(result.errors.includes("overall.status is required"), true);
});

Deno.test("validateHealthCheckResponse returns error for missing overall.timestamp", () => {
  const result = validateHealthCheckResponse({
    system: { status: "ok", supabase: { status: "ok" } },
    tokens: { healthy: [], expiring_soon: [], expired: [], totalPages: 0 },
    overall: { status: "healthy", uptime: 0, version: "1.0.0" },
    alerts: { expiryWarningsSent: 0, criticalAlerts: [] },
  });

  assertEquals(result.isValid, false);
  assertEquals(result.errors.includes("overall.timestamp is required"), true);
});

Deno.test("validateHealthCheckResponse returns error for non-number overall.uptime", () => {
  const result = validateHealthCheckResponse({
    system: { status: "ok", supabase: { status: "ok" } },
    tokens: { healthy: [], expiring_soon: [], expired: [], totalPages: 0 },
    overall: { status: "healthy", timestamp: "2024-01-01", uptime: "not-number", version: "1.0.0" },
    alerts: { expiryWarningsSent: 0, criticalAlerts: [] },
  });

  assertEquals(result.isValid, false);
  assertEquals(result.errors.includes("overall.uptime must be a number"), true);
});

Deno.test("validateHealthCheckResponse returns error for missing overall.version", () => {
  const result = validateHealthCheckResponse({
    system: { status: "ok", supabase: { status: "ok" } },
    tokens: { healthy: [], expiring_soon: [], expired: [], totalPages: 0 },
    overall: { status: "healthy", timestamp: "2024-01-01", uptime: 0 },
    alerts: { expiryWarningsSent: 0, criticalAlerts: [] },
  });

  assertEquals(result.isValid, false);
  assertEquals(result.errors.includes("overall.version is required"), true);
});

Deno.test("validateHealthCheckResponse returns error for non-number alerts.expiryWarningsSent", () => {
  const result = validateHealthCheckResponse({
    system: { status: "ok", supabase: { status: "ok" } },
    tokens: { healthy: [], expiring_soon: [], expired: [], totalPages: 0 },
    overall: { status: "healthy", timestamp: "2024-01-01", uptime: 0, version: "1.0.0" },
    alerts: { expiryWarningsSent: "not-number", criticalAlerts: [] },
  });

  assertEquals(result.isValid, false);
  assertEquals(result.errors.includes("alerts.expiryWarningsSent must be a number"), true);
});

Deno.test("validateHealthCheckResponse returns error for non-array alerts.criticalAlerts", () => {
  const result = validateHealthCheckResponse({
    system: { status: "ok", supabase: { status: "ok" } },
    tokens: { healthy: [], expiring_soon: [], expired: [], totalPages: 0 },
    overall: { status: "healthy", timestamp: "2024-01-01", uptime: 0, version: "1.0.0" },
    alerts: { expiryWarningsSent: 0, criticalAlerts: "not-array" },
  });

  assertEquals(result.isValid, false);
  assertEquals(result.errors.includes("alerts.criticalAlerts must be an array"), true);
});

Deno.test("validateHealthCheckResponse returns valid for correct structure", () => {
  const result = validateHealthCheckResponse({
    system: { status: "ok", supabase: { status: "ok" } },
    tokens: { healthy: [], expiring_soon: [], expired: [], totalPages: 0 },
    overall: { status: "healthy", timestamp: "2024-01-01T00:00:00Z", uptime: 3600, version: "1.0.0" },
    alerts: { expiryWarningsSent: 0, criticalAlerts: [] },
  });

  assertEquals(result.isValid, true);
  assertEquals(result.errors.length, 0);
});

