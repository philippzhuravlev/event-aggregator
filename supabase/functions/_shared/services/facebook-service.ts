import { logger } from "./logger-service.ts";
import type { FacebookServiceLogger } from "@event-aggregator/shared/src/services/facebook-service.ts";
// Import directly from source instead of compiled bundle
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAllRelevantEvents,
  getEventDetails,
  getPageEvents,
  getUserPages,
  setFacebookServiceLogger,
} from "@event-aggregator/shared/src/services/facebook-service.ts";

const supabaseLogger: FacebookServiceLogger = {
  info: (
    message: string,
    metadata?: Record<string, unknown>,
  ) => logger.info(message, metadata),
  warn: (
    message: string,
    metadata?: Record<string, unknown>,
  ) => logger.warn(message, metadata),
  error: (
    message: string,
    error?: Error | null,
    metadata?: Record<string, unknown>,
  ) => logger.error(message, error ?? null, metadata),
  debug: (
    message: string,
    metadata?: Record<string, unknown>,
  ) => logger.debug(message, metadata),
};

setFacebookServiceLogger(supabaseLogger);

export {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAllRelevantEvents,
  getEventDetails,
  getPageEvents,
  getUserPages,
  setFacebookServiceLogger,
};

export type {
  FacebookCover,
  FacebookErrorResponse,
  FacebookEvent,
  FacebookPage,
  FacebookPagePictureData,
  FacebookPlace,
  FacebookPlaceLocation,
  FacebookServiceLogger,
} from "@event-aggregator/shared/src/services/facebook-service.ts";
