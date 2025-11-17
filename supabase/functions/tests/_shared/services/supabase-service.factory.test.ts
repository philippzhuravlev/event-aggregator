import { assertEquals } from "std/assert/mod.ts";
import {
  createSupabaseClient,
  resetSupabaseClientFactory,
  setSupabaseClientFactory,
} from "../../../_shared/services/supabase-service.ts";

type FactoryType = Parameters<typeof setSupabaseClientFactory>[0];
type FakeClient = ReturnType<FactoryType>;

Deno.test("createSupabaseClient uses injected factory implementation", () => {
  const calls: Array<Record<string, unknown>> = [];
  const fakeClient = {} as FakeClient;

  const factory: FactoryType = (url, key, options) => {
    calls.push({ url, key, options });
    return fakeClient;
  };

  setSupabaseClientFactory(factory);
  try {
    const result = createSupabaseClient("https://example.com", "service-key", {
      auth: { persistSession: false },
    });

    assertEquals(result, fakeClient);
    assertEquals(calls.length, 1);
    assertEquals(calls[0].url, "https://example.com");
    assertEquals(calls[0].key, "service-key");
  } finally {
    resetSupabaseClientFactory();
  }
});

Deno.test("resetSupabaseClientFactory allows injecting new factory after reset", () => {
  let firstCalls = 0;
  let secondCalls = 0;

  const fakeClient = {} as FakeClient;

  const firstFactory: FactoryType = () => {
    firstCalls++;
    return fakeClient;
  };

  const secondFactory: FactoryType = () => {
    secondCalls++;
    return fakeClient;
  };

  setSupabaseClientFactory(firstFactory);
  try {
    createSupabaseClient("https://example.com", "key");
    assertEquals(firstCalls, 1);
  } finally {
    resetSupabaseClientFactory();
  }

  setSupabaseClientFactory(secondFactory);
  try {
    createSupabaseClient("https://example.com", "key");
    assertEquals(secondCalls, 1);
  } finally {
    resetSupabaseClientFactory();
  }
});

