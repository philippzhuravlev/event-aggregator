/**
 * API Response Validation & Standardization
 * Provides consistent response codes, formats, and error handling
 *
 * Usage:
 * - Success response: createSuccessResponse(data, 200)
 * - Error response: createErrorResponse('Invalid input', 400)
 * - Validation error: createValidationErrorResponse(errors)
 * - Not found: createNotFoundResponse('Resource')
 */

import { ApiResponse, ErrorApiResponse, PaginatedResponse } from "../types.ts";

// Re-export types for convenience
export type { ApiResponse, ErrorApiResponse, PaginatedResponse };

// This used to be called "middleware", which lies in the middle between http request
// and business logic. But since we're using deno in edge functions without a full framework,
// it's not technically "middleware" and more of what middleware usually is 95% of the time:
// validation.

// API response validation ensures that all responses from our API endpoints adhere to a
// consistent structure - what this actually means is that whether it's a success or error,
// the response will always have the same "envelope" with fields like "success", "data",
// "error", and "timestamp". This makes it easier for clients to parse and handle responses,
// as they can always expect the same format regardless of the outcome of their request.

// ============================================================================
// HTTP STATUS CODES
// ============================================================================

export const HTTP_STATUS = {
  // 2xx Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // 3xx Redirection
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  NOT_MODIFIED: 304,

  // 4xx Client Error
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // 5xx Server Error
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

// ============================================================================
// PAGINATION CONFIGURATION
// ============================================================================

export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
  MAX_SEARCH_LENGTH: 200,
} as const;

// ============================================================================
// CORS HEADERS
// ============================================================================

/**
 * Get dynamic CORS headers based on request origin
 * Allows for environment-specific configuration
 */
function getCORSHeaders(requestOrigin?: string): Record<string, string> {
  const allowedOrigin = requestOrigin || 
    Deno.env.get("WEB_APP_URL") || 
    "https://event-aggregator-nine.vercel.app";
  
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

// ============================================================================
// SUCCESS RESPONSES
// ============================================================================

/**
 * Create a successful response with CORS headers
 * @param data - Response data
 * @param statusCode - HTTP status code (default: 200)
 * @param requestId - Optional request ID for tracing
 * @param corsOrigin - Optional CORS origin to use
 * @returns Response object
 */
export function createSuccessResponse<T = unknown>(
  data: T,
  statusCode: number = HTTP_STATUS.OK,
  requestId?: string,
  corsOrigin?: string,
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    requestId,
  };

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      ...getCORSHeaders(corsOrigin),
    },
  });
}

/**
 * Create a response with no content
 * @returns Response object
 */
export function createNoContentResponse(): Response {
  return new Response(null, {
    status: HTTP_STATUS.NO_CONTENT,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Create a response for created resource
 * @param data - Created resource data
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createCreatedResponse<T = unknown>(
  data: T,
  requestId?: string,
): Response {
  return createSuccessResponse(data, HTTP_STATUS.CREATED, requestId);
}

/**
 * Create a paginated response
 * @param items - Array of items
 * @param page - Current page number (1-indexed)
 * @param pageSize - Items per page
 * @param total - Total items across all pages
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createPaginatedResponse<T = unknown>(
  items: T[],
  page: number,
  pageSize: number,
  total: number,
  requestId?: string,
): Response {
  const totalPages = Math.ceil(total / pageSize);

  const response: PaginatedResponse<T> = {
    success: true,
    data: items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
    timestamp: new Date().toISOString(),
    requestId,
  };

  return new Response(JSON.stringify(response), {
    status: HTTP_STATUS.OK,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

// ============================================================================
// ERROR RESPONSES
// ============================================================================

/**
 * Create an error response with CORS headers
 * @param message - Error message
 * @param statusCode - HTTP status code (default: 400)
 * @param errorCode - Optional error code for client handling
 * @param requestId - Optional request ID for tracing
 * @param corsOrigin - Optional CORS origin to use
 * @returns Response object
 */
export function createErrorResponse(
  message: string,
  statusCode: number = HTTP_STATUS.BAD_REQUEST,
  errorCode?: string,
  requestId?: string,
  corsOrigin?: string,
): Response {
  const response: ErrorApiResponse = {
    success: false,
    error: message,
    errorCode,
    timestamp: new Date().toISOString(),
    requestId,
    statusCode,
  };

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      ...getCORSHeaders(corsOrigin),
    },
  });
}

