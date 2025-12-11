/**
 * Data Access Layer (DAL)
 */

// This is the primary interface for fetching data from external services.
// It abstracts away the implementation details of where data comes from,
// allowing the rest of the app to just call these functions without worrying
// about whether data comes from the backend API, Supabase, or mock data.
//
// The DAL is the "pipe" from frontend to backend's data. It returns data as-is,
// without any processing or transformations (that's handled by the backend).

import type { Event, Page } from "@/types/index.ts";
import { events as mockEvents, pages as mockPages } from "@/data/mock.ts";
import {
  API_TIMEOUT_MS,
  BACKEND_URL,
  USE_BACKEND_API,
  USE_SUPABASE,
} from "@/constants/config.ts";
import { supabase } from "@/lib/supabase.ts";

// the /services/ folder contain actual connections to the external services we use, principally
// supabase and the backend; the backend also has a /services/ folder, which connects to facebook,
// vault secrets manager etc

// The "Data Access Layer" (dal) is the direct pipe from the frontend to backend's data. It just gives
// over the data (here: events and pages) as-is, without any processing or changes (that's done by the backend).

// PAGINATION
// pagination literally means "dividing stuff into pages". In databases, it means splitting up large requests
// into smaller chunks, or "pages". Like if you have 1000 events, you don't want the frontend to fetch them
// all at once, because that will be slow and might crash. And so, we split them up into e.g. 50 events per page.
/**
 * Pagination options for getEvents
 */
export interface GetEventsOptions { // we use an interface, but in ts they're just used for type checking
  // the "options" pattern is very common in js/ts. Instead of passing a long list of parameters, we pass an "options"
  // object with a list of little properties like the ones above. Also makes it easier to add new options later.
  // the ? after each property means it's optional.
  limit?: number; // Number of events per page (default: 50)
  pageToken?: string; // "Cursor" for next page. A cursor is just a fancy word for "where to start from"
  pageId?: string; // Filter by Facebook page
  upcoming?: boolean; // Only upcoming events (default: true)
  search?: string; // Search query
}

/**
 * Paginated response from getEvents
 */
export interface PaginatedEventsResponse {
  // this matches the backend's GetEventsResponse.
  events: Event[];
  nextPageToken?: string; // calling it a "token" is a bit misleading, it's really just a timestamp, a "pointer"
  hasMore: boolean;
  totalReturned: number;
}

/**
 * Get all pages from Supabase or backend API
 * Returns mock data if USE_BACKEND_API is false, allowing for local development and testing
 * @returns List of pages
 */
export async function getPages(): Promise<Page[]> {
  if (!USE_BACKEND_API && !USE_SUPABASE) {
    await new Promise((r) => setTimeout(r, 100)); // Simulate network delay for realistic UI testing
    return mockPages;
  }

  try {
    const { data, error } = await supabase.from("pages").select("*");

    if (error) {
      return [];
    }

    if (!data) {
      console.warn("No pages data returned from Supabase");
      return [];
    }

    // Map Supabase schema to Page schema
    // IMPORTANT: Use page_id (Facebook page ID), NOT id (database UUID)!
    // Events use pageId from the Facebook API, so we must match that here for filtering to work
    return data.map((
      d: { page_id: number; page_name: string; token_status: string },
    ) => ({
      id: String(d.page_id), // Convert Facebook page_id (number) to string for consistency
      name: d.page_name || "Unnamed Page",
      url: "", // Supabase schema doesn't have URL
      active: d.token_status === "active",
    }));
  } catch (err) {
    console.error("Error in getPages:", err);
    return [];
  }
}

/**
 * Get events from backend API or directly from Supabase
 * Returns mock data if USE_BACKEND_API is false, allowing for development without running the backend
 * Falls back to Supabase if backend API fails for graceful error handling
 */
export async function getEvents(options?: GetEventsOptions): Promise<Event[]> {
  if (!USE_BACKEND_API) {
    if (USE_SUPABASE) {
      return getEventsFromSupabase(options);
    }
    await new Promise((r) => setTimeout(r, 150)); // Simulate network delay for realistic UI testing
    return mockEvents;
  }

  try {
    const params = new URLSearchParams(); // URLSearchParams is a built-in js class that makes it easy to build URL parameters

    // the "options" object is something we defined above, but basically it's a container for all the
    // possible parameters we might need instead of defining them manually; it's a common pattern in js/ts.
    // and here, we convert the options into URL parameters for the backend API call
    if (options?.limit) params.append("limit", String(options.limit));
    if (options?.pageToken) params.append("pageToken", options.pageToken);
    if (options?.pageId) params.append("pageId", options.pageId);
    if (options?.upcoming !== undefined) {
      params.append("upcoming", String(options.upcoming));
    }
    if (options?.search) params.append("search", options.search);

    // Make the actual API call to the backend
    // fetch is a built-in JS function to make HTTP requests (similar to axios but built-in to browsers)
    // We use await because fetch returns a Promise, and we want to wait for the response
    // Template literals (${}) allow us to embed variables directly into strings
    const url = `${BACKEND_URL}/get-events?${params.toString()}`;
    const authKey = import.meta.env.VITE_SUPABASE_ANON_KEY ||
      import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!BACKEND_URL || !authKey) {
      // Fall back to direct Supabase access if backend config is missing
      return getEventsFromSupabase(options);
    }

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${authKey}`,
        "apikey": authKey,
      },
      // AbortSignal.timeout ensures requests don't hang indefinitely
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (!response.ok) {
      return getEventsFromSupabase(options);
    }
    const json = await response.json();

    // Map backend response to Event format - backend returns raw database format
    // that needs to be transformed to match our Event interface (e.g., page_id → pageId)
    const events = json.data?.events || [];
    return events.map((e: Record<string, unknown>) => ({
      id: e.id,
      pageId: e.pageId || String(e.page_id || ""),
      title: e.title || "Unnamed Event",
      description: e.description,
      startTime: e.startTime || e.start_time || "",
      endTime: e.endTime || e.end_time,
      place: e.place,
      coverImageUrl: e.coverImageUrl || e.cover,
      eventURL: e.eventURL || `https://facebook.com/events/${e.id}`,
      createdAt: e.createdAt || e.created_at || "",
      updatedAt: e.updatedAt || e.updated_at || "",
    })) as Event[];
  } catch {
    return getEventsFromSupabase(options);
  }
}

