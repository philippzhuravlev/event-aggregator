/**
 * Data Validation Utilities
 * Field-level validators for common data types
 * Reusable validators for type checking, format validation, and constraints
 *
 * Usage:
 * - Email: isValidEmail(email)
 * - URL: isValidUrl(url)
 * - Phone: isValidPhoneNumber(phone)
 * - String: validateString(value, { minLength: 5, maxLength: 100 })
 * - Number: validateNumber(value, { min: 0, max: 100 })
 */

import { NumberValidationOptions, StringValidationOptions } from "../types.ts";

// This used to be called "middleware", which lies in the middle between http request
// and business logic. But since we're using deno in edge functions without a full framework,
// it's not technically "middleware" and more of what middleware usually is 95% of the time:
// validation.

// Data validation is crucial because it ensures that the data we process and store
// is clean, correct, and safe. Invalid or malicious data can lead to bugs etc etc.
// It's a bit of a vague name, sure, but it's about validating the actual data
// we pass, not where it goes (oauth) or how often (rate limiting) etc etc.

// ============================================================================
// STRING VALIDATION
// ============================================================================

/**
 * Validate string against constraints
 * @param value - String to validate
 * @param options - Validation options
 * @returns { valid, error? }
 */
export function validateString(
  value: unknown,
  options: StringValidationOptions = {},
): { valid: boolean; error?: string } {
  if (typeof value !== "string") {
    return { valid: false, error: "Value is not a string" };
  }

  let str = value;

  // Trim if requested
  if (options.trim) {
    str = str.trim();
  }

  // Check if empty
  if (!str && !options.allowEmpty) {
    return { valid: false, error: "String cannot be empty" };
  }

  // Check length constraints
  if (options.minLength && str.length < options.minLength) {
    return {
      valid: false,
      error: `String is too short (minimum ${options.minLength} characters)`,
    };
  }

  if (options.maxLength && str.length > options.maxLength) {
    return {
      valid: false,
      error: `String is too long (maximum ${options.maxLength} characters)`,
    };
  }

  // Check pattern
  if (options.pattern && !options.pattern.test(str)) {
    return {
      valid: false,
      error:
        `String does not match required pattern: ${options.pattern.source}`,
    };
  }

  return { valid: true };
}

// ============================================================================
// NUMBER VALIDATION
// ============================================================================

/**
 * Validate number against constraints
 * @param value - Number to validate
 * @param options - Validation options
 * @returns { valid, error? }
 */
export function validateNumber(
  value: unknown,
  options: NumberValidationOptions = {},
): { valid: boolean; error?: string } {
  const num = typeof value === "string" ? parseFloat(value) : value;

  if (typeof num !== "number" || isNaN(num)) {
    return { valid: false, error: "Value is not a valid number" };
  }

  // Check if integer
  if (options.integer && !Number.isInteger(num)) {
    return { valid: false, error: "Value must be an integer" };
  }

  // Check if positive
  if (options.positive && num <= 0) {
    return { valid: false, error: "Value must be positive" };
  }

  // Check if negative
  if (options.negative && num >= 0) {
    return { valid: false, error: "Value must be negative" };
  }

  // Check minimum
  if (options.min !== undefined && num < options.min) {
    return { valid: false, error: `Value must be at least ${options.min}` };
  }

  // Check maximum
  if (options.max !== undefined && num > options.max) {
    return { valid: false, error: `Value must be at most ${options.max}` };
  }

  return { valid: true };
}

// ============================================================================
// EMAIL VALIDATION
// ============================================================================

/**
 * Basic email regex pattern
 * Not RFC-compliant but practical for most use cases
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * More strict email regex pattern
 * Closer to RFC 5322 (but still simplified)
 */
const STRICT_EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Validate email address
 * @param email - Email to validate
 * @param strict - Use strict RFC-like validation (default: false)
 * @returns { valid, normalized?, error? }
 */
