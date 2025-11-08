/**
 * Validation utilities barrel export
 */

// Index files are a weird thing. In regards to functions, they are our
// actual functions that get executed. But in regards to folders, they
// are "barrel" files that just import and export stuff for the folder.
// The common thread here is that index files are always entry points

// Re-export shared types
export type {
    ApiResponse,
    BruteForceEntry,
    ErrorApiResponse,
    FullRequestValidationOptions,
    HmacVerificationResult,
    HttpMethod,
    JsonSchema,
    NumberValidationOptions,
    OAuthStateValidation,
    PaginatedResponse,
    SlidingWindowBucket,
    SlidingWindowConfig,
    StringValidationOptions,
    TokenBucket,
    ValidationResult,
} from "../types.ts";

// Re-export shared constants
export { CORS_HEADERS, HTTP_STATUS } from "../utils/constants-util.ts";

// Re-export content types from request validation
export { COMMON_CONTENT_TYPES } from "./request-validation.ts";

// Authentication & Signature Verification
export {
    computeHmacSignature,
    extractBearerToken,
    getAuthErrorResponse,
    timingSafeCompare,
    verifyBearerToken,
    verifyHmacSignature,
} from "./auth-validation.ts";

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

// OAuth Validation
export {
    extractOriginFromState,
    isAllowedOrigin,
    validateOAuthState,
} from "./oauth-validation.ts";

// Rate Limiting & Brute Force Protection
export {
    BruteForceProtection,
    getClientIp,
    getRateLimitExceededResponse,
    getRateLimitHeaders,
    SlidingWindowRateLimiter,
    TokenBucketRateLimiter,
} from "./rate-limit-validation.ts";

// Request Validation (Content-Type, Body Size, Structure)
export {
    formatBytes,
    getContentLength,
    getContentTypeCharset,
    getHeader,
    getJsonType,
    getOrigin,
    hasHeader,
    isFormContentType,
    isJsonContentType,
    isSameOrigin,
    validateBodySize,
    validateContentLength,
    validateContentType,
    validateHeaders,
    validateHttpMethod,
    validateJsonStructure,
    validateOrigin,
    validateRequest,
    validateRequestJson,
} from "./request-validation.ts";

// API Response Standardization
export {
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
    generateRequestId,
    getStatusText,
    handleCORSPreflight,
    isClientErrorStatus,
    isServerErrorStatus,
    isSuccessStatus,
    parseResponseBody,
    responseToJson,
} from "./api-response-validation.ts";

// Data Type Validation
export {
    isIpAddress,
    isValidEmail,
    isValidIpv4,
    isValidIpv6,
    isValidPhoneNumber,
    isValidUrl,
    isValidUuid,
    isValidUuidV4,
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
