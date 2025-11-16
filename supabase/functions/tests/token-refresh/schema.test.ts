import { assertEquals, assertExists } from "std/assert/mod.ts";
import { validateTokenRefreshRequest } from "../../token-refresh/schema.ts";

Deno.test("validateTokenRefreshRequest accepts empty body", () => {
  const result = validateTokenRefreshRequest(null);

  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(Object.keys(result.data!).length, 0);
});

Deno.test("validateTokenRefreshRequest accepts empty object", () => {
  const result = validateTokenRefreshRequest({});

  assertEquals(result.success, true);
  assertExists(result.data);
});

Deno.test("validateTokenRefreshRequest returns error for empty pageId string", () => {
  const result = validateTokenRefreshRequest({ pageId: "" });

  assertEquals(result.success, false);
  assertEquals(result.error, "pageId must be a non-empty string");
});

Deno.test("validateTokenRefreshRequest returns error for whitespace-only pageId", () => {
  const result = validateTokenRefreshRequest({ pageId: "   " });

  assertEquals(result.success, false);
  assertEquals(result.error, "pageId must be a non-empty string");
});

Deno.test("validateTokenRefreshRequest returns error for non-string pageId", () => {
  const result = validateTokenRefreshRequest({ pageId: 123 });

  assertEquals(result.success, false);
  assertEquals(result.error, "pageId must be a non-empty string");
});

Deno.test("validateTokenRefreshRequest trims pageId", () => {
  const result = validateTokenRefreshRequest({ pageId: "  123  " });

  assertEquals(result.success, true);
  assertEquals(result.data!.pageId, "123");
});

Deno.test("validateTokenRefreshRequest accepts valid pageId", () => {
  const result = validateTokenRefreshRequest({ pageId: "page-123" });

  assertEquals(result.success, true);
  assertEquals(result.data!.pageId, "page-123");
});

Deno.test("validateTokenRefreshRequest returns error for non-boolean dryRun", () => {
  const result = validateTokenRefreshRequest({ dryRun: "true" });

  assertEquals(result.success, false);
  assertEquals(result.error, "dryRun must be a boolean");
});

Deno.test("validateTokenRefreshRequest accepts dryRun=true", () => {
  const result = validateTokenRefreshRequest({ dryRun: true });

  assertEquals(result.success, true);
  assertEquals(result.data!.dryRun, true);
});

Deno.test("validateTokenRefreshRequest accepts dryRun=false", () => {
  const result = validateTokenRefreshRequest({ dryRun: false });

  assertEquals(result.success, true);
  assertEquals(result.data!.dryRun, false);
});

Deno.test("validateTokenRefreshRequest accepts both pageId and dryRun", () => {
  const result = validateTokenRefreshRequest({
    pageId: "page-123",
    dryRun: true,
  });

  assertEquals(result.success, true);
  assertEquals(result.data!.pageId, "page-123");
  assertEquals(result.data!.dryRun, true);
});

Deno.test("validateTokenRefreshRequest handles validation errors gracefully", () => {
  // Create a request that will throw an error
  const request = {
    get pageId() {
      throw new Error("Test error");
    },
  };

  const result = validateTokenRefreshRequest(request);

  assertEquals(result.success, false);
  assertEquals(result.error?.includes("Test error"), true);
});

