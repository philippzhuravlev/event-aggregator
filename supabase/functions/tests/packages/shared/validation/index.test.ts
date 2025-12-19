import {
  computeHmacSignature,
  createErrorResponse,
  createPaginatedResponse,
  createSuccessResponse,
  createTooManyRequestsResponse,
  createValidationErrorResponse,
  formatBytes,
  generateRequestId,
  getStatusText,
  handleCORSPreflight,
  isClientErrorStatus,
  isServerErrorStatus,
  isSuccessStatus,
  parseResponseBody,
  responseToJson,
  timingSafeCompare,
  validateContentType,
  validateHeaders,
  validateHttpMethod,
  validateJsonStructure,
  validateRequestJson,
  verifyBearerToken,
  verifyHmacSignature,
  extractBearerToken,
} from "../../../../../../packages/shared/src/validation/index.ts";
import type {
  ApiResponse,
  JsonSchema,
} from "../../../../../../packages/shared/src/types.ts";
import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "std/assert/mod.ts";

Deno.test("createSuccessResponse embeds metadata with CORS headers", async () => {
  const response = createSuccessResponse({ ok: true }, undefined, "req-123", "https://app.example.com");
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("access-control-allow-origin"), "https://app.example.com");

  const body = await response.clone().json();
  assertEquals(body.success, true);
  assertEquals(body.data.ok, true);
  assertEquals(body.requestId, "req-123");
  assert(body.timestamp);
});

Deno.test("createErrorResponse and createValidationErrorResponse format errors", async () => {
  const base = await createErrorResponse("boom", 418, "TEAPOT", "req-1").json();
  assertEquals(base.success, false);
  assertEquals(base.errorCode, "TEAPOT");
  assertEquals(base.statusCode, 418);

  const fieldResponse = await createValidationErrorResponse(
    { field: ["missing"] },
    "req-2",
  ).json();
  assertEquals(fieldResponse.error, "Validation failed");
  assertEquals(fieldResponse.errors.field, ["missing"]);
});

Deno.test("createTooManyRequestsResponse sets retry headers", async () => {
  const response = createTooManyRequestsResponse(5, "https://app.example.com");
  assertEquals(response.status, 429);
  assertEquals(response.headers.get("retry-after"), "5");
  const body = await response.json();
  assertEquals(body.error, "Too many requests");
  assertEquals(body.statusCode, 429);
  assertEquals(body.errorCode, "TOO_MANY_REQUESTS");
});

Deno.test("handleCORSPreflight responds with base headers", () => {
  const response = handleCORSPreflight("https://origin.example.com");
  assertEquals(response.status, 204);
  assertEquals(response.headers.get("access-control-allow-origin"), "https://origin.example.com");
});

Deno.test("response helpers serialize and parse bodies safely", () => {
  const id = generateRequestId();
  assertMatch(id, /^\d+-[a-z0-9]+$/i);

  assertEquals(isSuccessStatus(200), true);
  assertEquals(isClientErrorStatus(404), true);
  assertEquals(isServerErrorStatus(503), true);

  assertEquals(getStatusText(404), "Not Found");
  assertEquals(getStatusText(499), "HTTP 499");

  const response: ApiResponse<{ foo: string }> = {
    success: true,
    data: { foo: "bar" },
    timestamp: "2025-01-01T00:00:00.000Z",
  };

  const json = responseToJson(response);
  assertEquals(json, JSON.stringify(response));
  assertEquals(parseResponseBody(json), response);
  assertEquals(parseResponseBody("not json"), null);
});

Deno.test("auth helpers compute and verify HMAC signatures", async () => {
  const signature = await computeHmacSignature("payload", "secret");
  assertStringIncludes(signature, "sha256=");

  const bare = await computeHmacSignature("payload", "secret", "hex");
  assertEquals(bare.startsWith("sha256="), false);

  const verify = await verifyHmacSignature("payload", signature, "secret");
  assertEquals(verify.valid, true);

  const invalid = await verifyHmacSignature("payload", "sha256=deadbeef", "secret");
  assertEquals(invalid.valid, false);

  assertEquals(timingSafeCompare("abc", "abc"), true);
  assertEquals(timingSafeCompare("abc", "abd"), false);
});