export function validateEmail(
  email: unknown,
  strict: boolean = false,
): { valid: boolean; normalized?: string; error?: string } {
  if (typeof email !== "string") {
    return { valid: false, error: "Email must be a string" };
  }

  const normalized = email.toLowerCase().trim();

  if (!normalized) {
    return { valid: false, error: "Email cannot be empty" };
  }

  const pattern = strict ? STRICT_EMAIL_PATTERN : EMAIL_PATTERN;

  if (!pattern.test(normalized)) {
    return { valid: false, error: "Invalid email format" };
  }

  // Additional checks
  if (normalized.length > 254) {
    return {
      valid: false,
      error: "Email is too long (maximum 254 characters)",
    };
  }

  const [localPart] = normalized.split("@");
  if (localPart.length > 64) {
    return {
      valid: false,
      error: "Email local part is too long (maximum 64 characters)",
    };
  }

  return { valid: true, normalized };
}

/**
 * Check if string is an email
 * @param email - Email to check
 * @returns true if valid email
 */
export function isValidEmail(email: unknown): boolean {
  const result = validateEmail(email);
  return result.valid;
}

// ============================================================================
// URL VALIDATION
// ============================================================================

export interface UrlValidationOptions {
  protocols?: string[];
  allowLocalhost?: boolean;
  allowIp?: boolean;
}

/**
 * Validate URL
 * @param url - URL to validate
 * @param options - Validation options
 * @returns { valid, parsed?, error? }
 */
export function validateUrl(
  url: unknown,
  options: UrlValidationOptions = {},
): {
  valid: boolean;
  parsed?: URL;
  error?: string;
} {
  if (typeof url !== "string") {
    return { valid: false, error: "URL must be a string" };
  }

  try {
    const parsed = new URL(url);

    // Check protocol
    if (options.protocols) {
      const protocol = parsed.protocol.replace(":", "");
      if (!options.protocols.includes(protocol)) {
        return {
          valid: false,
          error: `Invalid protocol: ${protocol}. Expected: ${
            options.protocols.join(", ")
          }`,
        };
      }
    }

    // Check for localhost
    if (
      !options.allowLocalhost && /^localhost|127\.0\.0\.1/.test(parsed.hostname)
    ) {
      return { valid: false, error: "Localhost URLs are not allowed" };
    }

    // Check for IP addresses
    if (!options.allowIp && isIpAddress(parsed.hostname)) {
      return { valid: false, error: "IP addresses are not allowed" };
    }

    return { valid: true, parsed };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Check if string is a valid URL
 * @param url - URL to check
 * @returns true if valid URL
 */
export function isValidUrl(url: unknown): boolean {
  const result = validateUrl(url);
  return result.valid;
}

// ============================================================================
// PHONE NUMBER VALIDATION
// ============================================================================

/**
 * Validate phone number (basic international format)
 * Accepts formats like: +1-555-123-4567, (555) 123-4567, 555-123-4567, etc.
 * @param phone - Phone number to validate
 * @param allowInternational - Allow international format (default: true)
 * @returns { valid, normalized?, error? }
 */
export function validatePhoneNumber(
  phone: unknown,
  allowInternational: boolean = true,
): {
  valid: boolean;
  normalized?: string;
  error?: string;
} {
  if (typeof phone !== "string") {
    return { valid: false, error: "Phone must be a string" };
  }

  // Remove spaces, dashes, parentheses
  const normalized = phone.replace(/[\s\-()]/g, "");

  // Check if it's only digits and optional leading +
  const pattern = allowInternational ? /^\+?\d{7,15}$/ : /^\d{7,15}$/;

  if (!pattern.test(normalized)) {
    return {
      valid: false,
      error: "Invalid phone number format",
    };
  }

  return { valid: true, normalized };
}

/**
 * Check if string is a valid phone number
 * @param phone - Phone to check
 * @returns true if valid phone number
 */
export function isValidPhoneNumber(phone: unknown): boolean {
  const result = validatePhoneNumber(phone);
  return result.valid;
}

// ============================================================================
// DATE VALIDATION
// ============================================================================

export interface DateValidationOptions {
  minDate?: Date;
  maxDate?: Date;
  format?: "ISO" | "timestamp";
}

/**
 * Validate date
 * @param date - Date to validate (Date object, ISO string, or timestamp)
 * @param options - Validation options
 * @returns { valid, parsed?, error? }
 */
export function validateDate(
  date: unknown,
  options: DateValidationOptions = {},
): {
  valid: boolean;
  parsed?: Date;
  error?: string;
} {
  let parsedDate: Date;

  if (date instanceof Date) {
    parsedDate = date;
  } else if (typeof date === "string") {
    // Try ISO format
    parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return { valid: false, error: "Invalid date format" };
    }
  } else if (typeof date === "number") {
    // Timestamp
    parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return { valid: false, error: "Invalid timestamp" };
    }
  } else {
    return {
      valid: false,
      error: "Date must be a Date object, ISO string, or timestamp",
    };
  }

  // Check min date
  if (options.minDate && parsedDate < options.minDate) {
    return {
      valid: false,
      error: `Date must be after ${options.minDate.toISOString()}`,
    };
  }

  // Check max date
  if (options.maxDate && parsedDate > options.maxDate) {
    return {
      valid: false,
      error: `Date must be before ${options.maxDate.toISOString()}`,
    };
  }

  return { valid: true, parsed: parsedDate };
}

