import { describe, expect, it, vi } from "vitest";
import {
  sanitizeHtml,
  sanitizeSearchQuery,
  setInputValidationLogger,
} from "../../src/validation/input-validation.ts";

describe("input-validation", () => {
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

    it("handles empty input", () => {
      expect(sanitizeHtml("")).toBe("");
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
  });
});

