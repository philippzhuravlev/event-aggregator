const admin = require('firebase-admin');

// So this is a util, a helper function that is neither "what to do" (handler) nor 
// "how to connect to an external service" (service). It just does pure logic that 
// either makes sense to compartmentalize or is used in multiple places.

// This util helpfully formats and standardizes how the data from our Fb events
// to our firestore database schema; it's just a pipe. This is formally called
// "normalization" or "data transformation"

/**
 * Normalize a Facebook Graph API event object into our Firestore schema
 * @param {Object} facebookEvent - Raw event object from Facebook Graph API
 * @param {string} pageId - Facebook page ID this event belongs to
 * @param {string|null} [coverImageUrl] - Processed cover image URL (from image service). If null, uses Facebook's URL
 * @returns {Object} Normalized event object ready for Firestore
 */
function normalizeEvent(facebookEvent, pageId, coverImageUrl = null) {
  // handles the "place data", i.e. what the location is of the event (if at all)
  // facebookEvent.place is actually an object with name and location (which itself is an object)
  // if no place - which is v common - we just set it to undefined
  const placeData = facebookEvent.place ? {
    name: facebookEvent.place.name,
    location: facebookEvent.place.location,
  } : undefined;

  // use image URL if provided, otherwise fall back to Facebook's URL
  const finalCoverUrl = coverImageUrl ||
    (facebookEvent.cover && facebookEvent.cover.source) ||
    undefined;

  // this is the complete, fully normalized event object that we'll place in firestore
  const normalized = {
    id: facebookEvent.id,
    pageId: pageId,
    title: facebookEvent.name,
    description: facebookEvent.description,
    startTime: facebookEvent.start_time,
    endTime: facebookEvent.end_time,
    place: placeData,
    coverImageUrl: finalCoverUrl,
    eventURL: `https://facebook.com/events/${facebookEvent.id}`,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // while this section below looks very complicated, all it does is that it filters
  // out any undefined values from the normalized object. Firestore doesn't accept
  return Object.fromEntries(
    Object.entries(normalized).filter(([, v]) => v !== undefined)
  );
}

module.exports = {
  normalizeEvent,
};
