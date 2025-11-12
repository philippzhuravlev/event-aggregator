import process from "node:process";
import { createStructuredLogger } from "@event-aggregator/shared/services/logger-service";
import type {
  ErrorMetadata,
  LogMetadata,
} from "@event-aggregator/shared/types";

export const logger = createStructuredLogger({
  shouldLogDebug: () => process.env.NODE_ENV !== "production",
});

export type { LogMetadata, ErrorMetadata };
