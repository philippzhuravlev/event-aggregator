/**
 * Consolidated types/index.ts - central export file for all type definitions
 * This file re-exports types from other files and defines shared types
 */

// Re-export handler types
export type { HttpResponse, AuthMiddleware, StorageBucket, TypedError, HandlerResult, QueryParams } from './handlers';
export { isTypedError, toTypedError, successResult, errorResult, getQueryParam, getQueryParamBoolean, getQueryParamNumber } from './handlers';

// Re-export supabase types
export type { Page } from './supabase';

/**
 * Facebook API Types
 */
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

/**
 * Supabase Schema Types
 */
export interface NormalizedEvent {
  id?: string; // UUID (auto-generated)
  page_id: number; // Facebook page ID
  event_id: string; // Facebook event ID
  event_data: FacebookEventData; // JSONB containing the event details
  created_at?: string; // ISO 8601 timestamp
  updated_at?: string; // ISO 8601 timestamp
}

export interface FacebookEventData {
  id: string;
  name: string;
  description?: string;
  start_time: string;
  end_time?: string;
  place?: {
    name?: string;
    location?: {
      city?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
      street?: string;
      zip?: string;
    };
  };
  cover?: {
    source: string;
    id?: string;
  };
}

export interface PageDocument {
  id: string;
  name: string;
  url?: string;
  active: boolean;
  connectedAt?: string; // ISO 8601 timestamp
  updatedAt?: string; // ISO 8601 timestamp
  tokenStoredAt?: string;
  tokenExpiresAt?: string;
  tokenExpiresInDays?: number;
  tokenStatus?: 'valid' | 'expired' | 'expiring';
  tokenExpiredAt?: string;
}

export type EventDocument = NormalizedEvent;

/**
 * Service Return Types
 */
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

/**
 * Batch operations
 */
export interface EventBatchItem {
  id: string;
  data: NormalizedEvent;
}

export interface PageInfo {
  id: string;
  name: string;
  data: any;
}

/**
 * Image Service Types
 */
export interface ImageUploadOptions {
  bucket: any;
  maxRetries?: number;
  timeoutMs?: number;
  makePublic?: boolean;
  signedUrlExpiryYears?: number;
}

/**
 * Webhook Types
 */
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

/**
 * Event Cleanup Types
 */
export interface CleanupResult {
  deletedCount: number;
  archivedCount: number;
  failedCount: number;
  cutoffDate: string;
  duration: number; // milliseconds
  errors?: string[];
}

export interface CleanupOptions {
  daysToKeep: number;
  dryRun?: boolean;
  archiveBeforeDelete?: boolean;
  batchSize?: number;
}

/**
 * Constants Structure Types
 */
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

export interface DatabaseConstants {
  MAX_BATCH_SIZE: number;
}

export interface ErrorCodes {
  FACEBOOK_TOKEN_INVALID: number;
  FACEBOOK_PERMISSION_DENIED: number;
  FACEBOOK_RATE_LIMIT: number;
}

export interface RateLimitConfig {
  WINDOW_MS: number;
  MAX_REQUESTS: number;
}

export interface RateLimitsConstants {
  STANDARD: RateLimitConfig;
  WEBHOOK: RateLimitConfig;
  OAUTH: RateLimitConfig;
}
