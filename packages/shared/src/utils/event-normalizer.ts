import type { FacebookEvent, NormalizedEvent } from "../types.ts";

/**
 * Normalize a Facebook Graph API event object into the Supabase event schema.
 * @param facebookEvent - Raw event object from Facebook Graph API
 * @param pageId - Facebook page ID this event belongs to
 * @param coverImageUrl - Optional processed cover image URL (falls back to Facebook URL)
 * @returns Normalized event ready for persistence
 */
export function normalizeEvent(
  facebookEvent: FacebookEvent,
  pageId: string,
  coverImageUrl: string | null = null,
): NormalizedEvent {
  const finalCoverUrl = coverImageUrl ??
    facebookEvent.cover?.source ??
    undefined;

  const eventData: NormalizedEvent["event_data"] = {
    id: facebookEvent.id,
    name: facebookEvent.name,
    start_time: facebookEvent.start_time,
  };

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

  return {
    page_id: parseInt(pageId, 10),
    event_id: facebookEvent.id,
    event_data: eventData,
  };
}


