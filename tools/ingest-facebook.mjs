import { readFile } from 'node:fs/promises';
import fetch from 'node-fetch';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { config } from 'dotenv';
import { execSync } from 'child_process';

// Load environment variables from .env file
config();

console.log('Starting Facebook event ingestion...');

/**
 * Get token from Secret Manager using gcloud CLI
 */
function getToken(pageId) {
  try {
    const secretName = `facebook-token-${pageId}`;
    const command = `gcloud secrets versions access latest --secret="${secretName}"`;
    const token = execSync(command, { encoding: 'utf-8' }).trim();
    return token;
  } catch (error) {
    console.error(`Failed to get token for page ${pageId}:`, error.message);
    throw new Error(`No token found for page ${pageId} in Secret Manager`);
  }
}

// Initialize Firebase
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH;
let credential;
let serviceAccountJson = null;

if (SERVICE_ACCOUNT_PATH) {
  const json = await readFile(SERVICE_ACCOUNT_PATH, 'utf8');
  serviceAccountJson = JSON.parse(json);
  credential = cert(serviceAccountJson);
} else {
  credential = applicationDefault();
}

const app = initializeApp({ credential });
const db = getFirestore();
// Setup Storage (optional). If FIREBASE_STORAGE_BUCKET is set in env, we'll
// try to upload event cover images there and publish a stable public URL.
let storageBucket = null;
try {
  const storage = getStorage(app);
  // Prefer explicit env var. If not set, try to derive from the service account
  // project_id (project_id.appspot.com). Finally fall back to SDK default.
  let bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName && serviceAccountJson && serviceAccountJson.project_id) {
    bucketName = `${serviceAccountJson.project_id}.appspot.com`;
    console.log('Derived Storage bucket name from service account:', bucketName);
  }
  if (!bucketName) {
    // Let the SDK attempt to pick a default bucket name if possible
    try {
      const sdkBucket = storage.bucket();
      bucketName = sdkBucket?.name;
    } catch (e) {
      // ignore
    }
  }

  if (bucketName) {
    try {
      storageBucket = storage.bucket(bucketName);
      console.log('Using Storage bucket for cover images:', bucketName);
    } catch (e) {
      console.warn('Could not access Storage bucket', bucketName, e.message);
    }
  } else {
    console.log('No Firebase Storage bucket configured; will not rehost images.');
  }
} catch (e) {
  console.warn('Could not initialize Firebase Storage:', e.message);
}

// Small helper to infer a file extension from a content-type header.
function getExtFromContentType(contentType) {
  if (!contentType) return '';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('webp')) return '.webp';
  return '';
}
// Ignore undefined properties when writing documents so optional FB fields
// (like coverImageUrl or place) don't cause failures.
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch (e) {
  // Some older SDKs may not support settings; log and continue.
  console.warn('Could not set Firestore settings ignoreUndefinedProperties:', e.message);
}

/**
 * Get token for a page from Secret Manager
 */
function getTokenForPage(pageId) {
  try {
    const token = getToken(pageId);
    console.log(`Using Secret Manager token for page ${pageId}`);
    return token;
  } catch (error) {
    throw new Error(`No token found for page ${pageId} in Secret Manager.`);
  }
}

/**
 * Get all pages to process - hardcoded for simplicity
 */
/**async function getAllPages() {
  // Just hardcode your page IDs - way simpler than complex metadata queries
  const pageIds = ['777401265463466']; // Add more page IDs here as needed
  
  console.log(`Processing ${pageIds.length} configured pages`);
  return pageIds;
}*/

/**
 * Get all pages to process from Firestore collection 'pages'
 */
async function getAllPages() {
  const snapshot = await db.collection('pages').get();
  const pageIds = [];
  snapshot.forEach(doc => {
    pageIds.push(doc.id);
  });
  console.log(`Processing ${pageIds.length} pages from Firestore`);
  return pageIds;
}

// Main ingestion logic
const pages = await getAllPages();

if (pages.length === 0) {
  console.error('No pages configured for processing.');
  console.error('Add page IDs to the getAllPages() function in this script.');
  process.exit(1);
}

console.log(`Processing ${pages.length} page(s): ${pages.join(', ')}`);

let totalEvents = 0;
let successfulPages = 0;
let failedPages = 0;

