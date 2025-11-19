import { assertArrayIncludes, assertEquals } from "std/assert/mod.ts";
import {
  containsSqlKeywords,
  detectSuspiciousPatterns,
  escapeHtml,
  removeNullBytes,
  sanitizeHtml,
  sanitizeInput,
  sanitizeSearchQuery,
  sanitizeSql,
  setInputValidationLogger,
  validateInputComplexity,
  validateInputLength,
} from "@event-aggregator/shared/validation/input-validation.js";

Deno.test("sanitizeHtml removes dangerous tags and attributes", () => {
  const dirty = `<script>alert(1)</script><p onclick="hack()">Hello</p>`;
  const clean = sanitizeHtml(dirty);
  assertEquals(clean.includes("<script"), false);
  assertEquals(clean.includes("onclick"), false);
});

Deno.test("sanitizeHtml falls back to escaping when sanitizer errors", () => {
  const warnings: Array<Record<string, unknown>> = [];
  setInputValidationLogger({
    warn: (_message: string, metadata?: Record<string, unknown>) => {
      warnings.push(metadata ?? {});
    },
  });

  const allowedTags = {
    has() {
      throw new Error("boom");
    },
  } as unknown as Set<string>;

  const result = sanitizeHtml("<div>oops</div>", allowedTags);
  assertEquals(result, "&lt;div&gt;oops&lt;/div&gt;");
  assertEquals(warnings.length, 1);
});

Deno.test("sanitizeSql and containsSqlKeywords guard basic injection attempts", () => {
  assertEquals(sanitizeSql("O'Hara"), "O''Hara");
  assertEquals(containsSqlKeywords("select * from users"), true);
  assertEquals(containsSqlKeywords("hello world"), false);
});

Deno.test("sanitizeInput supports email, url, number, alphanumeric, and text modes", () => {
  assertEquals(
    sanitizeInput(" user@example.com ", "email"),
    "user@example.com",
  );
  assertEquals(
    sanitizeInput("https://exa mple.com?<bad>", "url"),
    "https://example.com?bad",
  );
  assertEquals(sanitizeInput(" 123-45a ", "number"), "123-45");
  assertEquals(sanitizeInput("abc$%^ 123", "alphanumeric"), "abc 123");
  assertEquals(sanitizeInput("<b>bold</b>", "text"), "&lt;b&gt;bold&lt;/b&gt;");
});

Deno.test("removeNullBytes strips control characters", () => {
  const input = "abc\x00def\x07ghi";
  assertEquals(removeNullBytes(input), "abcdefghi");
});

Deno.test("detectSuspiciousPatterns flags multiple attack vectors", () => {
  const result = detectSuspiciousPatterns(
    "SELECT * FROM users;<script>alert(1)</script>../etc/passwd",
  );
  assertEquals(result.suspicious, true);
  assertArrayIncludes(result.patterns, [
    "sql_keywords",
    "dangerous_tags",
    "path_traversal",
  ]);
});

Deno.test("validateInputLength and complexity report expected errors", () => {
  assertEquals(
    validateInputLength("", 1, 5),
    { valid: false, error: "Input is required (minimum 1 characters)" },
  );
  assertEquals(
    validateInputLength("abcdef", 1, 5),
    { valid: false, error: "Input must be at most 5 characters" },
  );
  assertEquals(validateInputLength("abc", 1, 5), { valid: true });

  const complexity = validateInputComplexity("Aa1!", 2, 2, 2, 1);
  assertEquals(complexity.valid, false);
  assertArrayIncludes(complexity.missing, [
    "at least 2 uppercase letters",
    "at least 2 lowercase letters",
    "at least 2 numbers",
  ]);

  const strong = validateInputComplexity("AaBb12$%", 1, 1, 1, 1);
  assertEquals(strong.valid, true);
});

Deno.test("escapeHtml encodes special characters predictably", () => {
  const encoded = escapeHtml(`5 > 3 && 1 < 2 "quotes" 'single' & ampersand`);
  assertEquals(
    encoded,
    "5 &gt; 3 &amp;&amp; 1 &lt; 2 &quot;quotes&quot; &#39;single&#39; &amp; ampersand",
  );
});

Deno.test("sanitizeSearchQuery trims invalid characters and length", () => {
  const sanitized = sanitizeSearchQuery("  hello*&%world  ", 8);
  assertEquals(sanitized, "hello&wo");
});
