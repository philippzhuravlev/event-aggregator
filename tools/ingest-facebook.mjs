import { readFile } from 'node:fs/promises';
import fetch from 'node-fetch';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

// ENV
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH;
const FB_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const PAGES = (process.env.FB_PAGES || 'shuset.dk,DiagonalenDTU').split(',');

if (!FB_TOKEN) {
  console.error('Missing FB_PAGE_ACCESS_TOKEN');
  process.exit(1);
}

let credential;
if (SERVICE_ACCOUNT_PATH) {
  const json = await readFile(SERVICE_ACCOUNT_PATH, 'utf8');
  credential = cert(JSON.parse(json));
} else {
  credential = applicationDefault();
}

initializeApp({ credential });
const db = getFirestore();

for (const page of PAGES) {
  const url = `https://graph.facebook.com/v19.0/${page}/events?fields=id,name,description,start_time,end_time,place,cover,updated_time&access_token=${FB_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    console.error('FB API error for page', page, res.status, text);
    continue;
  }
  const { data = [] } = await res.json();
  for (const ev of data) {
    const docId = ev.id;
    await db.collection('events').doc(docId).set({
      pageId: page,
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
  }
  console.log(`Synced ${data.length} events from ${page}`);
}

console.log('Done.');

