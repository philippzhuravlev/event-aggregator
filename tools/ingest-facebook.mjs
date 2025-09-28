import { readFile } from 'node:fs/promises';
import fetch from 'node-fetch';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { config } from 'dotenv';
import TokenManager from './token-manager.mjs';

// Load environment variables from .env file
config();

console.log('🚀 Starting Facebook event ingestion...');

// Initialize Firebase
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH;
let credential;

if (SERVICE_ACCOUNT_PATH) {
  const json = await readFile(SERVICE_ACCOUNT_PATH, 'utf8');
  credential = cert(JSON.parse(json));
} else {
  credential = applicationDefault();
}

initializeApp({ credential });
const db = getFirestore();

// Initialize token manager
const tokenManager = new TokenManager();

/**
 * Get token for a page from Firestore
 */
async function getTokenForPage(pageId) {
  try {
    const token = await tokenManager.getValidToken(pageId);
    console.log(`📱 Using Firestore token for page ${pageId}`);
    return token;
  } catch (error) {
    throw new Error(`No valid token found for page ${pageId}. Use 'node tools/manage-tokens.mjs add ${pageId} <token>' to add one.`);
  }
}

/**
 * Get all pages to process from Firestore tokens
 */
async function getAllPages() {
  try {
    const storedTokens = await tokenManager.getAllTokens();
    const validTokens = storedTokens.filter(token => 
      token.status === 'valid' || token.status === 'needs_refresh'
    );
    
    console.log(`📊 Found ${storedTokens.length} stored tokens in Firestore (${validTokens.length} usable)`);
    return validTokens.map(token => token.pageId);
  } catch (error) {
    console.log('📝 No stored tokens found in Firestore');
    return [];
  }
}

// Main ingestion logic
const pages = await getAllPages();

if (pages.length === 0) {
  console.error('❌ No valid tokens found in Firestore.');
  console.error('💡 Add tokens using: node tools/manage-tokens.mjs add <pageId> <token>');
  process.exit(1);
}

console.log(`📄 Processing ${pages.length} page(s): ${pages.join(', ')}`);

let totalEvents = 0;
let successfulPages = 0;
let failedPages = 0;

for (const pageId of pages) {
  console.log(`\n🔍 Processing page ${pageId}...`);
  
  try {
    // Get valid token for this page
    const token = await getTokenForPage(pageId);
    
    // Fetch events from Facebook
    const url = `https://graph.facebook.com/v19.0/${pageId}/events?fields=id,name,description,start_time,end_time,place,cover,updated_time&access_token=${token}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      const text = await res.text();
      console.error(`❌ FB API error for page ${pageId} (${res.status}):`, text);
      failedPages++;
      
      // If using Firestore token, mark as invalid
      try {
        await tokenManager.updateTokenStatus(pageId, 'invalid');
      } catch (e) {
        // Token might not be in Firestore yet
      }
      continue;
    }
    
    const { data = [] } = await res.json();
    console.log(`📅 Found ${data.length} events for page ${pageId}`);
    
    // Store events in Firestore
    let eventCount = 0;
    for (const ev of data) {
      const docId = ev.id;
      await db.collection('events').doc(docId).set({
        pageId: pageId,
        title: ev.name,
        description: ev.description ?? null,
        startTime: ev.start_time ? new Date(ev.start_time) : null,
        endTime: ev.end_time ? new Date(ev.end_time) : null,
        place: ev.place ?? null,
        coverImageUrl: ev.cover?.source ?? null,
        eventURL: `https://facebook.com/events/${docId}`,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }, { merge: true });
      eventCount++;
    }
    
    console.log(`✅ Synced ${eventCount} events from page ${pageId}`);
    totalEvents += eventCount;
    successfulPages++;
    
    // Mark token as valid if using Firestore
    try {
      await tokenManager.updateTokenStatus(pageId, 'valid');
    } catch (e) {
      // Token might not be in Firestore yet
    }
    
  } catch (error) {
    console.error(`❌ Error processing page ${pageId}:`, error.message);
    failedPages++;
  }
}

// Summary
console.log('\n📊 Ingestion Summary:');
console.log(`  Total events synced: ${totalEvents}`);
console.log(`  Successful pages: ${successfulPages}`);
console.log(`  Failed pages: ${failedPages}`);
console.log(`  Success rate: ${pages.length > 0 ? Math.round((successfulPages / pages.length) * 100) : 0}%`);

if (failedPages > 0) {
  console.log('\n⚠️  Some pages failed. Check token validity and permissions.');
}

console.log('\n✅ Ingestion completed!');

