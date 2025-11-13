/**
 * Services Barrel Export
 * Re-exports all shared services for convenient importing
 *
 * Services handle connections to external systems (Facebook, Supabase, Mail, Vault)
 * and provide reusable business logic across edge functions
 */

// Index files are a weird thing. In regards to functions, they are our
// actual functions that get executed. But in regards to folders, they
// are "barrel" files that just import and export stuff for the folder.
// The common thread here is that index files are always entry points

// Logger Service - Centralized logging to Supabase stdout/stderr
export { logger } from "./logger-service.ts";

// Facebook API Service - OAuth and event management
export {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAllRelevantEvents,
  getPageEvents,
  getUserPages,
} from "./facebook-service.ts";

// Image Service - Image processing and CDN management
export {
  copyFile,
  createSignedUrl,
  deleteFile,
  downloadFile,
  getPublicUrl,
  listFiles,
  moveFile,
  uploadFile,
} from "./image-service.ts";

// Mail Service - Email sending and alerts
export {
  createMailTransporter,
  sendEventSyncFailedAlert,
  sendTokenExpiryWarning,
  sendTokenRefreshFailedAlert,
} from "./mail-service.ts";

export type { AlertEmailOptions, EmailOptions } from "@event-aggregator/shared/types.ts";

// Supabase Service - Database operations
export {
  batchWriteEvents,
  checkTokenExpiry,
  deleteOldEvents,
  getActivePages,
  markTokenExpired,
  saveEvent,
  savePage,
} from "./supabase-service.ts";

// Vault Service - Secrets and token management
export {
  deleteSecret,
  getApiKey,
  getPageToken,
  getWebhookVerifyToken,
  storePageToken,
  updateSecret,
} from "./vault-service.ts";
