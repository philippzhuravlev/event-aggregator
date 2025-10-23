import * as admin from 'firebase-admin';
import { FACEBOOK, FIRESTORE } from '../utils/constants';
import { logger } from '../utils/logger';
import { PageInfo, EventBatchItem, NormalizedEvent } from '../types';

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, firestore and
// google secret manager. The term could also mean like an intenal service, e.g.
// authentication or handling tokens, but here we've outsourced it to google/meta
// it's honestly kind of like a glorified util that's focused on connecting things
// Services should not be confused with "handlers" that do business logic

// This is a classic service module insofar as it connects directly to firestore. Simple as

/**
 * Get all active pages from Firestore
 * @param db - Firestore database instance
 * @returns Array of page objects
 */
export async function getActivePages(db: admin.firestore.Firestore): Promise<PageInfo[]> {
  // snapshots are firebase's way of returning results after consulting it. It's
  // just an object with values like .empty .docs, .size, .id, .ref (location)
  // where() is a firebase function that filters the collection based on a condition, 
  // which for us is that the page is active. .get() actually executes the query
  const snapshot = await db.collection('pages').where('active', '==', true).get();
  
  if (snapshot.empty) { // returns true if empty
    return [];
  }
  
  // this is the snapshot object's actual data we're interested in, placed in .data() funct
  return snapshot.docs.map(doc => ({ // .map tells us which data we want
    id: doc.id,
    name: doc.data().name,
    data: doc.data(),
  }));
}

/**
 * Save or update a Facebook page in Firestore in /page/ collection
 * @param db - Firestore database instance
 * @param pageId - Facebook page ID
 * @param pageData - Page data to store
 */
export async function savePage(
  db: admin.firestore.Firestore, 
  pageId: string, 
  pageData: { name?: string; active?: boolean }
): Promise<void> {
  // i.e. in /page/ firebase collection 
  const { FieldValue } = require('@google-cloud/firestore');
  const pageRef = db.collection('pages').doc(pageId);
  
  const dataToSave: any = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  
  // Only include fields that are provided
  if (pageData.name !== undefined) {
    dataToSave.id = pageId;
    dataToSave.name = pageData.name;
    dataToSave.url = FACEBOOK.pageUrl(pageId);
    dataToSave.connectedAt = FieldValue.serverTimestamp();
  }
  
  if (pageData.active !== undefined) {
    dataToSave.active = pageData.active;
  } else if (pageData.name !== undefined) {
    // If creating a new page, default to active
    dataToSave.active = true;
  }
  
  await pageRef.set(dataToSave, { merge: true });
}

/**
 * Save or update a Facebook event in Firestore in /event/ collection
 * @param db - Firestore database instance
 * @param eventId - Facebook event ID
 * @param eventData - Event data to store
 */
export async function saveEvent(
  db: admin.firestore.Firestore, 
  eventId: string, 
  eventData: NormalizedEvent
): Promise<void> {
  // remember: Ref is the reference, i.e. the path to whcih collection
  // it lives in. So yk where in /event/ collection
  const eventRef = db.collection('events').doc(eventId);
  await eventRef.set(eventData, { merge: true });
}

/**
 * Batch write multiple events to Firestore
 * @param db - Firestore database instance
 * @param events - Array of event objects with id and data
 * @returns Number of events written
 */
export async function batchWriteEvents(
  db: admin.firestore.Firestore, 
  events: EventBatchItem[]
): Promise<number> {
  // batch wrting is a neat way of doing a thing all at once. It's kind 
  // of like a SQL transaction; you do the entire thing or you do nothing
  // that way you don't update only half the items. How useful!
  if (events.length === 0) {
    return 0;
  }
  
  // Firestore has a 500 operation limit per batch, so we need to chunk
  const BATCH_SIZE = FIRESTORE.MAX_BATCH_SIZE;
  const chunks: EventBatchItem[][] = [];
  
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    chunks.push(events.slice(i, i + BATCH_SIZE));
  }
  
  // Process each chunk
  let totalWritten = 0;
  for (const chunk of chunks) {
    const batch = db.batch();
    
    for (const event of chunk) {
      // again, ref = reference, i.e. the path inside /event/ collecton
      const eventRef = db.collection('events').doc(event.id);
      batch.set(eventRef, event.data, { merge: true });
    }
    
    await batch.commit();
    totalWritten += chunk.length;
    logger.debug('Wrote batch of events to Firestore', {
      batchSize: chunk.length,
      totalWritten,
      totalEvents: events.length,
    });
  }
  
  return totalWritten;
}

// NB: One could theoretically do batch write for facebook pages also,
// but honestly the admins we connect might only have one, max three 
// fb pages they moderate. So might be a bit overkill

