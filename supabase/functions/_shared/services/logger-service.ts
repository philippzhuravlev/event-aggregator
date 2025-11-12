import { createStructuredLogger } from "../../packages/shared/dist/logging/index.js";
import type { ErrorMetadata, LogMetadata } from "../types.ts";

export const logger = createStructuredLogger({
  shouldLogDebug: () => Deno.env.get("ENVIRONMENT") !== "production",
});

export type { LogMetadata, ErrorMetadata };
