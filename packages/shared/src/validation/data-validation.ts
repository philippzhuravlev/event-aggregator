/**
 * Placeholder for shared data validation helpers.
 */
import type {
  NumberValidationOptions,
  StringValidationOptions,
} from "../types.js";

export interface UrlValidationOptions {
  allowProtocol?: string[];
  requireProtocol?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN =
  /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IPV6_REGEX =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

export function validateString(
  value: unknown,
  options: StringValidationOptions = {},
): { valid: boolean; error?: string } {
  if (typeof value !== "string") {
    return { valid: false, error: "Value is not a string" };
  }

  let str = value;

  if (options.trim) {
    str = str.trim();
  }

  if (!str && !options.allowEmpty) {
    return { valid: false, error: "String cannot be empty" };
  }

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

  if (options.pattern && !options.pattern.test(str)) {
    return {
      valid: false,
      error: `String does not match required pattern: ${options.pattern.source}`,
    };
  }

  return { valid: true };
}

export function validateNumber(
  value: unknown,
  options: NumberValidationOptions = {},
): { valid: boolean; error?: string } {
  const num = typeof value === "string" ? parseFloat(value) : value;

  if (typeof num !== "number" || Number.isNaN(num)) {
    return { valid: false, error: "Value is not a valid number" };
  }

  if (options.integer && !Number.isInteger(num)) {
    return { valid: false, error: "Value must be an integer" };
  }

  if (options.positive && num <= 0) {
    return { valid: false, error: "Value must be positive" };
  }

  if (options.negative && num >= 0) {
    return { valid: false, error: "Value must be negative" };
  }

  if (options.min !== undefined && num < options.min) {
    return { valid: false, error: `Value must be at least ${options.min}` };
  }

  if (options.max !== undefined && num > options.max) {
    return { valid: false, error: `Value must be at most ${options.max}` };
  }

  return { valid: true };
}

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

export function isValidUrl(
  url: string,
  options: UrlValidationOptions = {},
): boolean {
  if (!url || typeof url !== "string") return false;

  try {
    const urlObj = new URL(url);

    if (options.requireProtocol && !urlObj.protocol) {
      return false;
    }

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

export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== "string") return false;
  return PHONE_PATTERN.test(phone.replace(/\s/g, ""));
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

export function isValidUuid(uuid: string): boolean {
  if (!uuid || typeof uuid !== "string") return false;
  return UUID_PATTERN.test(uuid);
}

export function isValidUuidV4(uuid: string): boolean {
  if (!uuid || typeof uuid !== "string") return false;
  return UUID_V4_PATTERN.test(uuid);
}

export function isValidIpv4(ip: string): boolean {
  if (!ip || typeof ip !== "string") return false;

  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    const num = Number.parseInt(part, 10);
    return num >= 0 && num <= 255 && part === String(num);
  });
}

export function isValidIpv6(ip: string): boolean {
  if (!ip || typeof ip !== "string") return false;
  return IPV6_REGEX.test(ip);
}

export function isIpAddress(ip: string): boolean {
  return isValidIpv4(ip) || isValidIpv6(ip);
}

export function validateDate(
  date: unknown,
): { valid: boolean; error?: string } {
  if (date instanceof Date) {
    return Number.isNaN(date.getTime())
      ? { valid: false, error: "Invalid date" }
      : { valid: true };
  }

  if (typeof date === "string") {
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime())
      ? { valid: false, error: "Invalid date string" }
      : { valid: true };
  }

  return { valid: false, error: "Date must be a Date object or string" };
}

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

export function validateBoolean(
  value: unknown,
): { valid: boolean; error?: string } {
  if (typeof value === "boolean") return { valid: true };

  if (typeof value === "string") {
    if (value.toLowerCase() === "true" || value.toLowerCase() === "false") {
      return { valid: true };
    }
  }

  return { valid: false, error: "Value must be a boolean" };
}

export function validateEnum<T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
): { valid: boolean; error?: string } {
  if (typeof value !== "string") {
    return { valid: false, error: "Value must be a string" };
  }

  if (!allowedValues.includes(value)) {
    return {
      valid: false,
      error: `Invalid value. Allowed values: ${allowedValues.join(", ")}`,
    };
  }

  return { valid: true };
}

export function validateArray<T>(
  value: unknown,
  options: {
    minLength?: number;
    maxLength?: number;
    itemValidator?: (item: T) => { valid: boolean; error?: string };
  } = {},
): { valid: boolean; error?: string } {
  if (!Array.isArray(value)) {
    return { valid: false, error: "Value must be an array" };
  }

  if (options.minLength !== undefined && value.length < options.minLength) {
    return {
      valid: false,
      error: `Array must have at least ${options.minLength} items`,
    };
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    return {
      valid: false,
      error: `Array must have at most ${options.maxLength} items`,
    };
  }

  if (options.itemValidator) {
    for (const item of value) {
      const result = options.itemValidator(item as T);
      if (!result.valid) {
        return {
          valid: false,
          error: `Invalid array item: ${result.error ?? "Invalid value"}`,
        };
      }
    }
  }

  return { valid: true };
}

export function maskEmail(email: string): string {
  if (!isValidEmail(email)) return email;
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;
  const maskedLocal =
    localPart.length <= 2
      ? localPart[0] + "*"
      : `${localPart[0]}${"*".repeat(localPart.length - 2)}${
        localPart[localPart.length - 1]
      }`;
  return `${maskedLocal}@${domain}`;
}

export function maskPhone(phone: string): string {
  if (!isValidPhoneNumber(phone)) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

export function isValidJson(value: string): boolean {
  if (typeof value !== "string") return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function validateJson(
  value: unknown,
): { valid: boolean; error?: string } {
  if (typeof value === "string") {
    return isValidJson(value)
      ? { valid: true }
      : { valid: false, error: "Invalid JSON string" };
  }

  if (value !== null && typeof value === "object") {
    try {
      JSON.stringify(value);
      return { valid: true };
    } catch {
      return { valid: false, error: "Value contains non-serializable data" };
    }
  }

  return { valid: false, error: "Value must be a JSON string or object" };
}

