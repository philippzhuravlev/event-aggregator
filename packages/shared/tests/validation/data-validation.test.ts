import { describe, expect, it } from "vitest";
import {
  validateString,
  validateNumber,
  validateUrl,
  validateEmail,
  isValidUuid,
  isValidUuidV4,
} from "../../src/validation/data-validation.ts";

describe("data-validation", () => {
  describe("validateString", () => {
    it("validates a valid string", () => {
      expect(validateString("test")).toEqual({ valid: true });
    });

    it("rejects non-string values", () => {
      expect(validateString(123)).toEqual({
        valid: false,
        error: "Value is not a string",
      });
      expect(validateString(null)).toEqual({
        valid: false,
        error: "Value is not a string",
      });
    });

    it("enforces minimum length", () => {
      expect(validateString("ab", { minLength: 3 })).toEqual({
        valid: false,
        error: "String is too short (minimum 3 characters)",
      });
      expect(validateString("abc", { minLength: 3 })).toEqual({ valid: true });
    });

    it("enforces maximum length", () => {
      expect(validateString("abcd", { maxLength: 3 })).toEqual({
        valid: false,
        error: "String is too long (maximum 3 characters)",
      });
      expect(validateString("abc", { maxLength: 3 })).toEqual({ valid: true });
    });

    it("trims before validation when trim option is set", () => {
      expect(validateString("  abc  ", { trim: true, minLength: 3 })).toEqual({
        valid: true,
      });
    });

    it("rejects empty strings unless allowEmpty is true", () => {
      expect(validateString("")).toEqual({
        valid: false,
        error: "String cannot be empty",
      });
      expect(validateString("", { allowEmpty: true })).toEqual({
        valid: true,
      });
    });

    it("validates against pattern", () => {
      expect(validateString("abc123", { pattern: /^[a-z]+$/ })).toEqual({
        valid: false,
        error: expect.stringContaining("does not match required pattern"),
      });
      expect(validateString("abc", { pattern: /^[a-z]+$/ })).toEqual({
        valid: true,
      });
    });
  });

  describe("validateNumber", () => {
    it("validates a valid number", () => {
      expect(validateNumber(123)).toEqual({ valid: true });
      expect(validateNumber("123")).toEqual({ valid: true });
    });

    it("rejects non-numeric values", () => {
      expect(validateNumber("abc")).toEqual({
        valid: false,
        error: "Value is not a valid number",
      });
      expect(validateNumber(NaN)).toEqual({
        valid: false,
        error: "Value is not a valid number",
      });
    });

    it("enforces integer constraint", () => {
      expect(validateNumber(123.5, { integer: true })).toEqual({
        valid: false,
        error: "Value must be an integer",
      });
      expect(validateNumber(123, { integer: true })).toEqual({ valid: true });
    });

    it("enforces minimum value", () => {
      expect(validateNumber(5, { min: 10 })).toEqual({
        valid: false,
        error: "Value must be at least 10",
      });
      expect(validateNumber(10, { min: 10 })).toEqual({ valid: true });
    });

    it("enforces maximum value", () => {
      expect(validateNumber(15, { max: 10 })).toEqual({
        valid: false,
        error: "Value must be at most 10",
      });
      expect(validateNumber(10, { max: 10 })).toEqual({ valid: true });
    });

    it("enforces positive constraint", () => {
      expect(validateNumber(-5, { positive: true })).toEqual({
        valid: false,
        error: "Value must be positive",
      });
      expect(validateNumber(5, { positive: true })).toEqual({ valid: true });
    });

    it("enforces negative constraint", () => {
      expect(validateNumber(5, { negative: true })).toEqual({
        valid: false,
        error: "Value must be negative",
      });
      expect(validateNumber(-5, { negative: true })).toEqual({ valid: true });
    });
  });

  describe("validateUrl", () => {
    it("validates a valid URL", () => {
      expect(validateUrl("https://example.com")).toEqual({ valid: true });
      expect(validateUrl("http://example.com/path")).toEqual({ valid: true });
    });

    it("rejects invalid URLs", () => {
      expect(validateUrl("not-a-url")).toEqual({
        valid: false,
        error: "Invalid URL",
      });
    });

    it("validates allowed protocols", () => {
      expect(
        validateUrl("https://example.com", { allowProtocol: ["https"] }),
      ).toEqual({ valid: true });
      expect(
        validateUrl("http://example.com", { allowProtocol: ["https"] }),
      ).toEqual({
        valid: false,
        error: "Invalid URL",
      });
    });

    it("requires protocol when requireProtocol is true", () => {
      expect(validateUrl("example.com", { requireProtocol: true })).toEqual({
        valid: false,
        error: "Invalid URL",
      });
    });
  });

  describe("validateEmail", () => {
    it("validates a valid email", () => {
      expect(validateEmail("test@example.com")).toEqual({ valid: true });
      expect(validateEmail("user.name+tag@example.co.uk")).toEqual({
        valid: true,
      });
    });

    it("rejects invalid emails", () => {
      expect(validateEmail("not-an-email")).toEqual({
        valid: false,
        error: "Invalid email address",
      });
      expect(validateEmail("@example.com")).toEqual({
        valid: false,
        error: "Invalid email address",
      });
      expect(validateEmail("test@")).toEqual({
        valid: false,
        error: "Invalid email address",
      });
    });
  });

  describe("isValidUuid", () => {
    it("validates a valid UUID", () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      expect(isValidUuid(uuid)).toBe(true);
    });

    it("validates a valid UUID v4", () => {
      const uuidv4 = "550e8400-e29b-41d4-a716-446655440000";
      expect(isValidUuidV4(uuidv4)).toBe(true);
    });

    it("rejects invalid UUIDs", () => {
      expect(isValidUuid("not-a-uuid")).toBe(false);
      expect(isValidUuid("550e8400-e29b-41d4-a716")).toBe(false);
    });
  });
});

