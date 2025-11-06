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
} from "../types";

// Re-export shared constants
export {
    COMMON_CONTENT_TYPES,
    CORS_HEADERS,
    HTTP_STATUS,
    RATE_LIMITER_DEFAULTS,
    REQUEST_SIZE_LIMITS,
    RESPONSE_PAGINATION,
} from "../utils/constants-util";

// Authentication & Signature Verification
export {
    computeHmacSignature,
    extractBearerToken,
    getAuthErrorResponse,
    timingSafeCompare,
    verifyBearerToken,
    verifyHmacSignature,
} from "./auth-validation";

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
} from "./input-validation";

// OAuth Validation
export {
    extractOriginFromState,
    isAllowedOrigin,
    validateOAuthState,
} from "./oauth-validation";

// Rate Limiting & Brute Force Protection
export {
    BruteForceProtection,
    getClientIp,
    getRateLimitExceededResponse,
    getRateLimitHeaders,
    SlidingWindowRateLimiter,
    TokenBucketRateLimiter,
} from "./rate-limit-validation";

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
} from "./request-validation";

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
} from "./api-response-validation";

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
} from "./data-validation";
