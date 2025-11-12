import { logger } from "./logger-service.ts";
import type { FacebookServiceLogger } from "@shared-src/services/facebook-service.ts";
// @deno-types="@shared-src/services/facebook-service.ts"
import * as facebookService from "../../packages/shared/dist/services/index.js";

const {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAllRelevantEvents,
  getPageEvents,
  getUserPages,
  setFacebookServiceLogger,
} = facebookService;

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
  getPageEvents,
  getUserPages,
  setFacebookServiceLogger,
};

// @deno-types="@shared-src/services/facebook-service.ts"
export type {
  FacebookCover,
  FacebookErrorResponse,
  FacebookEvent,
  FacebookPage,
  FacebookPagePictureData,
  FacebookPlace,
  FacebookPlaceLocation,
  FacebookServiceLogger,
} from "@shared-src/services/facebook-service.ts";
