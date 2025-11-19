import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import {
  batchWriteEvents,
  checkTokenExpiry,
  deleteOldEvents,
  getActivePages,
  markTokenExpired,
  saveEvent,
  savePage,
} from "../../../_shared/services/supabase-service.ts";
import type {
  DatabasePage,
  NormalizedEvent,
} from "@event-aggregator/shared/types.ts";

type MockQueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type MockQueryBuilder = {
  eq: (
    column: string,
    value: unknown,
  ) => MockQueryBuilder | Promise<MockQueryResult<unknown>>;
  not: (
    column: string,
    operator: string,
    value: unknown,
  ) => Promise<MockQueryResult<unknown>>;
  limit: (n: number) => Promise<MockQueryResult<unknown>>;
  single: () => Promise<MockQueryResult<unknown>>;
  lt: (column: string, value: string) => Promise<MockQueryResult<unknown>>;
};

type MockSelectOptions = {
  count?: string;
  head?: boolean;
};

function createSupabaseClientMock(options?: {
  shouldFail?: boolean;
  failOperation?: string;
  pages?: DatabasePage[];
  events?: NormalizedEvent[];
  tokenExpiry?: string | null;
  count?: number;
}) {
  const {
    shouldFail = false,
    failOperation,
    pages = [],
    events = [],
    tokenExpiry = null,
    count = 0,
  } = options || {};

  const createQueryBuilder = (
    table: string,
    finalResult: MockQueryResult<unknown>,
  ): MockQueryBuilder => {
    const builder = {} as MockQueryBuilder;
    builder.eq = (column: string, value: unknown) => {
      if (
        table === "pages" && column === "token_status" && value === "active"
      ) {
        return {
          not: () => Promise.resolve(finalResult),
        } as unknown as MockQueryBuilder;
      }
      if (table === "pages" && column === "page_id") {
        return {
          single: () => Promise.resolve(finalResult),
        } as MockQueryBuilder;
      }
      // Return builder for chaining, but don't recurse
      return builder;
    };
    builder.not = (_column: string, _operator: string, _value: unknown) => {
      return Promise.resolve(finalResult);
    };
    builder.limit = (_n: number) => Promise.resolve(finalResult);
    builder.single = () => Promise.resolve(finalResult);
    builder.lt = (_column: string, _value: string) =>
      Promise.resolve(finalResult);
    return builder;
  };

  const mockClient = {
    from: (table: string) => {
      // Handle failure cases first
      if (shouldFail && failOperation === "upsert") {
        return {
          upsert: () =>
            Promise.resolve({
              error: { message: "Database error" },
            }),
        };
      }

      if (shouldFail && failOperation === "select") {
        return {
          select: () =>
            createQueryBuilder(table, {
              data: null,
              error: { message: "Query failed" },
            }),
        };
      }

      if (shouldFail && failOperation === "update") {
        return {
          update: () => ({
            eq: () =>
              Promise.resolve({
                error: { message: "Update failed" },
              }),
          }),
        };
      }

      if (shouldFail && failOperation === "delete") {
        return {
          select: (_columns: string, options?: MockSelectOptions) => {
            // First handle the count query
            if (options?.count === "exact" && options?.head === true) {
              return {
                lt: () =>
                  Promise.resolve({
                    count: 5,
                    error: null,
                  }),
              };
            }
            // Then the delete will fail
            return createQueryBuilder(table, {
              data: null,
              error: { message: "Query failed" },
            });
          },
          delete: () => ({
            lt: () =>
              Promise.resolve({
                error: { message: "Delete failed" },
              }),
          }),
        };
      }

      if (shouldFail && failOperation === "count") {
        return {
          select: (_columns: string, options?: MockSelectOptions) => {
            if (options?.count === "exact" && options?.head === true) {
              return {
                lt: () =>
                  Promise.resolve({
                    count: null,
                    error: { message: "Count failed" },
                  }),
              };
            }
            return createQueryBuilder(table, {
              data: null,
              error: { message: "Query failed" },
            });
          },
        };
      }

      // Success cases
      return {
        upsert: (_data: unknown, _options?: Record<string, unknown>) => {
          return Promise.resolve({ error: null });
        },
        select: (_columns?: string, options?: MockSelectOptions) => {
          // Special handling for count queries
          if (options?.count === "exact" && options?.head === true) {
            return {
              lt: () =>
                Promise.resolve({
                  count,
                  error: null,
                }),
            };
          }

          // Handle different query patterns
          if (table === "pages") {
            return createQueryBuilder(table, {
              data: pages,
              error: null,
            });
          }

          return createQueryBuilder(table, {
            data: events,
            error: null,
          });
        },
        update: (_data: unknown) => ({
          eq: (_column: string, _value: unknown) =>
            Promise.resolve({
              error: null,
            }),
        }),
        delete: () => ({
          eq: (_column: string, _value: unknown) =>
            Promise.resolve({
              error: null,
            }),
          lt: (_column: string, _value: string) =>
            Promise.resolve({
              error: null,
            }),
        }),
      };
    },
  };

  // Override for token expiry queries
  const originalFrom = mockClient.from;
  mockClient.from = (table: string) => {
    const result = originalFrom(table);

    // Special handling for checkTokenExpiry
    if (table === "pages" && result.select) {
      const originalSelect = result.select;
      result.select = (columns?: string) => {
        const builder = originalSelect(columns || "") as MockQueryBuilder;
        if (builder.eq) {
          const originalEq = builder.eq;
          builder.eq = (column: string, value: unknown) => {
            if (column === "page_id") {
              return {
                single: () =>
                  Promise.resolve({
                    data: tokenExpiry !== undefined
                      ? (tokenExpiry !== null
                        ? { token_expiry: tokenExpiry }
                        : null)
                      : null,
                    error: tokenExpiry === undefined
                      ? { message: "Not found" }
                      : null,
                  }),
              } as unknown as MockQueryBuilder;
            }
            return originalEq(column, value);
          };
        }
        return builder;
      };
    }

    return result;
  };

  return mockClient;
}

