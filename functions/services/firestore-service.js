const admin = require('firebase-admin');

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, firestore and
// google secret manager. The term could also mean like an intenal service, e.g.
// authentication or handling tokens, but here we've outsourced it to google/meta
// it's honestly kind of like a glorified util that's focused on connecting things
// Services should not be confused with "handlers" that do business logic

/**
 * Get all active pages from Firestore
 * @param {admin.firestore.Firestore} db - Firestore database instance
 * @returns {Promise<Array>} Array of {id, name, data} objects
 */
async function getActivePages(db) {
  // snapshots are firebase's way of returning results after consulting it. It's
  // just an object with values like .empty .docs, .size, .id, .ref (location)
  const snapshot = await db.collection('pages').where('active', '==', true).get();
  
  if (snapshot.empty) { // returns true if empty
    return [];
  }
  
  // this is the snapshot object's actual data we're interested in, placed in .data()
  return snapshot.docs.map(doc => ({ // .map tells us which data we want
    id: doc.id,
    name: doc.data().name,
    data: doc.data(),
  }));
}

/**
 * Save or update a Facebook page in Firestore in /page/ collection
 * @param {admin.firestore.Firestore} db - Firestore database instance
 * @param {string} pageId - Facebook page ID
 * @param {Object} pageData - Page data to store
 */
async function savePage(db, pageId, pageData) {
  // i.e. in /page/ firebase collection 
  const pageRef = db.collection('pages').doc(pageId);
  await pageRef.set({
    id: pageId,
    name: pageData.name,
    url: `https://facebook.com/${pageId}`,
    active: true,
    connectedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Save or update a Facebook event in Firestore in /event/ collection
 * @param {admin.firestore.Firestore} db - Firestore database instance
 * @param {string} eventId - Facebook event ID
 * @param {Object} eventData - Event data to store
 */
async function saveEvent(db, eventId, eventData) {
    // remember: Ref is the reference, i.e. the path to whcih collection
    // it lives in. So yk where in /event/ collection
  const eventRef = db.collection('events').doc(eventId);
  await eventRef.set(eventData, { merge: true });
}

/**
 * Batch write multiple events to Firestore
 * @param {admin.firestore.Firestore} db - Firestore database instance
 * @param {Array} events - Array of {id, data} objects
 * @returns {Promise<number>} Number of events written
 */
async function batchWriteEvents(db, events) {
  // batch wrting is a neat way of doing a thing all at once. It's kind 
  // of like a SQL transaction; you do the entire thing or you do nothing
  // that way you don't update only half the items. How useful!
  if (events.length === 0) {
    return 0;
  }
  
  const batch = db.batch();
  
  for (const event of events) {
    // again, ref = reference, i.e. the path inside /event/ collecton
    const eventRef = db.collection('events').doc(event.id);
    batch.set(eventRef, event.data, { merge: true });
  }
  
  await batch.commit();
  return events.length;
}

// NB: One could theoretically do batch write for facebook pages also,
// but honestly the admins we connect might only have one, max three 
// fb pages they moderate. So might be a bit overkill

module.exports = {
  getActivePages,
  savePage,
  saveEvent,
  batchWriteEvents,
};
