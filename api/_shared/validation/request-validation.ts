/**
 * Request Validation Utilities
 * Validates HTTP requests: Content-Type, body size, structure, method, etc.
 * Node.js compatible version
 *
 * Usage:
 * - Content-Type check: validateContentType(request, 'application/json')
 * - Body size check: validateBodySize(body, 10000)
 * - JSON structure: validateJsonStructure(body, schema)
 * - HTTP method: validateHttpMethod(request, 'POST')
 */

import type {
    FullRequestValidationOptions,
    HttpMethod,
    JsonSchema,
    ValidationResult,
} from "../types.ts";
import { REQUEST_SIZE_LIMITS } from "../utils/constants-util.ts";

// ============================================================================
// CONTENT-TYPE VALIDATION
// ============================================================================

/**
 * Validate request Content-Type header
 * @param request - Request object with headers
 * @param allowedTypes - Array of allowed content types
 * @returns Validation result
 */
export function validateContentType(
    request: Record<string, unknown>,
    allowedTypes: string | string[],
): ValidationResult {
    const headers = request.headers as Record<string, string> || {};
    const contentType = headers["content-type"];

    if (!contentType) {
        return {
            valid: false,
            error: "Missing Content-Type header",
        };
    }

    // Parse content type (remove charset and boundary)
    const baseContentType = contentType.split(";")[0].toLowerCase().trim();

    // Convert single type to array for comparison
    const types = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
    const normalizedTypes = types.map((t) => t.toLowerCase());

    if (!normalizedTypes.includes(baseContentType)) {
        return {
            valid: false,
            error: `Invalid Content-Type: ${baseContentType}. Expected: ${
                normalizedTypes.join(", ")
            }`,
            details: {
                received: baseContentType,
                expected: normalizedTypes,
            },
        };
    }

    return { valid: true };
}

/**
 * Check if Content-Type is JSON
 * @param request - Request object with headers
 * @returns true if content type is JSON
 */
export function isJsonContentType(request: Record<string, unknown>): boolean {
    const headers = request.headers as Record<string, string> || {};
    const contentType = headers["content-type"];
    if (!contentType) return false;
    return contentType.toLowerCase().includes("application/json");
}

/**
 * Check if Content-Type is form data
 * @param request - Request object with headers
 * @returns true if content type is form data
 */
export function isFormContentType(request: Record<string, unknown>): boolean {
    const headers = request.headers as Record<string, string> || {};
    const contentType = headers["content-type"];
    if (!contentType) return false;
    const type = contentType.toLowerCase();
    return (
        type.includes("application/x-www-form-urlencoded") ||
        type.includes("multipart/form-data")
    );
}

/**
 * Extract charset from Content-Type header
 * @param request - Request object with headers
 * @returns Charset or 'utf-8' as default
 */
