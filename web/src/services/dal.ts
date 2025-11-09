import type { Event, Page } from "../types.ts";
import { events as mockEvents, pages as mockPages } from "../data/mock.ts";
import { backendURL, useBackendAPI } from "../utils/constants.ts";
import { supabase } from "../lib/supabase.ts";

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
 * Get all pages from Supabase
 * Returns mock data if "useBackendAPI" is false
 * @returns List of pages
 */
export async function getPages(): Promise<Page[]> {
  if (!useBackendAPI) { // this allows us developers to use mock data instead of supabase if needed
    await new Promise((r) => setTimeout(r, 100)); // simulate network delay
    return mockPages;
  }

  try {
    const { data, error } = await supabase.from("pages").select("*");

    if (error) {
      console.error("Error fetching pages from Supabase:", error);
      return [];
    }

    if (!data) {
      console.warn("No pages data returned from Supabase");
      return [];
    }

    // Map Supabase schema to Page schema
    return data.map((
      d: { id: string; page_name: string; token_status: string },
    ) => ({
      id: d.id,
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
 * Returns mock data if "useBackendAPI" is false
 * Falls back to Supabase if backend API fails
 */
export async function getEvents(options?: GetEventsOptions): Promise<Event[]> {
  if (!useBackendAPI) { // use mock data if backend api is disabled in testing
    await new Promise((r) => setTimeout(r, 150)); // simulate network delay
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

    // make the actual API call to the backend
    // fetch is a built-in js function to make HTTP requests, it's like axios but built-in
    // we use await because fetch returns a promise, and we want to wait for it to resolve
    // also note the use of the `${}` syntax to build the URL string from variables
    const url = `${backendURL}/get-events?${params.toString()}`;
    const authKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!backendURL || !authKey) {
      console.warn(
        `Missing configuration for backend API: backendURL=${backendURL}, hasAuthKey=${!!authKey}. Falling back to direct Supabase access.`,
      );
      return getEventsFromSupabase(options);
    }

    console.log(`Fetching events from backend API: ${url.substring(0, 50)}...`);
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${authKey}`,
        "apikey": authKey,
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      console.warn(
        `Backend API returned error ${response.status}. Falling back to direct Supabase access.`,
      );
      return getEventsFromSupabase(options);
    }
    const json = await response.json();
    return json.data?.events as Event[];
  } catch (error) {
    console.warn("Backend API failed, falling back to direct Supabase access:", error);
    return getEventsFromSupabase(options);
  }
}

/**
 * Get events directly from Supabase
 * Fallback when backend API is not available
 */
async function getEventsFromSupabase(options?: GetEventsOptions): Promise<Event[]> {
  try {
    console.log("Fetching events directly from Supabase...");
    
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
      console.error("Error fetching events from Supabase:", error);
      return [];
    }

    if (!data) {
      console.warn("No event data returned from Supabase");
      return [];
    }

    // Map database format to Event format
    return data.map((d: { id: string; page_id: number; event_data: Record<string, unknown>; created_at: string; updated_at: string }) => ({
      id: d.id,
      pageId: String(d.page_id),
      title: (d.event_data?.name as string) || "Unnamed Event",
      description: (d.event_data?.description as string),
      startTime: (d.event_data?.start_time as string) || "",
      endTime: (d.event_data?.end_time as string),
      place: d.event_data?.place ? {
        name: (d.event_data.place as Record<string, unknown>)?.name as string,
      } : undefined,
      coverImageUrl: d.event_data?.cover ? (d.event_data.cover as Record<string, unknown>)?.source as string : undefined,
      eventURL: `https://facebook.com/events/${d.id}`,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
  } catch (err) {
    console.error("Error fetching events from Supabase:", err);
    return [];
  }
}

/**
 * Get paginated events with full response metadata
 * Only works with backend API
 */
export async function getEventsPaginated(
  options?: GetEventsOptions,
): Promise<PaginatedEventsResponse> {
  if (!useBackendAPI) {
    // fallback: Just return all events without the metadata about pagination
    const events = await getEvents(options);
    return {
      events,
      hasMore: false,
      totalReturned: events.length,
    };
  }

  // Here we build the URL parameters for the backend API call like in the previous function
  const params = new URLSearchParams();
  if (options?.limit) params.append("limit", String(options.limit));
  if (options?.pageToken) params.append("pageToken", options.pageToken);
  if (options?.pageId) params.append("pageId", options.pageId);
  if (options?.upcoming !== undefined) {
    params.append("upcoming", String(options.upcoming));
  }
  if (options?.search) params.append("search", options.search);

  const response = await fetch(
    `${backendURL}/get-events?${params.toString()}`,
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