/**
 * Create a validation error response
 * @param errors - Object with field names as keys and arrays of error messages as values
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createValidationErrorResponse(
  errors: Record<string, string[]>,
  requestId?: string,
): Response {
  const response: ApiResponse = {
    success: false,
    error: "Validation failed",
    errors,
    timestamp: new Date().toISOString(),
    requestId,
  };

  return new Response(JSON.stringify(response), {
    status: HTTP_STATUS.UNPROCESSABLE_ENTITY,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Create a single field validation error response
 * @param fieldName - Name of the field that failed validation
 * @param fieldError - Error message for the field
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createFieldValidationErrorResponse(
  fieldName: string,
  fieldError: string,
  requestId?: string,
): Response {
  return createValidationErrorResponse(
    {
      [fieldName]: [fieldError],
    },
    requestId,
  );
}

/**
 * Create a 400 Bad Request response
 * @param message - Error message (default: generic message)
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createBadRequestResponse(
  message: string = "Bad request",
  requestId?: string,
): Response {
  return createErrorResponse(
    message,
    HTTP_STATUS.BAD_REQUEST,
    "BAD_REQUEST",
    requestId,
  );
}

/**
 * Create a 401 Unauthorized response
 * @param message - Error message (default: generic message)
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createUnauthorizedResponse(
  message: string = "Unauthorized",
  requestId?: string,
): Response {
  return createErrorResponse(
    message,
    HTTP_STATUS.UNAUTHORIZED,
    "UNAUTHORIZED",
    requestId,
  );
}

/**
 * Create a 403 Forbidden response
 * @param message - Error message (default: generic message)
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createForbiddenResponse(
  message: string = "Forbidden",
  requestId?: string,
): Response {
  return createErrorResponse(
    message,
    HTTP_STATUS.FORBIDDEN,
    "FORBIDDEN",
    requestId,
  );
}

/**
 * Create a 404 Not Found response
 * @param resourceName - Name of the resource that was not found
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createNotFoundResponse(
  resourceName: string = "Resource",
  requestId?: string,
): Response {
  return createErrorResponse(
    `${resourceName} not found`,
    HTTP_STATUS.NOT_FOUND,
    "NOT_FOUND",
    requestId,
  );
}

/**
 * Create a 409 Conflict response
 * @param message - Error message (default: generic message)
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createConflictResponse(
  message: string = "Conflict",
  requestId?: string,
): Response {
  return createErrorResponse(
    message,
    HTTP_STATUS.CONFLICT,
    "CONFLICT",
    requestId,
  );
}

/**
 * Create a 429 Too Many Requests response
 * @param retryAfterSeconds - Seconds to wait before retrying
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createTooManyRequestsResponse(
  retryAfterSeconds: number = 60,
  requestId?: string,
): Response {
  const response = createErrorResponse(
    "Too many requests",
    HTTP_STATUS.TOO_MANY_REQUESTS,
    "TOO_MANY_REQUESTS",
    requestId,
  );

  // Add Retry-After header
  response.headers.set("Retry-After", String(retryAfterSeconds));

  return response;
}

/**
 * Create a 500 Internal Server Error response
 * @param message - Error message (default: generic message)
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createInternalErrorResponse(
  message: string = "Internal server error",
  requestId?: string,
): Response {
  return createErrorResponse(
    message,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    "INTERNAL_ERROR",
    requestId,
  );
}

/**
 * Create a 503 Service Unavailable response
 * @param message - Error message (default: generic message)
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createServiceUnavailableResponse(
  message: string = "Service unavailable",
  requestId?: string,
): Response {
  return createErrorResponse(
    message,
    HTTP_STATUS.SERVICE_UNAVAILABLE,
    "SERVICE_UNAVAILABLE",
    requestId,
  );
}

// ============================================================================
// RESPONSE WITH HEADERS
// ============================================================================

/**
 * Create success response with custom headers
 * @param data - Response data
 * @param customHeaders - Custom headers to include
 * @param statusCode - HTTP status code (default: 200)
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createSuccessResponseWithHeaders<T = unknown>(
  data: T,
  customHeaders: Record<string, string>,
  statusCode: number = HTTP_STATUS.OK,
  requestId?: string,
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    requestId,
  };

  const headers = new Headers({
    "Content-Type": "application/json",
    ...customHeaders,
  });

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers,
  });
}

/**
 * Create error response with custom headers
 * @param message - Error message
 * @param customHeaders - Custom headers to include
 * @param statusCode - HTTP status code (default: 400)
 * @param errorCode - Optional error code for client handling
 * @param requestId - Optional request ID for tracing
 * @returns Response object
 */
