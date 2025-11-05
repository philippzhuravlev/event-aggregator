/**
 * Validation schema for cleanup-events query parameters
 * Defines and validates the query params for event cleanup operations
 */

/**
 * Query parameters for cleanup-events endpoint
 */
export interface CleanupEventsQuery {
  daysToKeep: number;
  dryRun?: boolean;
}

/**
 * Validate and parse query parameters for cleanup-events
 * @param url - URL object with search params
 * @returns { success: boolean, data?: CleanupEventsQuery, error?: string }
 */
export function validateCleanupEventsQuery(
  url: URL,
): { success: boolean; data?: CleanupEventsQuery; error?: string } {
  try {
    const params = url.searchParams;

    // Parse daysToKeep (required)
    const daysToKeepStr = params.get("daysToKeep");
    if (!daysToKeepStr) {
      return { success: false, error: "daysToKeep parameter is required" };
    }

    const daysToKeep = parseInt(daysToKeepStr, 10);
    if (isNaN(daysToKeep) || daysToKeep < 1) {
      return { success: false, error: "daysToKeep must be a positive integer" };
    }

    // Parse dryRun (optional, default: false)
    const dryRunStr = params.get("dryRun");
    const dryRun = dryRunStr ? dryRunStr === "true" : false;

    return {
      success: true,
      data: {
        daysToKeep,
        dryRun,
      },
    };
  } catch {
    return { success: false, error: "Invalid query parameters" };
  }
}
