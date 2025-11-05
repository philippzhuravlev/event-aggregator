/**
 * Health Check Schema & Types
 * Unified system health monitoring including token status and alerts
 */

/**
 * Individual system component health status
 */
export interface SystemHealthStatus {
  status: "ok" | "error";
  latency?: number; // milliseconds
  error?: string;
}

/**
 * Individual page token status
 */
export interface PageTokenStatus {
  page_id: string;
  status: "healthy" | "expiring_soon" | "expired";
  daysUntilExpiry: number;
  expiresAt: string; // ISO 8601 timestamp or "unknown"/"error"
}

/**
 * Complete health check response
 * Includes system health, token monitoring, and alert information
 */
export interface HealthCheckResponse {
  // System health checks
  system: {
    status: "ok" | "error";
    latency?: number; // milliseconds
    supabase: SystemHealthStatus;
  };

  // Token monitoring results
  tokens: {
    healthy: PageTokenStatus[];
    expiring_soon: PageTokenStatus[];
    expired: PageTokenStatus[];
    totalPages: number;
  };

  // Overall system status
  overall: {
    status: "healthy" | "warning" | "critical";
    timestamp: string; // ISO 8601 timestamp
    uptime: number; // seconds since deployment
    version: string;
  };

  // Alerts that were triggered
  alerts: {
    expiryWarningsSent: number; // count of email alerts sent
    criticalAlerts: string[]; // list of critical issues
  };
}

/**
 * Validate health check response structure
 * @param response - Response to validate
 * @returns Validation result
 */
export function validateHealthCheckResponse(
  // deno-lint-ignore no-explicit-any
  response: any,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required top-level fields
  if (!response.system) errors.push("Missing required field: system");
  if (!response.tokens) errors.push("Missing required field: tokens");
  if (!response.overall) errors.push("Missing required field: overall");
  if (!response.alerts) errors.push("Missing required field: alerts");

  // Check system fields
  if (response.system) {
    if (!response.system.status) errors.push("system.status is required");
    if (!response.system.supabase) {
      errors.push("system.supabase is required");
    }
  }

  // Check tokens fields
  if (response.tokens) {
    if (!Array.isArray(response.tokens.healthy)) {
      errors.push("tokens.healthy must be an array");
    }
    if (!Array.isArray(response.tokens.expiring_soon)) {
      errors.push("tokens.expiring_soon must be an array");
    }
    if (!Array.isArray(response.tokens.expired)) {
      errors.push("tokens.expired must be an array");
    }
    if (typeof response.tokens.totalPages !== "number") {
      errors.push("tokens.totalPages must be a number");
    }
  }

  // Check overall fields
  if (response.overall) {
    if (!response.overall.status) errors.push("overall.status is required");
    if (!response.overall.timestamp) {
      errors.push("overall.timestamp is required");
    }
    if (typeof response.overall.uptime !== "number") {
      errors.push("overall.uptime must be a number");
    }
    if (!response.overall.version) {
      errors.push("overall.version is required");
    }
  }

  // Check alerts fields
  if (response.alerts) {
    if (typeof response.alerts.expiryWarningsSent !== "number") {
      errors.push("alerts.expiryWarningsSent must be a number");
    }
    if (!Array.isArray(response.alerts.criticalAlerts)) {
      errors.push("alerts.criticalAlerts must be an array");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
