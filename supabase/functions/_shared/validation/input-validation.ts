import { logger } from "../services/logger-service.ts";
import * as sharedInputValidation from "../../packages/shared/dist/validation/input-validation.js";

const { setInputValidationLogger } = sharedInputValidation;

setInputValidationLogger({
  warn: (message: string, metadata?: Record<string, unknown>) =>
    logger.warn(message, metadata),
});

export * from "../../packages/shared/dist/validation/input-validation.js";
export const sanitizeSearchQuery: (
  input: string,
  maxLength?: number,
) => string = sharedInputValidation.sanitizeSearchQuery;
