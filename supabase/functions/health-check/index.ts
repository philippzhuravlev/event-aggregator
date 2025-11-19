import { logger } from "../_shared/services/logger-service.ts";
import { sendTokenExpiryWarning } from "../_shared/services/mail-service.ts";
import { createSupabaseClient } from "../_shared/services/supabase-service.ts";
import { calculateDaysUntilExpiry } from "@event-aggregator/shared/utils/token-expiry.js";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@event-aggregator/shared/validation/index.js";
import {
  HealthCheckResponse,
  PageTokenStatus,
  SystemHealthStatus,
} from "./schema.ts";

const startTime = Date.now();

/**
 * Unified Health Check Handler
 * Comprehensive system monitoring including:
 * - Supabase connectivity & latency
 * - Token expiry status for all pages
 * - Email alerts for critical issues
 *
 * Flow:
 * 1. Check Supabase connectivity
 * 2. Monitor all active page tokens for expiry
 * 3. Send email alerts for expiring/expired tokens
 * 4. Return comprehensive health report
 *
 * Returns:
 * - 200 if system healthy (may have warnings)
 * - 500 if critical issues
 */

async function checkSupabaseHealth(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<SystemHealthStatus> {
  const start = Date.now();

  try {
    await supabase.from("pages").select("id").limit(1);

    return {
      status: "ok",
      latency: Date.now() - start,
    };
  } catch (error) {
    logger.warn("Health check: Supabase connectivity failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      latency: Date.now() - start,
    };
  }
}

/**
 * Monitor all page tokens for expiry status and send alerts
 */
async function monitorTokens(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<{
  healthy: PageTokenStatus[];
  expiring_soon: PageTokenStatus[];
  expired: PageTokenStatus[];
  totalPages: number;
  alertsSent: number;
  criticalAlerts: string[];
}> {
  const result = {
    healthy: [] as PageTokenStatus[],
    expiring_soon: [] as PageTokenStatus[],
    expired: [] as PageTokenStatus[],
    totalPages: 0,
    alertsSent: 0,
    criticalAlerts: [] as string[],
  };

  try {
    // Get all active pages with tokens
    const { data: pages, error: queryError } = await supabase
      .from("pages")
      .select("page_id, token_expiry, token_status")
      .eq("token_status", "active");

    if (queryError) {
      logger.error("Failed to fetch pages for token monitoring", null, {
        error: queryError.message,
      });
      return result;
    }

    if (!pages || pages.length === 0) {
      logger.info("No active pages found for token monitoring");
      return result;
    }

    result.totalPages = pages.length;
    logger.info(`Monitoring ${pages.length} active pages for token expiry`);

    // Check each page's token status
    // deno-lint-ignore no-explicit-any
    for (const page of pages as any[]) {
      try {
        if (!page.token_expiry) {
          logger.warn(`No expiry data found for page ${page.page_id}`);
          result.expiring_soon.push({
            page_id: String(page.page_id),
            status: "expiring_soon",
            daysUntilExpiry: -1,
            expiresAt: "unknown",
          });
          continue;
        }

        const expiresAt = new Date(page.token_expiry);
        const now = new Date();
        const daysUntilExpiry = calculateDaysUntilExpiry(expiresAt, now);

        const status: "healthy" | "expiring_soon" | "expired" =
          daysUntilExpiry <= 0
            ? "expired"
            : daysUntilExpiry <= 7
            ? "expiring_soon"
            : "healthy";

        const tokenStatus: PageTokenStatus = {
          page_id: String(page.page_id),
          status,
          daysUntilExpiry,
          expiresAt: expiresAt.toISOString(),
        };

        result[status].push(tokenStatus);

        // Send alert emails for expiring/expired tokens
        if (status === "expired") {
          result.criticalAlerts.push(
            `Page ${page.page_id} token has EXPIRED`,
          );
        } else if (status === "expiring_soon") {
          try {
            await sendTokenExpiryWarning(
              String(page.page_id),
              daysUntilExpiry * 24 * 60 * 60,
            );
            result.alertsSent++;
            logger.info(`Token expiry warning sent for page ${page.page_id}`, {
              daysUntilExpiry,
            });
          } catch (mailError) {
            logger.error(
              `Failed to send token expiry warning for page ${page.page_id}`,
              mailError instanceof Error ? mailError : null,
            );
          }
        }
      } catch (pageError) {
        logger.error(
          `Error monitoring page ${page.page_id}`,
          pageError instanceof Error ? pageError : null,
        );
        result.expiring_soon.push({
          page_id: page.page_id,
          status: "expiring_soon",
          daysUntilExpiry: -1,
          expiresAt: "error",
        });
      }
    }

    return result;
  } catch (error) {
    logger.error(
      "Token monitoring failed",
      error instanceof Error ? error : null,
    );
    return result;
  }
}

/**
 * Perform comprehensive health check
 */
async function performHealthCheck(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<HealthCheckResponse> {
  // Run checks in parallel for performance
  const [supabaseHealth, tokenMonitoring] = await Promise.all([
    checkSupabaseHealth(supabase),
    monitorTokens(supabase),
  ]);

  // Determine overall system status
  let overallStatus: "healthy" | "warning" | "critical" = "healthy";

  if (supabaseHealth.status === "error") {
    overallStatus = "critical";
  } else if (tokenMonitoring.expired.length > 0) {
    overallStatus = "critical";
  } else if (
    tokenMonitoring.expiring_soon.length > 0 ||
    tokenMonitoring.alertsSent > 0
  ) {
    overallStatus = "warning";
  }

  return {
    system: {
      status: supabaseHealth.status === "ok" ? "ok" : "error",
      latency: supabaseHealth.latency,
      supabase: supabaseHealth,
    },
    tokens: {
      healthy: tokenMonitoring.healthy,
      expiring_soon: tokenMonitoring.expiring_soon,
      expired: tokenMonitoring.expired,
      totalPages: tokenMonitoring.totalPages,
    },
    overall: {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: Deno.env.get("DENO_DEPLOYMENT_ID") || "1.0.0",
    },
    alerts: {
      expiryWarningsSent: tokenMonitoring.alertsSent,
      criticalAlerts: tokenMonitoring.criticalAlerts,
    },
  };
}

// Handler
export async function handleHealthCheck(req: Request): Promise<Response> {
  // Only allow GET requests
  if (req.method !== "GET") {
    return createErrorResponse(
      "Method not allowed",
      405,
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      logger.error("Missing Supabase configuration", null);
      return createErrorResponse(
        "Health check unavailable - missing configuration",
        503,
      );
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const result = await performHealthCheck(supabase);

    // Return appropriate status code
    const statusCode = result.overall.status === "critical" ? 500 : 200;

    logger.info("Health check completed", {
      status: result.overall.status,
      expiredTokens: result.tokens.expired.length,
      expiringTokens: result.tokens.expiring_soon.length,
      alertsSent: result.alerts.expiryWarningsSent,
    });

    return createSuccessResponse(result, statusCode);
  } catch (error) {
    logger.error(
      "Health check endpoint failed",
      error instanceof Error ? error : null,
    );

    return createErrorResponse(
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}

// Start server when executed directly (Supabase runtime)
if (import.meta.main) {
  Deno.serve(handleHealthCheck);
}

export { performHealthCheck };
