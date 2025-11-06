/**
 * Response helpers for consistent API responses
 */

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * Create a success JSON response
 */
export function createSuccessResponse<T>(
  data: T,
  statusCode: number = 200,
): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Create an error JSON response
 */
export function createErrorResponse(
  error: string,
  statusCode: number = 400,
  code?: string,
  details?: Record<string, unknown>,
): Response {
  const body: ApiErrorResponse = { error, code, details };
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Handle CORS preflight requests
 */
export function handleCORSPreflight(): Response {
  return new Response('OK', {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
};
