import type {
  FullRequestValidationOptions,
  JsonSchema,
  ValidationResult,
} from "../types.js";
export const COMMON_CONTENT_TYPES = {
  JSON: "application/json",
  FORM: "application/x-www-form-urlencoded",
  FORM_DATA: "multipart/form-data",
  TEXT: "text/plain",
  HTML: "text/html",
  XML: "application/xml",
  OCTET_STREAM: "application/octet-stream",
} as const;

export const SIZE_LIMITS = {
  SMALL: 1 * 1024,
  MEDIUM: 10 * 1024,
  LARGE: 100 * 1024,
  VERY_LARGE: 1 * 1024 * 1024,
  HUGE: 10 * 1024 * 1024,
} as const;

export function validateContentType(
  request: Request,
  allowedTypes: string | string[],
): ValidationResult {
  const contentType = request.headers.get("content-type");

  if (!contentType) {
    return {
      valid: false,
      error: "Missing Content-Type header",
    };
  }

  const baseContentType = contentType.split(";")[0].toLowerCase().trim();
  const types = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
  const normalizedTypes = types.map((t) => t.toLowerCase());

  if (!normalizedTypes.includes(baseContentType)) {
    return {
      valid: false,
      error: `Invalid Content-Type: ${baseContentType}. Expected: ${normalizedTypes.join(", ")}`,
      details: {
        received: baseContentType,
        expected: normalizedTypes,
      },
    };
  }

  return { valid: true };
}

export function isJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  if (!contentType) return false;
  return contentType.toLowerCase().includes(COMMON_CONTENT_TYPES.JSON);
}

export function isFormContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  if (!contentType) return false;
  const type = contentType.toLowerCase();
  return (
    type.includes(COMMON_CONTENT_TYPES.FORM) ||
    type.includes(COMMON_CONTENT_TYPES.FORM_DATA)
  );
}

export function getContentTypeCharset(request: Request): string {
  const contentType = request.headers.get("content-type");
  if (!contentType) return "utf-8";

  const match = contentType.match(/charset=([^\s;]+)/i);
  return match ? match[1].replace(/["']/g, "") : "utf-8";
}

export function validateBodySize(
  bodyLength: number,
  maxSize: number = SIZE_LIMITS.LARGE,
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
      error: `Request body exceeds maximum size: ${bodyLength} bytes > ${maxSize} bytes`,
      details: {
        actual: bodyLength,
        max: maxSize,
      },
    };
  }

  return { valid: true };
}

export function getContentLength(request: Request): number | null {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return null;

  const length = Number.parseInt(contentLength, 10);
  return Number.isNaN(length) ? null : length;
}

export function validateContentLength(
  request: Request,
  maxSize: number = SIZE_LIMITS.LARGE,
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

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

export function isJsonContentTypeStrict(request: Request): boolean {
  return request.headers.get("content-type")?.toLowerCase() ===
    COMMON_CONTENT_TYPES.JSON;
}

export function getJsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function validateJsonStructure(
  data: unknown,
  schema: JsonSchema,
): ValidationResult {
  const errors: string[] = [];
  const dataType = getJsonType(data);

  if (dataType !== schema.type) {
    errors.push(`Expected type ${schema.type}, got ${dataType}`);
    return { valid: false, error: errors.join("; ") };
  }

  if (schema.type === "object" && typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;

    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, value] of Object.entries(obj)) {
        if (key in schema.properties) {
          const propSchema = schema.properties[key];
          const result = validateJsonStructure(value, propSchema);
          if (!result.valid) {
            errors.push(`Field '${key}': ${result.error ?? "Invalid value"}`);
          }
        }
      }
    }
  }

  if (schema.type === "string" && typeof data === "string") {
    if (schema.minLength && data.length < schema.minLength) {
      errors.push(`String too short: minimum ${schema.minLength} characters`);
    }
    if (schema.maxLength && data.length > schema.maxLength) {
      errors.push(`String too long: maximum ${schema.maxLength} characters`);
    }
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(data)) {
        errors.push(`String does not match pattern: ${schema.pattern}`);
      }
    }
  }

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
          errors.push(`Item ${i}: ${result.error ?? "Invalid value"}`);
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
      error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function validateHeaders(
  request: Request,
  requiredHeaders: string[],
): ValidationResult {
  const missing: string[] = [];

  for (const header of requiredHeaders) {
    if (!request.headers.has(header.toLowerCase())) {
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

export function getHeader(
  request: Request,
  headerName: string,
): string | null {
  return request.headers.get(headerName.toLowerCase());
}

export function hasHeader(request: Request, headerName: string): boolean {
  return request.headers.has(headerName.toLowerCase());
}

export function validateHttpMethod(
  request: Request,
  allowedMethods: string | string[],
): ValidationResult {
  const method = request.method.toUpperCase();

  const allowed = Array.isArray(allowedMethods)
    ? allowedMethods.map((m) => m.toUpperCase())
    : [allowedMethods.toUpperCase()];

  if (!allowed.includes(method)) {
    return {
      valid: false,
      error: `Method not allowed: ${method}. Expected: ${allowed.join(", ")}`,
      details: {
        received: method,
        expected: allowed,
      },
    };
  }

  return { valid: true };
}

export function validateOrigin(
  request: Request,
  allowedOrigins: string | string[],
): ValidationResult {
  const origin = request.headers.get("origin");

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

export function getOrigin(request: Request): string | null {
  return request.headers.get("origin");
}

export function isSameOrigin(request: Request, baseUrl: string): boolean {
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

export function validateRequest(
  request: Request,
  body: string,
  options: FullRequestValidationOptions,
): ValidationResult {
  const errors: string[] = [];

  if (options.method) {
    const methodResult = validateHttpMethod(request, options.method);
    if (!methodResult.valid && methodResult.error) errors.push(methodResult.error);
  }

  if (options.contentType) {
    const ctResult = validateContentType(request, options.contentType);
    if (!ctResult.valid && ctResult.error) errors.push(ctResult.error);
  }

  if (options.maxBodySize) {
    const sizeResult = validateBodySize(body.length, options.maxBodySize);
    if (!sizeResult.valid && sizeResult.error) errors.push(sizeResult.error);
  }

  if (options.requiredHeaders) {
    const headerResult = validateHeaders(request, options.requiredHeaders);
    if (!headerResult.valid && headerResult.error) errors.push(headerResult.error);
  }

  if (options.validateOrigin) {
    const originResult = validateOrigin(request, options.validateOrigin);
    if (!originResult.valid && originResult.error) errors.push(originResult.error);
  }

  if (options.jsonSchema) {
    const jsonResult = validateRequestJson(body);
    if (!jsonResult.valid) {
      if (jsonResult.error) errors.push(jsonResult.error);
    } else if (jsonResult.data) {
      const schemaResult = validateJsonStructure(
        jsonResult.data,
        options.jsonSchema,
      );
      if (!schemaResult.valid && schemaResult.error) {
        errors.push(schemaResult.error);
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

export function validateRequestJsonBody(
  request: Request,
): Promise<{ valid: boolean; data?: unknown; error?: string }> {
  return request
    .text()
    .then((body) => validateRequestJson(body))
    .catch(() => ({
      valid: false,
      error: "Failed to read request body",
    }));
}


