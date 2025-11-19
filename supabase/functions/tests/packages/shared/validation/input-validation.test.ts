import { assert, assertArrayIncludes, assertEquals } from "std/assert/mod.ts";
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

Deno.test("sanitizeHtml removes dangerous attributes and javascript protocols", () => {
  const allowed = new Set(["a"]);
  const sanitized = sanitizeHtml(
    `<a href="javascript:alert(1)" onclick="hack()" data="javascript:bad">Click</a>`,
    allowed,
  );
  assertEquals(sanitized.includes("onclick"), false);
  assertEquals(sanitized.includes("javascript:"), false);
  assertEquals(sanitized.includes("data="), false);
});

Deno.test("sanitizeInput returns empty string for falsy inputs", () => {
  assertEquals(sanitizeInput("", "email"), "");
  assertEquals(sanitizeInput(undefined as unknown as string, "text"), "");
});

Deno.test("detectSuspiciousPatterns flags broad attack signatures", () => {
  const result = detectSuspiciousPatterns(
    `onerror=1 javascript:alert(1) data:text/html;base64,../..\\cn=*`,
  );
  assertEquals(result.suspicious, true);
  assertArrayIncludes(result.patterns, [
    "event_handlers",
    "javascript_protocol",
    "data_protocol",
    "path_traversal",
    "ldap_injection",
  ]);
});

Deno.test("detectSuspiciousPatterns returns false for safe input", () => {
  const result = detectSuspiciousPatterns("Hello world");
  assertEquals(result.suspicious, false);
  assertEquals(result.patterns.length, 0);
});

Deno.test("detectSuspiciousPatterns handles null/undefined input", () => {
  const result1 = detectSuspiciousPatterns(null as unknown as string);
  assertEquals(result1.suspicious, false);
  const result2 = detectSuspiciousPatterns(undefined as unknown as string);
  assertEquals(result2.suspicious, false);
});

Deno.test("detectSuspiciousPatterns detects null bytes", () => {
  const result = detectSuspiciousPatterns("test\x00null");
  assertEquals(result.suspicious, true);
  assertArrayIncludes(result.patterns, ["null_bytes"]);
});

Deno.test("sanitizeHtml handles empty input", () => {
  assertEquals(sanitizeHtml(""), "");
  assertEquals(sanitizeHtml(null as unknown as string), "");
  assertEquals(sanitizeHtml(undefined as unknown as string), "");
});

Deno.test("sanitizeHtml handles allowed tags correctly", () => {
  const allowed = new Set(["p", "div", "span"]);
  const html = "<p>Hello</p><div>World</div><script>alert(1)</script>";
  const sanitized = sanitizeHtml(html, allowed);
  assertEquals(sanitized.includes("<script"), false);
  assertEquals(sanitized.includes("<p>"), true);
  assertEquals(sanitized.includes("<div>"), true);
});

Deno.test("sanitizeHtml removes dangerous closing tags", () => {
  const html = "<p>Hello</p></script>";
  const sanitized = sanitizeHtml(html);
  assertEquals(sanitized.includes("</script>"), false);
});

Deno.test("sanitizeHtml handles protocol regex replacement", () => {
  const html = '<a href="javascript:alert(1)">Click</a>';
  const sanitized = sanitizeHtml(html, new Set(["a"]));
  assertEquals(sanitized.includes("javascript:"), false);
});

Deno.test("sanitizeHtml handles vbscript protocol", () => {
  const html = '<a href="vbscript:alert(1)">Click</a>';
  const sanitized = sanitizeHtml(html, new Set(["a"]));
  assertEquals(sanitized.includes("vbscript:"), false);
});

Deno.test("sanitizeHtml handles data:text/html protocol", () => {
  const html = '<a href="data:text/html,<script>alert(1)</script>">Click</a>';
  const sanitized = sanitizeHtml(html, new Set(["a"]));
  assertEquals(sanitized.includes("data:text/html"), false);
});

Deno.test("sanitizeInput handles all input types", () => {
  assertEquals(sanitizeInput("  user@example.com  ", "email"), "user@example.com");
  assertEquals(sanitizeInput("  https://example.com/path?query=value  ", "url"), "https://example.com/path?query=value");
  assertEquals(sanitizeInput("  123.45  ", "number"), "123.45");
  assertEquals(sanitizeInput("  ABC123  ", "alphanumeric"), "ABC123");
  assertEquals(sanitizeInput("  <script>alert(1)</script>  ", "text"), "&lt;script&gt;alert(1)&lt;/script&gt;");
});

