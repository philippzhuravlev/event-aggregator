import { CORS_HEADERS, HTTP_STATUS } from "./constants.ts";

// So this is a util, a helper function that is neither "what to do" (handler) nor
// "how to connect to an external service" (service). It just does pure logic that
// either makes sense to compartmentalize or is used in multiple places.

// This util standardizes error handling and response creation across our Edge Functions.
// what that actually means is that instead of writing the same error handling code
// in every single function, we centralize it here, plus does other stuff like CORS etc

/**
 * Create a standardized error response with CORS headers
 * Always include CORS headers in ALL responses (success and error) per refactor rules
 */
export function createErrorResponse(
  statusCode: number,
  message: string,
  details?: unknown,
): Response {
  const body: Record<string, unknown> = {
    success: false,
    error: {
      message,
    },
    timestamp: new Date().toISOString(),
  };

  if (details) {
    (body.error as Record<string, unknown>).details = details;
  }

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Create a validation error response
 */
export function createValidationErrorResponse(
  errors: Record<string, string[]> | string[],
  message: string = "Validation failed",
): Response {
  const body = {
    success: false,
    error: {
      message,
      validationErrors: errors,
    },
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: HTTP_STATUS.BAD_REQUEST,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Create a successful response with CORS headers
 */
export function createSuccessResponse(
  data: unknown,
  statusCode: number = HTTP_STATUS.OK,
): Response {
  const body = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Handle CORS preflight requests (OPTIONS)
 */
export function handleCORSPreflight(): Response {
  return new Response(null, {
    status: HTTP_STATUS.NO_CONTENT,
    headers: CORS_HEADERS,
  });
}

/**
 * Extract and validate authorization token from request headers
 * Returns the token or null if missing/invalid
 */
export function extractAuthToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7); // Remove "Bearer " prefix
}

/**
 * Validate API key from Authorization header
 * For internal service-to-service authentication
 */
export function validateApiKey(req: Request, expectedKey: string): boolean {
  const apiKey = req.headers.get("X-API-Key");
  return apiKey === expectedKey;
}

/**
 * Sanitize error message for client response
 * Remove sensitive information in production
 */
export function sanitizeErrorMessage(
  error: unknown,
  isProduction: boolean,
): string {
  if (error instanceof Error) {
    return isProduction ? "An error occurred" : error.message;
  }
  return isProduction ? "An error occurred" : String(error);
}
