import { logger } from "../services/logger-service.ts";

import {
  setInputValidationLogger,
} from "../../packages/shared/dist/validation/input-validation.js";

setInputValidationLogger({
  warn: (message, metadata) => logger.warn(message, metadata),
});

export * from "../../packages/shared/dist/validation/input-validation.js";