export function createErrorResponseWithHeaders(
  message: string,
  customHeaders: Record<string, string>,
  statusCode: number = HTTP_STATUS.BAD_REQUEST,
  errorCode?: string,
  requestId?: string,
): Response {
  const response: ErrorApiResponse = {
    success: false,
    error: message,
    errorCode,
    timestamp: new Date().toISOString(),
    requestId,
    statusCode,
  };

  const headers = new Headers({
    "Content-Type": "application/json",
    ...customHeaders,
  });

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers,
  });
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

/**
 * Generate a unique request ID
 * @returns Request ID string
 */
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Check if a status code indicates success (2xx)
 * @param statusCode - HTTP status code
 * @returns true if status is 2xx
 */
export function isSuccessStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

/**
 * Check if a status code indicates client error (4xx)
 * @param statusCode - HTTP status code
 * @returns true if status is 4xx
 */
export function isClientErrorStatus(statusCode: number): boolean {
  return statusCode >= 400 && statusCode < 500;
}

/**
 * Check if a status code indicates server error (5xx)
 * @param statusCode - HTTP status code
 * @returns true if status is 5xx
 */
export function isServerErrorStatus(statusCode: number): boolean {
  return statusCode >= 500 && statusCode < 600;
}

/**
 * Get human-readable status text
 * @param statusCode - HTTP status code
 * @returns Status text
 */
export function getStatusText(statusCode: number): string {
  const statusTexts: Record<number, string> = {
    200: "OK",
    201: "Created",
    202: "Accepted",
    204: "No Content",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
  };

  return statusTexts[statusCode] || `HTTP ${statusCode}`;
}

/**
 * Convert response envelope to JSON string
 * @param response - API response object
 * @param pretty - Whether to pretty-print JSON (default: false)
 * @returns JSON string
 */
export function responseToJson<T>(
  response: ApiResponse<T>,
  pretty: boolean = false,
): string {
  return pretty ? JSON.stringify(response, null, 2) : JSON.stringify(response);
}

/**
 * Parse JSON response body
 * @param body - Response body string
 * @returns Parsed response or null if invalid
 */
export function parseResponseBody(body: string): ApiResponse | null {
  try {
    return JSON.parse(body) as ApiResponse;
  } catch {
    return null;
  }
}

/**
 * Handle CORS preflight requests (OPTIONS)
 * @param requestOrigin - Optional origin from request headers
 * @returns Response with CORS headers
 */
export function handleCORSPreflight(requestOrigin?: string): Response {
  return new Response(null, {
    status: HTTP_STATUS.NO_CONTENT,
    headers: getCORSHeaders(requestOrigin),
  });
}

/**
 * Export getCORSHeaders for use in handlers
 */
export { getCORSHeaders };
