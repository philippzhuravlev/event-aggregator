import { assertEquals } from "std/assert/mod.ts";
import { assertSpyCalls, spy } from "std/testing/mock.ts";

Deno.test("shared facebook-service module can be imported", async () => {
  const facebookService = await import(
    "../../../../../packages/shared/src/services/facebook-service.ts"
  );

  assertEquals(typeof facebookService, "object");
  assertEquals(facebookService !== null, true);
});

Deno.test("createSupabaseFacebookLogger proxies logging calls", async () => {
  const { createSupabaseFacebookLogger } = await import(
    "../../../_shared/services/logger-service.ts"
  );

  const infoSpy = spy(
    (_message: string, _metadata?: Record<string, unknown>) => {},
  );
  const warnSpy = spy(
    (_message: string, _metadata?: Record<string, unknown>) => {},
  );
  const errorSpy = spy((
    _message: string,
    _error?: Error | null,
    _metadata?: Record<string, unknown>,
  ) => {});
  const debugSpy = spy(
    (_message: string, _metadata?: Record<string, unknown>) => {},
  );

  const baseLogger = {
    info: infoSpy,
    warn: warnSpy,
    error: errorSpy,
    debug: debugSpy,
  };

  const supabaseLogger = createSupabaseFacebookLogger(baseLogger);
  const metadata = { source: "test" };
  const error = new Error("boom");

  if (
    !supabaseLogger.info ||
    !supabaseLogger.warn ||
    !supabaseLogger.error ||
    !supabaseLogger.debug
  ) {
    throw new Error(
      "createSupabaseFacebookLogger must provide all log methods",
    );
  }

  supabaseLogger.info("info", metadata);
  supabaseLogger.warn("warn", metadata);
  supabaseLogger.error("error", error, metadata);
  supabaseLogger.error("error-null", null, metadata);
  supabaseLogger.debug("debug", metadata);

  assertSpyCalls(infoSpy, 1);
  assertEquals(infoSpy.calls[0].args, ["info", metadata]);

  assertSpyCalls(warnSpy, 1);
  assertEquals(warnSpy.calls[0].args, ["warn", metadata]);

  assertSpyCalls(errorSpy, 2);
  assertEquals(errorSpy.calls[0].args, ["error", error, metadata]);
  assertEquals(errorSpy.calls[1].args[1], null);

  assertSpyCalls(debugSpy, 1);
  assertEquals(debugSpy.calls[0].args, ["debug", metadata]);
});
