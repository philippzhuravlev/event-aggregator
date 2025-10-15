import type { Event, Page } from '../types';
import { events as mockEvents, pages as mockPages } from '../data/mock';
import { backendURL, useFirestore, useBackendAPI } from '../utils/constants';

// the /services/ folder contain actual connections to the external services we use, principally
// firestore and the backend; the backend also has a /services/ folder, which connects to facebook,
// google secrets manager, google cloud in general etc etc

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
  limit?: number;         // Number of events per page (default: 50)
  pageToken?: string;     // "Cursor" for next page. A cursor is just a fancy word for "where to start from"
  pageId?: string;        // Filter by Facebook page
  upcoming?: boolean;     // Only upcoming events (default: true)
  search?: string;        // Search query
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
 * Get all pages from Firestore 
 * Returns mock data if "useFirestore" is false
 * @returns List of pages
 */
export async function getPages(): Promise<Page[]> {
  if (!useFirestore) { // this allows us developers to use mock data instead of firestore if needed
    await new Promise(r => setTimeout(r, 100)); // simulate network delay
    return mockPages;
  }

  // initialize firestore and get all pages and produce a firebase snapshot. Snapshot (or "snap") is 
  // technically just "the result of a query", but it's a special object with methods and properties
  const { db } = await import('../lib/firebase');
  const { collection, getDocs } = await import('firebase/firestore'); // docs 
  const snap = await getDocs(collection(db, 'pages')); // again, snap is short for snapshot

  // map the documents to Page objects
  return snap.docs.map(d => {
    // d.data() gets the actual data in the document, but it's of type "any", so we have to cast it
    // to the correct type first. We do this by saying "as { [casted type] }"
    const data = d.data() as { name: string; url: string; active: boolean };
    return {
      id: d.id,
      name: data.name,
      url: data.url,
      active: !!data.active,
    } satisfies Page;
  });
}

/**
  * Convert Firestore timestamp-like object to ISO string
  * Handles undefined and invalid formats gracefully
  * @param value - Firestore timestamp-like object
  * @returns ISO string or undefined
  */
function toIso(value: { toDate?: () => Date } | undefined): string | undefined {
  // self-explanatory. It's pretty complicated though because of firestore's weird timestamp object
  // that has a toDate() method. So we have to check for that and convert it to ISO string first
  if (!value) return undefined;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : undefined; // ? : notation = if else
  }
  return undefined;
}

// Define a specific type for `place` type used in Event pulled straight from Facebook via Firestore
interface Place {
  name?: string;
  address?: string;
  city?: string;
  country?: string;
}

/**
 * Get events from Firestore or backend API
 * Returns mock data if "useFirestore" is false
 */
export async function getEvents(options?: GetEventsOptions): Promise<Event[]> {
  if (!useFirestore) { // use mock data if firestore is disabled in testing
    await new Promise(r => setTimeout(r, 150)); // simulate network delay
    return mockEvents;
  }

  // Use backend API if enabled, which is usually should be, but not always in testing
  if (useBackendAPI) {
    const params = new URLSearchParams(); // URLSearchParams is a built-in js class that makes it easy to build URL parameters

    // the "options" object is something we defined above, but basically it's a container for all the
    // possible parameters we might need instead of defining them manually; it's a common pattern in js/ts.
    // and here, we convert the options into URL parameters for the backend API call
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.pageToken) params.append('pageToken', options.pageToken);
    if (options?.pageId) params.append('pageId', options.pageId);
    if (options?.upcoming !== undefined) params.append('upcoming', String(options.upcoming));
    if (options?.search) params.append('search', options.search);

    // make the actual API call to the backend
    // fetch is a built-in js function to make HTTP requests, it's like axios but built-in
    // we use await because fetch returns a promise, and we want to wait for it to resolve
    // also note the use of the `${}` syntax to build the URL string from variables
    const url = `${backendURL}/getEvents?${params.toString()}`;
  
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${response.statusText}`);
    }
    const data = await response.json();
    return data.events as Event[];
  }

  // Fallback to direct Firestore access (legacy, no pagination)
  const { db } = await import('../lib/firebase');
  const { collection, getDocs, orderBy, query, limit, startAfter, where, Timestamp } = await import('firebase/firestore');
  
  let q = query(collection(db, 'events'));

  // Apply filters
  if (options?.pageId) {
    q = query(q, where('pageId', '==', options.pageId));
  }
  if (options?.upcoming !== false) {
    q = query(q, where('startTime', '>=', Timestamp.now()));
  }

  // Order by start time
  q = query(q, orderBy('startTime', 'asc'));

  // apply pagination
  if (options?.pageToken) {
    const cursorTime = parseInt(atob(options.pageToken));
    q = query(q, startAfter(Timestamp.fromMillis(cursorTime)));
  }
  if (options?.limit) {
    q = query(q, limit(options.limit));
  }

  const snap = await getDocs(q);
  let events = snap.docs.map(d => {
    const data = d.data() as {
      pageId: string;
      title: string;
      description: string;
      startTime: { toDate: () => Date };
      endTime?: { toDate: () => Date };
      place: Place;
      coverImageUrl: string;
      eventURL: string;
      createdAt: { toDate: () => Date };
      updatedAt: { toDate: () => Date };
    };
    return {
      id: d.id,
      pageId: data.pageId,
      title: data.title,
      description: data.description,
      startTime: toIso(data.startTime) as string,
      endTime: toIso(data.endTime),
      place: data.place,
      coverImageUrl: data.coverImageUrl,
      eventURL: data.eventURL,
      createdAt: toIso(data.createdAt) as string,
      updatedAt: toIso(data.updatedAt) as string,
    } satisfies Event;
  });

  // apply search filter client-side if needed
  if (options?.search) {
    const searchLower = options.search.toLowerCase();
    events = events.filter(e => {
      const searchable = [e.title, e.description, e.place?.name || ''].join(' ').toLowerCase();
      return searchable.includes(searchLower);
    });
  }

  return events;
}

/**
 * Get paginated events with full response metadata
 * Only works with backend API
 */
export async function getEventsPaginated(options?: GetEventsOptions): Promise<PaginatedEventsResponse> {
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
  if (options?.limit) params.append('limit', String(options.limit));
  if (options?.pageToken) params.append('pageToken', options.pageToken);
  if (options?.pageId) params.append('pageId', options.pageId);
  if (options?.upcoming !== undefined) params.append('upcoming', String(options.upcoming));
  if (options?.search) params.append('search', options.search);

  const response = await fetch(`${backendURL}/getEvents?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`);
  }
  
  return await response.json();
}


