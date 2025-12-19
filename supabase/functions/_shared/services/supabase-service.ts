import { createClient } from "@supabase/supabase-js";
import type {
  SupabaseClient,
  SupabaseClientOptions,
} from "@supabase/supabase-js";
import { logger } from "./logger-service.ts";
import type {
  DatabasePage,
  NormalizedEvent,
} from "../../../../packages/shared/src/types.ts";
import {
  calculateDaysUntilExpiry,
  isTokenExpiring,
} from "../../../../packages/shared/src/utils/token-expiry-util.ts";
import { TOKEN_EXPIRY_CONFIG } from "../../../../packages/shared/src/runtime/deno.ts";

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, Supabase and
// secrets manager. The term could also mean like an internal service, e.g.
// authentication or handling tokens, but here we've outsourced it to meta
// Services should not be confused with "handlers" that do business logic

// This file specifically handles Supabase interactions related to Facebook pages and events
// For Vault operations (storing/retrieving encrypted secrets), see vault-service.ts

// Supabase client factory
// This is a factory pattern to create a Supabase client. The factory pattern is a classic
// programming design pattern (explained in book of the same name written by the "gang of four")
// which is used to create objects in a flexible way. In this case, we use it to create a Supabase client
// but it can have slightly different configurations, e.g. for testing and development. This is exactly
// what we do here for better testing.
type CreateClientFn = typeof createClient;

let currentClientFactory: CreateClientFn = createClient;

export function setSupabaseClientFactory(factory: CreateClientFn) {
  currentClientFactory = factory;
}

export function resetSupabaseClientFactory() {
  currentClientFactory = createClient;
}

export function createSupabaseClient(
  supabaseUrl: string,
  supabaseKey: string,
  options?: SupabaseClientOptions<"public">,
) {
  return currentClientFactory(supabaseUrl, supabaseKey, options);
}

/**
 * Save or update a Facebook page in Supabase
 * @param supabase - Supabase client
 * @param pageId - Facebook page ID
 * @param pageName - Facebook page name
 */
