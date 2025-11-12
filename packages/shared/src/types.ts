/**
 * Placeholder for shared type exports.
 * Populate with cross-runtime types in subsequent iterations.
 */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
  timestamp: string;
  requestId?: string;
}

export interface PaginatedResponse<T> extends ApiResponse {
  data?: T[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ErrorApiResponse extends ApiResponse {
  error: string;
  errorCode?: string;
  statusCode: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

export interface JsonSchema {
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
}

export interface FullRequestValidationOptions {
  method?: HttpMethod | HttpMethod[];
  contentType?: string | string[];
  maxBodySize?: number;
  requiredHeaders?: string[];
  validateOrigin?: string | string[];
  jsonSchema?: JsonSchema;
}

export interface StringValidationOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowEmpty?: boolean;
  trim?: boolean;
}

export interface NumberValidationOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  positive?: boolean;
  negative?: boolean;
}

export interface HmacVerificationResult {
  valid: boolean;
  computedSignature?: string;
  error?: string;
}

export interface SlidingWindowConfig {
  maxRequests: number;
  windowMs: number;
}

export interface SlidingWindowStatus {
  used: number;
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface TokenBucketState {
  tokens: number;
  lastRefill: number;
}

export interface BruteForceEntry {
  attempts: number;
  lockedUntil?: number;
}

