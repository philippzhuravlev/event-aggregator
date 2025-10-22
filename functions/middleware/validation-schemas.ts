import { z, ZodSchema } from 'zod';
import { Request } from 'firebase-functions/v2/https';
import { logger } from '../utils/logger';

// So in the broadest sense middleware is any software that works between 
// apps and services etc. Usually that means security, little "checkpoints"

// I am well aware that there's already a file called validation.ts, but that's because the word "validation" means something 
// slightly different in this context. There, it's about validating OAuth - are you the right guy? Here, it's about validating
// the data itself. This is done with Zod, a Node library that lets us define "schemas" for data (like "this is what a valid
// facebook event looks like, this is the right fields and format etc". This file is for validating the data inside schemas;
// the schemas themselves (found in functions/schemas/) are often related to API/HTTP endpoints, e.g. "this is what the query
// parameters for /get-events look like".

/**
 * Validation result interface
 */
export interface ValidationResult<T> {
  // remember - TS/JS interfaces are just for type checking. Here we're defining what a good validation result looks like
  // also, remember T in adv programming? reminder: it's a generic type parameter, meaning it can be any type (str, bool, obj etc)
  success: boolean; // has to be a bool tho
  data?: T; // ? = optional field. 
  errors?: string[];
}

/**
 * Validate request query parameters against a Zod schema
 * @param req - HTTP request object
 * @param schema - Zod schema to validate against
 * @returns Validation result with parsed data or errors
 */
export function validateQueryParams<T>(
  req: Request, // the HTTP request object, which contains fields and methods related to urls and endpoints etc
  schema: ZodSchema<T> // a Zod schema object, which defines the shape of the data we want to validate against
): ValidationResult<T> { // here, we say the function returns a ValidationResult object of type T
  try {
    const parsed = schema.parse(req.query); // first, we start by parsing using Zod schema's parse() method
    return { // and hope to return:
      success: true,
      data: parsed,
    }; // note that we're using the "ValidationResult" interface defined above. "parsed" is the validated data
  } catch (error) {
    // but if something went wrong:
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err) => { // we map over the issues array in the ZodError object
        const path = err.path.join('.'); // join the path array into a string with dots
        return `${path}: ${err.message}`; // we format the error messages nicely
      });
      
      // log if error
      logger.warn('Query parameter validation failed', {
        path: req.path,
        errors,
        query: req.query,
      });
      
      return {
        success: false,
        errors,
      };
    }
    
    // also log smth unexpected
    logger.error('Unexpected validation error', error as Error);
    return {
      success: false,
      errors: ['Validation failed due to unexpected error'],
    };
  }
}

/**
 * Validate request body against a Zod schema
 * @param req - HTTP request object
 * @param schema - Zod schema to validate against
 * @returns Validation result with parsed data or errors
 */
export function validateBody<T>( // T = generic type, so anything from str to bool to an obj etc
  req: Request, // again, the HTTP request object with urls/endpoint methods
  schema: ZodSchema<T>  // the Zod schema object we're validating against
): ValidationResult<T> { // the output
  try {
    const parsed = schema.parse(req.body); // 1. parse the body using Zod schema's parse() method
    return { // 2A. if successful, return:
      success: true,
      data: parsed,
    };
  } catch (error) { // 2B. if error:
    if (error instanceof z.ZodError) {
      // format the error nicely
      const errors = error.issues.map((err) => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });
      
      // log the error
      logger.warn('Request body validation failed', {
        path: req.path,
        errors,
      });

      // return the formatted errors
      return {
        success: false,
        errors,
      };
    }
    
    // also log unexpected errors
    logger.error('Unexpected validation error', error as Error);
    return {
      success: false,
      errors: ['Validation failed due to unexpected error'],
    };
  }
}

/**
 * Express-style middleware wrapper for Zod validation
 * Validates query params and sends 400 response if invalid
 * @param schema - Zod schema to validate against
 * @returns Middleware function
 */
export function validateQueryMiddleware<T>(schema: ZodSchema<T>) {
  return (req: Request, res: any, next: () => void) => {
    const result = validateQueryParams(req, schema);
    
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.errors,
      });
      return;
    }
    
    // Attach validated data to request for handlers to use
    (req as any).validatedQuery = result.data;
    next();
  };
}

/**
 * Validates request body and sends 400 response if invalid
 * @param schema - Zod schema to validate against
 * @returns Middleware function
 */
export function validateBodyMiddleware<T>(schema: ZodSchema<T>) { 
  return (req: Request, res: any, next: () => void) => {
    const result = validateBody(req, schema);
    
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.errors,
      });
      return;
    }
    
    // Attach validated data to request for handlers to use
    (req as any).validatedBody = result.data;
    next();
  };
}
