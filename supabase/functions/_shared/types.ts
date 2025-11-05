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
