/**
 * Type definitions for the Event Aggregator application
 * Domain models representing Facebook Pages and Events
 */

/**
 * Represents a Facebook Page that we aggregate events from
 */
export interface Page {
    id: string; // FB Page ID or slug
    name: string;
    url: string; // Facebook Page URL
    active: boolean;
}

/**
 * Geographic location information for an event
 */
export interface Location {
    street?: string;
    city?: string;
    zip?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
}

/**
 * Place/venue where an event is held
 */
export interface Place {
    id?: string; // FB Place ID
    name?: string; // e.g. "S-Huset, DTU Lyngby"
    location?: Location;
}

/**
 * Main Event domain model
 * Represents a Facebook event aggregated from a Page
 */
export interface Event {
    id: string; // Facebook Event ID (e.g. 681584148307168)
    pageId: string; // Source Facebook Page ID
    title: string; // FB: "name"
    description?: string; // FB: "description"
    startTime: string; // ISO 8601 format; FB: "start_time"
    endTime?: string; // ISO 8601; FB: "end_time"
    place?: Place; // Where the event is held
    coverImageUrl?: string; // FB: event_cover.source or cover.source
    eventURL?: string; // e.g. https://facebook.com/events/{id}
    createdAt: string; // ISO 8601 (when we stored it)
    updatedAt: string; // ISO 8601 (last sync/update)
}
