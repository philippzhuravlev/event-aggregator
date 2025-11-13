import {
  buildAllowedOriginsList,
  createAllowedOriginChecker,
} from "./origin-util.ts";
import type {
  AllowedOriginCheckerOptions,
  AllowedOriginsListOptions,
} from "./origin-util.ts";

export type OriginUtilitiesOptions = AllowedOriginCheckerOptions &
  AllowedOriginsListOptions;

export interface OriginUtilities {
  isAllowedOrigin: (origin: string) => boolean;
  getAllowedOrigins: (origin?: string) => string[];
}

export function createOriginUtilities(
  options: OriginUtilitiesOptions = {},
): OriginUtilities {
  const {
    webAppUrl,
    knownHostnames,
    previewHostnamePattern,
    additionalHostnames,
    allowLocalhost,
    vercelUrl,
    currentOrigin,
    includeLocalhost,
    localhostOrigins,
    knownOrigins,
    additionalOrigins,
  } = options;

  const isAllowedOrigin = createAllowedOriginChecker({
    webAppUrl,
    knownHostnames,
    previewHostnamePattern,
    additionalHostnames,
    allowLocalhost,
  });

  const getAllowedOrigins = (origin?: string): string[] =>
    buildAllowedOriginsList({
      webAppUrl,
      vercelUrl,
      currentOrigin: origin ?? currentOrigin,
      includeLocalhost,
      localhostOrigins,
      knownOrigins,
      additionalOrigins,
    });

  return {
    isAllowedOrigin,
    getAllowedOrigins,
  };
}


