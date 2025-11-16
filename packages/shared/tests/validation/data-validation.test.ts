import { describe, expect, it } from "vitest";
import {
  validateString,
  validateNumber,
  validateUrl,
  validateEmail,
  isValidUuid,
  isValidUuidV4,
  validatePhoneNumber,
  isValidPhoneNumber,
  isValidIpv4,
  isValidIpv6,
  isIpAddress,
  validateDate,
  validatePastDate,
  validateFutureDate,
  validateBoolean,
  validateEnum,
  validateArray,
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

  describe("validatePhoneNumber", () => {
    it("validates valid phone numbers", () => {
      expect(validatePhoneNumber("+1234567890")).toEqual({ valid: true });
      expect(validatePhoneNumber("(123) 456-7890")).toEqual({ valid: true });
      expect(validatePhoneNumber("123-456-7890")).toEqual({ valid: true });
    });

    it("rejects invalid phone numbers", () => {
      expect(validatePhoneNumber("123")).toEqual({
        valid: false,
        error: "Invalid phone number format",
      });
      expect(validatePhoneNumber("")).toEqual({
        valid: false,
        error: "Phone number is required",
      });
    });

    it("isValidPhoneNumber helper works", () => {
      expect(isValidPhoneNumber("+1234567890")).toBe(true);
      expect(isValidPhoneNumber("invalid")).toBe(false);
    });
  });

  describe("IP Address Validation", () => {
    it("validates IPv4 addresses", () => {
      expect(isValidIpv4("192.168.1.1")).toBe(true);
      expect(isValidIpv4("255.255.255.255")).toBe(true);
      expect(isValidIpv4("0.0.0.0")).toBe(true);
      expect(isValidIpv4("256.1.1.1")).toBe(false);
      expect(isValidIpv4("192.168.1")).toBe(false);
    });

    it("validates IPv6 addresses", () => {
      expect(isValidIpv6("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(true);
      expect(isValidIpv6("::1")).toBe(true);
      expect(isValidIpv6("invalid")).toBe(false);
    });

    it("isIpAddress checks both IPv4 and IPv6", () => {
      expect(isIpAddress("192.168.1.1")).toBe(true);
      expect(isIpAddress("2001:0db8::1")).toBe(true);
      expect(isIpAddress("invalid")).toBe(false);
    });
  });

  describe("validateDate", () => {
    it("validates Date objects", () => {
      expect(validateDate(new Date())).toEqual({ valid: true });
      expect(validateDate(new Date("invalid"))).toEqual({
        valid: false,
        error: "Invalid date",
      });
    });

    it("validates date strings", () => {
      expect(validateDate("2024-01-01")).toEqual({ valid: true });
      expect(validateDate("invalid date")).toEqual({
        valid: false,
        error: "Invalid date string",
      });
    });

    it("rejects non-date values", () => {
      expect(validateDate(123)).toEqual({
        valid: false,
        error: "Date must be a Date object or string",
      });
    });
  });

  describe("validatePastDate", () => {
    it("validates past dates", () => {
      const pastDate = new Date("2020-01-01");
      expect(validatePastDate(pastDate)).toEqual({ valid: true });
    });

    it("rejects future dates", () => {
      const futureDate = new Date("2099-01-01");
      expect(validatePastDate(futureDate)).toEqual({
        valid: false,
        error: "Date must be in the past",
      });
    });
  });

  describe("validateFutureDate", () => {
    it("validates future dates", () => {
      const futureDate = new Date("2099-01-01");
      expect(validateFutureDate(futureDate)).toEqual({ valid: true });
    });

    it("rejects past dates", () => {
      const pastDate = new Date("2020-01-01");
      expect(validateFutureDate(pastDate)).toEqual({
        valid: false,
        error: "Date must be in the future",
      });
    });
  });

  describe("validateBoolean", () => {
    it("validates boolean values", () => {
      expect(validateBoolean(true)).toEqual({ valid: true });
      expect(validateBoolean(false)).toEqual({ valid: true });
    });

    it("validates boolean strings", () => {
      expect(validateBoolean("true")).toEqual({ valid: true });
      expect(validateBoolean("false")).toEqual({ valid: true });
      expect(validateBoolean("TRUE")).toEqual({ valid: true });
    });

    it("rejects non-boolean values", () => {
      expect(validateBoolean("yes")).toEqual({
        valid: false,
        error: "Value must be a boolean",
      });
      expect(validateBoolean(1)).toEqual({
        valid: false,
        error: "Value must be a boolean",
      });
    });
  });

  describe("validateEnum", () => {
    it("validates enum values", () => {
      const allowed = ["red", "green", "blue"] as const;
      expect(validateEnum("red", allowed)).toEqual({ valid: true });
      expect(validateEnum("green", allowed)).toEqual({ valid: true });
    });

    it("rejects invalid enum values", () => {
      const allowed = ["red", "green", "blue"] as const;
      expect(validateEnum("yellow", allowed)).toEqual({
        valid: false,
        error: expect.stringContaining("Invalid value"),
      });
    });

    it("rejects non-string values", () => {
      const allowed = ["red", "green"] as const;
      expect(validateEnum(123, allowed)).toEqual({
        valid: false,
        error: "Value must be a string",
      });
    });
  });

  describe("validateArray", () => {
    it("validates arrays", () => {
      expect(validateArray([1, 2, 3])).toEqual({ valid: true });
    });

    it("rejects non-arrays", () => {
      expect(validateArray("not an array")).toEqual({
        valid: false,
        error: "Value must be an array",
      });
    });

    it("enforces minimum length", () => {
      expect(validateArray([1], { minLength: 2 })).toEqual({
        valid: false,
        error: "Array must have at least 2 items",
      });
    });

    it("enforces maximum length", () => {
      expect(validateArray([1, 2, 3, 4], { maxLength: 3 })).toEqual({
        valid: false,
        error: "Array must have at most 3 items",
      });
    });

    it("validates array items", () => {
      const itemValidator = (item: number) => {
        if (typeof item === "number") {
          return { valid: true };
        }
        return { valid: false, error: "Must be a number" };
      };
      expect(validateArray([1, 2, 3], { itemValidator })).toEqual({
        valid: true,
      });
      expect(validateArray([1, "invalid", 3], { itemValidator })).toEqual({
        valid: false,
        error: expect.stringContaining("Invalid array item"),
      });
    });
  });
});