export async function savePage(
  supabase: SupabaseClient,
  pageId: string,
  pageName: string,
): Promise<void> {
  const dataToSave = {
    page_id: parseInt(pageId, 10),
    page_name: pageName,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("pages").upsert(dataToSave);

  if (error) {
    logger.error("Failed to save page in Supabase", null, {
      pageId,
      error: String(error),
    });
    throw new Error(`Failed to save page in Supabase: ${error.message}`);
  }

  logger.info("Saved page in Supabase", { pageId });
}

/**
 * Save or update a Facebook event in Supabase
 * @param supabase - Supabase client
 * @param eventData - Normalized event data to store
 */
export async function saveEvent(
  supabase: SupabaseClient,
  eventData: NormalizedEvent,
): Promise<void> {
  const { error } = await supabase.from("events").upsert({
    page_id: eventData.page_id,
    event_id: eventData.event_id,
    event_data: eventData.event_data,
  });

  if (error) {
    logger.error("Failed to save event in Supabase", null, {
      eventId: eventData.event_id,
      error: String(error),
    });
    throw new Error(`Failed to save event in Supabase: ${error.message}`);
  }

  logger.debug("Saved event in Supabase", { eventId: eventData.event_id });
}

/**
 * Batch write multiple events to Supabase
 * @param supabase - Supabase client
 * @param events - Array of normalized event objects
 * @returns Number of events written
 */
export async function batchWriteEvents(
  supabase: SupabaseClient,
  events: NormalizedEvent[],
): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  const eventsToUpsert = events.map((event) => ({
    page_id: event.page_id,
    event_id: event.event_id,
    event_data: event.event_data,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("events")
    .upsert(eventsToUpsert, { onConflict: "page_id,event_id" });

  if (error) {
    logger.error("Failed to batch write events to Supabase", null, {
      batchSize: events.length,
      error: String(error),
    });
    throw new Error(
      `Failed to batch write events to Supabase: ${error.message}`,
    );
  }

  logger.info("Wrote batch of events to Supabase", {
    batchSize: events.length,
  });

  return events.length;
}

// Vault operations (getPageToken, getApiKey, getWebhookVerifyToken) have been moved to vault-service.ts
// Import from vault-service.ts instead to access vault-related functions

/**
 * Get all active pages from Supabase
 * @param supabase - Supabase client
 * @returns Array of page objects
 */
export async function getActivePages(
  supabase: SupabaseClient,
): Promise<DatabasePage[]> {
  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .eq("token_status", "active")
    .not("page_access_token_id", "is", null);

  if (error) {
    logger.error("Failed to retrieve active pages from Supabase", null, {
      error: String(error),
    });
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data as DatabasePage[];
}

/**
 * Check if a page's token is expiring soon and needs refresh
 * @param supabase - Supabase client
 * @param pageId - Facebook page ID
 * @param warningDays - Days before expiry to start warning
 * @returns Token expiry status
 */
export async function checkTokenExpiry(
  supabase: SupabaseClient,
  pageId: string,
  warningDays: number = TOKEN_EXPIRY_CONFIG.warningDays,
): Promise<
  { isExpiring: boolean; daysUntilExpiry: number; expiresAt: Date | null }
> {
  const { data, error } = await supabase
    .from("pages")
    .select("token_expiry")
    .eq("page_id", pageId)
    .single();

  if (error || !data) {
    if (error) {
      logger.warn("Failed to check token expiry from Supabase", {
        pageId,
        error: String(error),
      });
    }
    return { isExpiring: true, daysUntilExpiry: 0, expiresAt: null };
  }

  // deno-lint-ignore no-explicit-any
  const tokenExpiresAt = (data as any).token_expiry;
  if (!tokenExpiresAt) {
    return { isExpiring: true, daysUntilExpiry: 0, expiresAt: null };
  }

  const expiresAt = new Date(tokenExpiresAt);
  const now = new Date();
  const daysUntilExpiry = calculateDaysUntilExpiry(expiresAt, now);

  return {
    isExpiring: isTokenExpiring(daysUntilExpiry, warningDays),
    daysUntilExpiry,
    expiresAt,
  };
}

/**
 * Mark a page's token as expired in Supabase
 * @param supabase - Supabase client
 * @param pageId - Facebook page ID
 * @returns Promise<void>
 */
export async function markTokenExpired(
  supabase: SupabaseClient,
  pageId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("pages")
    .update({
      token_status: "expired",
      updated_at: now,
    })
    .eq("page_id", pageId);

  if (error) {
    logger.error("Failed to mark token as expired in Supabase", null, {
      pageId,
      error: String(error),
    });
    throw new Error(
      `Failed to mark token as expired in Supabase: ${error.message}`,
    );
  }

  logger.warn("Marked token as expired in Supabase", { pageId });
}

/**
 * Delete old events from Supabase
 * @param supabase - Supabase client
 * @param beforeDate - Delete events with created_at before this date
 * @param dryRun - If true, only count events without deleting
 * @returns Number of events deleted (or would be deleted if dryRun=true)
 */
export async function deleteOldEvents(
  supabase: SupabaseClient,
  beforeDate: Date,
  dryRun: boolean = false,
): Promise<number> {
  try {
    // First, count matching events
    const { count, error: countError } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .lt("created_at", beforeDate.toISOString());

    if (countError) {
      logger.error("Failed to count old events in Supabase", null, {
        error: String(countError),
      });
      return 0;
    }

    const eventsToDelete = count || 0;

    if (dryRun) {
      logger.info("Dry run: would delete old events from Supabase", {
        eventsToDelete,
        beforeDate: beforeDate.toISOString(),
      });
      return eventsToDelete;
    }

    // Actually delete the events
    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .lt("created_at", beforeDate.toISOString());

    if (deleteError) {
      const deleteErr = new Error(
        `Failed to delete old events from Supabase: ${deleteError.message}`,
      );
      logger.error("Failed to delete old events from Supabase", deleteErr, {
        error: String(deleteError),
      });
      throw deleteErr;
    }

    logger.info("Deleted old events from Supabase", {
      eventsDeleted: eventsToDelete,
    });
    return eventsToDelete;
  } catch (error) {
    logger.error(
      "Error deleting old events from Supabase",
      error instanceof Error ? error : null,
    );
    throw error instanceof Error
      ? error
      : new Error("Error deleting old events from Supabase");
  }
}
