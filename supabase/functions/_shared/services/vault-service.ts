import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger-service.ts";

/**
 * VaultService manages encrypted secret storage in Supabase Vault.
 *
 * Vault is a PostgreSQL extension that stores encrypted secrets with:
 * - Authenticated Encryption with Associated Data (AEAD) using libsodium
 * - Transparent Column Encryption (TCE) - secrets stored encrypted on disk
 * - Encryption keys managed separately from database
 * - Access via SQL views (vault.decrypted_secrets)
 *
 * See: https://supabase.com/docs/guides/database/vault
 */

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, Supabase and
// secrets manager. The term could also mean like an internal service, e.g.
// authentication or handling tokens, but here we've outsourced it to supabase/meta
// Services should not be confused with "handlers" that do business logic

// In database storage, you store data in a SQL or NoSQL database, simple as. However,
// for tokens, you put them in a vault, right? It's just a simple list, really. Same
// principle for images - you don't want to bloat your database with large binary files,
// making it impossible to search for etc. And so, you have "Storage" services like our
// Supabase Storage, which is optimized for storing files like images, gifs, videos, webps
// Vault is new but is extra secure; if a database is compromised, the secrets are still encrypted

/**
 * Store a Facebook page access token securely in Supabase Vault (encrypted)
 * and store token metadata in the pages table for expiry tracking.
 *
 * @param supabase - Supabase client
 * @param pageId - Facebook page ID
 * @param accessToken - Facebook page access token (will be encrypted in vault)
 * @param expiresInDays - Days until token expiry
 * @returns Promise<void>
 * @throws Error if storage fails
 */
