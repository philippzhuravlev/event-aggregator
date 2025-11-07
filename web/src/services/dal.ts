import type { Event, Page } from "../types";
import { events as mockEvents, pages as mockPages } from "../data/mock";
import { backendURL, useBackendAPI } from "../utils/constants";
import { supabase } from "../lib/supabase";

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

  const { data, error } = await supabase.from("pages").select("*");

  if (error) {
    console.error("Error fetching pages from Supabase:", error);
    return [];
  }

  return data.map((d) => ({
    id: d.id,
    name: d.name,
    url: d.url,
    active: !!d.active,
  }));
}

/**
 * Get events from backend API
 * Returns mock data if "useBackendAPI" is false
 */
export async function getEvents(options?: GetEventsOptions): Promise<Event[]> {
  if (!useBackendAPI) { // use mock data if backend api is disabled in testing
    await new Promise((r) => setTimeout(r, 150)); // simulate network delay
    return mockEvents;
  }

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

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY || "",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch events: ${response.status} ${response.statusText}`,
    );
  }
  const data = await response.json();
  return data.events as Event[];
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
