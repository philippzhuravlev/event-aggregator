"use strict";
// So this is a util, a helper function that is neither "what to do" (handler) nor 
// "how to connect to an external service" (service). It just does pure logic that 
// either makes sense to compartmentalize or is used in multiple places.
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logger = {
    /**
     * Log informational messages
     * @param message - Log message
     * @param metadata - Additional context
     */
    info(message, metadata = {}) {
        console.log(JSON.stringify({
            severity: 'INFO',
            message,
            ...metadata,
            timestamp: new Date().toISOString(),
        }));
    },
    /**
     * log warning messages
     * @param message - Warning message
     * @param metadata - Additional context
     */
    warn(message, metadata = {}) {
        console.warn(JSON.stringify({
            severity: 'WARNING',
            message,
            ...metadata,
            timestamp: new Date().toISOString(),
        }));
    },
    /**
     * log errors to Supabase logs
     * @param message - Error message
     * @param error - Error object or metadata
     * @param metadata - Additional context
     */
    error(message, error = null, metadata = {}) {
        const errorData = {
            severity: 'ERROR',
            message,
            ...metadata,
            timestamp: new Date().toISOString(),
        };
        // if the error is an Error object, include the stack trace
        if (error instanceof Error) {
            errorData.error = {
                message: error.message,
                stack: error.stack,
                name: error.name,
            };
        }
        else if (error) {
            errorData.errorDetails = error;
        }
        console.error(JSON.stringify(errorData));
    },
    /**
     * Log critical errors that require immediate attention
     * @param message - Critical error message
     * @param error - Error object
     * @param metadata - Additional context
     */
    critical(message, error, metadata = {}) {
        const errorData = {
            severity: 'CRITICAL',
            message,
            ...metadata,
            timestamp: new Date().toISOString(),
        };
        if (error instanceof Error) {
            errorData.error = {
                message: error.message,
                stack: error.stack,
                name: error.name,
            };
        }
        console.error(JSON.stringify(errorData));
    },
    /**
     * Log debug messages (only in non-production environments)
     * Auto-detects: development or local dev (no NODE_ENV=production)
     * @param message - Debug message
     * @param metadata - Additional context
     */
    debug(message, metadata = {}) {
        // Only log debug when NOT in production
        // In Supabase Edge Functions, NODE_ENV is set to 'production' in production
        // In local development, it's undefined or 'development'
        if (process.env.NODE_ENV !== 'production') {
            console.debug(JSON.stringify({
                severity: 'DEBUG',
                message,
                ...metadata,
                timestamp: new Date().toISOString(),
            }));
        }
    },
};
//# sourceMappingURL=logger.js.map