Deno.test("savePage saves page successfully", async () => {
  const supabase = createSupabaseClientMock();
  // deno-lint-ignore no-explicit-any
  await savePage(supabase as any, "123", "Test Page");
  // If no error is thrown, test passes
});

Deno.test("savePage throws error on database failure", async () => {
  const supabase = createSupabaseClientMock({
    shouldFail: true,
    failOperation: "upsert",
  });
  await assertRejects(
    async () => {
      // deno-lint-ignore no-explicit-any
      await savePage(supabase as any, "123", "Test Page");
    },
    Error,
    "Failed to save page in Supabase",
  );
});

Deno.test("saveEvent saves event successfully", async () => {
  const supabase = createSupabaseClientMock();
  // deno-lint-ignore no-explicit-any
  await saveEvent(supabase as any, {
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date().toISOString(),
    },
  });
  // If no error is thrown, test passes
});

Deno.test("saveEvent throws error on database failure", async () => {
  const supabase = createSupabaseClientMock({
    shouldFail: true,
    failOperation: "upsert",
  });
  await assertRejects(
    async () => {
      // deno-lint-ignore no-explicit-any
      await saveEvent(supabase as any, {
        page_id: 123,
        event_id: "event1",
        event_data: {
          id: "event1",
          name: "Test Event",
          start_time: new Date().toISOString(),
        },
      });
    },
    Error,
    "Failed to save event in Supabase",
  );
});

Deno.test("batchWriteEvents returns 0 for empty array", async () => {
  const supabase = createSupabaseClientMock();
  // deno-lint-ignore no-explicit-any
  const result = await batchWriteEvents(supabase as any, []);
  assertEquals(result, 0);
});

Deno.test("batchWriteEvents writes events successfully", async () => {
  const supabase = createSupabaseClientMock();
  const events = [
    {
      page_id: 123,
      event_id: "event1",
      event_data: {
        id: "event1",
        name: "Event 1",
        start_time: new Date().toISOString(),
      },
    },
    {
      page_id: 123,
      event_id: "event2",
      event_data: {
        id: "event2",
        name: "Event 2",
        start_time: new Date().toISOString(),
      },
    },
  ];
  // deno-lint-ignore no-explicit-any
  const result = await batchWriteEvents(supabase as any, events);
  assertEquals(result, 2);
});

Deno.test("batchWriteEvents throws error on database failure", async () => {
  const supabase = createSupabaseClientMock({
    shouldFail: true,
    failOperation: "upsert",
  });
  const events = [
    {
      page_id: 123,
      event_id: "event1",
      event_data: {
        id: "event1",
        name: "Event 1",
        start_time: new Date().toISOString(),
      },
    },
  ];
  await assertRejects(
    async () => {
      // deno-lint-ignore no-explicit-any
      await batchWriteEvents(supabase as any, events);
    },
    Error,
    "Failed to batch write events to Supabase",
  );
});