/**
 * Get events directly from Supabase
 * Fallback when backend API is not available
 */
async function getEventsFromSupabase(
  options?: GetEventsOptions,
): Promise<Event[]> {
  try {
    let query = supabase
      .from("events")
      .select("*");

    // Apply filters
    if (options?.pageId) {
      query = query.eq("page_id", parseInt(options.pageId, 10));
    }

    if (options?.search) {
      query = query.ilike("event_data->name", `%${options.search}%`);
    }

    // Apply pagination
    const limit = options?.limit || 50;
    const offset = options?.pageToken ? parseInt(options.pageToken, 10) : 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      return [];
    }

    if (!data) {
      return [];
    }

    // Map database format to Event format
    return data.map((
      d: {
        id: string;
        page_id: number;
        event_data: Record<string, unknown>;
        created_at: string;
        updated_at: string;
      },
    ) => ({
      id: d.id,
      pageId: String(d.page_id),
      title: (d.event_data?.name as string) || "Unnamed Event",
      description: (d.event_data?.description as string),
      startTime: (d.event_data?.start_time as string) || "",
      endTime: (d.event_data?.end_time as string),
      place: d.event_data?.place
        ? {
          name: (d.event_data.place as Record<string, unknown>)?.name as string,
        }
        : undefined,
      coverImageUrl: d.event_data?.cover
        ? (d.event_data.cover as Record<string, unknown>)?.source as string
        : undefined,
      eventURL: `https://facebook.com/events/${d.id}`,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Get paginated events with full response metadata
 * Only works with backend API - Supabase fallback provides non-paginated results
 *
 * Pagination is useful when dealing with large datasets, splitting results into "pages"
 * For example, instead of fetching 1000 events at once (slow!), we fetch 50 per page
 */
export async function getEventsPaginated(
  options?: GetEventsOptions,
): Promise<PaginatedEventsResponse> {
  if (!USE_BACKEND_API) {
    // Fallback: Return all events without pagination metadata
    // This allows frontend development even when backend API isn't available
    const events = await getEvents(options);
    return {
      events,
      hasMore: false,
      totalReturned: events.length,
    };
  }

  // Build URL parameters for the backend API call (same pattern as getEvents)
  const params = new URLSearchParams();
  if (options?.limit) params.append("limit", String(options.limit));
  if (options?.pageToken) params.append("pageToken", options.pageToken);
  if (options?.pageId) params.append("pageId", options.pageId);
  if (options?.upcoming !== undefined) {
    params.append("upcoming", String(options.upcoming));
  }
  if (options?.search) params.append("search", options.search);

  const response = await fetch(
    `${BACKEND_URL}/get-events?${params.toString()}`,
    {
      headers: {
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY || "",
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch events: ${response.status} ${response.statusText}`,
    );
  }

  return await response.json();
}

/**
 * Get a single event by id
 * Uses mock data in dev, otherwise fetches directly from Supabase
 */
export async function getEventById(id: string): Promise<Event | null> {
  if (!USE_BACKEND_API && !USE_SUPABASE) {
    const found = mockEvents.find((e) => e.id === id);
    return found ?? null;
  }

  return await fetchEventFromSupabaseById(id);
}

async function fetchEventFromSupabaseById(id: string): Promise<Event | null> {
  try {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      pageId: String(data.page_id),
      title: (data.event_data?.name as string) || "Unnamed Event",
      description: (data.event_data?.description as string),
      startTime: (data.event_data?.start_time as string) || "",
      endTime: (data.event_data?.end_time as string),
      place: data.event_data?.place
        ? {
          name: (data.event_data.place as Record<string, unknown>)
            ?.name as string,
        }
        : undefined,
      coverImageUrl: data.event_data?.cover
        ? (data.event_data.cover as Record<string, unknown>)?.source as string
        : undefined,
      eventURL: `https://facebook.com/events/${data.id}`,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    } satisfies Event;
  } catch (err) {
    console.error("Error in fetchEventFromSupabaseById:", err);
    return null;
  }
}
