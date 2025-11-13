// @deno-types="../../../../packages/shared/src/services/logger-service.ts"
import { createStructuredLogger } from "../../packages/shared/dist/services/logger-service.js";
import type { ErrorMetadata, LogMetadata } from "../types.ts";

export const logger = createStructuredLogger({
  shouldLogDebug: () => Deno.env.get("ENVIRONMENT") !== "production",
});

export type { LogMetadata, ErrorMetadata };
