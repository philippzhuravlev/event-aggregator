import { z } from 'zod'; // a nice and simple schema validation library for TypeScript from Node

// So what are "schemas"? They're kind of like "types" in that they define the shape of data, but instead of just defining
// the type (string, number, boolean etc), they define the structure of the data itself, so we can be sure it fits nicely
// in our database and doesn't have missing fields etc. We often pass the entire schema as a parameter to functions that
// need to validate data, a pattern called "dependency injection". Its similar to how we pass "req" and "object" as params.
// It might look like: const validation = validateQueryParams(req, cleanupEventsQuerySchema);

// The schema below handles the callback when you click "Connect with Facebook" and Facebook redirects to its OAuth site (
// and its endpoints) and back to us. Here, we need to validate the query parameters Facebook sends us back, including
// the "code" (authorization code) that's put into the URL query parameters, which is the code that'll authorize us to 
// pull from facebook's API on behalf of the user. This code is short-lived and one-time use only. There's also the "state" 
// param, which notes whether the request is legitimate and from us; this prevents so-called "cross-site request forgery", 
// where someone sends to code to their evil site. Also handles error cases where user denies permission etc.

/**
 * OAuth callback query parameters schema
 * Validates Facebook OAuth redirect parameters
 */
export const oauthCallbackQuerySchema = z.object({
  // When Facebook redirects back to us after user login/consent, it sends the following query parameters:
  code: z // the code that's in the http url we'll use to get the access token
    .string() // it's a string
    .regex(/^[\w\-._~]+$/, 'Invalid authorization code format') // must be 0-9, a-z, A-Z, - . _ ~
    .optional() // it's optional because if user denies permission, there's no code
    .describe('Authorization code from Facebook'), // add this lil description for documentation
  
  error: z // if user denies permission, Facebook sends an error param instead of code
    .string() // it's a string
    .optional() // it's optional because if user consents, there's no error
    .describe('Error message from Facebook OAuth'), // also a lil description for documentation
  
  error_reason: z // reason for error, if any
    .string() // you get the idea; it's a string, it's optional, and we add a description etc etc
    .optional()
    .describe('Reason for OAuth error'),
  
  error_description: z // detailed error description, if any
    .string()
    .optional()
    .describe('Detailed error description'),
  
  state: z // state param to open and close the request, preventing someone sending the code to another (evil) site
    .string() 
    .url('Invalid state parameter - must be a valid URL') // must be a valid URL 
    .optional() // it's optional because technically it could be missing
    .describe('State parameter for preventing CSRF attacks'), // description for documentation
}).refine( // .refine() is a zod method to add custom validation logic. Bit like .pipe() but for custom stuff
  (data) => data.code || data.error, // Here we say either "code" or "error" must be present
  {
    message: 'Either code or error parameter must be present',
  }
).describe('OAuth callback query parameters');

export type OAuthCallbackQuery = z.infer<typeof oauthCallbackQuerySchema>;