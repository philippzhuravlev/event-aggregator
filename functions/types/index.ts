import { Timestamp } from '@google-cloud/firestore';

// Facebook API Types
export interface FacebookEvent {
  id: string;
  name: string;
  description?: string;
  start_time: string;
  end_time?: string;
  place?: FacebookPlace;
  cover?: FacebookCover;
}

export interface FacebookPlace {
  name?: string;
  location?: FacebookLocation;
}

export interface FacebookLocation {
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  street?: string;
  zip?: string;
}

export interface FacebookCover {
  source: string;
  id?: string;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
}

export interface FacebookError {
  message: string;
  type: string;
  code: number;
  fbtrace_id?: string;
}

export interface FacebookErrorResponse {
  error: FacebookError;
}


// Firestore Schema Types
export interface NormalizedEvent {
  id: string;
  pageId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  place?: PlaceData;
  coverImageUrl?: string;
  eventURL: string;
  createdAt: Timestamp | typeof Timestamp.now;
  updatedAt: Timestamp | typeof Timestamp.now;
}

export interface PlaceData {
  name?: string;
  location?: FacebookLocation;
}

export interface PageDocument {
  id: string;
  name: string;
  url: string;
  active: boolean;
  connectedAt: Timestamp | typeof Timestamp.now;
  updatedAt: Timestamp | typeof Timestamp.now;
  tokenStoredAt?: Timestamp;
  tokenExpiresAt?: Timestamp;
  tokenExpiresInDays?: number;
  tokenStatus?: 'valid' | 'expired' | 'expiring';
  tokenExpiredAt?: Timestamp;
}

export interface EventDocument extends NormalizedEvent {
  // Event as stored in firestore
}


// Service Return Types
export interface TokenExpiryStatus {
  isExpiring: boolean;
  daysUntilExpiry: number;
  expiresAt: Date | null;
}

export interface SyncResult {
  syncedPages: number;
  syncedEvents: number;
  expiringTokens: number;
  expiringTokenDetails: ExpiringToken[];
}

export interface ExpiringToken {
  pageId: string;
  pageName: string;
  daysUntilExpiry: number;
  expiresAt: Date | null;
}

export interface TokenHealthReport {
  totalPages: number;
  healthy: PageTokenInfo[];
  expiringSoon: PageTokenInfo[];
  expired: PageTokenInfo[];
  unknown: PageTokenInfo[];
  timestamp: string;
}

export interface PageTokenInfo {
  pageId: string;
  pageName: string;
  daysUntilExpiry?: number;
  expiresAt?: string | null;
  error?: string;
}


// Image Service Types
export interface ImageUploadOptions {
  bucket: any; // firebase storage bucket type is complex, using any for simplicity
  maxRetries?: number;
  timeoutMs?: number;
  makePublic?: boolean;
  signedUrlExpiryYears?: number;
}


// Utility Types
export interface EventBatchItem {
  id: string;
  data: NormalizedEvent;
}

export interface PageInfo {
  id: string;
  name: string;
  data: any;
}

// Constants Structure Types
export interface FacebookConstants {
  API_VERSION: string;
  BASE_URL: string;
  pageUrl: (pageId: string) => string;
  eventUrl: (eventId: string) => string;
}

export interface URLConstants {
  WEB_APP: string;
  OAUTH_CALLBACK: string;
}

export interface ImageServiceConstants {
  MAX_RETRIES: number;
  TIMEOUT_MS: number;
  CACHE_MAX_AGE: number;
  ALLOWED_EXTENSIONS: string[];
  BACKOFF_BASE_MS: number;
  BACKOFF_MAX_MS: number;
}

export interface SyncConstants {
  SCHEDULE: string;
  TIMEZONE: string;
}

export interface FirestoreConstants {
  MAX_BATCH_SIZE: number;
}

export interface ErrorCodes {
  FACEBOOK_TOKEN_INVALID: number;
  FACEBOOK_PERMISSION_DENIED: number;
  FACEBOOK_RATE_LIMIT: number;
}


// Facebook Webhooks Types
export type WebhookEventVerb = 'create' | 'update' | 'delete';

export interface FacebookWebhookChange {
  field: 'events' | 'feed' | 'live_videos' | string;
  value: FacebookWebhookEventValue | any;
}

export interface FacebookWebhookEventValue {
  event_id: string;
  verb: WebhookEventVerb;
  page_id?: string;
  item?: 'event';
}

export interface FacebookWebhookEntry {
  id: string; // Page ID
  time: number; // timestamp
  changes: FacebookWebhookChange[];
}

export interface FacebookWebhookPayload {
  object: 'page';
  entry: FacebookWebhookEntry[];
}

export interface WebhookVerificationQuery {
  'hub.mode'?: string;
  'hub.challenge'?: string;
  'hub.verify_token'?: string;
}

export interface WebhookProcessingResult {
  processed: number;
  failed: number;
  skipped: number;
  details: WebhookEventDetail[];
}

export interface WebhookEventDetail {
  eventId: string;
  verb: WebhookEventVerb;
  pageId: string;
  status: 'success' | 'failed' | 'skipped';
  reason?: string;
}

