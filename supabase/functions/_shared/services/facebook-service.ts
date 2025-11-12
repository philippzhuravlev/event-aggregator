import { logger } from "./logger-service.ts";
import type { FacebookServiceLogger } from "../../../../packages/shared/src/services/facebook-service.ts";
// @deno-types="../../../../packages/shared/src/services/facebook-service.ts"
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
    message,
    metadata,
  ) => logger.info(message, metadata),
  warn: (
    message,
    metadata,
  ) => logger.warn(message, metadata),
  error: (
    message,
    error,
    metadata,
  ) => logger.error(message, error ?? null, metadata),
  debug: (
    message,
    metadata,
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

export type {
  FacebookCover,
  FacebookErrorResponse,
  FacebookEvent,
  FacebookPage,
  FacebookPagePictureData,
  FacebookPlace,
  FacebookPlaceLocation,
  FacebookServiceLogger,
} from "../../../../packages/shared/src/services/facebook-service.ts";