Deno.test("bearer token helpers extract and compare tokens safely", () => {
  const token = extractBearerToken("Bearer actual-token");
  assertEquals(token, "actual-token");
  assertEquals(extractBearerToken(null), null);
  assertEquals(verifyBearerToken("abc", "abc"), true);
  assertEquals(verifyBearerToken("abc", "def"), false);
});

Deno.test("request validation utilities guard headers, methods and payloads", () => {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    origin: "https://app.example.com",
    authorization: "Bearer token",
    "x-custom": "true",
  });

  const request = new Request("https://example.com", {
    method: "POST",
    headers,
  });

  assertEquals(validateContentType(request, "application/json").valid, true);
  assertEquals(validateHttpMethod(request, ["POST", "GET"]).valid, true);
  assertEquals(validateHeaders(request, ["content-type", "origin"]).valid, true);
  assertEquals(
    validateRequestJson(JSON.stringify({ ok: true })).valid,
    true,
  );

  const schema: JsonSchema = {
    type: "object",
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
    },
  };

  assertEquals(validateJsonStructure({ ok: true }, schema).valid, true);
  assertEquals(formatBytes(1536), "1.5 KB");
});

Deno.test("createSuccessResponse handles missing origin", async () => {
  const response = createSuccessResponse({ ok: true }, 200, "req-123");
  assertEquals(response.status, 200);
  const body = await response.clone().json();
  assertEquals(body.success, true);
  assertEquals(body.data.ok, true);
});

Deno.test("createSuccessResponse handles custom status code", () => {
  const response = createSuccessResponse({ ok: true }, 201, "req-123");
  assertEquals(response.status, 201);
});

Deno.test("createPaginatedResponse formats pagination metadata", async () => {
  const response = createPaginatedResponse(
    [{ id: 1 }, { id: 2 }],
    1,
    10,
    25,
    "req-123",
  );
  assertEquals(response.status, 200);
  const body = await response.clone().json();
  assertEquals(body.pagination.page, 1);
  assertEquals(body.pagination.pageSize, 10);
  assertEquals(body.pagination.total, 25);
  assertEquals(body.pagination.totalPages, 3);
});

Deno.test("createErrorResponse handles missing parameters", async () => {
  const response = createErrorResponse("Error message");
  assertEquals(response.status, 400);
  const body = await response.clone().json();
  assertEquals(body.error, "Error message");
  assertEquals(body.success, false);
});

Deno.test("createErrorResponse with origin includes CORS headers", () => {
  const response = createErrorResponse("Error", 400, "ERROR", "req-123", "https://app.example.com");
  assertEquals(response.headers.get("access-control-allow-origin"), "https://app.example.com");
});

Deno.test("createValidationErrorResponse formats field errors", async () => {
  const response = createValidationErrorResponse(
    { field1: ["error1", "error2"], field2: ["error3"] },
    "req-123",
  );
  assertEquals(response.status, 422);
  const body = await response.clone().json();
  assertEquals(body.error, "Validation failed");
  assertEquals(body.errors.field1, ["error1", "error2"]);
  assertEquals(body.errors.field2, ["error3"]);
});

Deno.test("createTooManyRequestsResponse handles missing origin", () => {
  const response = createTooManyRequestsResponse(60, "req-123");
  assertEquals(response.status, 429);
  assertEquals(response.headers.get("retry-after"), "60");
});

Deno.test("handleCORSPreflight handles null origin", () => {
  const response = handleCORSPreflight(null);
  assertEquals(response.status, 204);
  assertEquals(response.headers.get("access-control-allow-origin"), "*");
});

Deno.test("isSuccessStatus handles edge cases", () => {
  assertEquals(isSuccessStatus(199), false);
  assertEquals(isSuccessStatus(200), true);
  assertEquals(isSuccessStatus(299), true);
  assertEquals(isSuccessStatus(300), false);
});

Deno.test("isClientErrorStatus handles edge cases", () => {
  assertEquals(isClientErrorStatus(399), false);
  assertEquals(isClientErrorStatus(400), true);
  assertEquals(isClientErrorStatus(499), true);
  assertEquals(isClientErrorStatus(500), false);
});

