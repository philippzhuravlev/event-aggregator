import { describe, expect, it } from "vitest";
import {
  formatBytes,
  getContentLength,
  getContentTypeCharset,
  getHeader,
  getJsonType,
  getOrigin,
  hasHeader,
  isFormContentType,
  isJsonContentType,
  isJsonContentTypeStrict,
  isSameOrigin,
  SIZE_LIMITS,
  validateBodySize,
  validateContentLength,
  validateContentType,
  validateHeaders,
  validateHttpMethod,
  validateJsonStructure,
  validateOrigin,
  validateRequest,
  validateRequestJson,
  validateRequestJsonBody,
} from "../../src/validation/request-validation.ts";

describe("request-validation", () => {
  describe("validateContentType", () => {
    it("validates matching content type", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json" },
      });
      const result = validateContentType(request, "application/json");
      expect(result.valid).toBe(true);
    });

    it("validates against array of allowed types", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json" },
      });
      const result = validateContentType(request, [
        "application/json",
        "text/plain",
      ]);
      expect(result.valid).toBe(true);
    });

    it("rejects missing Content-Type header", () => {
      const request = new Request("https://example.com");
      const result = validateContentType(request, "application/json");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing Content-Type header");
    });

    it("rejects mismatched content type", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "text/plain" },
      });
      const result = validateContentType(request, "application/json");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid Content-Type");
    });

    it("handles content type with charset", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
      const result = validateContentType(request, "application/json");
      expect(result.valid).toBe(true);
    });

    it("is case-insensitive", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "APPLICATION/JSON" },
      });
      const result = validateContentType(request, "application/json");
      expect(result.valid).toBe(true);
    });
  });

  describe("isJsonContentType", () => {
    it("detects JSON content type", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json" },
      });
      expect(isJsonContentType(request)).toBe(true);
    });

    it("returns false for non-JSON content type", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "text/plain" },
      });
      expect(isJsonContentType(request)).toBe(false);
    });

    it("returns false when Content-Type is missing", () => {
      const request = new Request("https://example.com");
      expect(isJsonContentType(request)).toBe(false);
    });
  });

  describe("isFormContentType", () => {
    it("detects form-urlencoded content type", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      expect(isFormContentType(request)).toBe(true);
    });

    it("detects multipart/form-data content type", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "multipart/form-data" },
      });
      expect(isFormContentType(request)).toBe(true);
    });

    it("returns false for non-form content type", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json" },
      });
      expect(isFormContentType(request)).toBe(false);
    });
  });

  describe("getContentTypeCharset", () => {
    it("extracts charset from Content-Type", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
      expect(getContentTypeCharset(request)).toBe("utf-8");
    });

    it("defaults to utf-8 when charset is missing", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json" },
      });
      expect(getContentTypeCharset(request)).toBe("utf-8");
    });

    it("handles quoted charset", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": 'application/json; charset="utf-8"' },
      });
      expect(getContentTypeCharset(request)).toBe("utf-8");
    });
  });

  describe("validateBodySize", () => {
    it("validates body within size limit", () => {
      const result = validateBodySize(100, SIZE_LIMITS.LARGE);
      expect(result.valid).toBe(true);
    });

    it("rejects body exceeding size limit", () => {
      const result = validateBodySize(SIZE_LIMITS.LARGE + 1, SIZE_LIMITS.LARGE);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum size");
    });

    it("rejects empty body", () => {
      const result = validateBodySize(0);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Request body is empty");
    });
  });

  describe("getContentLength", () => {
    it("extracts Content-Length header", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Length": "1024" },
      });
      expect(getContentLength(request)).toBe(1024);
    });

    it("returns null when Content-Length is missing", () => {
      const request = new Request("https://example.com");
      expect(getContentLength(request)).toBeNull();
    });

    it("returns null for invalid Content-Length", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Length": "invalid" },
      });
      expect(getContentLength(request)).toBeNull();
    });
  });

  describe("validateContentLength", () => {
    it("validates Content-Length within limit", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Length": "100" },
      });
      const result = validateContentLength(request, SIZE_LIMITS.LARGE);
      expect(result.valid).toBe(true);
    });

    it("rejects missing Content-Length", () => {
      const request = new Request("https://example.com");
      const result = validateContentLength(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing Content-Length header");
    });
  });

  describe("formatBytes", () => {
    it("formats bytes correctly", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1024 * 1024)).toBe("1 MB");
    });
  });

  describe("isJsonContentTypeStrict", () => {
    it("strictly matches JSON content type", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json" },
      });
      expect(isJsonContentTypeStrict(request)).toBe(true);
    });

    it("rejects JSON with charset", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
      expect(isJsonContentTypeStrict(request)).toBe(false);
    });
  });

  describe("getJsonType", () => {
    it("identifies JSON types", () => {
      expect(getJsonType(null)).toBe("null");
      expect(getJsonType([])).toBe("array");
      expect(getJsonType({})).toBe("object");
      expect(getJsonType("string")).toBe("string");
      expect(getJsonType(123)).toBe("number");
      expect(getJsonType(true)).toBe("boolean");
    });
  });

  describe("validateJsonStructure", () => {
    it("validates object structure", () => {
      const schema = {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          age: { type: "number" as const },
        },
        required: ["name"],
      };
      const data = { name: "John", age: 30 };
      const result = validateJsonStructure(data, schema);
      expect(result.valid).toBe(true);
    });

    it("rejects missing required fields", () => {
      const schema = {
        type: "object" as const,
        required: ["name"],
      };
      const data = {};
      const result = validateJsonStructure(data, schema);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing required field");
    });

    it("validates string constraints", () => {
      const schema = {
        type: "string" as const,
        minLength: 3,
        maxLength: 10,
      };
      expect(validateJsonStructure("abc", schema).valid).toBe(true);
      expect(validateJsonStructure("ab", schema).valid).toBe(false);
      expect(validateJsonStructure("abcdefghijkl", schema).valid).toBe(false);
    });

    it("validates array constraints", () => {
      const schema = {
        type: "array" as const,
        minItems: 2,
        maxItems: 4,
        items: { type: "string" as const },
      };
      expect(validateJsonStructure(["a", "b"], schema).valid).toBe(true);
      expect(validateJsonStructure(["a"], schema).valid).toBe(false);
      expect(validateJsonStructure(["a", "b", "c", "d", "e"], schema).valid)
        .toBe(false);
    });

    it("validates string pattern matching", () => {
      const schema = {
        type: "string" as const,
        pattern: "^[a-z]+$",
      };
      expect(validateJsonStructure("abc", schema).valid).toBe(true);
      expect(validateJsonStructure("ABC", schema).valid).toBe(false);
      expect(validateJsonStructure("abc123", schema).valid).toBe(false);
    });

    it("validates nested object properties", () => {
      const schema = {
        type: "object" as const,
        properties: {
          user: {
            type: "object" as const,
            properties: {
              name: { type: "string" as const },
            },
            required: ["name"],
          },
        },
      };
      expect(
        validateJsonStructure({ user: { name: "John" } }, schema).valid,
      ).toBe(true);
      expect(validateJsonStructure({ user: {} }, schema).valid).toBe(false);
    });

    it("validates array items with nested schemas", () => {
      const schema = {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "number" as const },
          },
          required: ["id"],
        },
      };
      expect(
        validateJsonStructure([{ id: 1 }, { id: 2 }], schema).valid,
      ).toBe(true);
      expect(validateJsonStructure([{ id: 1 }, {}], schema).valid).toBe(false);
    });

    it("rejects wrong type", () => {
      const schema = { type: "string" as const };
      expect(validateJsonStructure(123, schema).valid).toBe(false);
      expect(validateJsonStructure(null, schema).valid).toBe(false);
    });

    it("validates object with properties but no required fields", () => {
      const schema = {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
        },
      };
      expect(validateJsonStructure({ name: "John" }, schema).valid).toBe(true);
      expect(validateJsonStructure({}, schema).valid).toBe(true);
    });

    it("validates object with extra properties not in schema", () => {
      const schema = {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
        },
      };
      expect(
        validateJsonStructure({ name: "John", extra: "field" }, schema).valid,
      ).toBe(true);
    });
  });

  describe("validateRequestJson", () => {
    it("validates valid JSON", () => {
      const result = validateRequestJson('{"key":"value"}');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ key: "value" });
    });

    it("rejects invalid JSON", () => {
      const result = validateRequestJson("invalid json");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid JSON");
    });

    it("rejects empty body", () => {
      const result = validateRequestJson("");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Request body is empty");
    });
  });

  describe("validateHeaders", () => {
    it("validates all required headers present", () => {
      const request = new Request("https://example.com", {
        headers: {
          "Authorization": "Bearer token",
          "Content-Type": "application/json",
        },
      });
      const result = validateHeaders(request, [
        "Authorization",
        "Content-Type",
      ]);
      expect(result.valid).toBe(true);
    });

    it("rejects missing headers", () => {
      const request = new Request("https://example.com", {
        headers: { "Authorization": "Bearer token" },
      });
      const result = validateHeaders(request, [
        "Authorization",
        "Content-Type",
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing required headers");
    });

    it("is case-insensitive", () => {
      const request = new Request("https://example.com", {
        headers: { "authorization": "Bearer token" },
      });
      const result = validateHeaders(request, ["Authorization"]);
      expect(result.valid).toBe(true);
    });
  });

  describe("getHeader and hasHeader", () => {
    it("getHeader retrieves header value", () => {
      const request = new Request("https://example.com", {
        headers: { "Authorization": "Bearer token" },
      });
      expect(getHeader(request, "Authorization")).toBe("Bearer token");
      expect(getHeader(request, "authorization")).toBe("Bearer token");
    });

    it("hasHeader checks header presence", () => {
      const request = new Request("https://example.com", {
        headers: { "Authorization": "Bearer token" },
      });
      expect(hasHeader(request, "Authorization")).toBe(true);
      expect(hasHeader(request, "X-Missing")).toBe(false);
    });
  });

  describe("validateHttpMethod", () => {
    it("validates allowed method", () => {
      const request = new Request("https://example.com", { method: "GET" });
      const result = validateHttpMethod(request, "GET");
      expect(result.valid).toBe(true);
    });

    it("validates against array of methods", () => {
      const request = new Request("https://example.com", { method: "POST" });
      const result = validateHttpMethod(request, ["GET", "POST"]);
      expect(result.valid).toBe(true);
    });

    it("rejects disallowed method", () => {
      const request = new Request("https://example.com", { method: "DELETE" });
      const result = validateHttpMethod(request, ["GET", "POST"]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Method not allowed");
    });

    it("is case-insensitive", () => {
      const request = new Request("https://example.com", { method: "get" });
      const result = validateHttpMethod(request, "GET");
      expect(result.valid).toBe(true);
    });
  });

  describe("validateOrigin", () => {
    it("validates allowed origin", () => {
      const request = new Request("https://example.com", {
        headers: { "Origin": "https://example.com" },
      });
      const result = validateOrigin(request, "https://example.com");
      expect(result.valid).toBe(true);
    });

    it("validates against array of origins", () => {
      const request = new Request("https://example.com", {
        headers: { "Origin": "https://app.example.com" },
      });
      const result = validateOrigin(request, [
        "https://example.com",
        "https://app.example.com",
      ]);
      expect(result.valid).toBe(true);
    });

    it("rejects missing Origin header", () => {
      const request = new Request("https://example.com");
      const result = validateOrigin(request, "https://example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing Origin header");
    });

    it("rejects disallowed origin", () => {
      const request = new Request("https://example.com", {
        headers: { "Origin": "https://evil.com" },
      });
      const result = validateOrigin(request, "https://example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Origin not allowed");
    });
  });

  describe("getOrigin and isSameOrigin", () => {
    it("getOrigin extracts origin header", () => {
      const request = new Request("https://example.com", {
        headers: { "Origin": "https://app.example.com" },
      });
      expect(getOrigin(request)).toBe("https://app.example.com");
    });

    it("isSameOrigin compares origins", () => {
      const request = new Request("https://example.com", {
        headers: { "Origin": "https://example.com" },
      });
      expect(isSameOrigin(request, "https://example.com")).toBe(true);
      expect(isSameOrigin(request, "https://other.com")).toBe(false);
    });
  });

  describe("validateRequest", () => {
    it("validates request with all checks passing", () => {
      const request = new Request("https://example.com", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://example.com",
        },
      });
      const body = '{"key":"value"}';
      const result = validateRequest(request, body, {
        method: "POST",
        contentType: "application/json",
        maxBodySize: 1000,
        validateOrigin: "https://example.com",
      });
      expect(result.valid).toBe(true);
    });

    it("fails when method doesn't match", () => {
      const request = new Request("https://example.com", { method: "GET" });
      const result = validateRequest(request, "", {
        method: "POST",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Method not allowed");
    });

    it("fails when content type doesn't match", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "text/plain" },
      });
      const result = validateRequest(request, "", {
        contentType: "application/json",
      });
      expect(result.valid).toBe(false);
    });

    it("validates JSON schema when provided", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json" },
      });
      const body = '{"name":"John"}';
      const result = validateRequest(request, body, {
        jsonSchema: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
          },
        },
      });
      expect(result.valid).toBe(true);
    });

    it("fails JSON schema validation when data doesn't match", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json" },
      });
      const body = '{"age":30}';
      const result = validateRequest(request, body, {
        jsonSchema: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
          },
        },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing required field");
    });

    it("fails when body size exceeds limit", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json" },
      });
      const body = "x".repeat(2000);
      const result = validateRequest(request, body, {
        maxBodySize: 1000,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum size");
    });

    it("fails when required headers are missing", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json" },
      });
      const result = validateRequest(request, "", {
        requiredHeaders: ["Authorization", "X-Custom-Header"],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing required headers");
    });

    it("fails when origin doesn't match", () => {
      const request = new Request("https://example.com", {
        headers: { "Origin": "https://evil.com" },
      });
      const result = validateRequest(request, "", {
        validateOrigin: "https://example.com",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Origin not allowed");
    });

    it("validates with multiple options combined", () => {
      const request = new Request("https://example.com", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://example.com",
          "Authorization": "Bearer token",
        },
      });
      const body = '{"name":"John"}';
      const result = validateRequest(request, body, {
        method: ["POST", "PUT"],
        contentType: "application/json",
        maxBodySize: 1000,
        validateOrigin: "https://example.com",
        requiredHeaders: ["Authorization"],
        jsonSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      });
      expect(result.valid).toBe(true);
    });

    it("fails when JSON is invalid in schema validation", () => {
      const request = new Request("https://example.com", {
        headers: { "Content-Type": "application/json" },
      });
      const body = "invalid json";
      const result = validateRequest(request, body, {
        jsonSchema: {
          type: "object",
        },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid JSON");
    });
  });

  describe("validateRequestJsonBody", () => {
    it("validates JSON body from request", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({ key: "value" }),
      });
      const result = await validateRequestJsonBody(request);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ key: "value" });
    });

    it("handles invalid JSON gracefully", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: "invalid json",
      });
      const result = await validateRequestJsonBody(request);
      expect(result.valid).toBe(false);
    });

    it("handles empty body", async () => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: "",
      });
      const result = await validateRequestJsonBody(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Request body is empty");
    });
  });
});