export async function storePageToken(
  supabase: SupabaseClient,
  pageId: string,
  accessToken: string,
  expiresInDays: number,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + expiresInDays * 24 * 60 * 60 * 1000,
  );
  const secretName = `facebook-token-${pageId}`;

  try {
    // Step 1: Store encrypted token in Supabase Vault using RPC
    // The vault.create_secret function will encrypt and store the token securely
    const { data: createData, error: createError } =
      // deno-lint-ignore no-explicit-any
      await (supabase.rpc as any)(
        "vault.create_secret",
        {
          secret: accessToken,
          unique_name: secretName,
          description: `Facebook page token for ${pageId}`,
        },
      );

    if (createError) {
      logger.error("Failed to store token in Supabase Vault", null, {
        pageId,
        error: String(createError),
      });
      throw createError;
    }

    logger.info("Stored encrypted token in Supabase Vault", {
      pageId,
      secretId: createData,
    });

    // Step 2: Store token metadata in pages table for expiry tracking
    const pageData = {
      page_id: parseInt(pageId, 10),
      token_expiry: expiresAt.toISOString(),
      token_status: "active",
      updated_at: now.toISOString(),
      page_access_token_id: createData,
    };

    const { error: updateError } = await supabase
      .from("pages")
      .upsert(pageData);

    if (updateError) {
      logger.error("Failed to update page metadata in Supabase", null, {
        pageId,
        error: String(updateError),
      });
      throw new Error(
        `Cannot store token metadata: Supabase update failed for page ${pageId}`,
      );
    }

    logger.info("Stored token metadata in Supabase pages table", {
      pageId,
      expiresInDays,
    });
  } catch (error) {
    logger.error(
      "Failed to store page token",
      error instanceof Error ? error : null,
      { pageId },
    );
    throw new Error(
      `Cannot store token for ${pageId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Retrieve a Facebook page access token from Supabase Vault (encrypted, decrypted on read)
 *
 * @param supabase - Supabase client
 * @param pageId - Facebook page ID
 * @returns The decrypted access token or null if not found
 */
export async function getPageToken(
  supabase: SupabaseClient,
  pageId: string,
): Promise<string | null> {
  const secretName = `facebook-token-${pageId}`;

  try {
    // Query the vault.decrypted_secrets view which automatically decrypts secrets on read
    const { data, error } = await supabase
      .from("vault.decrypted_secrets")
      .select("decrypted_secret")
      .eq("unique_name", secretName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn("Failed to retrieve token from Supabase Vault", {
        pageId,
        errorMessage: error.message,
      });
      return null;
    }

    if (!data) {
      logger.warn("No token found in Supabase Vault", { pageId });
      return null;
    }

    // @ts-ignore - vault.decrypted_secrets returns decrypted_secret field
    return (data.decrypted_secret as string) || null;
  } catch (error) {
    logger.error(
      "Failed to retrieve token from Supabase Vault",
      error instanceof Error ? error : null,
      { pageId },
    );
    return null;
  }
}

/**
 * Get the API key for authenticating manual sync requests from Supabase Vault (encrypted)
 *
 * @param supabase - Supabase client
 * @returns The decrypted API key or null if not found
 */
export async function getApiKey(
  supabase: SupabaseClient,
): Promise<string | null> {
  const secretName = "API_SYNC_KEY";

  try {
    const { data, error } = await supabase
      .from("vault.decrypted_secrets")
      .select("decrypted_secret")
      .eq("unique_name", secretName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error("Failed to retrieve API key from Supabase Vault", null, {
        secretName,
        error: String(error),
      });
      return null;
    }

    if (!data) {
      logger.warn("No API key found in Supabase Vault", { secretName });
      return null;
    }

    // @ts-ignore - vault.decrypted_secrets returns decrypted_secret field
    return (data.decrypted_secret as string) || null;
  } catch (error) {
    logger.error(
      "Failed to retrieve API key from Supabase Vault",
      error instanceof Error ? error : null,
      { secretName },
    );
    return null;
  }
}

/**
 * Get the webhook verify token for Facebook webhook verification from Supabase Vault (encrypted)
 *
 * @param supabase - Supabase client
 * @returns The decrypted webhook verify token or null if not found
 */
export async function getWebhookVerifyToken(
  supabase: SupabaseClient,
): Promise<string | null> {
  const secretName = "WEBHOOK_VERIFY_TOKEN";

  try {
    const { data, error } = await supabase
      .from("vault.decrypted_secrets")
      .select("decrypted_secret")
      .eq("unique_name", secretName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error(
        "Failed to retrieve webhook verify token from Supabase Vault",
        null,
        { secretName, error: String(error) },
      );
      return null;
    }

    if (!data) {
      logger.warn("No webhook verify token found in Supabase Vault", {
        secretName,
      });
      return null;
    }

    // @ts-ignore - vault.decrypted_secrets returns decrypted_secret field
    return (data.decrypted_secret as string) || null;
  } catch (error) {
    logger.error(
      "Failed to retrieve webhook verify token from Supabase Vault",
      error instanceof Error ? error : null,
      { secretName },
    );
    return null;
  }
}

/**
 * Update a secret in Supabase Vault
 *
 * @param supabase - Supabase client
 * @param secretUuid - UUID of the secret to update
 * @param newSecret - New secret value
 * @param newUniqueName - Optional new unique name
 * @param newDescription - Optional new description
 * @returns Promise<void>
 * @throws Error if update fails
 */
export async function updateSecret(
  supabase: SupabaseClient,
  secretUuid: string,
  newSecret: string,
  newUniqueName?: string,
  newDescription?: string,
): Promise<void> {
  try {
    // deno-lint-ignore no-explicit-any
    const { error } = await (supabase.rpc as any)("vault.update_secret", {
      secret_id: secretUuid,
      secret: newSecret,
      unique_name: newUniqueName,
      description: newDescription,
    });

    if (error) {
      logger.error("Failed to update secret in Supabase Vault", null, {
        secretUuid,
        error: String(error),
      });
      throw error;
    }

    logger.info("Updated secret in Supabase Vault", { secretUuid });
  } catch (error) {
    logger.error(
      "Failed to update secret in Supabase Vault",
      error instanceof Error ? error : null,
      { secretUuid },
    );
    throw new Error(
      `Cannot update secret: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Delete a secret from Supabase Vault
 *
 * @param supabase - Supabase client
 * @param secretUuid - UUID of the secret to delete
 * @returns Promise<void>
 * @throws Error if deletion fails
 */
export async function deleteSecret(
  supabase: SupabaseClient,
  secretUuid: string,
): Promise<void> {
  try {
    // deno-lint-ignore no-explicit-any
    const { error } = await (supabase.rpc as any)("vault.delete_secret", {
      secret_id: secretUuid,
    });

    if (error) {
      logger.error("Failed to delete secret from Supabase Vault", null, {
        secretUuid,
        error: String(error),
      });
      throw error;
    }

    logger.info("Deleted secret from Supabase Vault", { secretUuid });
  } catch (error) {
    logger.error(
      "Failed to delete secret from Supabase Vault",
      error instanceof Error ? error : null,
      { secretUuid },
    );
    throw new Error(
      `Cannot delete secret: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
