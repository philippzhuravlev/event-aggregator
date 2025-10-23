import { z } from 'zod'; // a nice and simple schema validation library for TypeScript from Node

// So what are "schemas"? They're kind of like "types" in that they define the shape of data, but instead of just defining
// the type (string, number, boolean etc), they define the structure of the data itself, so we can be sure it fits nicely
// in our database and doesn't have missing fields etc. We often pass the entire schema as a parameter to functions that
// need to validate data, a pattern called "dependency injection". Its similar to how we pass "req" and "object" as params.
// It might look like: const validation = validateQueryParams(req, cleanupEventsQuerySchema);

// The schema below defines the structure of Facebook webhook requests. Webhooks in general is a way to query services for
// only the __changes__ done, and receive real-time updates. In Facebook's case, we can set up a webhook to notify us
// whenever something changes on a Facebook Page we manage, e.g. new events created, events updated/deleted etc. This way,
// we don't have to constantly poll Facebook's API for changes, saving resources and ensuring we get updates as soon
// as they happen. The webhook has two main parts: verification (GET requests) and event notifications (POST requests).

/**
 * Facebook webhook verification query parameters schema
 * Used for GET requests to verify webhook endpoint
 */
export const webhookVerificationSchema = z.object({
  // pt 1: Verify the webhook 
  // Facebook sends the following query parameters to verify the facebook webhook's dedicated HTTP endpoints
  // (each are prefaced by "hub.", a bit confusing but that's just how Facebook does it for some reason)
  'hub.mode': z // what "mode" we're in: Subscribe (i.e. Facebook is trying to verify the webhook) or Unsubscribe
    .string()
    .refine((val) => val === 'subscribe', 'Invalid hub.mode - must be "subscribe"') // we only support "subscribe" mode
    .describe('Webhook verification mode'),
  
  'hub.verify_token': z // another param: "verify_token" - the token we set when creating the webhook
    .string()
    .min(1, 'Verify token cannot be empty') // self-explanatory: must not be empty
    .describe('Webhook verification token'),
  
  'hub.challenge': z // finally, "challenge" - a random string Facebook expects us to echo back, kind of like a code
    // note that this file doesn't do the actual ping-pong handshake, just makes sure the params are there and valid
    .string()
    .min(1, 'Challenge cannot be empty') // also self-explanatory: Must not be empty
    .describe('Challenge string to echo back'),
}).describe('Facebook webhook verification parameters');

/**
 * Facebook webhook event change schema
 * Represents a single change notification
 */
const webhookChangeSchema = z.object({
  // when an event changes, Facebook will send a "change" object with the following fields:
  field: z
    .string(), // the field that changed, e.g. "events"
  value: z
    .record(z.string(), z.unknown()), // the new value of the field (can be any shape, so it's unknown)
    // .record() = a zod method to define an object with string keys and unknown values'
});

/**
 * Facebook webhook entry schema
 * Contains changes for a specific page
 */
const webhookEntrySchema = z.object({
  // Here, "entry" confusingly enough represents changes for a specific Facebook Page
  id: z
    .string() // the Facebook Page ID as a str
    .describe('Page ID'), // we put it here for documentation purposes
  time: z //
    .number() // time as a number
    .int() // forced to be an integer
    .positive() // forced to be positive
    .describe('Timestamp in seconds'), // the time the change occurred (in unix time seconds)
  changes: z
    .array(webhookChangeSchema) // forces it to be an array of changes (as defined above! Yay!)
    .optional(), // allow empty changes arrays
});

/**
 * Facebook webhook POST body schema
 * Validates incoming webhook notifications
 */
export const webhookPayloadSchema = z.object({
  object: z
    .string() // the object type that changed, e.g. "page"
    .refine((val) => val === 'page', 'Invalid object type - must be "page"') // we only support "page" object changes
    .describe('Object type (always "page")'), // documentation description
  
  entry: z
    .array(webhookEntrySchema) // allow empty entry arrays (tests send empty arrays)
    .describe('Array of webhook entries'),
}).describe('Facebook webhook payload');

export type WebhookVerification = z.infer<typeof webhookVerificationSchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;