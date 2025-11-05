/**
 * Input Validation Utilities
 * Prevents XSS, SQL injection, and other input-based attacks
 *
 * Usage:
 * - XSS prevention: sanitizeHtml(userInput)
 * - SQL injection: sanitizeSql(userInput)
 * - General sanitization: sanitizeInput(userInput, 'email')
 * - Validation: isValidEmail(email)
 */

import { logger } from "../services/logger-service.ts";

// This used to be called "middleware", which lies in the middle between http request
// and business logic. But since we're using deno in edge functions without a full framework,
// it's not technically "middleware" and more of what middleware usually is 95% of the time:
// validation.

// Input validation is super important because user input is often the biggest attack vector.
// Users can try to inject scripts (XSS), SQL commands (SQL injection), or other
// malicious payloads. So we need to sanitize and validate all inputs before
// processing or storing them

// ============================================================================
// XSS PREVENTION
// ============================================================================

/**
 * Dangerous HTML tags and attributes that can be used for XSS attacks
 */
const DANGEROUS_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "applet",
  "meta",
  "link",
  "style",
]);

const DANGEROUS_ATTRIBUTES = new Set([
  "onclick",
  "onload",
  "onerror",
  "onmouseover",
  "onmouseout",
  "onmousemove",
  "onkeydown",
  "onkeyup",
  "onchange",
  "onsubmit",
  "onblur",
  "onfocus",
  "ondblclick",
  "oncontextmenu",
  "onwheel",
  "onscroll",
  "oninput",
  "onpaste",
  "oncopy",
  "oncut",
  "ondrag",
  "ondrop",
  "onunload",
  "onbeforeunload",
  "onpageshow",
  "onpagehide",
  "onpopstate",
  "onhashchange",
  "onanimationstart",
  "onanimationend",
  "ontransitionend",
  // Also include event handlers with colon syntax (sometimes used in older browsers)
  "behavior",
  "expression", // IE specific
  "srcset", // Can lead to XSS via data: URLs
  "data", // data URLs can contain scripts
  "src", // For script/iframe elements
  "href", // Can contain javascript: protocol
]);

/**
 * Sanitize HTML to prevent XSS attacks
 * Removes potentially dangerous tags and attributes using regex-based approach
 * (DOMParser not available in Deno edge functions)
 * @param html - HTML string to sanitize
 * @param allowedTags - Set of allowed tag names (default: common safe tags)
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(
  html: string,
  allowedTags: Set<string> = new Set([
    "p",
    "div",
    "span",
    "b",
    "i",
    "u",
    "strong",
    "em",
    "a",
    "ul",
    "ol",
    "li",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
  ]),
): string {
  if (!html) return "";

  try {
    let sanitized = html;

    // Remove dangerous tags entirely
    for (const tag of DANGEROUS_TAGS) {
      const regex = new RegExp(`</?${tag}[^>]*>`, "gi");
      sanitized = sanitized.replace(regex, "");
    }

    // Remove tags not in allowed list
    sanitized = sanitized.replace(
      /<([a-z]+)([^>]*)>/gi,
      (_match, tag, attrs) => {
        const tagName = tag.toLowerCase();
        if (!allowedTags.has(tagName)) {
          return ""; // Remove tag but keep content
        }

        // Remove dangerous attributes from allowed tags
        let cleanedAttrs = attrs;
        for (const attr of DANGEROUS_ATTRIBUTES) {
          const attrRegex = new RegExp(
            `\\s${attr}\\s*=\\s*["']?[^"'\\s>]*["']?`,
            "gi",
          );
          cleanedAttrs = cleanedAttrs.replace(attrRegex, "");
        }

        // Remove javascript:, vbscript:, and data: protocols from href/src/action/formaction
        const protocolRegex =
          /(\s(?:href|src|data|action|formaction)\s*=\s*)["']?javascript:|vbscript:|data:text\/html/gi;
        cleanedAttrs = cleanedAttrs.replace(protocolRegex, "$1");

        return `<${tag}${cleanedAttrs}>`;
      },
    );

    // Remove closing tags for removed tags
    sanitized = sanitized.replace(/<\/([a-z]+)>/gi, (match, tag) => {
      const tagName = tag.toLowerCase();
      if (DANGEROUS_TAGS.has(tagName) || !allowedTags.has(tagName)) {
        return "";
      }
      return match;
    });

    return sanitized;
  } catch (error) {
    logger.warn("HTML sanitization error", {
      error: error instanceof Error ? error.message : String(error),
      inputLength: html.length,
    });
    // Fallback: escape all HTML
    return escapeHtml(html);
  }
}

/**
 * Escape HTML special characters to prevent XSS
 * Converts <, >, &, ", ' to HTML entities
 * @param text - Text to escape
 * @returns Escaped text safe for HTML display
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

// ============================================================================
// SQL INJECTION PREVENTION
// ============================================================================

/**
 * Sanitize input to prevent SQL injection
 * Uses parameterized query approach (escaping single quotes)
 * NOTE: For production, use actual parameterized queries in your ORM/driver
 * @param input - User input to sanitize
 * @returns Escaped string safe for SQL queries
 */
