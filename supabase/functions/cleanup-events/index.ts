import { createClient } from "@supabase/supabase-js";
import { deleteOldEvents } from "../_shared/services/supabase-service.ts";
import { logger } from "../_shared/services/logger-service.ts";
import type { CleanupResult } from "@event-aggregator/shared/types.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  handleCORSPreflight,
} from "@event-aggregator/shared/validation/index.js";
import { HTTP_STATUS } from "@event-aggregator/shared/runtime/deno.js";

// this used to be a "handler", i.e. "thing that does something" (rather than connect,
// or help etc), but because we've refactored to supabase, it's now a "Edge Function".
// They're run on deno, an upgrade to nodejs, and work similarly to serverless functions
// we had before - basically, functions that run on demand or on a schedule.

// This handler cleans up old events to prevent database bloat. Events older than X
// days are deleted (or archived). Archiving is important because of GDPR compliance,
// as users have a right to get all their stored data back even after deletion

/**
 * Clean up old events from Supabase
 * @param supabase - Supabase client
 * @param daysToKeep - Number of days of events to keep
 * @param dryRun - If true, only simulate cleanup without deleting
 * @returns Cleanup result with counts and details
 */
export async function cleanupOldEvents(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  daysToKeep: number = 90,
  dryRun: boolean = false,
): Promise<CleanupResult> {
  const startTime = Date.now();

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  logger.info("Starting event cleanup", {
    daysToKeep,
    cutoffDate: cutoffDate.toISOString(),
    dryRun,
  });

  const result: CleanupResult = {
    success: true,
    eventsDeleted: 0,
    dryRun,
    timestamp: new Date().toISOString(),
  };

  try {
    // Delete old events using the service function
    const eventsDeleted = await deleteOldEvents(supabase, cutoffDate, dryRun);

    result.eventsDeleted = eventsDeleted;

    logger.info("Event cleanup completed", {
      eventsDeleted,
      daysToKeep,
      dryRun,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    logger.error("Event cleanup failed", error instanceof Error ? error : null);
    result.success = false;
    return result;
  }
}

// Handler
export async function handleCleanupEvents(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCORSPreflight();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return createErrorResponse(
      "Method not allowed",
      HTTP_STATUS.METHOD_NOT_ALLOWED,
    );
  }

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const daysToKeep = parseInt(url.searchParams.get("daysToKeep") || "90", 10);
    const dryRun = url.searchParams.get("dryRun") === "true";

    // Validate daysToKeep
    if (isNaN(daysToKeep) || daysToKeep < 1) {
      return createErrorResponse(
        "Invalid daysToKeep parameter - must be >= 1",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseKey) {
      return createErrorResponse(
        "Missing Supabase configuration",
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    logger.info("Cleanup requested", {
      daysToKeep,
      dryRun,
    });

    const result = await cleanupOldEvents(supabase, daysToKeep, dryRun);

    return createSuccessResponse(result);
  } catch (error) {
    logger.error(
      "Cleanup handler failed",
      error instanceof Error ? error : null,
    );
    return createErrorResponse(
      "Failed to cleanup events",
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

// Start server when executed directly (Supabase runtime)
if (import.meta.main) {
  Deno.serve(handleCleanupEvents);
}
