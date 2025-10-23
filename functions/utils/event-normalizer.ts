import { FACEBOOK } from './constants';
import { FieldValue } from '@google-cloud/firestore';
import { FacebookEvent, NormalizedEvent, PlaceData } from '../types';

// So this is a util, a helper function that is neither "what to do" (handler) nor 
// "how to connect to an external service" (service). It just does pure logic that 
// either makes sense to compartmentalize or is used in multiple places.

// This util helpfully formats and standardizes how the data from our Fb events
// to our firestore database schema; it's just a pipe. This is formally called
// "normalization" or "data transformation"

/**
 * Normalize a Facebook Graph API event object into our Firestore schema
 * @param facebookEvent - Raw event object from Facebook Graph API
 * @param pageId - Facebook page ID this event belongs to
 * @param coverImageUrl - Processed cover image URL (from image service). If null, uses Facebook's URL
 * @returns Normalized event object ready for Firestore
 */
export function normalizeEvent(
  facebookEvent: FacebookEvent, 
  pageId: string, 
  coverImageUrl: string | null = null
): NormalizedEvent {
  // handles the "place data", i.e. what the location is of the event (if at all)
  // facebookEvent.place is actually an object with name and location (which itself is an object)
  // if no place - which is v common - we just set it to undefined
  let placeData: PlaceData | undefined = undefined;
  if (facebookEvent.place) {
    placeData = {
      name: facebookEvent.place.name,
    };
    // Only include location if it exists and has properties
    if (facebookEvent.place.location && Object.keys(facebookEvent.place.location).length > 0) {
      placeData.location = facebookEvent.place.location;
    }
  }

  // use image URL if provided, otherwise fall back to Facebook's URL
  const finalCoverUrl = coverImageUrl ||
    (facebookEvent.cover && facebookEvent.cover.source) ||
    undefined;

  // this is the complete, fully normalized event object that we'll place in firestore
  const normalized: Partial<NormalizedEvent> = {
    id: facebookEvent.id,
    pageId: pageId,
    title: facebookEvent.name,
    description: facebookEvent.description,
    startTime: facebookEvent.start_time,
    endTime: facebookEvent.end_time,
    place: placeData,
    coverImageUrl: finalCoverUrl,
    eventURL: FACEBOOK.eventUrl(facebookEvent.id),
    createdAt: FieldValue.serverTimestamp() as any,
    updatedAt: FieldValue.serverTimestamp() as any,
  };

  // while this section below looks very complicated, all it does is that it filters
  // out any undefined values from the normalized object. Firestore doesn't accept undefined
  const filtered = Object.fromEntries(
    Object.entries(normalized).filter(([, v]) => v !== undefined)
  );
  
  return filtered as unknown as NormalizedEvent;
}

