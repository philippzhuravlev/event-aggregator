import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// lib folders in frontend is confusingly enough not the same as lib folders in backend, which usually means 
// "shared code". Instead, /lib/ in frontend means setup logic for core and central frameworks, services, 
// libraries, APIs etc. Meanwhile the actual connection to these services is in /services/.

// This file specifically handles Firebase setup and initialization

// Firebase vars
// we get these from environment variables, which are set in /web/.env file
const appId = import.meta.env.VITE_FIREBASE_APP_ID;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'dtuevent-8105b'; 
// the firebase and gcp project ID aren't necessarily the same but often are

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  appId: appId,
  authDomain: `${projectId}.firebaseapp.com`,
  projectId: projectId,
  storageBucket: `${projectId}.firebasestorage.app`,
  messagingSenderId: appId.split(':')[1], // Extract from appId
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig); // ? : notation = if else
export const db = getFirestore(app);

// if enabled, point the web app at the local Firestore emulator
// set VITE_FIRESTORE_EMULATOR=true in web/.env while running `firebase emulators:start`
if (import.meta.env.VITE_FIRESTORE_EMULATOR === 'true') {
  // Default emulator host/port from firebase.json
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
