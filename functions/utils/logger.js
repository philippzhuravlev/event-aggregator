const { ErrorReporting } = require('@google-cloud/error-reporting');

// So this is a util, a helper function that is neither "what to do" (handler) nor 
// "how to connect to an external service" (service). It just does pure logic that 
// either makes sense to compartmentalize or is used in multiple places.

// This could honestly very well be a /service/ or /infrastructure/ file, but since
// it's not really connecting to an external service (like facebook, firestore or
// secret manager) but rather to Google Cloud's own monitoring stack, it feels
// more like a util. It's also used many, many places across the codebase.

// Begin Google Cloud Error Reporting
// This automatically uses your Firebase project credentials 
const errors = new ErrorReporting({
  projectId: process.env.GCLOUD_PROJECT,
  reportMode: 'production', // Set to 'always' for testing, 'production' for prod
  serviceContext: {
    service: 'dtuevent-functions',
    version: process.env.K_REVISION || '1.0.0', // Cloud Functions provides this
  },
});

const logger = {
  /**
   * Log informational messages
   * @param {string} message - Log message
   * @param {Object} metadata - Additional context
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
   * @param {string} message - Warning message
   * @param {Object} metadata - Additional context
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
   * log errors and report to Google Cloud Error Reporting
   * @param {string} message - Error message
   * @param {Error|Object} error - Error object or metadata
   * @param {Object} metadata - Additional context
   */
  error(message, error = null, metadata = {}) {
    const errorData = {
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
      errors.report(error, {
        user: metadata.userId || metadata.pageId || 'unknown',
        context: JSON.stringify(metadata),
      });
    } else if (error) {
      errorData.errorDetails = error;
    }

    console.error(JSON.stringify(errorData));
  },

  /**
   * Log critical errors that require immediate attention
   * @param {string} message - Critical error message
   * @param {Error} error - Error object
   * @param {Object} metadata - Additional context
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
      
      // Report critical errors with higher priority
      errors.report(error, {
        user: metadata.userId || metadata.pageId || 'unknown',
        context: JSON.stringify({ ...metadata, priority: 'CRITICAL' }),
      });
    }

    console.error(JSON.stringify(errorData));
  },

  /**
   * Log debug messages (only in development)
   * @param {string} message - Debug message
   * @param {Object} metadata - Additional context
   */
  debug(message, metadata = {}) {
    if (process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'development') {
      console.debug(JSON.stringify({
        severity: 'DEBUG',
        message,
        ...metadata,
        timestamp: new Date().toISOString(),
      }));
    }
  },
};

module.exports = { logger };
