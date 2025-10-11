import { ErrorReporting } from '@google-cloud/error-reporting';

// So this is a util, a helper function that is neither "what to do" (handler) nor 
// "how to connect to an external service" (service). It just does pure logic that 
// either makes sense to compartmentalize or is used in multiple places.

// This could honestly very well be a /service/ or /infrastructure/ file, but since
// it's not really connecting to an external service (like facebook, firestore or
// secret manager) but rather to Google Cloud's own monitoring stack, it feels
// more like a util. It's also used many, many places across the codebase.

// the error's general sturctures are info, warning, error, critical and debug

// Begin Google Cloud Error Reporting
// This automatically uses your Firebase project credentials 
// Only initialize Error Reporting in production or when explicitly requested
let errors: any = null;

function getErrorReporting() {
  if (!errors && process.env.GCLOUD_PROJECT) {
    // Suppress the NODE_ENV warning in test environments
    const originalEnv = process.env.NODE_ENV;
    if (process.env.NODE_ENV !== 'production') {
      process.env.NODE_ENV = 'production';
    }
    
    try {
      errors = new ErrorReporting({
        projectId: process.env.GCLOUD_PROJECT, // not .env, auto-detected by Google Cloud
        reportMode: 'production', // Set to 'always' for testing, 'production' for prod
        serviceContext: {
          service: 'dtuevent-functions',
          version: process.env.K_REVISION || '1.0.0', // Cloud Functions also provides this
        },
      });
    } finally {
      // Restore original NODE_ENV
      if (originalEnv !== undefined) {
        process.env.NODE_ENV = originalEnv;
      } else {
        delete process.env.NODE_ENV;
      }
    }
  }
  return errors;
}

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
   * log errors and report to Google Cloud Error Reporting
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

    // if the error is an Error object, do the entire stack trace
    if (error instanceof Error) {
      errorData.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
      
      // do the actual report to Google Cloud Error Reporting
      const errorReporting = getErrorReporting();
      if (errorReporting) {
        errorReporting.report(error, {
          user: metadata.userId || metadata.pageId || 'unknown',
          context: JSON.stringify(metadata),
        });
      }
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
      
      // Report critical errors with higher priority
      const errorReporting = getErrorReporting();
      if (errorReporting) {
        errorReporting.report(error, {
          user: metadata.userId || metadata.pageId || 'unknown',
          context: JSON.stringify({ ...metadata, priority: 'CRITICAL' }),
        });
      }
    }

    console.error(JSON.stringify(errorData));
  },

  /**
   * Log debug messages (only in non-production environments)
   * Auto-detects: emulator or local dev (no GCLOUD_PROJECT)
   * @param message - Debug message
   * @param metadata - Additional context
   */
  debug(message: string, metadata: LogMetadata = {}): void {
    // Only log debug when NOT in Google Cloud production
    // The easy and amazing way to do this is thru google's own env 
    // vars which they autodetect; you don't need to set any in .env:
    //   - Local/emulator: GCLOUD_PROJECT is undefined → logs enabled
    //   - Production: GCLOUD_PROJECT is set → logs disabled
    // Note: We use console.debug() directly here (not logger.debug) 
    // because we **are** the logger - we can't call ourselves!
    if (!process.env.GCLOUD_PROJECT || process.env.FUNCTIONS_EMULATOR === 'true') {
      console.debug(JSON.stringify({
        severity: 'DEBUG',
        message,
        ...metadata,
        timestamp: new Date().toISOString(),
      }));
    }
  },
};

