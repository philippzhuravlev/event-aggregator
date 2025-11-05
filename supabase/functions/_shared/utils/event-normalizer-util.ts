import { FacebookEvent, NormalizedEvent } from "../types.ts";

// So this is a util, a helper function that is neither "what to do" (handler) nor
// "how to connect to an external service" (service). It just does pure logic that
// either makes sense to compartmentalize or is used in multiple places.

// This util helpfully formats and standardizes how the data from our Fb events
// to our supabase database schema; it's just a pipe. This is formally called
// "normalization" or "data transformation"

/**
 * Normalize a Facebook Graph API event object into our Supabase schema
 * @param facebookEvent - Raw event object from Facebook Graph API
 * @param pageId - Facebook page ID this event belongs to
 * @param coverImageUrl - Processed cover image URL (from image service). If null, uses Facebook's URL
 * @returns Normalized event object ready for Supabase
 */
export function normalizeEvent(
  facebookEvent: FacebookEvent,
  pageId: string,
  coverImageUrl: string | null = null,
): NormalizedEvent {
  // Use image URL if provided, otherwise fall back to Facebook's URL
  const finalCoverUrl = coverImageUrl ||
    (facebookEvent.cover && facebookEvent.cover.source) ||
    undefined;

  // Build the event_data JSONB object with proper typing
  const eventData: NormalizedEvent["event_data"] = {
    id: facebookEvent.id,
    name: facebookEvent.name,
    start_time: facebookEvent.start_time,
  };

  // Add optional fields only if they're defined
  if (facebookEvent.description !== undefined) {
    eventData.description = facebookEvent.description;
  }
  if (facebookEvent.end_time !== undefined) {
    eventData.end_time = facebookEvent.end_time;
  }
  if (facebookEvent.place !== undefined) {
    eventData.place = facebookEvent.place;
  }
  if (finalCoverUrl !== undefined) {
    eventData.cover = {
      source: finalCoverUrl,
      id: facebookEvent.cover?.id,
    };
  }

  // Return the normalized event with the correct structure
  return {
    page_id: parseInt(pageId, 10),
    event_id: facebookEvent.id,
    event_data: eventData,
  };
}
