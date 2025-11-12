/**
 * Shared TypeScript types and interfaces for Event Aggregator runtimes.
 * Consolidates API contracts, validation types, logging metadata, and service DTOs.
 */

// ============================================================================
// FACEBOOK API TYPES
// ============================================================================

export interface FacebookErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}

export interface FacebookPlaceLocation {
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  state?: string;
  street?: string;
  zip?: string;
}

export interface FacebookPlace {
  name: string;
  location?: FacebookPlaceLocation;
}

export interface FacebookCover {
  id: string;
  source: string;
  offset_x: number;
  offset_y: number;
}

export interface FacebookEvent {
  id: string;
  name: string;
  description?: string;
  start_time: string;
  end_time?: string;
  place?: FacebookPlace;
  cover?: FacebookCover;
  event_times?: Array<{ id: string; start: string; end?: string }>;
}

export interface FacebookPagePictureData {
  height: number;
  is_silhouette: boolean;
  url: string;
  width: number;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token?: string;
  picture?: {
    data: FacebookPagePictureData;
  };
}

export interface PaginatedPageResponse {
  data: FacebookPage[];
  paging?: { next: string };
}

export interface PaginatedEventResponse {
  data: FacebookEvent[];
  paging?: { next: string };
}

// ============================================================================
// SUPABASE DATABASE TYPES
// ============================================================================

export interface NormalizedEvent {
  page_id: number;
  event_id: string;
  event_data: {
    id: string;
    name: string;
    start_time: string;
    description?: string;
    end_time?: string;
    place?: FacebookPlace;
    cover?: {
      source: string;
      id?: string;
    };
  };
}

export interface DatabasePage {
  page_id: number;
  page_name: string;
  page_access_token_id: string;
  token_expiry: string;
  token_status: "active" | "expired" | "invalid";
  created_at: string;
  updated_at: string;
}

export interface DatabaseEvent {
  id: string;
  page_id: number;
  event_id: string;
  event_data: NormalizedEvent["event_data"];
  created_at: string;
  updated_at: string;
}

// ============================================================================
// API RESPONSE & DTO TYPES
// ============================================================================

export interface GetEventsQuery {
  limit: number;
  pageToken?: string;
  pageId?: string;
  upcoming: boolean;
  search?: string;
}

export interface CleanupResult {
  success: boolean;
  eventsDeleted: number;
  dryRun: boolean;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
  timestamp: string;
  requestId?: string;
}

export interface PaginatedResponse<T> extends ApiResponse {
  data?: T[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ErrorApiResponse extends ApiResponse {
  error: string;
  errorCode?: string;
  statusCode: number;
}

// ============================================================================
// LOGGING TYPES
// ============================================================================

export interface LogMetadata {
  [key: string]: unknown;
}

export interface ErrorMetadata extends LogMetadata {
  error?: unknown;
}

// ============================================================================
// MAIL & NOTIFICATIONS
// ============================================================================

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface AlertEmailOptions extends EmailOptions {
  alertType:
    | "token_refresh_failed"
    | "token_expiry_warning"
    | "event_sync_failed";
  details?: Record<string, unknown>;
}

// ============================================================================
// STORAGE / IMAGE SERVICE
// ============================================================================

export interface UploadOptions {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
}

export interface FileMetadata {
  name: string;
  size: number;
  contentType: string;
  createdAt: string;
  url?: string;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

export interface JsonSchema {
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
}

export interface FullRequestValidationOptions {
  method?: HttpMethod | HttpMethod[];
  contentType?: string | string[];
  maxBodySize?: number;
  requiredHeaders?: string[];
  validateOrigin?: string | string[];
  jsonSchema?: JsonSchema;
}

export interface StringValidationOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowEmpty?: boolean;
  trim?: boolean;
}

export interface NumberValidationOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  positive?: boolean;
  negative?: boolean;
}

export interface HmacVerificationResult {
  valid: boolean;
  computedSignature?: string;
  error?: string;
}

export interface OAuthStateValidation {
  isValid: boolean;
  origin: string | null;
  error: string | null;
}

export interface SlidingWindowConfig {
  maxRequests: number;
  windowMs: number;
}

export interface SlidingWindowStatus {
  used: number;
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface TokenBucketState {
  tokens: number;
  lastRefill: number;
}

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export interface BruteForceEntry {
  attempts: number;
  lockedUntil?: number;
}

// ============================================================================
// OAUTH & TOKEN TYPES
// ============================================================================

export interface OAuthCallbackRequest {
  code: string;
  state?: string;
}

export interface OAuthCallbackResponse {
  success: boolean;
  message: string;
  userId?: string;
  accessToken?: string;
}

export interface TokenInfo {
  accessToken: string;
  expiresAt: Date;
  daysUntilExpiry: number;
  status: "valid" | "expiring" | "expired";
}

export interface TokenRefreshStatus {
  pageId: string;
  status: "valid" | "expiring" | "expired";
  daysUntilExpiry: number;
  lastChecked: string;
}

// ============================================================================
// PLATFORM SPECIFIC TYPES
// ============================================================================

export interface VercelRequest {
  method?: string;
  url: string;
  headers: Record<string, string>;
  env?: Record<string, string>;
  query?: Record<string, string | string[]>;
  body?: unknown;
}

export interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  redirect: (url: string) => void;
  setHeader: (key: string, value: string) => void;
  send: (data: unknown) => void;
}

