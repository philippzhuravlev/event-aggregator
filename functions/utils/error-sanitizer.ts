// So this is a util, a helper function that is neither "what to do" (handler) nor 
// "how to connect to an external service" (service). It just does pure logic that 
// either makes sense to compartmentalize or is used in multiple places.

// Errors are actually rich objects in JS/TS, with properties like message, name, stack, cause, etc.
// the usual thing to do when you wanna log an error or send it back thru e.g. http, you can send
// the entire json object. But that can leak sensitive info, e.g. if the error message contains
// an access token or api key or something. So this util sanitizes error message by e.g. redacting
// tokens, keys, secrets, passwords etc, or removing entire stack traces in production etc etc
// (which yk stack traces can be super useful for debugging but can reveal our entire structure)

/**
 * Sanitize error messages to prevent information leakage
 * Removes or redacts sensitive information like tokens, keys, secrets, passwords
 * @param message - Original error message
 * @returns Sanitized error message safe for client responses
 */
export function sanitizeErrorMessage(message: string): string {
  // Self-explanatory. How this actually works is by trying to match text ("regex")
  // to find sensitive information in the error message and replace it with a placeholder.
  // examples of sensitive info can be access tokens, api keys, secrets, passwords, emails etc
  // all of which is just replaced with "REDACTED" - ez
  if (!message || typeof message !== 'string') { 
    return 'An error occurred';
  }

  const sanitized = message
    // Token patterns
    .replace(/token[=:]\s*[\w\-._~]+/gi, 'token=REDACTED')
    .replace(/bearer\s+[\w\-._~]+/gi, 'bearer REDACTED')
    .replace(/authorization[=:]\s*[\w\-._~]+/gi, 'authorization=REDACTED')
    
    // API key patterns
    .replace(/key[=:]\s*[\w\-._~]+/gi, 'key=REDACTED')
    .replace(/api[-_]?key[=:]\s*[\w\-._~]+/gi, 'api_key=REDACTED')
    
    // Secret patterns
    .replace(/secret[=:]\s*[\w\-._~]+/gi, 'secret=REDACTED')
    .replace(/app[-_]?secret[=:]\s*[\w\-._~]+/gi, 'app_secret=REDACTED')
    
    // Password patterns
    .replace(/password[=:]\s*[\w\-._~]+/gi, 'password=REDACTED')
    .replace(/pass[=:]\s*[\w\-._~]+/gi, 'pass=REDACTED')
    
    // Email patterns (optional - remove if emails should be visible)
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, 'EMAIL_REDACTED')
    
    // Path patterns that might contain sensitive info
    .replace(/\/projects\/[^\/\s]+\/secrets\/[^\s,)]+/gi, '/projects/PROJECT_ID/secrets/SECRET_NAME')
    
    // Facebook-specific patterns
    .replace(/access_token[=:]\s*[\w\-._~]+/gi, 'access_token=REDACTED')
    .replace(/code[=:]\s*[\w\-._~]+/gi, 'code=REDACTED');
  
  return sanitized;
}

/**
 * Sanitize an entire error object for safe logging/response
 * Extracts message and sanitizes it, returns safe error object
 * @param error - Error object (any type)
 * @returns Sanitized error object with message property
 */
export function sanitizeError(error: any): { message: string; type?: string } { 
  // whereas the first method far above redacts sensitive info (tokens, API keys etc), 
  // this method extracts the message from an error object and "sanitizes" it;
  // this means it will redact sensitive info but also ensure it's a string
  // and not e.g. undefined or null or an object or something otherwise quite weird innit

  if (!error) {
    return { message: 'An unknown error occurred' };
  }

  // Extract error message
  let message = '';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else if (error.message) {
    message = error.message;
  } else {
    message = String(error);
  }

  // Sanitize and return
  return {
    message: sanitizeErrorMessage(message),
    type: error.constructor?.name,
  };
}

/**
 * Create a safe error response object for HTTP responses
 * Includes timestamp and sanitized error information
 * @param error - Error object
 * @param includeDetails - Whether to include error details (e.g., in development)
 * @returns Safe error response object
 */
export function createErrorResponse(
  error: any, 
  includeDetails: boolean = false
): {
  success: false;
  error: string;
  timestamp: string;
  details?: string;
} {
  // this is the full function that uses the above two methods to create
  // a full error object. Like usual, we send it thru a so-called http "response"
  // (also an object), that usually has plenty of properties, but we will only
  // include the safest ones. We're like "trimming" away the potentially dangerous stuff.
  
  const sanitized = sanitizeError(error); 
  
  const response: { // here we're putting these things from the response http object → ...
    success: false;
    error: string;
    timestamp: string;
    details?: string;
  } = {             // ... → in here
    success: false,
    // Return the sanitized message so tests (and callers) receive a meaningful error
    error: sanitized.message || 'An error occurred',
    timestamp: new Date().toISOString(),
  };

  // include sanitized details only if requested (e.g., development mode)
  if (includeDetails) {
    response.details = sanitized.message;
  }

  return response;
}