Deno.test("isServerErrorStatus handles edge cases", () => {
  assertEquals(isServerErrorStatus(499), false);
  assertEquals(isServerErrorStatus(500), true);
  assertEquals(isServerErrorStatus(599), true);
  assertEquals(isServerErrorStatus(600), false);
});

Deno.test("getStatusText handles all known status codes", () => {
  assertEquals(getStatusText(200), "OK");
  assertEquals(getStatusText(201), "Created");
  assertEquals(getStatusText(204), "No Content");
  assertEquals(getStatusText(400), "Bad Request");
  assertEquals(getStatusText(401), "Unauthorized");
  assertEquals(getStatusText(403), "Forbidden");
  assertEquals(getStatusText(404), "Not Found");
  assertEquals(getStatusText(409), "Conflict");
  assertEquals(getStatusText(422), "Unprocessable Entity");
  assertEquals(getStatusText(429), "Too Many Requests");
  assertEquals(getStatusText(500), "Internal Server Error");
  assertEquals(getStatusText(503), "Service Unavailable");
});

Deno.test("responseToJson handles pretty printing", () => {
  const response: ApiResponse<{ foo: string; nested: { value: number } }> = {
    success: true,
    data: { foo: "bar", nested: { value: 123 } },
    timestamp: "2025-01-01T00:00:00.000Z",
  };
  const compact = responseToJson(response, false);
  const pretty = responseToJson(response, true);
  assertEquals(JSON.parse(compact), response);
  assert(pretty.includes("\n"));
  assertEquals(JSON.parse(pretty), response);
});

Deno.test("parseResponseBody handles invalid JSON", () => {
  assertEquals(parseResponseBody("not json"), null);
  assertEquals(parseResponseBody(""), null);
  assertEquals(parseResponseBody("{ invalid }"), null);
});

Deno.test("verifyHmacSignature handles missing payload", async () => {
  const result = await verifyHmacSignature("", "sha256=abc", "secret");
  assertEquals(result.valid, false);
  assertEquals(result.error, "Missing payload");
});

Deno.test("verifyHmacSignature handles missing signature", async () => {
  const result = await verifyHmacSignature("payload", "", "secret");
  assertEquals(result.valid, false);
  assertEquals(result.error, "Missing signature");
});

Deno.test("verifyHmacSignature handles missing secret", async () => {
  const result = await verifyHmacSignature("payload", "sha256=abc", "");
  assertEquals(result.valid, false);
  assertEquals(result.error, "Missing secret");
});

Deno.test("verifyHmacSignature handles invalid signature format", async () => {
  const result = await verifyHmacSignature("payload", "invalid-format", "secret");
  assertEquals(result.valid, false);
  assert(result.error?.includes("Invalid signature format"));
});

Deno.test("verifyHmacSignature handles hex format", async () => {
  const signature = await computeHmacSignature("payload", "secret", "hex");
  const result = await verifyHmacSignature("payload", signature, "secret", "hex");
  assertEquals(result.valid, true);
});

Deno.test("timingSafeCompare handles different length strings", () => {
  assertEquals(timingSafeCompare("abc", "abcd"), false);
  assertEquals(timingSafeCompare("abcd", "abc"), false);
});

Deno.test("extractBearerToken handles case insensitive Bearer", () => {
  assertEquals(extractBearerToken("bearer token"), "token");
  assertEquals(extractBearerToken("BEARER token"), "token");
  assertEquals(extractBearerToken("Bearer token"), "token");
});

Deno.test("extractBearerToken handles invalid formats", () => {
  assertEquals(extractBearerToken("Invalid token"), null);
  assertEquals(extractBearerToken("Bearer"), null);
  assertEquals(extractBearerToken(""), null);
});

Deno.test("verifyBearerToken handles errors gracefully", () => {
  // This should not throw even with invalid inputs
  assertEquals(verifyBearerToken("", ""), true);
});

Deno.test("validateContentType handles missing content-type", () => {
  const request = new Request("https://example.com");
  const result = validateContentType(request, "application/json");
  assertEquals(result.valid, false);
  assertEquals(result.error, "Missing Content-Type header");
});

Deno.test("validateContentType handles content-type with parameters", () => {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
  });
  const request = new Request("https://example.com", { headers });
  const result = validateContentType(request, "application/json");
  assertEquals(result.valid, true);
});

