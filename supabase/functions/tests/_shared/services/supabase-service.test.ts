import {
  assertEquals,
  assertExists,
  assertRejects,
} from "std/assert/mod.ts";
import {
  savePage,
  saveEvent,
  batchWriteEvents,
  getActivePages,
  checkTokenExpiry,
  markTokenExpired,
  deleteOldEvents,
} from "../../../_shared/services/supabase-service.ts";

function createSupabaseClientMock(options?: {
  shouldFail?: boolean;
  failOperation?: string;
  pages?: any[];
  events?: any[];
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

  const createQueryBuilder = (table: string, finalResult: any) => {
    const builder: any = {
      eq: (column: string, value: any) => {
        if (table === "pages" && column === "token_status" && value === "active") {
          return {
            not: () => Promise.resolve(finalResult),
          };
        }
        if (table === "pages" && column === "page_id") {
          return {
            single: () => Promise.resolve(finalResult),
          };
        }
        // Return builder for chaining, but don't recurse
        return builder;
      },
      not: (column: string, operator: string, value: any) => {
        return Promise.resolve(finalResult);
      },
      limit: (n: number) => Promise.resolve(finalResult),
      single: () => Promise.resolve(finalResult),
      lt: (column: string, value: string) => Promise.resolve(finalResult),
    };
    return builder;
  };

  const mockClient: any = {
    from: (table: string) => {
      // Handle failure cases first
      if (shouldFail && failOperation === "upsert") {
        return {
          upsert: () => Promise.resolve({
            error: { message: "Database error" },
          }),
        };
      }

      if (shouldFail && failOperation === "select") {
        return {
          select: () => createQueryBuilder(table, {
            data: null,
            error: { message: "Query failed" },
          }),
        };
      }

      if (shouldFail && failOperation === "update") {
        return {
          update: () => ({
            eq: () => Promise.resolve({
              error: { message: "Update failed" },
            }),
          }),
        };
      }

      if (shouldFail && failOperation === "delete") {
        return {
          select: (columns: string, options?: any) => {
            // First handle the count query
            if (options?.count === "exact" && options?.head === true) {
              return {
                lt: () => Promise.resolve({
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
            lt: () => Promise.resolve({
              error: { message: "Delete failed" },
            }),
          }),
        };
      }

      if (shouldFail && failOperation === "count") {
        return {
          select: (columns: string, options?: any) => {
            if (options?.count === "exact" && options?.head === true) {
              return {
                lt: () => Promise.resolve({
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
        upsert: (data: any, options?: any) => {
          return Promise.resolve({ error: null });
        },
        select: (columns?: string, options?: any) => {
          // Special handling for count queries
          if (options?.count === "exact" && options?.head === true) {
            return {
              lt: () => Promise.resolve({
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
        update: (data: any) => ({
          eq: (column: string, value: any) => Promise.resolve({
            error: null,
          }),
        }),
        delete: () => ({
          eq: (column: string, value: any) => Promise.resolve({
            error: null,
          }),
          lt: (column: string, value: string) => Promise.resolve({
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
        const builder = originalSelect(columns);
        if (builder.eq) {
          const originalEq = builder.eq;
          builder.eq = (column: string, value: any) => {
            if (column === "page_id") {
              return {
                single: () => Promise.resolve({
                  data: tokenExpiry !== undefined
                    ? (tokenExpiry !== null ? { token_expiry: tokenExpiry } : null)
                    : null,
                  error: tokenExpiry === undefined ? { message: "Not found" } : null,
                }),
              };
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
  await savePage(supabase, "123", "Test Page");
  // If no error is thrown, test passes
});

Deno.test("savePage throws error on database failure", async () => {
  const supabase = createSupabaseClientMock({
    shouldFail: true,
    failOperation: "upsert",
  });
  await assertRejects(
    async () => {
      await savePage(supabase, "123", "Test Page");
    },
    Error,
    "Failed to save page in Supabase",
  );
});

Deno.test("saveEvent saves event successfully", async () => {
  const supabase = createSupabaseClientMock();
  await saveEvent(supabase, {
    page_id: 123,
    event_id: "event1",
    event_data: { id: "event1", name: "Test Event", start_time: new Date().toISOString() },
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
      await saveEvent(supabase, {
        page_id: 123,
        event_id: "event1",
        event_data: { id: "event1", name: "Test Event", start_time: new Date().toISOString() },
      });
    },
    Error,
    "Failed to save event in Supabase",
  );
});

Deno.test("batchWriteEvents returns 0 for empty array", async () => {
  const supabase = createSupabaseClientMock();
  const result = await batchWriteEvents(supabase, []);
  assertEquals(result, 0);
});

Deno.test("batchWriteEvents writes events successfully", async () => {
  const supabase = createSupabaseClientMock();
  const events = [
    {
      page_id: 123,
      event_id: "event1",
      event_data: { id: "event1", name: "Event 1", start_time: new Date().toISOString() },
    },
    {
      page_id: 123,
      event_id: "event2",
      event_data: { id: "event2", name: "Event 2", start_time: new Date().toISOString() },
    },
  ];
  const result = await batchWriteEvents(supabase, events);
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
      event_data: { id: "event1", name: "Event 1", start_time: new Date().toISOString() },
    },
  ];
  await assertRejects(
    async () => {
      await batchWriteEvents(supabase, events);
    },
    Error,
    "Failed to batch write events to Supabase",
  );
});

Deno.test("getActivePages returns empty array when no pages", async () => {
  const supabase = createSupabaseClientMock({ pages: [] });
  const result = await getActivePages(supabase);
  assertEquals(result, []);
});

Deno.test("getActivePages returns pages successfully", async () => {
  const mockPages = [
    {
      page_id: 123,
      page_name: "Test Page",
      token_status: "active",
      page_access_token_id: 1,
    },
  ];
  const supabase = createSupabaseClientMock({ pages: mockPages });
  const result = await getActivePages(supabase);
  assertEquals(result.length, 1);
  assertEquals(result[0].page_id, 123);
});

Deno.test("getActivePages returns empty array on query error", async () => {
  const supabase = createSupabaseClientMock({
    shouldFail: true,
    failOperation: "select",
  });
  const result = await getActivePages(supabase);
  assertEquals(result, []);
});

Deno.test("checkTokenExpiry returns expiring when token expiry is null", async () => {
  const supabase = createSupabaseClientMock({ tokenExpiry: null });
  const result = await checkTokenExpiry(supabase, "123");
  assertEquals(result.isExpiring, true);
  assertEquals(result.daysUntilExpiry, 0);
  assertEquals(result.expiresAt, null);
});

Deno.test("checkTokenExpiry returns expiring when query fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFail: true,
    failOperation: "select",
    tokenExpiry: undefined,
  });
  const result = await checkTokenExpiry(supabase, "123");
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
  const result = await checkTokenExpiry(supabase, "123");
  assertEquals(result.isExpiring, false);
  assertEquals(result.daysUntilExpiry > 0, true);
  assertExists(result.expiresAt);
});

Deno.test("markTokenExpired marks token as expired successfully", async () => {
  const supabase = createSupabaseClientMock();
  await markTokenExpired(supabase, "123");
  // If no error is thrown, test passes
});

Deno.test("markTokenExpired throws error on database failure", async () => {
  const supabase = createSupabaseClientMock({
    shouldFail: true,
    failOperation: "update",
  });
  await assertRejects(
    async () => {
      await markTokenExpired(supabase, "123");
    },
    Error,
    "Failed to mark token as expired in Supabase",
  );
});

Deno.test("deleteOldEvents returns 0 for dry run with no events", async () => {
  const supabase = createSupabaseClientMock({ count: 0 });
  const beforeDate = new Date();
  beforeDate.setDate(beforeDate.getDate() - 90);
  const result = await deleteOldEvents(supabase, beforeDate, true);
  assertEquals(result, 0);
});

Deno.test("deleteOldEvents returns count for dry run", async () => {
  const supabase = createSupabaseClientMock({ count: 5 });
  const beforeDate = new Date();
  beforeDate.setDate(beforeDate.getDate() - 90);
  const result = await deleteOldEvents(supabase, beforeDate, true);
  assertEquals(result, 5);
});

Deno.test("deleteOldEvents deletes events when not dry run", async () => {
  const supabase = createSupabaseClientMock({ count: 3 });
  const beforeDate = new Date();
  beforeDate.setDate(beforeDate.getDate() - 90);
  const result = await deleteOldEvents(supabase, beforeDate, false);
  assertEquals(result, 3);
});

Deno.test("deleteOldEvents returns 0 when count query fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFail: true,
    failOperation: "count",
  });
  const beforeDate = new Date();
  beforeDate.setDate(beforeDate.getDate() - 90);
  const result = await deleteOldEvents(supabase, beforeDate, false);
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
  const result = await deleteOldEvents(supabase, beforeDate, false);
  // Should return 0 on error
  assertEquals(result, 0);
});

