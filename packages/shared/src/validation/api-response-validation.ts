import { HTTP_STATUS } from "../config/validation-config.ts";
import {
  createBaseCorsHeaders,
  createCorsHeaders,
} from "../runtime/base.ts";
import type {
  ApiResponse,
  ErrorApiResponse,
  PaginatedResponse,
} from "../types.ts";

const BASE_CORS_HEADERS = createBaseCorsHeaders();

export const CORS_HEADERS = BASE_CORS_HEADERS;
export function getCORSHeaders(origin?: string): Record<string, string> {
  if (origin) {
    return createCorsHeaders(origin);
  }
  return { ...BASE_CORS_HEADERS };
}

export function createSuccessResponse<T = unknown>(
  data: T,
  statusCode: number = HTTP_STATUS.OK,
  requestId?: string,
  origin?: string,
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
      ...getCORSHeaders(origin),
    },
  });
}

export function createNoContentResponse(origin?: string): Response {
  return new Response(null, {
    status: HTTP_STATUS.NO_CONTENT,
    headers: {
      "Content-Type": "application/json",
      ...getCORSHeaders(origin),
    },
  });
}

export function createCreatedResponse<T = unknown>(
  data: T,
  requestId?: string,
  origin?: string,
): Response {
  return createSuccessResponse(data, HTTP_STATUS.CREATED, requestId, origin);
}

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
      ...getCORSHeaders(),
    },
  });
}

export function createErrorResponse(
  message: string,
  statusCode: number = HTTP_STATUS.BAD_REQUEST,
  errorCode?: string,
  requestId?: string,
  origin?: string,
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
      ...getCORSHeaders(origin),
    },
  });
}

export function createValidationErrorResponse(
  errors: Record<string, string[]>,
  requestId?: string,
  origin?: string,
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
      ...getCORSHeaders(origin),
    },
  });
}

export function createFieldValidationErrorResponse(
  fieldName: string,
  fieldError: string,
  requestId?: string,
  origin?: string,
): Response {
  return createValidationErrorResponse(
    {
      [fieldName]: [fieldError],
    },
    requestId,
    origin,
  );
}

export function createBadRequestResponse(
  message: string = "Bad request",
  requestId?: string,
  origin?: string,
): Response {
  return createErrorResponse(
    message,
    HTTP_STATUS.BAD_REQUEST,
    "BAD_REQUEST",
    requestId,
    origin,
  );
}

export function createUnauthorizedResponse(
  message: string = "Unauthorized",
  requestId?: string,
  origin?: string,
): Response {
  return createErrorResponse(
    message,
    HTTP_STATUS.UNAUTHORIZED,
    "UNAUTHORIZED",
    requestId,
    origin,
  );
}

export function createForbiddenResponse(
  message: string = "Forbidden",
  requestId?: string,
  origin?: string,
): Response {
  return createErrorResponse(
    message,
    HTTP_STATUS.FORBIDDEN,
    "FORBIDDEN",
    requestId,
    origin,
  );
}

export function createNotFoundResponse(
  resourceName: string = "Resource",
  requestId?: string,
  origin?: string,
): Response {
  return createErrorResponse(
    `${resourceName} not found`,
    HTTP_STATUS.NOT_FOUND,
    "NOT_FOUND",
    requestId,
    origin,
  );
}

export function createConflictResponse(
  message: string = "Conflict",
  requestId?: string,
  origin?: string,
): Response {
  return createErrorResponse(
    message,
    HTTP_STATUS.CONFLICT,
    "CONFLICT",
    requestId,
    origin,
  );
}

export function createTooManyRequestsResponse(
  retryAfterSeconds: number = 60,
  requestId?: string,
  origin?: string,
): Response {
  const response = createErrorResponse(
    "Too many requests",
    HTTP_STATUS.TOO_MANY_REQUESTS,
    "TOO_MANY_REQUESTS",
    requestId,
    origin,
  );

  response.headers.set("Retry-After", String(retryAfterSeconds));

  return response;
}

export function createInternalErrorResponse(
  message: string = "Internal server error",
  requestId?: string,
  origin?: string,
): Response {
  return createErrorResponse(
    message,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    "INTERNAL_ERROR",
    requestId,
    origin,
  );
}

export function createServiceUnavailableResponse(
  message: string = "Service unavailable",
  requestId?: string,
  origin?: string,
): Response {
  return createErrorResponse(
    message,
    HTTP_STATUS.SERVICE_UNAVAILABLE,
    "SERVICE_UNAVAILABLE",
    requestId,
    origin,
  );
}

export function createSuccessResponseWithHeaders<T = unknown>(
  data: T,
  customHeaders: Record<string, string>,
  statusCode: number = HTTP_STATUS.OK,
  requestId?: string,
  origin?: string,
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    requestId,
  };

  const headers = new Headers({
    "Content-Type": "application/json",
    ...getCORSHeaders(origin),
    ...customHeaders,
  });

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers,
  });
}

export function createErrorResponseWithHeaders(
  message: string,
  customHeaders: Record<string, string>,
  statusCode: number = HTTP_STATUS.BAD_REQUEST,
  errorCode?: string,
  requestId?: string,
  origin?: string,
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
    ...getCORSHeaders(origin),
    ...customHeaders,
  });

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers,
  });
}

export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export function isSuccessStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

export function isClientErrorStatus(statusCode: number): boolean {
  return statusCode >= 400 && statusCode < 500;
}

export function isServerErrorStatus(statusCode: number): boolean {
  return statusCode >= 500 && statusCode < 600;
}

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

export function responseToJson<T>(
  response: ApiResponse<T>,
  pretty: boolean = false,
): string {
  return pretty ? JSON.stringify(response, null, 2) : JSON.stringify(response);
}

export function parseResponseBody(body: string): ApiResponse | null {
  try {
    return JSON.parse(body) as ApiResponse;
  } catch {
    return null;
  }
}

export function handleCORSPreflight(origin?: string): Response {
  const corsHeaders = createCorsHeaders(origin ?? "*");

  return new Response(null, {
    status: HTTP_STATUS.NO_CONTENT,
    headers: corsHeaders,
  });
}
/**
 * Placeholder for shared API response validation utilities.
 */
export {};