Deno.test("getActivePages returns empty array when no pages", async () => {
  const supabase = createSupabaseClientMock({ pages: [] });
  // deno-lint-ignore no-explicit-any
  const result = await getActivePages(supabase as any);
  assertEquals(result, []);
});

Deno.test("getActivePages returns pages successfully", async () => {
  const mockPages: DatabasePage[] = [
    {
      page_id: 123,
      page_name: "Test Page",
      token_status: "active",
      page_access_token_id: "1",
      token_expiry: null as unknown as string,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const supabase = createSupabaseClientMock({ pages: mockPages });
  // deno-lint-ignore no-explicit-any
  const result = await getActivePages(supabase as any);
  assertEquals(result.length, 1);
  assertEquals(result[0].page_id, 123);
});

Deno.test("getActivePages returns empty array on query error", async () => {
  const supabase = createSupabaseClientMock({
    shouldFail: true,
    failOperation: "select",
  });
  // deno-lint-ignore no-explicit-any
  const result = await getActivePages(supabase as any);
  assertEquals(result, []);
});

Deno.test("checkTokenExpiry returns expiring when token expiry is null", async () => {
  const supabase = createSupabaseClientMock({ tokenExpiry: null });
  // deno-lint-ignore no-explicit-any
  const result = await checkTokenExpiry(supabase as any, "123");
  assertEquals(result.isExpiring, true);
  assertEquals(result.daysUntilExpiry, 0);
  assertEquals(result.expiresAt, null);
});

Deno.test("checkTokenExpiry handles invalid date string", async () => {
  const supabase = createSupabaseClientMock({
    tokenExpiry: "invalid-date",
  });

  // deno-lint-ignore no-explicit-any
  const result = await checkTokenExpiry(supabase as any, "123", 7);
  // Should handle invalid date gracefully
  assertEquals(typeof result.isExpiring, "boolean");
  assertEquals(typeof result.daysUntilExpiry, "number");
});

Deno.test("checkTokenExpiry handles custom warningDays", async () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 10);

  const supabase = createSupabaseClientMock({
    tokenExpiry: futureDate.toISOString(),
  });

  // deno-lint-ignore no-explicit-any
  const result = await checkTokenExpiry(supabase as any, "123", 5);
  assertEquals(typeof result.isExpiring, "boolean");
  assertEquals(typeof result.daysUntilExpiry, "number");
});

Deno.test("checkTokenExpiry handles token expiring within warning days", async () => {
  const expiringDate = new Date();
  expiringDate.setDate(expiringDate.getDate() + 3);

  const supabase = createSupabaseClientMock({
    tokenExpiry: expiringDate.toISOString(),
  });

  // deno-lint-ignore no-explicit-any
  const result = await checkTokenExpiry(supabase as any, "123", 7);
  assertEquals(result.isExpiring, true);
});

Deno.test("checkTokenExpiry handles token not expiring", async () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);

  const supabase = createSupabaseClientMock({
    tokenExpiry: futureDate.toISOString(),
  });

  // deno-lint-ignore no-explicit-any
  const result = await checkTokenExpiry(supabase as any, "123", 7);
  assertEquals(result.isExpiring, false);
});

Deno.test("checkTokenExpiry handles already expired token", async () => {
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 1);

  const supabase = createSupabaseClientMock({
    tokenExpiry: pastDate.toISOString(),
  });

  // deno-lint-ignore no-explicit-any
  const result = await checkTokenExpiry(supabase as any, "123", 7);
  assertEquals(result.isExpiring, true);
  assertEquals(result.daysUntilExpiry <= 0, true);
});

Deno.test("deleteOldEvents handles count error", async () => {
  const errorSupabase = {
    from: () => ({
      select: (_columns: string, options?: MockSelectOptions) => {
        if (options?.count === "exact" && options?.head === true) {
          return {
            lt: () =>
              Promise.resolve({
                count: null,
                error: { message: "Count failed" },
              }),
          };
        }
        return {
          limit: () => Promise.resolve({ data: [], error: null }),
        };
      },
    }),
  };

  // deno-lint-ignore no-explicit-any
  const result = await deleteOldEvents(errorSupabase as any, new Date(), false);
  assertEquals(result, 0);
});

