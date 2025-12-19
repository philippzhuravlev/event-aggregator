import {
  createServiceLoggerFromStructuredLogger,
  createStructuredLogger,
} from "../../../../packages/shared/src/services/logger-service.ts";
import { setFacebookServiceLogger } from "../../../../packages/shared/src/services/facebook-service.ts";
import type {
  ErrorMetadata,
  LogMetadata,
} from "../../../../packages/shared/src/types.ts";
import { setInputValidationLogger } from "../../../../packages/shared/src/validation/input-validation.ts";

/**
 * Heads up on Supabase logging:
 * - Edge Functions + the dashboard basically scoop up anything you `console.*`.
 * - Supabase recommends JSON payloads if you want structured searches (`supabase functions logs` makes that super nice).
 * - When you need grown-up observability, wire a log drain (Logflare, Datadog, etc.) in the project settings and keep shipping JSON.
 * TL;DR: log like it's 2025, but keep it simple enough that past-you can read it at 2 AM.
 */

export const logger = createStructuredLogger({
  shouldLogDebug: () => Deno.env.get("ENVIRONMENT") !== "production",
});

export function createSupabaseFacebookLogger(
  baseLogger: Pick<typeof logger, "info" | "warn" | "error" | "debug">,
): ReturnType<typeof createServiceLoggerFromStructuredLogger> {
  return createServiceLoggerFromStructuredLogger(baseLogger);
}

const supabaseFacebookLogger = createSupabaseFacebookLogger(logger);
setFacebookServiceLogger(supabaseFacebookLogger);

setInputValidationLogger({
  warn: (message: string, metadata?: Record<string, unknown>) =>
    logger.warn(message, metadata),
});

export type { ErrorMetadata, LogMetadata };
