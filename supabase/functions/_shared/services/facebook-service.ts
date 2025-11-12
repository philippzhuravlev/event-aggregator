import { logger } from "./logger-service.ts";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAllRelevantEvents,
  getPageEvents,
  getUserPages,
  setFacebookServiceLogger,
  type FacebookCover,
  type FacebookErrorResponse,
  type FacebookEvent,
  type FacebookPage,
  type FacebookPagePictureData,
  type FacebookPlace,
  type FacebookPlaceLocation,
} from "@event-aggregator/shared/services/facebook-service";

setFacebookServiceLogger({
  info: (message, metadata) => logger.info(message, metadata),
  warn: (message, metadata) => logger.warn(message, metadata),
  error: (message, error, metadata) => logger.error(message, error ?? null, metadata),
  debug: (message, metadata) => logger.debug(message, metadata),
});

export {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAllRelevantEvents,
  getPageEvents,
  getUserPages,
};

export type {
  FacebookCover,
  FacebookErrorResponse,
  FacebookEvent,
  FacebookPage,
  FacebookPagePictureData,
  FacebookPlace,
  FacebookPlaceLocation,
};
