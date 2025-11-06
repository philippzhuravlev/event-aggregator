/**
 * Data Validation Utilities
 * Field-level validators for common data types
 * Node.js compatible version
 *
 * Usage:
 * - Email: isValidEmail(email)
 * - URL: isValidUrl(url)
 * - Phone: isValidPhoneNumber(phone)
 * - String: validateString(value, { minLength: 5, maxLength: 100 })
 * - Number: validateNumber(value, { min: 0, max: 100 })
 */

import type {
    NumberValidationOptions,
    StringValidationOptions,
} from "../types";

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
            error:
                `String is too short (minimum ${options.minLength} characters)`,
        };
    }

    if (options.maxLength && str.length > options.maxLength) {
        return {
            valid: false,
            error:
                `String is too long (maximum ${options.maxLength} characters)`,
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email address (basic validation)
 * @param email - Email to validate
 * @returns true if valid email
 */
export function isValidEmail(email: string): boolean {
    if (!email || typeof email !== "string") return false;
    return EMAIL_PATTERN.test(email.toLowerCase());
}

export function validateEmail(
    email: string,
): { valid: boolean; error?: string } {
    if (!email) {
        return { valid: false, error: "Email is required" };
    }

    if (typeof email !== "string") {
        return { valid: false, error: "Email must be a string" };
    }

    if (!isValidEmail(email)) {
        return { valid: false, error: "Invalid email address" };
    }

    return { valid: true };
}

// ============================================================================
// URL VALIDATION
// ============================================================================

export interface UrlValidationOptions {
    allowProtocol?: string[];
    requireProtocol?: boolean;
}

/**
 * Validate URL
 * @param url - URL to validate
 * @param options - Validation options
 * @returns true if valid URL
 */
export function isValidUrl(
    url: string,
    options: UrlValidationOptions = {},
): boolean {
    if (!url || typeof url !== "string") return false;

    try {
        const urlObj = new URL(url);

        // Check protocol if specified
        if (options.allowProtocol) {
            const protocol = urlObj.protocol.replace(":", "");
            if (!options.allowProtocol.includes(protocol)) {
                return false;
            }
        }

        return true;
    } catch {
        return false;
    }
}

export function validateUrl(
    url: string,
    options: UrlValidationOptions = {},
): { valid: boolean; error?: string } {
    if (!url) {
        return { valid: false, error: "URL is required" };
    }

    if (typeof url !== "string") {
        return { valid: false, error: "URL must be a string" };
    }

    if (!isValidUrl(url, options)) {
        return { valid: false, error: "Invalid URL" };
    }

    return { valid: true };
}

// ============================================================================
// PHONE NUMBER VALIDATION
// ============================================================================

/**
 * Basic phone number validation
 * Accepts formats with digits, spaces, dashes, +, (, )
 * @param phone - Phone number to validate
 * @returns true if valid phone number
 */
export function isValidPhoneNumber(phone: string): boolean {
    if (!phone || typeof phone !== "string") return false;

    // Allow digits, spaces, dashes, +, (, ), dot, and x (for extension)
    const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
    return phoneRegex.test(phone.replace(/\s/g, ""));
}

export function validatePhoneNumber(
    phone: string,
): { valid: boolean; error?: string } {
    if (!phone) {
        return { valid: false, error: "Phone number is required" };
    }

    if (typeof phone !== "string") {
        return { valid: false, error: "Phone number must be a string" };
    }

    if (!isValidPhoneNumber(phone)) {
        return { valid: false, error: "Invalid phone number format" };
    }

    return { valid: true };
}

// ============================================================================
// UUID VALIDATION
// ============================================================================

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate UUID (any version)
 * @param uuid - UUID to validate
 * @returns true if valid UUID
 */
export function isValidUuid(uuid: string): boolean {
    if (!uuid || typeof uuid !== "string") return false;
    return UUID_PATTERN.test(uuid);
}

/**
 * Validate UUID v4 specifically
 * @param uuid - UUID to validate
 * @returns true if valid UUIDv4
 */
export function isValidUuidV4(uuid: string): boolean {
    if (!uuid || typeof uuid !== "string") return false;
    return UUID_V4_PATTERN.test(uuid);
}

// ============================================================================
// IP ADDRESS VALIDATION
// ============================================================================

/**
 * Validate IPv4 address
 * @param ip - IP address to validate
 * @returns true if valid IPv4
 */
export function isValidIpv4(ip: string): boolean {
    if (!ip || typeof ip !== "string") return false;

    const parts = ip.split(".");
    if (parts.length !== 4) return false;

    return parts.every((part) => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255 && part === String(num);
    });
}

/**
 * Validate IPv6 address (basic validation)
 * @param ip - IP address to validate
 * @returns true if valid IPv6
 */
export function isValidIpv6(ip: string): boolean {
    if (!ip || typeof ip !== "string") return false;

    // Basic IPv6 validation using regex
    const ipv6Regex =
        /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

    return ipv6Regex.test(ip);
}

/**
 * Validate IP address (IPv4 or IPv6)
 * @param ip - IP address to validate
 * @returns true if valid IP
 */
export function isIpAddress(ip: string): boolean {
    return isValidIpv4(ip) || isValidIpv6(ip);
}

// ============================================================================
// DATE VALIDATION
// ============================================================================

export interface DateValidationOptions {
    format?: string;
}

/**
 * Validate date
 * @param date - Date to validate
 * @returns { valid, error? }
 */
export function validateDate(
    date: unknown,
): { valid: boolean; error?: string } {
    if (date instanceof Date) {
        return !isNaN(date.getTime())
            ? { valid: true }
            : { valid: false, error: "Invalid date" };
    }

    if (typeof date === "string") {
        const parsed = new Date(date);
        return !isNaN(parsed.getTime())
            ? { valid: true }
            : { valid: false, error: "Invalid date string" };
    }

    return { valid: false, error: "Date must be a Date object or string" };
}

/**
 * Validate that date is in the past
 * @param date - Date to validate
 * @returns { valid, error? }
 */
export function validatePastDate(
    date: unknown,
): { valid: boolean; error?: string } {
    const dateResult = validateDate(date);
    if (!dateResult.valid) return dateResult;

    const dateObj = date instanceof Date ? date : new Date(String(date));
    const now = new Date();

    if (dateObj >= now) {
        return { valid: false, error: "Date must be in the past" };
    }

    return { valid: true };
}

/**
 * Validate that date is in the future
 * @param date - Date to validate
 * @returns { valid, error? }
 */
export function validateFutureDate(
    date: unknown,
): { valid: boolean; error?: string } {
    const dateResult = validateDate(date);
    if (!dateResult.valid) return dateResult;

    const dateObj = date instanceof Date ? date : new Date(String(date));
    const now = new Date();

    if (dateObj <= now) {
        return { valid: false, error: "Date must be in the future" };
    }

    return { valid: true };
}

// ============================================================================
// GENERIC VALIDATORS
// ============================================================================

/**
 * Validate boolean
 * @param value - Value to validate
 * @returns { valid, error? }
 */
export function validateBoolean(
    value: unknown,
): { valid: boolean; error?: string } {
    if (typeof value !== "boolean") {
        return { valid: false, error: "Value must be a boolean" };
    }
    return { valid: true };
}

/**
 * Validate enum value
 * @param value - Value to validate
 * @param allowedValues - Array of allowed values
 * @returns { valid, error? }
 */
export function validateEnum(
    value: unknown,
    allowedValues: unknown[],
): { valid: boolean; error?: string } {
    if (!allowedValues.includes(value)) {
        return {
            valid: false,
            error: `Value must be one of: ${allowedValues.join(", ")}`,
        };
    }
    return { valid: true };
}

/**
 * Validate array
 * @param value - Value to validate
 * @param options - Validation options
 * @returns { valid, error? }
 */
export function validateArray(
    value: unknown,
    options: { minLength?: number; maxLength?: number } = {},
): { valid: boolean; error?: string } {
    if (!Array.isArray(value)) {
        return { valid: false, error: "Value must be an array" };
    }

    if (options.minLength && value.length < options.minLength) {
        return {
            valid: false,
            error: `Array must have at least ${options.minLength} items`,
        };
    }

    if (options.maxLength && value.length > options.maxLength) {
        return {
            valid: false,
            error: `Array must have at most ${options.maxLength} items`,
        };
    }

    return { valid: true };
}

/**
 * Validate JSON string
 * @param value - Value to validate
 * @returns { valid, error?, parsed? }
 */
export function validateJson(
    value: unknown,
): { valid: boolean; error?: string; parsed?: unknown } {
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
