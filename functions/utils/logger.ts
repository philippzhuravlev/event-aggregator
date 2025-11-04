// So this is a util, a helper function that is neither "what to do" (handler) nor 
// "how to connect to an external service" (service). It just does pure logic that 
// either makes sense to compartmentalize or is used in multiple places.

// This could honestly very well be a /service/ or /infrastructure/ file, but since
// it's not really connecting to an external service (like facebook, supabase or
// secret manager) but rather to Supabase's own monitoring stack, it feels
// more like a util. It's also used many, many places across the codebase.

// the error's general structures are info, warning, error, critical and debug

interface LogMetadata {
  [key: string]: any;
}

interface ErrorMetadata extends LogMetadata {
  userId?: string;
  pageId?: string;
}

export const logger = {
  /**
   * Log informational messages
   * @param message - Log message
   * @param metadata - Additional context
   */
  info(message: string, metadata: LogMetadata = {}): void {
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
  warn(message: string, metadata: LogMetadata = {}): void {
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
  error(message: string, error: Error | null = null, metadata: ErrorMetadata = {}): void {
    const errorData: any = {
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
    } else if (error) {
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
  critical(message: string, error: Error, metadata: ErrorMetadata = {}): void {
    const errorData: any = {
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
  debug(message: string, metadata: LogMetadata = {}): void {
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