export function getContentTypeCharset(
    request: Record<string, unknown>,
): string {
    const headers = request.headers as Record<string, string> || {};
    const contentType = headers["content-type"];
    if (!contentType) return "utf-8";

    const match = contentType.match(/charset=([^\s;]+)/i);
    return match ? match[1].replace(/["']/g, "") : "utf-8";
}

// ============================================================================
// BODY SIZE VALIDATION
// ============================================================================

/**
 * Validate request body size
 * @param bodyLength - Length of request body in bytes
 * @param maxSize - Maximum allowed size in bytes
 * @returns Validation result
 */
export function validateBodySize(
    bodyLength: number,
    maxSize: number = REQUEST_SIZE_LIMITS.LARGE,
): ValidationResult {
    if (bodyLength <= 0) {
        return {
            valid: false,
            error: "Request body is empty",
        };
    }

    if (bodyLength > maxSize) {
        return {
            valid: false,
            error:
                `Request body exceeds maximum size: ${bodyLength} bytes > ${maxSize} bytes`,
            details: {
                actual: bodyLength,
                max: maxSize,
                formatted: {
                    actual: formatBytes(bodyLength),
                    max: formatBytes(maxSize),
                },
            },
        };
    }

    return { valid: true };
}

/**
 * Get content length from request headers
 * @param request - Request object with headers
 * @returns Content length in bytes or null if not available
 */
export function getContentLength(
    request: Record<string, unknown>,
): number | null {
    const headers = request.headers as Record<string, string> || {};
    const contentLength = headers["content-length"];
    if (!contentLength) return null;

    const length = parseInt(contentLength, 10);
    return isNaN(length) ? null : length;
}

/**
 * Validate content length header
 * @param request - Request object with headers
 * @param maxSize - Maximum allowed size in bytes
 * @returns Validation result
 */
export function validateContentLength(
    request: Record<string, unknown>,
    maxSize: number = REQUEST_SIZE_LIMITS.LARGE,
): ValidationResult {
    const contentLength = getContentLength(request);

    if (contentLength === null) {
        return {
            valid: false,
            error: "Missing Content-Length header",
        };
    }

    return validateBodySize(contentLength, maxSize);
}

/**
 * Format bytes to human-readable format
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

// ============================================================================
// HTTP METHOD VALIDATION
// ============================================================================

/**
 * Validate HTTP method
 * @param request - Request object with method
 * @param allowedMethods - Array of allowed HTTP methods
 * @returns Validation result
 */
export function validateHttpMethod(
    request: Record<string, unknown>,
    allowedMethods: HttpMethod | HttpMethod[],
): ValidationResult {
    const method = String(request.method || "").toUpperCase();

    const allowed = Array.isArray(allowedMethods)
        ? allowedMethods.map((m) => m.toUpperCase())
        : [allowedMethods.toUpperCase()];

    if (!allowed.includes(method)) {
        return {
            valid: false,
            error: `Method not allowed: ${method}. Expected: ${
                allowed.join(", ")
            }`,
            details: {
                received: method,
                expected: allowed,
            },
        };
    }

    return { valid: true };
}

// ============================================================================
// REQUEST STRUCTURE VALIDATION
// ============================================================================

/**
 * Basic JSON structure validation
 * Validates object keys and types match schema
 * @param data - Data to validate
 * @param schema - JSON Schema definition
 * @returns Validation result
 */
export function validateJsonStructure(
    data: unknown,
    schema: JsonSchema,
): ValidationResult {
    const errors: string[] = [];

    // Type validation
    const dataType = getJsonType(data);
    if (dataType !== schema.type) {
        errors.push(`Expected type ${schema.type}, got ${dataType}`);
        return {
            valid: false,
            error: errors.join("; "),
        };
    }

    // Object-specific validation
    if (schema.type === "object" && typeof data === "object" && data !== null) {
        const obj = data as Record<string, unknown>;

        // Check required fields
        if (schema.required) {
            for (const field of schema.required) {
                if (!(field in obj)) {
                    errors.push(`Missing required field: ${field}`);
                }
            }
        }

        // Validate properties
        if (schema.properties) {
            for (const [key, value] of Object.entries(obj)) {
                if (key in schema.properties) {
                    const propSchema = schema.properties[key];
                    const result = validateJsonStructure(value, propSchema);
                    if (!result.valid) {
                        errors.push(`Field '${key}': ${result.error}`);
                    }
                }
            }
        }
    }

    // String-specific validation
    if (schema.type === "string" && typeof data === "string") {
        if (schema.minLength && data.length < schema.minLength) {
            errors.push(
                `String too short: minimum ${schema.minLength} characters`,
            );
        }
        if (schema.maxLength && data.length > schema.maxLength) {
            errors.push(
                `String too long: maximum ${schema.maxLength} characters`,
            );
        }
        if (schema.pattern) {
            const regex = new RegExp(schema.pattern);
            if (!regex.test(data)) {
                errors.push(`String does not match pattern: ${schema.pattern}`);
            }
        }
    }

    // Array-specific validation
    if (schema.type === "array" && Array.isArray(data)) {
        if (schema.minItems && data.length < schema.minItems) {
            errors.push(`Array too short: minimum ${schema.minItems} items`);
        }
        if (schema.maxItems && data.length > schema.maxItems) {
            errors.push(`Array too long: maximum ${schema.maxItems} items`);
        }
        if (schema.items) {
            for (let i = 0; i < data.length; i++) {
                const result = validateJsonStructure(data[i], schema.items);
                if (!result.valid) {
                    errors.push(`Item ${i}: ${result.error}`);
                }
            }
        }
    }

    if (errors.length > 0) {
        return {
            valid: false,
            error: errors.join("; "),
        };
    }

    return { valid: true };
}

/**
 * Get JSON type of a value
 * @param value - Value to check
 * @returns JSON type string
 */
export function getJsonType(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "object";
    return typeof value;
}

/**
 * Validate request is valid JSON
 * @param body - Request body string
 * @returns { valid, data?, error? }
 */
export function validateRequestJson(
    body: string,
): { valid: boolean; data?: unknown; error?: string } {
    if (!body) {
        return {
            valid: false,
            error: "Request body is empty",
        };
    }

    try {
        const data = JSON.parse(body);
        return {
            valid: true,
            data,
        };
    } catch (error) {
        return {
            valid: false,
            error: `Invalid JSON: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }
}

// ============================================================================
// HEADER VALIDATION
// ============================================================================

/**
 * Validate required headers are present
 * @param request - Request object with headers
 * @param requiredHeaders - Array of required header names
 * @returns Validation result
 */
export function validateHeaders(
    request: Record<string, unknown>,
    requiredHeaders: string[],
): ValidationResult {
    const headers = request.headers as Record<string, string> || {};
    const missing: string[] = [];

    for (const header of requiredHeaders) {
        if (!(header.toLowerCase() in headers)) {
            missing.push(header);
        }
    }

    if (missing.length > 0) {
        return {
            valid: false,
            error: `Missing required headers: ${missing.join(", ")}`,
            details: {
                missing,
            },
        };
    }

    return { valid: true };
}

/**
 * Get header value case-insensitively
 * @param request - Request object with headers
 * @param headerName - Header name to get
 * @returns Header value or null if not found
 */
export function getHeader(
    request: Record<string, unknown>,
    headerName: string,
): string | null {
    const headers = request.headers as Record<string, string> || {};
    return headers[headerName.toLowerCase()] || null;
}

/**
 * Check if header exists
 * @param request - Request object with headers
 * @param headerName - Header name to check
 * @returns true if header exists
 */
export function hasHeader(
    request: Record<string, unknown>,
    headerName: string,
): boolean {
    const headers = request.headers as Record<string, string> || {};
    return headerName.toLowerCase() in headers;
}

// ============================================================================
// ORIGIN & REFERER VALIDATION
// ============================================================================

/**
 * Validate Origin header
 * @param request - Request object with headers
 * @param allowedOrigins - Array of allowed origins
 * @returns Validation result
 */
export function validateOrigin(
    request: Record<string, unknown>,
    allowedOrigins: string | string[],
): ValidationResult {
    const origin = getOrigin(request);

    if (!origin) {
        return {
            valid: false,
            error: "Missing Origin header",
        };
    }

    const allowed = Array.isArray(allowedOrigins)
        ? allowedOrigins
        : [allowedOrigins];

    if (!allowed.includes(origin)) {
        return {
            valid: false,
            error: `Origin not allowed: ${origin}`,
            details: {
                received: origin,
                allowed,
            },
        };
    }

    return { valid: true };
}

/**
 * Extract origin from request
 * @param request - Request object with headers
 * @returns Origin URL or null if not available
 */
export function getOrigin(request: Record<string, unknown>): string | null {
    const headers = request.headers as Record<string, string> || {};
    return headers.origin || null;
}

/**
 * Validate request is from same origin
 * @param request - Request object with headers
 * @param baseUrl - Base URL of the application
 * @returns true if origin matches
 */
export function isSameOrigin(
    request: Record<string, unknown>,
    baseUrl: string,
): boolean {
    const origin = getOrigin(request);
    if (!origin) return false;

    try {
        const requestOrigin = new URL(origin).origin;
        const baseOrigin = new URL(baseUrl).origin;
        return requestOrigin === baseOrigin;
    } catch {
        return false;
    }
}

// ============================================================================
// COMPREHENSIVE REQUEST VALIDATION
// ============================================================================

/**
 * Perform comprehensive request validation
 * Validates method, content-type, size, headers, origin, and JSON structure
 * @param request - Request object
 * @param body - Request body as string
 * @param options - Validation options
 * @returns Validation result
 */
export function validateRequest(
    request: Record<string, unknown>,
    body: string,
    options: FullRequestValidationOptions,
): ValidationResult {
    const errors: string[] = [];

    // Validate HTTP method
    if (options.method) {
        const methodResult = validateHttpMethod(request, options.method);
        if (!methodResult.valid) errors.push(methodResult.error!);
    }

    // Validate Content-Type
    if (options.contentType) {
        const ctResult = validateContentType(request, options.contentType);
        if (!ctResult.valid) errors.push(ctResult.error!);
    }

    // Validate body size
    if (options.maxBodySize) {
        const sizeResult = validateBodySize(body.length, options.maxBodySize);
        if (!sizeResult.valid) errors.push(sizeResult.error!);
    }

    // Validate required headers
    if (options.requiredHeaders) {
        const headerResult = validateHeaders(request, options.requiredHeaders);
        if (!headerResult.valid) errors.push(headerResult.error!);
    }

    // Validate Origin
    if (options.validateOrigin) {
        const originResult = validateOrigin(request, options.validateOrigin);
        if (!originResult.valid) errors.push(originResult.error!);
    }

    // Validate JSON structure
    if (options.jsonSchema) {
        const jsonResult = validateRequestJson(body);
        if (!jsonResult.valid) {
            errors.push(jsonResult.error!);
        } else if (jsonResult.data) {
            const schemaResult = validateJsonStructure(
                jsonResult.data,
                options.jsonSchema,
            );
            if (!schemaResult.valid) errors.push(schemaResult.error!);
        }
    }

    if (errors.length > 0) {
        return {
            valid: false,
            error: errors.join("; "),
        };
    }

    return { valid: true };
}