Deno.test("sanitizeInput handles default text type", () => {
  assertEquals(sanitizeInput("<b>bold</b>"), "&lt;b&gt;bold&lt;/b&gt;");
});

Deno.test("removeNullBytes handles various control characters", () => {
  const input = "abc\x00\x01\x02\x03\x1F\x7Fdef";
  const result = removeNullBytes(input);
  assertEquals(result, "abcdef");
});

Deno.test("removeNullBytes handles empty string", () => {
  assertEquals(removeNullBytes(""), "");
  assertEquals(removeNullBytes(null as unknown as string), "");
});

Deno.test("validateInputLength handles edge cases", () => {
  assertEquals(validateInputLength("", 0, 10).valid, true);
  assertEquals(validateInputLength("", 1, 10).valid, false);
  assertEquals(validateInputLength("a".repeat(11), 1, 10).valid, false);
  assertEquals(validateInputLength("a".repeat(10), 1, 10).valid, true);
});

Deno.test("validateInputComplexity handles all requirements met", () => {
  const result = validateInputComplexity("Aa1!Bb2@", 2, 2, 2, 2);
  assertEquals(result.valid, true);
  assertEquals(result.missing.length, 0);
});

Deno.test("validateInputComplexity handles partial requirements", () => {
  const result = validateInputComplexity("Aa1", 2, 2, 2, 1);
  assertEquals(result.valid, false);
  assertEquals(result.missing.length > 0, true);
});

Deno.test("validateInputComplexity calculates score correctly", () => {
  const result = validateInputComplexity("Aa1!Bb2@", 1, 1, 1, 1);
  assertEquals(result.valid, true);
  assertEquals(result.score > 0, true);
});

Deno.test("sanitizeSearchQuery handles max length", () => {
  const result = sanitizeSearchQuery("hello world", 5);
  assertEquals(result.length, 5);
});

Deno.test("sanitizeSearchQuery filters invalid characters", () => {
  const result = sanitizeSearchQuery("hello*&%world", 20);
  assertEquals(result.includes("*"), false);
  assertEquals(result.includes("&"), true); // & is allowed punctuation
});

Deno.test("sanitizeSearchQuery trims whitespace", () => {
  const result = sanitizeSearchQuery("  hello world  ", 20);
  assertEquals(result, "hello world");
});

Deno.test("containsSqlKeywords detects various SQL keywords", () => {
  assertEquals(containsSqlKeywords("SELECT * FROM users"), true);
  assertEquals(containsSqlKeywords("INSERT INTO table"), true);
  assertEquals(containsSqlKeywords("UPDATE users SET"), true);
  assertEquals(containsSqlKeywords("DELETE FROM users"), true);
  assertEquals(containsSqlKeywords("DROP TABLE users"), true);
  assertEquals(containsSqlKeywords("CREATE TABLE users"), true);
  assertEquals(containsSqlKeywords("ALTER TABLE users"), true);
  assertEquals(containsSqlKeywords("EXEC sp_procedure"), true);
  assertEquals(containsSqlKeywords("UNION SELECT"), true);
  assertEquals(containsSqlKeywords("DECLARE @var"), true);
});

Deno.test("containsSqlKeywords handles case insensitive matching", () => {
  assertEquals(containsSqlKeywords("select * from users"), true);
  assertEquals(containsSqlKeywords("Select * From Users"), true);
});

Deno.test("containsSqlKeywords handles word boundaries", () => {
  assertEquals(containsSqlKeywords("SELECTION"), false);
  assertEquals(containsSqlKeywords("SELECT *"), true);
});

Deno.test("setInputValidationLogger updates logger", () => {
  const warnings: string[] = [];
  setInputValidationLogger({
    warn: (message: string) => warnings.push(message),
  });

  // Trigger a warning by causing sanitizeHtml to error
  const allowedTags = {
    has() {
      throw new Error("test");
    },
  } as unknown as Set<string>;

  sanitizeHtml("<div>test</div>", allowedTags);
  assertEquals(warnings.length, 1);
  
  // Reset logger
  setInputValidationLogger(undefined);
});
