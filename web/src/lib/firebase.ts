import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// Firebase vars
const appId = import.meta.env.VITE_FIREBASE_APP_ID;
const projectId = process.env.GCLOUD_PROJECT; 
// the firebase and gcp project ID aren't necessarily the same but often are

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  appId: appId,
  authDomain: `${projectId}.firebaseapp.com`,
  projectId: projectId,
  storageBucket: `${projectId}.firebasestorage.app`,
  messagingSenderId: appId.split(':')[1], // Extract from appId
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

// if enabled, point the web app at the local Firestore emulator
// set VITE_FIRESTORE_EMULATOR=true in web/.env while running `firebase emulators:start`
if (import.meta.env.VITE_FIRESTORE_EMULATOR === 'true') {
  // Default emulator host/port from firebase.json
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
