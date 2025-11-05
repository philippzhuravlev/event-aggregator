/**
 * Validation Utilities Barrel Export
 * Re-exports all validation modules for convenient importing
 */

// Index files are a weird thing. In regards to functions, they are our
// actual functions that get executed. But in regards to folders, they
// are "barrel" files that just import and export stuff for the folder.
// The common thread here is that index files are always entry points

// Authentication & Signature Verification
export {
  extractBearerToken,
  getAuthErrorResponse,
  type HmacVerificationResult,
  timingSafeCompare,
  verifyBearerToken,
  verifyHmacSignature,
} from "./auth-validation.ts";

// Rate Limiting & Brute Force Protection
export {
  BruteForceProtection,
  getClientIp,
  getRateLimitExceededResponse,
  getRateLimitHeaders,
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
} from "./rate-limit-validation.ts";

// OAuth Validation
export {
  extractOriginFromState,
  isAllowedOrigin,
  type OAuthStateValidation,
  validateOAuthState,
} from "./oauth-validation.ts";

// Input Validation (XSS, SQL Injection Prevention)
export {
  containsSqlKeywords,
  detectSuspiciousPatterns,
  escapeHtml,
  removeNullBytes,
  sanitizeHtml,
  sanitizeInput,
  sanitizeSql,
  validateInputComplexity,
  validateInputLength,
} from "./input-validation.ts";

// Request Validation (Content-Type, Body Size, Structure)
export {
  COMMON_CONTENT_TYPES,
  formatBytes,
  type FullRequestValidationOptions,
  getContentLength,
  getContentTypeCharset,
  getHeader,
  getJsonType,
  getOrigin,
  hasHeader,
  type HttpMethod,
  isFormContentType,
  isJsonContentType,
  isSameOrigin,
  type JsonSchema,
  SIZE_LIMITS,
  validateBodySize,
  validateContentLength,
  validateContentType,
  validateHeaders,
  validateHttpMethod,
  validateJsonStructure,
  validateOrigin,
  validateRequest,
  validateRequestJson,
  type ValidationResult,
} from "./request-validation.ts";

// API Response Standardization
export {
  type ApiResponse,
  CORS_HEADERS,
  createBadRequestResponse,
  createConflictResponse,
  createCreatedResponse,
  createErrorResponse,
  createErrorResponseWithHeaders,
  createFieldValidationErrorResponse,
  createForbiddenResponse,
  createInternalErrorResponse,
  createNoContentResponse,
  createNotFoundResponse,
  createPaginatedResponse,
  createServiceUnavailableResponse,
  createSuccessResponse,
  createSuccessResponseWithHeaders,
  createTooManyRequestsResponse,
  createUnauthorizedResponse,
  createValidationErrorResponse,
  type ErrorApiResponse,
  generateRequestId,
  getStatusText,
  handleCORSPreflight,
  HTTP_STATUS,
  isClientErrorStatus,
  isServerErrorStatus,
  isSuccessStatus,
  type PaginatedResponse,
  PAGINATION,
  parseResponseBody,
  responseToJson,
} from "./api-response-validation.ts";

// Data Type Validation
export {
  type ArrayValidationOptions,
  type DateValidationOptions,
  isIpAddress,
  isValidEmail,
  isValidIpv4,
  isValidIpv6,
  isValidPhoneNumber,
  isValidUrl,
  isValidUuid,
  isValidUuidV4,
  type NumberValidationOptions,
  type StringValidationOptions,
  type UrlValidationOptions as DataUrlValidationOptions,
  validateArray,
  validateBoolean,
  validateDate,
  validateEmail,
  validateEnum,
  validateFutureDate,
  validateJson,
  validateNumber,
  validatePastDate,
  validatePhoneNumber,
  validateString,
  validateUrl,
} from "./data-validation.ts";
