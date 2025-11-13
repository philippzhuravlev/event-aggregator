// @deno-types="../../../../packages/shared/src/services/logger-service.ts"
import { createStructuredLogger } from "@event-aggregator/shared/services/logger-service.js";
import type { ErrorMetadata, LogMetadata } from "@event-aggregator/shared/types.ts";
import { setInputValidationLogger } from "@event-aggregator/shared/validation/input-validation.js";

export const logger = createStructuredLogger({
  shouldLogDebug: () => Deno.env.get("ENVIRONMENT") !== "production",
});

setInputValidationLogger({
  warn: (message: string, metadata?: Record<string, unknown>) =>
    logger.warn(message, metadata),
});

export type { LogMetadata, ErrorMetadata };
