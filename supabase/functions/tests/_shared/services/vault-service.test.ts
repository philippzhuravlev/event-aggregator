import {
  assertEquals,
  assertExists,
  assertRejects,
} from "std/assert/mod.ts";
import {
  storePageToken,
  getPageToken,
  getApiKey,
  getWebhookVerifyToken,
  updateSecret,
  deleteSecret,
} from "../../../_shared/services/vault-service.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

function createSupabaseClientMock(options?: {
  shouldFailRpc?: boolean;
  shouldFailUpsert?: boolean;
  rpcData?: unknown;
  rpcError?: Error | null;
  vaultData?: { decrypted_secret: string } | null;
  vaultError?: Error | null;
}) {
  const {
    shouldFailRpc = false,
    shouldFailUpsert = false,
    rpcData = "secret-uuid-123",
    rpcError = null,
    vaultData = { decrypted_secret: "test-token" },
    vaultError = null,
  } = options || {};

  return {
    rpc: (functionName: string, params?: unknown) => {
      if (shouldFailRpc || rpcError) {
        return Promise.resolve({
          data: null,
          error: rpcError || { message: "RPC failed" },
        });
      }
      return Promise.resolve({ data: rpcData, error: null });
    },
    from: (table: string) => {
      if (table === "vault.decrypted_secrets") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => {
                    if (vaultError) {
                      return Promise.resolve({
                        data: null,
                        error: vaultError,
                      });
                    }
                    return Promise.resolve({
                      data: vaultData,
                      error: null,
                    });
                  },
                }),
              }),
            }),
          }),
        };
      }
      if (table === "pages") {
        return {
          upsert: (data: unknown) => {
            if (shouldFailUpsert) {
              return Promise.resolve({
                error: { message: "Upsert failed" },
              });
            }
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
  };
}

Deno.test("storePageToken stores token successfully", async () => {
  const supabase = createSupabaseClientMock({
    rpcData: "secret-uuid-123",
  });

  await storePageToken(
    supabase as unknown as SupabaseClient,
    "123",
    "test-access-token",
    30,
  );

  // If no error is thrown, the test passes
  assertEquals(true, true);
});

Deno.test("storePageToken throws error when RPC fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFailRpc: true,
    rpcError: { message: "Vault RPC failed" },
  });

  await assertRejects(
    async () => {
      await storePageToken(
        supabase as unknown as SupabaseClient,
        "123",
        "test-access-token",
        30,
      );
    },
    Error,
    "Cannot store token for 123",
  );
});

Deno.test("storePageToken throws error when upsert fails", async () => {
  const supabase = createSupabaseClientMock({
    rpcData: "secret-uuid-123",
    shouldFailUpsert: true,
  });

  await assertRejects(
    async () => {
      await storePageToken(
        supabase as unknown as SupabaseClient,
        "123",
        "test-access-token",
        30,
      );
    },
    Error,
    "Cannot store token for 123",
  );
});

Deno.test("getPageToken retrieves token successfully", async () => {
  const supabase = createSupabaseClientMock({
    vaultData: { decrypted_secret: "test-access-token" },
  });

  const token = await getPageToken(
    supabase as unknown as SupabaseClient,
    "123",
  );

  assertEquals(token, "test-access-token");
});

Deno.test("getPageToken returns null when token not found", async () => {
  const supabase = createSupabaseClientMock({
    vaultData: null,
  });

  const token = await getPageToken(
    supabase as unknown as SupabaseClient,
    "123",
  );

  assertEquals(token, null);
});

Deno.test("getPageToken returns null when query fails", async () => {
  const supabase = createSupabaseClientMock({
    vaultError: { message: "Query failed" },
  });

  const token = await getPageToken(
    supabase as unknown as SupabaseClient,
    "123",
  );

  assertEquals(token, null);
});

Deno.test("getApiKey retrieves API key successfully", async () => {
  const supabase = createSupabaseClientMock({
    vaultData: { decrypted_secret: "test-api-key" },
  });

  const apiKey = await getApiKey(supabase as unknown as SupabaseClient);

  assertEquals(apiKey, "test-api-key");
});

Deno.test("getApiKey returns null when key not found", async () => {
  const supabase = createSupabaseClientMock({
    vaultData: null,
  });

  const apiKey = await getApiKey(supabase as unknown as SupabaseClient);

  assertEquals(apiKey, null);
});

Deno.test("getApiKey returns null when query fails", async () => {
  const supabase = createSupabaseClientMock({
    vaultError: { message: "Query failed" },
  });

  const apiKey = await getApiKey(supabase as unknown as SupabaseClient);

  assertEquals(apiKey, null);
});

