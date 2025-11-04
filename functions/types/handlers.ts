// Typescript is called that because its an upgraded version of javascript that has
// types (and much much more). Types (str, bool, null) are structured like interfaces in
// java/c#, but they're just used for "type checking", i.e. the compiler checks that the
// types are correct; the object that is a string is indeed supposed to be a string, etc.

// We've chosen to separate away the types necessary for handlers. This came about because
// in js, we passed the handler objects as "any"; you shouldn't really do that in general, and 
// especially in ts. The whole point of ts is to provide type safety, so we're doing that here.

/**
 * Supabase Functions HTTP Response type
 * We use a minimal interface instead of importing Express Response to avoid version conflicts
 * This covers all methods we actually use in the codebase
 */
export interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: unknown): HttpResponse;
  send(body?: unknown): HttpResponse;
  redirect(url: string): void;
  set(field: string, value: string): HttpResponse;
  headersSent: boolean;
}

/**
 * Authentication middleware signature
 */
export type AuthMiddleware = (req: Request, res: HttpResponse) => Promise<boolean>;

/**
 * Supabase Storage Bucket type
 * Use this instead of 'any' for bucket objects
 */
export type StorageBucket = any;

/**
 * Typed error object
 * Use instead of 'any' in catch blocks
 */
export interface TypedError extends Error {
  message: string;
  code?: string | number;
  stack?: string;
}

/**
 * Type guard to check if error is TypedError
 */
export function isTypedError(error: unknown): error is TypedError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as TypedError).message === 'string'
  );
}

/**
 * Safe error handler - converts unknown errors to typed errors
 */
export function toTypedError(error: unknown): TypedError {
  if (isTypedError(error)) {
    return error;
  }
  
  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
    };
  }
  
  return {
    name: 'UnknownError',
    message: 'An unknown error occurred',
  };
}

/**
 * Handler result types using discriminated unions
 * These provide type safety for operation results
 */
export type HandlerResult<T> = 
  | { success: true; data: T }
  | { success: false; error: TypedError };

/**
 * Create a success result
 */
export function successResult<T>(data: T): HandlerResult<T> {
  return { success: true, data };
}

/**
 * Create an error result
 */
export function errorResult<T>(error: unknown): HandlerResult<T> {
  return { success: false, error: toTypedError(error) };
}

/**
 * Query parameters type helper
 */
export type QueryParams = Record<string, string | string[] | undefined>;

/**
 * Extract query param as string
 */
export function getQueryParam(
  query: QueryParams,
  key: string,
  defaultValue?: string
): string | undefined {
  const value = query[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value || defaultValue;
}

/**
 * Extract query param as boolean
 */
export function getQueryParamBoolean(
  query: QueryParams,
  key: string,
  defaultValue: boolean = false
): boolean {
  const value = getQueryParam(query, key);
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Extract query param as number
 */
export function getQueryParamNumber(
  query: QueryParams,
  key: string,
  defaultValue?: number
): number | undefined {
  const value = getQueryParam(query, key);
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

