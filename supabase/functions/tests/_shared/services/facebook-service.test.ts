import { assertEquals } from "std/assert/mod.ts";

Deno.test("facebook-service module can be imported", async () => {
  // Just verify the module loads without errors
  // The module sets up the logger at import time, so importing it is the test
  const facebookService = await import("../../../_shared/services/facebook-service.ts");
  
  // Verify it exports something
  assertEquals(typeof facebookService, "object");
  assertEquals(facebookService !== null, true);
  
  // The functions are re-exported from the shared package
  // We can't easily test them without mocking the entire shared package
  // So we just verify the module loads successfully
});