Deno.test("getWebhookVerifyToken retrieves token successfully", async () => {
  const supabase = createSupabaseClientMock({
    vaultData: { decrypted_secret: "test-verify-token" },
  });

  const token = await getWebhookVerifyToken(
    supabase as unknown as SupabaseClient,
  );

  assertEquals(token, "test-verify-token");
});

Deno.test("getWebhookVerifyToken returns null when token not found", async () => {
  const supabase = createSupabaseClientMock({
    vaultData: null,
  });

  const token = await getWebhookVerifyToken(
    supabase as unknown as SupabaseClient,
  );

  assertEquals(token, null);
});

Deno.test("getWebhookVerifyToken returns null when query fails", async () => {
  const supabase = createSupabaseClientMock({
    vaultError: { message: "Query failed" },
  });

  const token = await getWebhookVerifyToken(
    supabase as unknown as SupabaseClient,
  );

  assertEquals(token, null);
});

Deno.test("updateSecret updates secret successfully", async () => {
  const supabase = createSupabaseClientMock({
    rpcData: null,
  });

  await updateSecret(
    supabase as unknown as SupabaseClient,
    "secret-uuid-123",
    "new-secret-value",
    "new-name",
    "new-description",
  );

  // If no error is thrown, the test passes
  assertEquals(true, true);
});

Deno.test("updateSecret throws error when RPC fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFailRpc: true,
    rpcError: { message: "Update failed" },
  });

  await assertRejects(
    async () => {
      await updateSecret(
        supabase as unknown as SupabaseClient,
        "secret-uuid-123",
        "new-secret-value",
      );
    },
    Error,
    "Cannot update secret",
  );
});

Deno.test("deleteSecret deletes secret successfully", async () => {
  const supabase = createSupabaseClientMock({
    rpcData: null,
  });

  await deleteSecret(
    supabase as unknown as SupabaseClient,
    "secret-uuid-123",
  );

  // If no error is thrown, the test passes
  assertEquals(true, true);
});

Deno.test("deleteSecret throws error when RPC fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFailRpc: true,
    rpcError: { message: "Delete failed" },
  });

  await assertRejects(
    async () => {
      await deleteSecret(
        supabase as unknown as SupabaseClient,
        "secret-uuid-123",
      );
    },
    Error,
    "Cannot delete secret",
  );
});

Deno.test("getPageToken returns null when decrypted_secret is empty string", async () => {
  const supabase = createSupabaseClientMock({
    vaultData: { decrypted_secret: "" },
  });

  const token = await getPageToken(
    supabase as unknown as SupabaseClient,
    "123",
  );

  assertEquals(token, null);
});

Deno.test("getApiKey returns null when decrypted_secret is empty string", async () => {
  const supabase = createSupabaseClientMock({
    vaultData: { decrypted_secret: "" },
  });

  const apiKey = await getApiKey(supabase as unknown as SupabaseClient);

  assertEquals(apiKey, null);
});

Deno.test("getWebhookVerifyToken returns null when decrypted_secret is empty string", async () => {
  const supabase = createSupabaseClientMock({
    vaultData: { decrypted_secret: "" },
  });

  const token = await getWebhookVerifyToken(
    supabase as unknown as SupabaseClient,
  );

  assertEquals(token, null);
});

Deno.test("updateSecret handles non-Error exceptions", async () => {
  const supabase = {
    rpc: () => {
      throw "String error";
    },
  };

  await assertRejects(
    async () => {
      await updateSecret(
        supabase as unknown as SupabaseClient,
        "secret-uuid-123",
        "new-secret",
      );
    },
    Error,
    "Cannot update secret",
  );
});

Deno.test("deleteSecret handles non-Error exceptions", async () => {
  const supabase = {
    rpc: () => {
      throw "String error";
    },
  };

  await assertRejects(
    async () => {
      await deleteSecret(
        supabase as unknown as SupabaseClient,
        "secret-uuid-123",
      );
    },
    Error,
    "Cannot delete secret",
  );
});

Deno.test("storePageToken handles non-Error exceptions in catch block", async () => {
  const supabase = {
    rpc: () => {
      throw "String error in RPC";
    },
    from: () => ({}),
  };

  await assertRejects(
    async () => {
      await storePageToken(
        supabase as unknown as SupabaseClient,
        "123",
        "test-token",
        30,
      );
    },
    Error,
    "Cannot store token for 123",
  );
});