for (const pageId of pages) {
  try {
    console.log(`\nProcessing page ${pageId}...`);
    
  const token = getTokenForPage(pageId);
  // Explicitly request the cover{source} field so the Graph API returns the
  // cover image URL. Without this, some API responses omit the cover object.
  const url = new URL(`https://graph.facebook.com/v19.0/${pageId}/events`);
  url.searchParams.set('access_token', token);
  //url.searchParams.set('time_filter', 'upcoming');
  url.searchParams.set('fields', 'id,name,description,start_time,end_time,place,cover{source}');
  const res = await fetch(url.toString());

    if (!res.ok) {
      const text = await res.text();
      console.error(`FB API error for page ${pageId} (${res.status}):`, text);
      // Token invalid - just log it
      try {
        const errorObj = JSON.parse(text);
        if (errorObj.error && errorObj.error.code === 190) {
          console.error(`Token for page ${pageId} is invalid or expired`);
        }
      } catch (e) {
        // Token might not be in Firestore yet
      }
      continue;
    }
    
    const { data = [] } = await res.json();
    console.log(`Found ${data.length} events for page ${pageId}`);
    
    // Store events in Firestore
    let eventCount = 0;
    for (const ev of data) {
      const docId = ev.id;
      // Log cover for debugging when images stop appearing in the UI
      if (ev.cover) console.log(`Event ${ev.id} cover from Graph:`, ev.cover);
      else console.log(`Event ${ev.id} has no cover object from Graph API`);

      // Decide which image URL to store: try to rehost on Firebase Storage for
      // a stable, long-lived URL. If storage isn't configured or upload fails,
      // fall back to the Facebook CDN URL (which can expire).
      let coverUrl = ev.cover?.source;
  if (ev.cover?.source && storageBucket) {
        try {
          const imgRes = await fetch(ev.cover.source);
          if (imgRes.ok) {
            const contentType = imgRes.headers.get('content-type') || 'application/octet-stream';
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const filePath = `event-covers/${docId}${getExtFromContentType(contentType)}`;
            const file = storageBucket.file(filePath);
            await file.save(buffer, { metadata: { contentType } });
            // Make file public so clients can access it without signing.
            try { await file.makePublic(); } catch (e) { console.warn('Could not make file public:', e.message); }
            coverUrl = `https://storage.googleapis.com/${storageBucket.name}/${file.name}`;
            console.log(`Uploaded cover for ${docId} to ${coverUrl}`);
          } else {
            console.warn(`Failed to fetch cover image for ${docId}: HTTP ${imgRes.status}`);
          }
        } catch (e) {
          console.warn(`Failed to rehost cover image for ${docId}:`, e.message);
          // If upload fails (bucket missing or permissions), don't store the
          // transient Facebook CDN URL which may expire — prefer no image.
          coverUrl = undefined;
        }
      } else if (ev.cover?.source) {
        // If we don't have storage configured, verify the FB URL is reachable
        try {
          const head = await fetch(ev.cover.source, { method: 'HEAD' });
          if (!head.ok) {
            console.warn(`Facebook CDN cover URL for ${docId} returned ${head.status}; skipping storing it`);
            coverUrl = undefined;
          }
        } catch (e) {
          console.warn(`Error checking FB cover URL for ${docId}:`, e.message);
          coverUrl = undefined;
        }
      }

      // Normalize fields so the web client can read them directly
      await db.collection('events').doc(docId).set({
        id: ev.id,
        pageId: pageId,
        title: ev.name,
        description: ev.description || '',
        startTime: ev.start_time ? Timestamp.fromDate(new Date(ev.start_time)) : null,
        endTime: ev.end_time ? Timestamp.fromDate(new Date(ev.end_time)) : null,
        place: ev.place,
        coverImageUrl: coverUrl,
        eventURL: `https://www.facebook.com/events/${ev.id}`,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        raw: ev
      }, { merge: true });
      console.log(`Wrote event ${docId} coverImageUrl=${coverUrl}`);
      eventCount++;
    }

    totalEvents += eventCount;
    successfulPages++;
    // Token working fine
    console.log(`Synced ${eventCount} events from page ${pageId}`);

  } catch (error) {
    failedPages++;
    console.error(`Error processing page ${pageId}:`, error.message);
  }
}

console.log('\nIngestion Summary:');
console.log(`  Total events synced: ${totalEvents}`);
console.log(`  Successful pages: ${successfulPages}`);
console.log(`  Failed pages: ${failedPages}`);
console.log(`  Success rate: ${Math.round((successfulPages / pages.length) * 100)}%`);

if (failedPages > 0) {
  console.log('\nSome pages failed. Check token validity and permissions.');
}

console.log('\nIngestion completed!');