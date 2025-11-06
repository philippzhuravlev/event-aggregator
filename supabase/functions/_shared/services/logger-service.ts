import { ErrorMetadata, LogMetadata } from "../types.ts";

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, Supabase and
// secrets manager. The term could also mean like an internal service, e.g.
// authentication or handling tokens, but here we've outsourced it to supabase/meta
// Services should not be confused with "handlers" that do business logic

// Logs make sense - instead of putting all the errors into console.log (actually
// a security risk btw!), you put it into a dedicated service - supabase!
// In Deno/Edge Functions, logging goes to something called "stdout/stderr logs"
// which you can view in the Supabase dashboard under "Logs". The error's general
// structures are info, warning, error, critical and debug

export const logger = {
  /**
   * Log informational messages
   * @param message - Log message
   * @param metadata - Additional context
   */
  info(message: string, metadata: LogMetadata = {}): void {
    console.log(JSON.stringify({
      severity: "INFO",
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
      severity: "WARNING",
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
  error(
    message: string,
    error: Error | null = null,
    metadata: ErrorMetadata = {},
  ): void {
    const errorData: Record<string, unknown> = {
      severity: "ERROR",
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
    const errorData: Record<string, unknown> = {
      severity: "CRITICAL",
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
   * Log debug messages (only in development)
   * @param message - Debug message
   * @param metadata - Additional context
   */
  debug(message: string, metadata: LogMetadata = {}): void {
    const isProduction = Deno.env.get("ENVIRONMENT") === "production";
    if (!isProduction) {
      console.debug(JSON.stringify({
        severity: "DEBUG",
        message,
        ...metadata,
        timestamp: new Date().toISOString(),
      }));
    }
  },
};
