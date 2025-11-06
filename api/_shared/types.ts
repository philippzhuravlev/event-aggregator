/**
 * Shared TypeScript types and interfaces for Supabase Edge Functions
 * This file centralizes all type definitions used across services, handlers, and utilities
 */

// ============================================================================
// FACEBOOK API TYPES
// ============================================================================

/**
 * Facebook API error response structure
 */
export interface FacebookErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}

/**
 * Facebook place/location object (nested in events)
 */
export interface FacebookPlace {
  name: string;
  location?: {
    city?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    state?: string;
    street?: string;
    zip?: string;
  };
}

/**
 * Facebook cover image object
 */
export interface FacebookCover {
  id: string;
  source: string;
  offset_x: number;
  offset_y: number;
}

/**
 * Facebook event object from Graph API
 */
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

/**
 * Facebook page object from Graph API
 */
export interface FacebookPage {
  id: string;
  name: string;
  access_token?: string;
  picture?: {
    data: {
      height: number;
      is_silhouette: boolean;
      url: string;
      width: number;
    };
  };
}

// ============================================================================
// SUPABASE DATABASE TYPES
// ============================================================================

/**
 * Normalized event object for Supabase database
 */
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

/**
 * Database page record
 */
export interface DatabasePage {
  page_id: number;
  page_name: string;
  page_access_token_id: string; // UUID reference to vault secret
  token_expiry: string; // ISO timestamp
  token_status: "active" | "expired" | "invalid";
  created_at: string;
  updated_at: string;
}

/**
 * Database event record
 */
export interface DatabaseEvent {
  id: string;
  page_id: number;
  event_id: string;
  event_data: NormalizedEvent["event_data"];
  created_at: string;
  updated_at: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Query parameters for get-events endpoint
 */
export interface GetEventsQuery {
  limit: number;
  pageToken?: string;
  pageId?: string;
  upcoming: boolean;
  search?: string;
}

/**
 * Cleanup events result
 */
export interface CleanupResult {
  success: boolean;
  eventsDeleted: number;
  dryRun: boolean;
  timestamp: string;
}

/**
 * Generic API error response
 */
export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

/**
 * Generic API success response
 */
export interface SuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

// ============================================================================
// LOGGER TYPES
// ============================================================================

/**
 * Logging metadata
 */
export interface LogMetadata {
  [key: string]: unknown;
}

/**
 * Error logging metadata
 */
export interface ErrorMetadata extends LogMetadata {
  userId?: string;
  pageId?: string;
}

// ============================================================================
// MAIL SERVICE TYPES
// ============================================================================

/**
 * Email options for sending emails
 */
export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Alert email options with alert type and details
 */
export interface AlertEmailOptions extends EmailOptions {
  alertType:
    | "token_refresh_failed"
    | "token_expiry_warning"
    | "event_sync_failed";
  details?: Record<string, unknown>;
}

// ============================================================================
// IMAGE SERVICE TYPES
// ============================================================================

/**
 * File upload options
 */
export interface UploadOptions {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
}

/**
 * File metadata for storage operations
 */
export interface FileMetadata {
  name: string;
  size: number;
  contentType: string;
  createdAt: string;
  url?: string;
}

// ============================================================================
// VALIDATION TYPES - API RESPONSE
// ============================================================================

/**
 * Standard API response envelope
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
  timestamp: string;
  requestId?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> extends ApiResponse {
  data?: T[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Error API response
 */
export interface ErrorApiResponse extends ApiResponse {
  error: string;
  errorCode?: string;
  statusCode: number;
}

// ============================================================================
// VALIDATION TYPES - AUTH
// ============================================================================

/**
 * HMAC signature verification result
 */
export interface HmacVerificationResult {
  valid: boolean;
  computedSignature?: string;
  error?: string;
}

// ============================================================================
// VALIDATION TYPES - DATA
// ============================================================================

/**
 * String validation options
 */
export interface StringValidationOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowEmpty?: boolean;
  trim?: boolean;
}

/**
 * Number validation options
 */
export interface NumberValidationOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  positive?: boolean;
  negative?: boolean;
}

// ============================================================================
// VALIDATION TYPES - OAUTH
// ============================================================================

/**
 * OAuth state validation result
 */
export interface OAuthStateValidation {
  isValid: boolean;
  origin: string | null;
  error: string | null;
}

// ============================================================================
// VALIDATION TYPES - REQUEST
// ============================================================================

/**
 * HTTP methods
 */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * JSON schema for simple validation
 */
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

/**
 * Full request validation options
 */
export interface FullRequestValidationOptions {
  method?: HttpMethod | HttpMethod[];
  contentType?: string | string[];
  maxBodySize?: number;
  requiredHeaders?: string[];
  validateOrigin?: string | string[];
  jsonSchema?: JsonSchema;
}

/**
 * Full request validation options
 */
export interface FullRequestValidationOptions {
  method?: HttpMethod | HttpMethod[];
  contentType?: string | string[];
  maxBodySize?: number;
  requiredHeaders?: string[];
  validateOrigin?: string | string[];
  jsonSchema?: JsonSchema;
}

// ============================================================================
// VALIDATION TYPES - RATE LIMITING
// ============================================================================

/**
 * Sliding window rate limiter bucket
 */
export interface SlidingWindowBucket {
  requests: number[];
  windowMs: number;
}

/**
 * Sliding window rate limiter configuration
 */
export interface SlidingWindowConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Token bucket for rate limiting
 */
export interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Brute force protection entry
 */
export interface BruteForceEntry {
  failures: number;
  lastFailure: number;
  locked: boolean;
  lockedUntil?: number;
}

// ============================================================================
// OAUTH TYPES
// ============================================================================

/**
 * OAuth callback request body
 */
export interface OAuthCallbackRequest {
  code: string;
  state?: string;
}

/**
 * OAuth callback response
 */
export interface OAuthCallbackResponse {
  success: boolean;
  message: string;
  userId?: string;
  accessToken?: string;
}

// ============================================================================
// TOKEN MANAGEMENT TYPES
// ============================================================================

/**
 * Token information
 */
export interface TokenInfo {
  accessToken: string;
  expiresAt: Date;
  daysUntilExpiry: number;
  status: "valid" | "expiring" | "expired";
}

/**
 * Token refresh status
 */
export interface TokenRefreshStatus {
  pageId: string;
  status: "valid" | "expiring" | "expired";
  daysUntilExpiry: number;
  lastChecked: string;
}

// ============================================================================
// VERCEL SERVERLESS FUNCTION TYPES
// ============================================================================

/**
 * Vercel serverless function request
 */
export interface VercelRequest {
  method?: string;
  url: string;
  headers: Record<string, string>;
  env?: Record<string, string>;
  query?: Record<string, string | string[]>;
  body?: unknown;
}

/**
 * Vercel serverless function response
 */
export interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  redirect: (url: string) => void;
  setHeader: (key: string, value: string) => void;
  send: (data: unknown) => void;
}

// ============================================================================
// FACEBOOK API PAGINATION TYPES
// ============================================================================

/**
 * Paginated Facebook API response for pages
 */
export interface PaginatedPageResponse {
  data: FacebookPage[];
  paging?: { next: string };
}

/**
 * Paginated Facebook API response for events
 */
export interface PaginatedEventResponse {
  data: FacebookEvent[];
  paging?: { next: string };
}
