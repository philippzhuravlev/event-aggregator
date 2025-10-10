import { 
  FacebookConstants, 
  URLConstants, 
  ImageServiceConstants, 
  SyncConstants, 
  FirestoreConstants, 
  ErrorCodes 
} from '../types';

// So this is a util, a helper function that is neither "what to do" (handler) nor 
// "how to connect to an external service" (service). It just does pure logic that 
// either makes sense to compartmentalize or is used in multiple places.

// So this util is just a list of constants - quite convenient to have them all in one place
// rather than scattered around the codebase. It also makes it easier to change them
// later on, e.g. if Facebook changes their API version or if we want to adjust sync
// frequency or error codes etc etc you get the idea

// Facebook API
export const FACEBOOK: FacebookConstants = {
  API_VERSION: 'v23.0',
  get BASE_URL() {
    return `https://graph.facebook.com/${this.API_VERSION}`;
  },
  pageUrl: (pageId: string) => `https://facebook.com/${pageId}`,
  eventUrl: (eventId: string) => `https://facebook.com/events/${eventId}`,
};

// Facebook API Request Configuration
export const FACEBOOK_API = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000, // Base delay for exponential backoff (1 second)
  PAGINATION_LIMIT: 100, // Max items per page in paginated requests
};

// App URLs - auto-detected based on where the code is running
// so all of this isProduction mess was because the facebook redirect URL was initially in a 
// firebase web app but sent it back as localhost which wasn't running. This fixes that.
// also note that there's process.env but you don't need to set anything in .env; 
// everything is auto-detected by firebase/google cloud functions. How amazing.
// !! is a slightly confusing js thing but it just converts a value to a boolean that "feels
// true or false", so !!null = false, !!"hello" = true, !!"" = false, !!0 = false, !!1 = true
const isProduction = !!process.env.GCLOUD_PROJECT && !process.env.FUNCTIONS_EMULATOR;
const projectId = process.env.GCLOUD_PROJECT || 'dtuevent-8105b';
const region = process.env.FUNCTION_REGION || 'europe-west1';

export const URLS: URLConstants = {
  // Frontend URL
  WEB_APP: isProduction ?
    `https://${projectId}.web.app` :
    'http://localhost:5173',
  
  // Backend OAuth callback URL
  OAUTH_CALLBACK: isProduction ?
    `https://${region}-${projectId}.cloudfunctions.net/facebookCallback` :
    `http://localhost:5001/${projectId}/${region}/facebookCallback`,
};

// Image Service from Facebook
export const IMAGE_SERVICE: ImageServiceConstants = {
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30000, // 30 seconds
  CACHE_MAX_AGE: 31536000, // 1 year in seconds
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  BACKOFF_BASE_MS: 1000, // Base delay for exponential backoff (1 second)
  BACKOFF_MAX_MS: 10000, // Maximum delay for exponential backoff (10 seconds)
};

// Sync 
export const SYNC: SyncConstants = {
  SCHEDULE: 'every 12 hours',
  TIMEZONE: 'Etc/UTC',
};

// Firestore limits
export const FIRESTORE: FirestoreConstants = {
  MAX_BATCH_SIZE: 500, // i.e the max operations per batch write
};

// Error codes
export const ERROR_CODES: ErrorCodes = {
  FACEBOOK_TOKEN_INVALID: 190, // Facebook's error code for invalid/expired token
  FACEBOOK_PERMISSION_DENIED: 200,
  FACEBOOK_RATE_LIMIT: 429,
};

// Allowed origins for OAuth redirects 
export const ALLOWED_ORIGINS: string[] = [
  // Production Firebase hosting
  `https://${projectId}.web.app`, // firebase default domain
  `https://${projectId}.firebaseapp.com`,
  `https://dtuevent.dk`, // custom domain (haven't been bought yet but yk)

  // Local development
  'http://localhost:5173', // Vite dev server
  'http://localhost:5000', // Firebase hosting emulator
];

export { region };

