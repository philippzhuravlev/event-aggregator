import { describe, expect, it } from "vitest";
import {
  createBadRequestResponse,
  createConflictResponse,
  createCreatedResponse,
  createErrorResponse,
  createErrorResponseWithHeaders,
  createFieldValidationErrorResponse,
  createForbiddenResponse,
  createInternalErrorResponse,
  createNoContentResponse,
  createNotFoundResponse,
  createPaginatedResponse,
  createServiceUnavailableResponse,
  createSuccessResponse,
  createSuccessResponseWithHeaders,
  createTooManyRequestsResponse,
  createUnauthorizedResponse,
  createValidationErrorResponse,
  generateRequestId,
  getCORSHeaders,
  getStatusText,
  handleCORSPreflight,
  isClientErrorStatus,
  isServerErrorStatus,
  isSuccessStatus,
  parseResponseBody,
  responseToJson,
} from "../../src/validation/api-response-validation.ts";
import { HTTP_STATUS } from "../../src/config/validation-config.ts";

describe("api-response-validation", () => {
  describe("getCORSHeaders", () => {
    it("returns base CORS headers when no origin provided", () => {
      const headers = getCORSHeaders();
      expect(headers["Access-Control-Allow-Origin"]).toBe("*");
      expect(headers["Access-Control-Allow-Methods"]).toBeDefined();
    });

    it("returns origin-specific headers when origin provided", () => {
      const headers = getCORSHeaders("https://example.com");
      expect(headers["Access-Control-Allow-Origin"]).toBe(
        "https://example.com",
      );
    });
  });

  describe("createSuccessResponse", () => {
    it("creates a successful response with data", async () => {
      const response = createSuccessResponse({ id: 1, name: "Test" });
      const data = await response.json();

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(data.success).toBe(true);
      expect(data.data).toEqual({ id: 1, name: "Test" });
      expect(data.timestamp).toBeDefined();
    });

    it("accepts custom status code", () => {
      const response = createSuccessResponse({}, HTTP_STATUS.CREATED);
      expect(response.status).toBe(HTTP_STATUS.CREATED);
    });

    it("includes requestId when provided", async () => {
      const requestId = "req-123";
      const response = createSuccessResponse({}, HTTP_STATUS.OK, requestId);
      const data = await response.json();
      expect(data.requestId).toBe(requestId);
    });

    it("includes CORS headers with origin", () => {
      const response = createSuccessResponse(
        {},
        HTTP_STATUS.OK,
        undefined,
        "https://example.com",
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://example.com",
      );
    });
  });

  describe("createNoContentResponse", () => {
    it("creates a 204 No Content response", () => {
      const response = createNoContentResponse();
      expect(response.status).toBe(HTTP_STATUS.NO_CONTENT);
      expect(response.body).toBeNull();
    });
  });

  describe("createCreatedResponse", () => {
    it("creates a 201 Created response", async () => {
      const response = createCreatedResponse({ id: 1 });
      const data = await response.json();

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(data.success).toBe(true);
      expect(data.data).toEqual({ id: 1 });
    });
  });

  describe("createPaginatedResponse", () => {
    it("creates a paginated response with correct structure", async () => {
      const items = [{ id: 1 }, { id: 2 }];
      const response = createPaginatedResponse(items, 1, 10, 25);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toEqual(items);
      expect(data.pagination).toEqual({
        page: 1,
        pageSize: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it("calculates totalPages correctly", async () => {
      const response = createPaginatedResponse([], 1, 10, 0);
      const data = await response.json();
      expect(data.pagination.totalPages).toBe(0);
    });
  });

  describe("createErrorResponse", () => {
    it("creates an error response with message", async () => {
      const response = createErrorResponse("Something went wrong");
      const data = await response.json();

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Something went wrong");
      expect(data.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    });

    it("accepts custom status code and error code", async () => {
      const response = createErrorResponse(
        "Not found",
        HTTP_STATUS.NOT_FOUND,
        "NOT_FOUND",
      );
      const data = await response.json();

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(data.errorCode).toBe("NOT_FOUND");
    });
  });

  describe("createValidationErrorResponse", () => {
    it("creates a validation error response", async () => {
      const errors = {
        email: ["Invalid email format"],
        age: ["Must be a number"],
      };
      const response = createValidationErrorResponse(errors);
      const data = await response.json();

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Validation failed");
      expect(data.errors).toEqual(errors);
    });
  });

  describe("createFieldValidationErrorResponse", () => {
    it("creates a single field validation error", async () => {
      const response = createFieldValidationErrorResponse(
        "email",
        "Invalid format",
      );
      const data = await response.json();

      expect(data.errors).toEqual({
        email: ["Invalid format"],
      });
    });
  });

  describe("HTTP status response helpers", () => {
    it("createBadRequestResponse creates 400 response", async () => {
      const response = createBadRequestResponse("Bad input");
      const data = await response.json();
      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(data.errorCode).toBe("BAD_REQUEST");
    });

    it("createUnauthorizedResponse creates 401 response", async () => {
      const response = createUnauthorizedResponse("Not authorized");
      const data = await response.json();
      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(data.errorCode).toBe("UNAUTHORIZED");
    });

    it("createForbiddenResponse creates 403 response", async () => {
      const response = createForbiddenResponse("Access denied");
      const data = await response.json();
      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(data.errorCode).toBe("FORBIDDEN");
    });

    it("createNotFoundResponse creates 404 response", async () => {
      const response = createNotFoundResponse("User");
      const data = await response.json();
      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(data.error).toBe("User not found");
      expect(data.errorCode).toBe("NOT_FOUND");
    });

    it("createConflictResponse creates 409 response", async () => {
      const response = createConflictResponse("Resource exists");
      const data = await response.json();
      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(data.errorCode).toBe("CONFLICT");
    });

    it("createTooManyRequestsResponse creates 429 with Retry-After header", async () => {
      const response = createTooManyRequestsResponse(120);
      const data = await response.json();
      expect(response.status).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
      expect(response.headers.get("Retry-After")).toBe("120");
      expect(data.errorCode).toBe("TOO_MANY_REQUESTS");
    });

    it("createInternalErrorResponse creates 500 response", async () => {
      const response = createInternalErrorResponse("Server error");
      const data = await response.json();
      expect(response.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(data.errorCode).toBe("INTERNAL_ERROR");
    });

    it("createServiceUnavailableResponse creates 503 response", async () => {
      const response = createServiceUnavailableResponse("Service down");
      const data = await response.json();
      expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
      expect(data.errorCode).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("response with custom headers", () => {
    it("createSuccessResponseWithHeaders includes custom headers", () => {
      const response = createSuccessResponseWithHeaders(
        { data: "test" },
        { "X-Custom": "value" },
      );
      expect(response.headers.get("X-Custom")).toBe("value");
    });

    it("createErrorResponseWithHeaders includes custom headers", () => {
      const response = createErrorResponseWithHeaders(
        "Error",
        { "X-Error-Code": "CUSTOM" },
        HTTP_STATUS.BAD_REQUEST,
      );
      expect(response.headers.get("X-Error-Code")).toBe("CUSTOM");
    });
  });

  describe("utility functions", () => {
    it("generateRequestId creates unique IDs", () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it("isSuccessStatus identifies success status codes", () => {
      expect(isSuccessStatus(200)).toBe(true);
      expect(isSuccessStatus(201)).toBe(true);
      expect(isSuccessStatus(299)).toBe(true);
      expect(isSuccessStatus(400)).toBe(false);
      expect(isSuccessStatus(199)).toBe(false);
    });

    it("isClientErrorStatus identifies client error codes", () => {
      expect(isClientErrorStatus(400)).toBe(true);
      expect(isClientErrorStatus(404)).toBe(true);
      expect(isClientErrorStatus(499)).toBe(true);
      expect(isClientErrorStatus(500)).toBe(false);
      expect(isClientErrorStatus(399)).toBe(false);
    });

    it("isServerErrorStatus identifies server error codes", () => {
      expect(isServerErrorStatus(500)).toBe(true);
      expect(isServerErrorStatus(503)).toBe(true);
      expect(isServerErrorStatus(599)).toBe(true);
      expect(isServerErrorStatus(400)).toBe(false);
      expect(isServerErrorStatus(499)).toBe(false);
    });

    it("getStatusText returns status text for known codes", () => {
      expect(getStatusText(200)).toBe("OK");
      expect(getStatusText(404)).toBe("Not Found");
      expect(getStatusText(500)).toBe("Internal Server Error");
    });

    it("getStatusText returns generic text for unknown codes", () => {
      expect(getStatusText(999)).toBe("HTTP 999");
    });
  });

  describe("response serialization", () => {
    it("responseToJson serializes response", () => {
      const response = {
        success: true,
        data: { id: 1 },
        timestamp: new Date().toISOString(),
      };
      const json = responseToJson(response);
      expect(json).toContain('"success":true');
      expect(json).toContain('"id":1');
    });

    it("responseToJson can pretty print", () => {
      const response = {
        success: true,
        data: { id: 1 },
        timestamp: new Date().toISOString(),
      };
      const json = responseToJson(response, true);
      expect(json).toContain("\n");
    });

    it("parseResponseBody parses valid JSON", () => {
      const body = '{"success":true,"data":{"id":1}}';
      const parsed = parseResponseBody(body);
      expect(parsed).toEqual({ success: true, data: { id: 1 } });
    });

    it("parseResponseBody returns null for invalid JSON", () => {
      const body = "invalid json";
      const parsed = parseResponseBody(body);
      expect(parsed).toBeNull();
    });
  });

  describe("handleCORSPreflight", () => {
    it("creates a preflight response", () => {
      const response = handleCORSPreflight("https://example.com");
      expect(response.status).toBe(HTTP_STATUS.NO_CONTENT);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://example.com",
      );
    });

    it("uses wildcard when no origin provided", () => {
      const response = handleCORSPreflight();
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });
});