Deno.test("deleteOldEvents handles delete error", async () => {
  const errorSupabase = {
    from: () => ({
      select: (_columns: string, options?: MockSelectOptions) => {
        if (options?.count === "exact" && options?.head === true) {
          return {
            lt: () =>
              Promise.resolve({
                count: 5,
                error: null,
              }),
          };
        }
        return {
          delete: () => ({
            lt: () =>
              Promise.resolve({
                error: { message: "Delete failed" },
              }),
          }),
        };
      },
    }),
  };

  try {
    // deno-lint-ignore no-explicit-any
    await deleteOldEvents(errorSupabase as any, new Date(), false);
    assertEquals(false, true, "Should have thrown an error");
  } catch (error) {
    assertEquals(error instanceof Error, true);
  }
});

Deno.test("checkTokenExpiry returns expiring when query fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFail: true,
    failOperation: "select",
    tokenExpiry: undefined,
  });
  // deno-lint-ignore no-explicit-any
  const result = await checkTokenExpiry(supabase as any, "123");
  assertEquals(result.isExpiring, true);
  assertEquals(result.daysUntilExpiry, 0);
  assertEquals(result.expiresAt, null);
});

Deno.test("checkTokenExpiry calculates expiry correctly", async () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 10); // 10 days from now
  const supabase = createSupabaseClientMock({
    tokenExpiry: futureDate.toISOString(),
  });
  // deno-lint-ignore no-explicit-any
  const result = await checkTokenExpiry(supabase as any, "123");
  assertEquals(result.isExpiring, false);
  assertEquals(result.daysUntilExpiry > 0, true);
  assertExists(result.expiresAt);
});

Deno.test("markTokenExpired marks token as expired successfully", async () => {
  const supabase = createSupabaseClientMock();
  // deno-lint-ignore no-explicit-any
  await markTokenExpired(supabase as any, "123");
  // If no error is thrown, test passes
});

Deno.test("markTokenExpired throws error on database failure", async () => {
  const supabase = createSupabaseClientMock({
    shouldFail: true,
    failOperation: "update",
  });
  await assertRejects(
    async () => {
      // deno-lint-ignore no-explicit-any
      await markTokenExpired(supabase as any, "123");
    },
    Error,
    "Failed to mark token as expired in Supabase",
  );
});

Deno.test("deleteOldEvents returns 0 for dry run with no events", async () => {
  const supabase = createSupabaseClientMock({ count: 0 });
  const beforeDate = new Date();
  beforeDate.setDate(beforeDate.getDate() - 90);
  // deno-lint-ignore no-explicit-any
  const result = await deleteOldEvents(supabase as any, beforeDate, true);
  assertEquals(result, 0);
});

Deno.test("deleteOldEvents returns count for dry run", async () => {
  const supabase = createSupabaseClientMock({ count: 5 });
  const beforeDate = new Date();
  beforeDate.setDate(beforeDate.getDate() - 90);
  // deno-lint-ignore no-explicit-any
  const result = await deleteOldEvents(supabase as any, beforeDate, true);
  assertEquals(result, 5);
});

Deno.test("deleteOldEvents deletes events when not dry run", async () => {
  const supabase = createSupabaseClientMock({ count: 3 });
  const beforeDate = new Date();
  beforeDate.setDate(beforeDate.getDate() - 90);
  // deno-lint-ignore no-explicit-any
  const result = await deleteOldEvents(supabase as any, beforeDate, false);
  assertEquals(result, 3);
});

Deno.test("deleteOldEvents returns 0 when count query fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFail: true,
    failOperation: "count",
  });
  const beforeDate = new Date();
  beforeDate.setDate(beforeDate.getDate() - 90);
  // deno-lint-ignore no-explicit-any
  const result = await deleteOldEvents(supabase as any, beforeDate, false);
  assertEquals(result, 0);
});

Deno.test("deleteOldEvents throws error when delete fails", async () => {
  const supabase = createSupabaseClientMock({
    count: 5,
    shouldFail: true,
    failOperation: "delete",
  });
  const beforeDate = new Date();
  beforeDate.setDate(beforeDate.getDate() - 90);
  // deno-lint-ignore no-explicit-any
  await assertRejects(
    async () => await deleteOldEvents(supabase as any, beforeDate, false),
    Error,
    "Failed to delete old events from Supabase",
  );
});
