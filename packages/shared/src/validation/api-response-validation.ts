import { HTTP_STATUS } from "../config/validation-config.js";
import {
  createBaseCorsHeaders,
  createCorsHeaders,
} from "../runtime/base.js";
import type {
  ApiResponse,
  ErrorApiResponse,
  PaginatedResponse,
} from "../types.js";

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
      ...BASE_CORS_HEADERS,
    },
  });
}

export function createNoContentResponse(): Response {
  return new Response(null, {
    status: HTTP_STATUS.NO_CONTENT,
    headers: {
      "Content-Type": "application/json",
      ...BASE_CORS_HEADERS,
    },
  });
}

export function createCreatedResponse<T = unknown>(
  data: T,
  requestId?: string,
): Response {
  return createSuccessResponse(data, HTTP_STATUS.CREATED, requestId);
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
      ...BASE_CORS_HEADERS,
    },
  });
}

export function createErrorResponse(
  message: string,
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

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      ...BASE_CORS_HEADERS,
    },
  });
}

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
      ...BASE_CORS_HEADERS,
    },
  });
}

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

  response.headers.set("Retry-After", String(retryAfterSeconds));

  return response;
}

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

export function handleCORSPreflight(): Response {
  return new Response(null, {
    status: HTTP_STATUS.NO_CONTENT,
    headers: BASE_CORS_HEADERS,
  });
}
/**
 * Placeholder for shared API response validation utilities.
 */
export {};

