import { logger } from "../services/logger-service";

import { setInputValidationLogger } from "@event-aggregator/shared/validation/input-validation";

setInputValidationLogger({
  warn: (message, metadata) => logger.warn(message, metadata),
});

export * from "@event-aggregator/shared/validation/input-validation";