/**
 * Validate date is in the future
 * @param date - Date to validate
 * @param minSecondsInFuture - Minimum seconds in the future (default: 0)
 * @returns { valid, error? }
 */
export function validateFutureDate(
  date: unknown,
  minSecondsInFuture: number = 0,
): { valid: boolean; error?: string } {
  const validation = validateDate(date);
  if (!validation.valid) {
    return validation;
  }

  const now = new Date();
  const minTime = now.getTime() + minSecondsInFuture * 1000;

  if (validation.parsed!.getTime() <= minTime) {
    return { valid: false, error: "Date must be in the future" };
  }

  return { valid: true };
}

/**
 * Validate date is in the past
 * @param date - Date to validate
 * @param maxSecondsInPast - Maximum seconds in the past (default: unlimited)
 * @returns { valid, error? }
 */
export function validatePastDate(
  date: unknown,
  maxSecondsInPast?: number,
): { valid: boolean; error?: string } {
  const validation = validateDate(date);
  if (!validation.valid) {
    return validation;
  }

  const now = new Date();

  if (validation.parsed!.getTime() >= now.getTime()) {
    return { valid: false, error: "Date must be in the past" };
  }

  if (maxSecondsInPast !== undefined) {
    const maxTime = now.getTime() - maxSecondsInPast * 1000;
    if (validation.parsed!.getTime() < maxTime) {
      return {
        valid: false,
        error: `Date must be within ${maxSecondsInPast} seconds in the past`,
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// UUID VALIDATION
// ============================================================================

/**
 * UUID v4 regex pattern
 */
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Generic UUID regex pattern (any version)
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate UUID
 * @param uuid - UUID to validate
 * @param version - UUID version (default: any)
 * @returns true if valid UUID
 */
export function isValidUuid(uuid: unknown, version: number = 4): boolean {
  if (typeof uuid !== "string") return false;

  if (version === 4) {
    return UUID_V4_PATTERN.test(uuid);
  }

  return UUID_PATTERN.test(uuid);
}

/**
 * Validate UUID is v4
 * @param uuid - UUID to validate
 * @returns true if valid UUIDv4
 */
export function isValidUuidV4(uuid: unknown): boolean {
  return isValidUuid(uuid, 4);
}

// ============================================================================
// IP ADDRESS VALIDATION
// ============================================================================

/**
 * Check if string is an IPv4 address
 * @param ip - String to check
 * @returns true if valid IPv4
 */
export function isValidIpv4(ip: unknown): boolean {
  if (typeof ip !== "string") return false;

  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255;
  });
}

/**
 * Check if string is an IPv6 address
 * @param ip - String to check
 * @returns true if valid IPv6
 */
export function isValidIpv6(ip: unknown): boolean {
  if (typeof ip !== "string") return false;

  // Simplified IPv6 validation
  const pattern =
    /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  return pattern.test(ip);
}

/**
 * Check if string is an IP address (IPv4 or IPv6)
 * @param ip - String to check
 * @returns true if valid IP
 */
export function isIpAddress(ip: unknown): boolean {
  return isValidIpv4(ip) || isValidIpv6(ip);
}

// ============================================================================
// ARRAY VALIDATION
// ============================================================================

export interface ArrayValidationOptions<T> {
  minLength?: number;
  maxLength?: number;
  validator?: (item: T) => { valid: boolean; error?: string };
}

/**
 * Validate array
 * @param value - Array to validate
 * @param options - Validation options
 * @returns { valid, errors? }
 */
export function validateArray<T = unknown>(
  value: unknown,
  options: ArrayValidationOptions<T> = {},
): {
  valid: boolean;
  errors?: string[];
} {
  if (!Array.isArray(value)) {
    return { valid: false, errors: ["Value is not an array"] };
  }

  const errors: string[] = [];

  // Check length constraints
  if (options.minLength && value.length < options.minLength) {
    errors.push(`Array is too short (minimum ${options.minLength} items)`);
  }

  if (options.maxLength && value.length > options.maxLength) {
    errors.push(`Array is too long (maximum ${options.maxLength} items)`);
  }

  // Validate items
  if (options.validator) {
    value.forEach((item, index) => {
      const result = options.validator!(item);
      if (!result.valid) {
        errors.push(`Item ${index}: ${result.error || "Invalid"}`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ============================================================================
// ENUM VALIDATION
// ============================================================================

/**
 * Validate value is one of allowed values
 * @param value - Value to validate
 * @param allowedValues - Array of allowed values
 * @returns { valid, error? }
 */
export function validateEnum<T>(
  value: unknown,
  allowedValues: T[],
): {
  valid: boolean;
  error?: string;
} {
  if (!allowedValues.includes(value as T)) {
    return {
      valid: false,
      error: `Invalid value. Expected one of: ${
        allowedValues.map((v) => String(v)).join(", ")
      }`,
    };
  }

  return { valid: true };
}

// ============================================================================
// BOOLEAN VALIDATION
// ============================================================================

/**
 * Validate and coerce to boolean
 * Accepts: true, false, 'true', 'false', 1, 0
 * @param value - Value to validate
 * @param strict - If true, only accepts actual booleans
 * @returns { valid, coerced?, error? }
 */
export function validateBoolean(
  value: unknown,
  strict: boolean = false,
): {
  valid: boolean;
  coerced?: boolean;
  error?: string;
} {
  if (typeof value === "boolean") {
    return { valid: true, coerced: value };
  }

  if (strict) {
    return { valid: false, error: "Value must be a boolean" };
  }

  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "true") return { valid: true, coerced: true };
    if (lower === "false") return { valid: true, coerced: false };
  }

  if (typeof value === "number") {
    if (value === 1) return { valid: true, coerced: true };
    if (value === 0) return { valid: true, coerced: false };
  }

  return { valid: false, error: "Value cannot be coerced to boolean" };
}

// ============================================================================
// JSON VALIDATION
// ============================================================================

/**
 * Validate and parse JSON string
 * @param value - String to parse as JSON
 * @returns { valid, parsed?, error? }
 */
export function validateJson(value: unknown): {
  valid: boolean;
  parsed?: unknown;
  error?: string;
} {
  if (typeof value !== "string") {
    return { valid: false, error: "Value must be a string" };
  }

  try {
    const parsed = JSON.parse(value);
    return { valid: true, parsed };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
