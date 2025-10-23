// utils folder is for stuff that is used in multiple places, like constants, helper functions etc

// this folder contains constants used throughout the frontend app that will not change often, if ever

// Frontend constants and feature toggles
// so env variables are set in .env file at the root of the project (backend) and /web/ (frontend, prefaced with VITE_).
// usually this is for stuff like api keys, urls, feature toggles etc, but we can also use it for stuff like
// setting the app in "development mode" or "production mode", whether to useFirestore or use mock data, and whether
// to use backend api or just Firestore. Note that env variables are always strings, so if we want to use them as booleans
// or numbers, we have to convert them first (see below).
// In the browser (Vite) use import.meta.env. Avoid Node's process.env which is undefined in the browser.
export const backendURL = import.meta.env.VITE_BACKEND_URL || 'https://default-backend-url.com';
export const useFirestore = (String(import.meta.env?.VITE_USE_FIRESTORE || '').toLowerCase() === 'true');
export const useBackendAPI = (String(import.meta.env?.VITE_USE_BACKEND_API || '').toLowerCase() === 'true');