export function sanitizeSql(input: string): string {
  if (!input) return "";

  // Escape single quotes by doubling them
  return input.replace(/'/g, "''");
}

/**
 * Validate input against SQL keywords (basic prevention)
 * @param input - Input to check
 * @returns true if input appears to contain SQL keywords
 */
export function containsSqlKeywords(input: string): boolean {
  const sqlKeywords = [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "CREATE",
    "ALTER",
    "EXEC",
    "EXECUTE",
    "UNION",
    "DECLARE",
  ];

  const upperInput = input.toUpperCase().trim();

  return sqlKeywords.some((keyword) => {
    // Check if keyword appears as a whole word (not part of another word)
    const regex = new RegExp(`\\b${keyword}\\b`);
    return regex.test(upperInput);
  });
}

// ============================================================================
// GENERAL SANITIZATION
// ============================================================================

/**
 * Sanitize input based on type
 * Applies appropriate sanitization for the input type
 * @param input - Input to sanitize
 * @param type - Type of input ('email', 'url', 'text', 'number', 'alphanumeric')
 * @returns Sanitized input
 */
export function sanitizeInput(
  input: string,
  type: "email" | "url" | "text" | "number" | "alphanumeric" = "text",
): string {
  if (!input) return "";

  let sanitized = input.trim();

  switch (type) {
    case "email":
      // Allow only email-safe characters
      sanitized = sanitized.replace(/[^a-zA-Z0-9._\-+@]/g, "");
      break;

    case "url":
      // Only allow URL-safe characters, basic validation happens elsewhere
      sanitized = sanitized.replace(
        /[^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]/g,
        "",
      );
      break;

    case "number":
      // Allow only numbers, dots, and minus sign
      sanitized = sanitized.replace(/[^0-9.\-]/g, "");
      break;

    case "alphanumeric":
      // Allow only letters, numbers, spaces, and common separators
      sanitized = sanitized.replace(/[^a-zA-Z0-9\s\-_]/g, "");
      break;

    case "text":
    default:
      // For general text, escape HTML and trim
      sanitized = escapeHtml(sanitized);
      break;
  }

  return sanitized;
}

/**
 * Remove null bytes and control characters from input
 * Prevents null byte injection attacks
 * @param input - Input to sanitize
 * @returns Sanitized input
 */
export function removeNullBytes(input: string): string {
  if (!input) return "";
  // Remove null bytes and other control characters
  const result = [];
  for (const char of input) {
    const code = char.charCodeAt(0);
    // Skip null bytes and ASCII control characters (0-31 and 127)
    if ((code >= 0x00 && code <= 0x1F) || code === 0x7F) {
      continue;
    }
    result.push(char);
  }
  return result.join("");
}

/**
 * Check if input contains suspicious patterns
 * Looks for common injection attack patterns
 * @param input - Input to check
 * @returns Object with detection results
 */
export function detectSuspiciousPatterns(input: string): {
  suspicious: boolean;
  patterns: string[];
} {
  const patterns: string[] = [];

  if (!input) return { suspicious: false, patterns };

  // Check for SQL keywords
  if (containsSqlKeywords(input)) {
    patterns.push("sql_keywords");
  }

  // Check for script tags
  if (/<script|<iframe|<object|<embed/i.test(input)) {
    patterns.push("dangerous_tags");
  }

  // Check for event handlers
  if (/on\w+\s*=/i.test(input)) {
    patterns.push("event_handlers");
  }

  // Check for javascript: protocol
  if (/javascript:/i.test(input)) {
    patterns.push("javascript_protocol");
  }

  // Check for data: protocol
  if (/data:text\/html/i.test(input)) {
    patterns.push("data_protocol");
  }

  // Check for common path traversal patterns
  if (/\.\.\/|\.\.\\/.test(input)) {
    patterns.push("path_traversal");
  }

  // Check for null bytes
  if (/\0/.test(input)) {
    patterns.push("null_bytes");
  }

  // Check for LDAP injection patterns
  if (/\*|&|\|/i.test(input) && input.includes("=")) {
    patterns.push("ldap_injection");
  }

  return {
    suspicious: patterns.length > 0,
    patterns,
  };
}

// ============================================================================
// INPUT LENGTH VALIDATION
// ============================================================================

/**
 * Validate input length
 * @param input - Input to validate
 * @param minLength - Minimum allowed length (default: 1)
 * @param maxLength - Maximum allowed length (default: 10000)
 * @returns { valid, error? }
 */
export function validateInputLength(
  input: string,
  minLength: number = 1,
  maxLength: number = 10000,
): { valid: boolean; error?: string } {
  if (!input && minLength > 0) {
    return {
      valid: false,
      error: `Input is required (minimum ${minLength} characters)`,
    };
  }

  if (input.length < minLength) {
    return {
      valid: false,
      error: `Input must be at least ${minLength} characters`,
    };
  }

  if (input.length > maxLength) {
    return {
      valid: false,
      error: `Input must be at most ${maxLength} characters`,
    };
  }

  return { valid: true };
}

/**
 * Validate input complexity (e.g., password strength)
 * @param input - Input to validate
 * @param minUppercase - Minimum uppercase letters (default: 0)
 * @param minLowercase - Minimum lowercase letters (default: 0)
 * @param minNumbers - Minimum digits (default: 0)
 * @param minSpecial - Minimum special characters (default: 0)
 * @returns { valid, score, missing }
 */
export function validateInputComplexity(
  input: string,
  minUppercase: number = 0,
  minLowercase: number = 0,
  minNumbers: number = 0,
  minSpecial: number = 0,
): {
  valid: boolean;
  score: number;
  missing: string[];
} {
  const missing: string[] = [];
  let score = 0;

  // Count character types
  const uppercaseCount = (input.match(/[A-Z]/g) || []).length;
  const lowercaseCount = (input.match(/[a-z]/g) || []).length;
  const numberCount = (input.match(/[0-9]/g) || []).length;
  const specialCount =
    (input.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || [])
      .length;

  // Check each requirement
  if (uppercaseCount >= minUppercase) {
    score += uppercaseCount;
  } else {
    missing.push(`at least ${minUppercase} uppercase letters`);
  }

  if (lowercaseCount >= minLowercase) {
    score += lowercaseCount;
  } else {
    missing.push(`at least ${minLowercase} lowercase letters`);
  }

  if (numberCount >= minNumbers) {
    score += numberCount;
  } else {
    missing.push(`at least ${minNumbers} numbers`);
  }

  if (specialCount >= minSpecial) {
    score += specialCount;
  } else {
    missing.push(`at least ${minSpecial} special characters`);
  }

  return {
    valid: missing.length === 0,
    score,
    missing,
  };
}