Deno.test("validateContentType handles array of allowed types", () => {
  const headers = new Headers({
    "content-type": "application/xml",
  });
  const request = new Request("https://example.com", { headers });
  const result = validateContentType(request, ["application/json", "application/xml"]);
  assertEquals(result.valid, true);
});

Deno.test("validateContentType handles invalid content-type", () => {
  const headers = new Headers({
    "content-type": "text/plain",
  });
  const request = new Request("https://example.com", { headers });
  const result = validateContentType(request, "application/json");
  assertEquals(result.valid, false);
  assert(result.error?.includes("Invalid Content-Type"));
});

Deno.test("validateHeaders handles missing headers", () => {
  const request = new Request("https://example.com");
  const result = validateHeaders(request, ["authorization", "content-type"]);
  assertEquals(result.valid, false);
  assert(result.error?.includes("Missing required headers"));
});

Deno.test("validateHeaders handles case insensitive header names", () => {
  const headers = new Headers({
    "Authorization": "Bearer token",
    "Content-Type": "application/json",
  });
  const request = new Request("https://example.com", { headers });
  const result = validateHeaders(request, ["authorization", "content-type"]);
  assertEquals(result.valid, true);
});

Deno.test("validateHttpMethod handles single allowed method", () => {
  const request = new Request("https://example.com", { method: "GET" });
  const result = validateHttpMethod(request, "GET");
  assertEquals(result.valid, true);
});

Deno.test("validateHttpMethod handles invalid method", () => {
  const request = new Request("https://example.com", { method: "DELETE" });
  const result = validateHttpMethod(request, "GET");
  assertEquals(result.valid, false);
  assert(result.error?.includes("Method not allowed"));
});

Deno.test("validateRequestJson handles invalid JSON", () => {
  const result = validateRequestJson("invalid json");
  assertEquals(result.valid, false);
  assert(result.error?.includes("Invalid JSON"));
});

Deno.test("validateRequestJson handles empty body", () => {
  const result = validateRequestJson("");
  assertEquals(result.valid, false);
  assertEquals(result.error, "Request body is empty");
});

Deno.test("validateJsonStructure handles missing required fields", () => {
  const schema: JsonSchema = {
    type: "object",
    required: ["name", "age"],
    properties: {
      name: { type: "string" },
      age: { type: "number" },
    },
  };
  const result = validateJsonStructure({ name: "John" }, schema);
  assertEquals(result.valid, false);
  assert(result.error?.includes("Missing required field"));
});

Deno.test("validateJsonStructure handles wrong type", () => {
  const schema: JsonSchema = { type: "string" };
  const result = validateJsonStructure(123, schema);
  assertEquals(result.valid, false);
  assert(result.error?.includes("Expected type string"));
});

Deno.test("validateJsonStructure handles string validation", () => {
  const schema: JsonSchema = {
    type: "string",
    minLength: 5,
    maxLength: 10,
    pattern: "^[a-z]+$",
  };
  assertEquals(validateJsonStructure("abc", schema).valid, false);
  assertEquals(validateJsonStructure("abcdefghijkl", schema).valid, false);
  assertEquals(validateJsonStructure("ABC", schema).valid, false);
  assertEquals(validateJsonStructure("abcdef", schema).valid, true);
});

Deno.test("validateJsonStructure handles array validation", () => {
  const schema: JsonSchema = {
    type: "array",
    minItems: 2,
    maxItems: 4,
    items: { type: "string" },
  };
  assertEquals(validateJsonStructure([], schema).valid, false);
  assertEquals(validateJsonStructure(["a"], schema).valid, false);
  assertEquals(validateJsonStructure(["a", "b", "c", "d", "e"], schema).valid, false);
  assertEquals(validateJsonStructure(["a", "b"], schema).valid, true);
  assertEquals(validateJsonStructure([1, 2], schema).valid, false);
});

Deno.test("formatBytes handles various sizes", () => {
  assertEquals(formatBytes(0), "0 B");
  assertEquals(formatBytes(1024), "1 KB");
  assertEquals(formatBytes(1024 * 1024), "1 MB");
  assertEquals(formatBytes(1024 * 1024 * 1024), "1 GB");
});

