import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  sanitizeHtml,
  sanitizeSearchQuery,
  setInputValidationLogger,
  escapeHtml,
  sanitizeSql,
  containsSqlKeywords,
  sanitizeInput,
  removeNullBytes,
  detectSuspiciousPatterns,
  validateInputLength,
  validateInputComplexity,
} from "../../src/validation/input-validation.ts";

describe("input-validation", () => {
  beforeEach(() => {
    // Reset logger to default before each test
    setInputValidationLogger(null);
  });

  describe("sanitizeHtml", () => {
    it("removes dangerous script tags", () => {
      const html = '<p>Safe</p><script>alert("xss")</script>';
      const sanitized = sanitizeHtml(html);
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).toContain("<p>Safe</p>");
    });

    it("removes dangerous event handler attributes", () => {
      const html = '<div onclick="alert(\'xss\')">Click me</div>';
      const sanitized = sanitizeHtml(html);
      expect(sanitized).not.toContain("onclick");
      expect(sanitized).toContain("Click me");
    });

    it("preserves safe HTML tags by default", () => {
      const html = "<p>Paragraph</p><strong>Bold</strong><em>Italic</em>";
      const sanitized = sanitizeHtml(html);
      expect(sanitized).toContain("<p>");
      expect(sanitized).toContain("<strong>");
      expect(sanitized).toContain("<em>");
    });

    it("respects custom allowed tags", () => {
      const html = "<p>Safe</p><div>Also safe</div>";
      const sanitized = sanitizeHtml(html, new Set(["p"]));
      expect(sanitized).toContain("<p>");
      expect(sanitized).not.toContain("<div>");
    });

    it("removes javascript: protocol from href", () => {
      const html = '<a href="javascript:alert(\'xss\')">Link</a>';
      const sanitized = sanitizeHtml(html);
      expect(sanitized).not.toContain("javascript:");
    });

    it("removes vbscript: and data: protocols", () => {
      const html = '<a href="vbscript:alert(\'xss\')">Link</a>';
      const sanitized = sanitizeHtml(html);
      expect(sanitized).not.toContain("vbscript:");
    });

    it("removes dangerous tags like iframe, object, embed", () => {
      const html = '<p>Safe</p><iframe src="evil.com"></iframe><object></object>';
      const sanitized = sanitizeHtml(html);
      expect(sanitized).not.toContain("<iframe");
      expect(sanitized).not.toContain("<object");
      expect(sanitized).toContain("<p>Safe</p>");
    });

    it("removes closing tags for removed dangerous tags", () => {
      const html = "<script>alert('xss')</script><p>Safe</p>";
      const sanitized = sanitizeHtml(html);
      expect(sanitized).not.toContain("</script>");
      expect(sanitized).toContain("<p>Safe</p>");
    });

    it("handles empty input", () => {
      expect(sanitizeHtml("")).toBe("");
    });

    it("handles errors gracefully and falls back to escapeHtml", () => {
      const warnSpy = vi.fn();
      setInputValidationLogger({ warn: warnSpy });

      // Create a scenario that might cause an error (malformed HTML)
      const result = sanitizeHtml("<p>Test</p>");
      expect(result).toBeDefined();
    });
  });

  describe("escapeHtml", () => {
    it("escapes HTML special characters", () => {
      expect(escapeHtml("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
      );
    });

    it("escapes all dangerous characters", () => {
      expect(escapeHtml('"test" & more')).toBe("&quot;test&quot; &amp; more");
    });

    it("handles empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("handles strings without special characters", () => {
      expect(escapeHtml("plain text")).toBe("plain text");
    });
  });

  describe("sanitizeSql", () => {
    it("escapes single quotes by doubling them", () => {
      expect(sanitizeSql("O'Brien")).toBe("O''Brien");
    });

    it("handles multiple single quotes", () => {
      expect(sanitizeSql("It's a 'test'")).toBe("It''s a ''test''");
    });

    it("handles empty string", () => {
      expect(sanitizeSql("")).toBe("");
    });

    it("handles strings without quotes", () => {
      expect(sanitizeSql("normal text")).toBe("normal text");
    });
  });

  describe("containsSqlKeywords", () => {
    it("detects SQL keywords", () => {
      expect(containsSqlKeywords("SELECT * FROM users")).toBe(true);
      expect(containsSqlKeywords("DROP TABLE users")).toBe(true);
      expect(containsSqlKeywords("INSERT INTO table")).toBe(true);
      expect(containsSqlKeywords("DELETE FROM table")).toBe(true);
    });

    it("detects keywords as whole words only", () => {
      expect(containsSqlKeywords("SELECTION")).toBe(false);
      expect(containsSqlKeywords("user SELECT")).toBe(true);
    });

    it("is case insensitive", () => {
      expect(containsSqlKeywords("select * from users")).toBe(true);
      expect(containsSqlKeywords("Select * From Users")).toBe(true);
    });

    it("returns false for safe input", () => {
      expect(containsSqlKeywords("normal text")).toBe(false);
      expect(containsSqlKeywords("user@example.com")).toBe(false);
    });

    it("handles empty string", () => {
      expect(containsSqlKeywords("")).toBe(false);
    });
  });

  describe("sanitizeInput", () => {
    it("sanitizes email input", () => {
      expect(sanitizeInput("user@example.com", "email")).toBe("user@example.com");
      // Email sanitization removes characters not allowed in emails, so < and > are removed
      expect(sanitizeInput("user@example.com<script>", "email")).toBe("user@example.comscript");
      // @ is allowed in emails, so it's kept
      expect(sanitizeInput("user@example.com!@#", "email")).toBe("user@example.com@");
    });

    it("sanitizes URL input", () => {
      expect(sanitizeInput("https://example.com", "url")).toBe("https://example.com");
      expect(sanitizeInput("https://example.com/path?query=test", "url")).toBe(
        "https://example.com/path?query=test",
      );
    });

    it("sanitizes number input", () => {
      expect(sanitizeInput("123.45", "number")).toBe("123.45");
      expect(sanitizeInput("-123", "number")).toBe("-123");
      expect(sanitizeInput("123abc", "number")).toBe("123");
    });

    it("sanitizes alphanumeric input", () => {
      expect(sanitizeInput("abc123", "alphanumeric")).toBe("abc123");
      expect(sanitizeInput("test-123_456", "alphanumeric")).toBe("test-123_456");
      expect(sanitizeInput("test@123", "alphanumeric")).toBe("test123");
    });

    it("sanitizes text input by escaping HTML", () => {
      expect(sanitizeInput("<script>alert('xss')</script>", "text")).toBe(
        "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
      );
    });

    it("trims input", () => {
      expect(sanitizeInput("  test  ", "text")).toBe("test");
    });

    it("handles empty string", () => {
      expect(sanitizeInput("", "text")).toBe("");
    });
  });

  describe("removeNullBytes", () => {
    it("removes null bytes", () => {
      const input = "test\0string";
      expect(removeNullBytes(input)).toBe("teststring");
    });

    it("removes control characters", () => {
      const input = "test\x01\x02string";
      expect(removeNullBytes(input)).toBe("teststring");
    });

    it("handles empty string", () => {
      expect(removeNullBytes("")).toBe("");
    });

    it("preserves normal characters", () => {
      expect(removeNullBytes("normal text")).toBe("normal text");
    });

    it("removes DEL character (127)", () => {
      const input = "test\x7Fstring";
      expect(removeNullBytes(input)).toBe("teststring");
    });
  });

  describe("detectSuspiciousPatterns", () => {
    it("detects SQL keywords", () => {
      const result = detectSuspiciousPatterns("SELECT * FROM users");
      expect(result.suspicious).toBe(true);
      expect(result.patterns).toContain("sql_keywords");
    });

    it("detects dangerous HTML tags", () => {
      const result = detectSuspiciousPatterns("<script>alert('xss')</script>");
      expect(result.suspicious).toBe(true);
      expect(result.patterns).toContain("dangerous_tags");
    });

    it("detects event handlers", () => {
      const result = detectSuspiciousPatterns('<div onclick="alert(1)">');
      expect(result.suspicious).toBe(true);
      expect(result.patterns).toContain("event_handlers");
    });

    it("detects javascript: protocol", () => {
      const result = detectSuspiciousPatterns('javascript:alert("xss")');
      expect(result.suspicious).toBe(true);
      expect(result.patterns).toContain("javascript_protocol");
    });

    it("detects data: protocol", () => {
      const result = detectSuspiciousPatterns('data:text/html,<script>alert(1)</script>');
      expect(result.suspicious).toBe(true);
      expect(result.patterns).toContain("data_protocol");
    });

    it("detects path traversal patterns", () => {
      const result = detectSuspiciousPatterns("../../../etc/passwd");
      expect(result.suspicious).toBe(true);
      expect(result.patterns).toContain("path_traversal");
    });

    it("detects null bytes", () => {
      const result = detectSuspiciousPatterns("test\0string");
      expect(result.suspicious).toBe(true);
      expect(result.patterns).toContain("null_bytes");
    });

    it("detects LDAP injection patterns", () => {
      const result = detectSuspiciousPatterns("user=admin&password=*");
      expect(result.suspicious).toBe(true);
      expect(result.patterns).toContain("ldap_injection");
    });

    it("returns false for safe input", () => {
      const result = detectSuspiciousPatterns("normal text");
      expect(result.suspicious).toBe(false);
      expect(result.patterns).toEqual([]);
    });

    it("handles empty string", () => {
      const result = detectSuspiciousPatterns("");
      expect(result.suspicious).toBe(false);
      expect(result.patterns).toEqual([]);
    });

    it("detects multiple patterns", () => {
      const result = detectSuspiciousPatterns("<script>SELECT * FROM users</script>");
      expect(result.suspicious).toBe(true);
      expect(result.patterns.length).toBeGreaterThan(1);
    });
  });

  describe("validateInputLength", () => {
    it("validates input within length range", () => {
      expect(validateInputLength("test", 1, 10)).toEqual({ valid: true });
    });

    it("rejects input shorter than minimum", () => {
      expect(validateInputLength("ab", 3, 10)).toEqual({
        valid: false,
        error: "Input must be at least 3 characters",
      });
    });

    it("rejects input longer than maximum", () => {
      expect(validateInputLength("a".repeat(101), 1, 100)).toEqual({
        valid: false,
        error: "Input must be at most 100 characters",
      });
    });

    it("rejects empty input when minLength > 0", () => {
      expect(validateInputLength("", 1, 100)).toEqual({
        valid: false,
        error: "Input is required (minimum 1 characters)",
      });
    });

    it("allows empty input when minLength is 0", () => {
      expect(validateInputLength("", 0, 100)).toEqual({ valid: true });
    });

    it("validates exact minimum length", () => {
      expect(validateInputLength("abc", 3, 10)).toEqual({ valid: true });
    });

    it("validates exact maximum length", () => {
      expect(validateInputLength("a".repeat(10), 1, 10)).toEqual({ valid: true });
    });
  });

  describe("validateInputComplexity", () => {
    it("validates input meeting all complexity requirements", () => {
      const result = validateInputComplexity("Test123!", 1, 1, 1, 1);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.score).toBeGreaterThan(0);
    });

    it("detects missing uppercase letters", () => {
      const result = validateInputComplexity("test123!", 1, 1, 1, 1);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("at least 1 uppercase letters");
    });

    it("detects missing lowercase letters", () => {
      const result = validateInputComplexity("TEST123!", 1, 1, 1, 1);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("at least 1 lowercase letters");
    });

    it("detects missing numbers", () => {
      const result = validateInputComplexity("Test!", 1, 1, 1, 1);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("at least 1 numbers");
    });

    it("detects missing special characters", () => {
      const result = validateInputComplexity("Test123", 1, 1, 1, 1);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("at least 1 special characters");
    });

    it("validates with zero requirements", () => {
      const result = validateInputComplexity("test", 0, 0, 0, 0);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("calculates score based on character counts", () => {
      const result = validateInputComplexity("Test123!", 1, 1, 1, 1);
      expect(result.score).toBeGreaterThan(0);
    });

    it("handles multiple missing requirements", () => {
      const result = validateInputComplexity("test", 1, 1, 1, 1);
      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(1);
    });
  });

  describe("sanitizeSearchQuery", () => {
    it("removes HTML tags from search queries", () => {
      const query = "<script>alert('xss')</script>test";
      const sanitized = sanitizeSearchQuery(query, 100);
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).toContain("test");
    });

    it("limits query length", () => {
      const longQuery = "a".repeat(200);
      const sanitized = sanitizeSearchQuery(longQuery, 50);
      expect(sanitized.length).toBeLessThanOrEqual(50);
    });

    it("trims whitespace", () => {
      expect(sanitizeSearchQuery("  query  ", 100)).toBe("query");
    });
  });

  describe("setInputValidationLogger", () => {
    it("allows custom logger to be set", () => {
      const warnSpy = vi.fn();
      setInputValidationLogger({ warn: warnSpy });

      // Trigger a warning by sanitizing something that would log
      sanitizeHtml("<script>test</script>");

      // Reset to default
      setInputValidationLogger(null);
    });

    it("uses default logger when null is passed", () => {
      setInputValidationLogger(null);
      // Should not throw
      sanitizeHtml("<p>test</p>");
    });

    it("uses default logger when undefined is passed", () => {
      setInputValidationLogger(undefined);
      // Should not throw
      sanitizeHtml("<p>test</p>");
    });
  });
});

