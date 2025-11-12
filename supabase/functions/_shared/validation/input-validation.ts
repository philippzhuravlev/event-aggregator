import { logger } from "../services/logger-service.ts";
import { setInputValidationLogger } from "../../packages/shared/dist/validation/input-validation.js";
import { sanitizeSearchQuery as sharedSanitizeSearchQuery } from "../../packages/shared/dist/utils/sanitizer-util.js";

setInputValidationLogger({
  warn: (message: string, metadata?: Record<string, unknown>) =>
    logger.warn(message, metadata),
});

export * from "../../packages/shared/dist/validation/input-validation.js";
export const sanitizeSearchQuery = sharedSanitizeSearchQuery;
