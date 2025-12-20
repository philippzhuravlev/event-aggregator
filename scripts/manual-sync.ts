#!/usr/bin/env deno run --allow-env --allow-net

/**
 * Manual Event Sync Script
 *
 * Triggers a manual sync of events from Facebook to Supabase.
 * Requires SYNC_TOKEN to be set in environment (.env file).
 *
 * Usage:
 *   deno run --allow-env --allow-net --allow-read scripts/manual-sync.ts
 *
 * Options:
 *   --token <token>     Override SYNC_TOKEN from environment
 *   --url <url>         Override sync endpoint URL (default: http://localhost:54321/functions/v1/sync-events)
 *   --production        Use production endpoint instead of local
 *   --dry-run           Simulate sync without making requests (validation only)
 */

import { parseArgs } from "std/cli/parse_args.ts";

interface SyncResponse {
  success: boolean;
  message: string;
  data?: {
    success: boolean;
    pagesProcessed: number;
    eventsAdded: number;
    eventsUpdated: number;
    errors: Array<{ pageId: string; error: string }>;
    timestamp: string;
  };
}

async function checkServerHealth(url: string): Promise<boolean> {
  // Skip health check for production (remote) URLs
  if (!url.includes("localhost")) {
    return true;
  }

  try {
    const healthUrl = url.replace("/sync-events", "/health-check");
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function loadEnvFile(): Promise<Record<string, string>> {
  const env: Record<string, string> = {};

  // Load from supabase/functions/.env
  const envPath = "supabase/functions/.env";

  try {
    const envContent = await Deno.readTextFile(envPath);
    console.log(`[OK] Found .env at: ${envPath}\n`);

    for (const line of envContent.split("\n")) {
      // Handle Windows line endings (\r\n)
      const trimmed = line.replace(/\r/g, "").trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) continue;

      const key = trimmed.substring(0, equalsIndex).trim();
      const rawValue = trimmed.substring(equalsIndex + 1).trim();

      // Remove inline comments - handle both quoted and unquoted values
      // First, handle quoted values (keep everything inside quotes)
      let value: string;
      if (
        (rawValue.startsWith('"') && rawValue.includes('"', 1)) ||
        (rawValue.startsWith("'") && rawValue.includes("'", 1))
      ) {
        // Quoted value - extract what's inside quotes
        const quote = rawValue[0];
        const endQuoteIndex = rawValue.indexOf(quote, 1);
        value = rawValue.substring(1, endQuoteIndex);
      } else {
        // Unquoted value - split on first space or # (comment)
        value = rawValue.split(/[\s#]/)[0].trim();
      }

      if (key) {
        env[key] = value;
      }
    }

    if (Object.keys(env).length > 0) {
      console.log(`[OK] Loaded ${Object.keys(env).length} env variables\n`);
      return env;
    }
  } catch (_error) {
    console.error(`[ERROR] Failed to read .env file: ${envPath}`);
    console.error(
      `   Error: ${_error instanceof Error ? _error.message : String(_error)}\n`,
    );
  }

  return env;
}

async function manualSync(): Promise<void> {
  const args = parseArgs(Deno.args, {
    string: ["token", "url"],
    boolean: ["production", "dry-run"],
    default: {
      production: false,
      "dry-run": false,
    },
  });

  console.log("Event Aggregator - Manual Sync Script\n");

  // Load environment
  const env = await loadEnvFile();

  const syncToken = args.token || Deno.env.get("SYNC_TOKEN") || env.SYNC_TOKEN;

  if (!syncToken) {
    console.error("[ERROR] SYNC_TOKEN not found");
    console.error(
      "   Pass --token <token> or set SYNC_TOKEN in supabase/functions/.env\n",
    );
    Deno.exit(1);
  }

  // For production, we also need the Supabase anon key for the apikey header
  const supabaseAnonKey = args.production
    ? (Deno.env.get("REMOTE_SUPABASE_ANON_KEY") || env.REMOTE_SUPABASE_ANON_KEY)
    : null;

  if (args["dry-run"]) {
    console.log("[DRY-RUN] Mode enabled (validation only)\n");
  }

  // Determine endpoint URL
  let syncUrl = args.url;
  if (!syncUrl) {
    if (args.production) {
      // Use remote URL from env if available
      const remoteUrl = env.REMOTE_SUPABASE_URL ||
        Deno.env.get("REMOTE_SUPABASE_URL");
      syncUrl = remoteUrl
        ? `${remoteUrl}/functions/v1/sync-events`
        : "https://your-project.supabase.co/functions/v1/sync-events";
    } else {
      syncUrl = "http://localhost:54321/functions/v1/sync-events";
    }
  }

  console.log(`[ENDPOINT] ${syncUrl}`);
  console.log(`[TOKEN] ${syncToken.slice(0, 8)}...${syncToken.slice(-4)}`);
  console.log(`   Full token length: ${syncToken.length} chars\n`);

  if (args["dry-run"]) {
    console.log("[OK] Configuration validated");
    console.log("(No actual request would be sent in dry-run mode)\n");
    Deno.exit(0);
  }

  try {
    // Check if server is running first
    console.log("[CHECK] Checking server health...");
    const isHealthy = await checkServerHealth(syncUrl);

    if (!isHealthy) {
      console.error("\n[ERROR] Supabase server is not responding\n");
      console.error("To start the local Supabase server:");
      console.error("  cd supabase");
      console.error("  supabase start\n");
      console.error("Then run this script again.\n");
      Deno.exit(1);
    }
    console.log("[OK] Server is responding\n");

    console.log("[SYNC] Triggering sync...\n");
    const startTime = Date.now();

    const response = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${syncToken}`,
        ...(supabaseAnonKey && { "apikey": supabaseAnonKey }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const elapsed = Date.now() - startTime;
    const data: SyncResponse = await response.json();

    if (response.ok && data.data?.success) {
      console.log("[SUCCESS] Sync completed successfully!\n");
      console.log(`[RESULTS]`);
      console.log(`   Pages processed: ${data.data.pagesProcessed}`);
      console.log(`   Events added: ${data.data.eventsAdded}`);
      console.log(`   Events updated: ${data.data.eventsUpdated}`);

      if (data.data.errors.length > 0) {
        console.log(`\n[WARNING] Errors encountered:`);
        for (const error of data.data.errors) {
          console.log(`   - Page ${error.pageId}: ${error.error}`);
        }
      }

      console.log(`\n[TIME] Completed in ${elapsed}ms`);
      console.log(`[TIMESTAMP] ${data.data.timestamp}`);
    } else {
      console.error("[ERROR] Sync failed\n");
      console.error(`Status: ${response.status}`);
      console.error(`Response: ${JSON.stringify(data, null, 2)}`);
      Deno.exit(1);
    }
  } catch (error) {
    console.error("[ERROR] Request failed\n");

    if (error instanceof Error) {
      const errorMsg = error.message;
      console.error(`Error: ${errorMsg}\n`);

      // Detailed debugging based on error type
      if (
        errorMsg.includes("Connection refused") ||
        errorMsg.includes("actively refused")
      ) {
        console.error("[HINT] The Supabase server is not running.\n");
        console.error("To start it:");
        console.error("  cd supabase");
        console.error("  supabase start\n");
      } else if (
        errorMsg.includes("ENOTFOUND") || errorMsg.includes("getaddrinfo")
      ) {
        console.error("[HINT] Cannot resolve the server address.\n");
        console.error("Check that the URL is correct:");
        console.error(`  Expected: ${syncUrl}\n`);
      } else if (errorMsg.includes("timeout")) {
        console.error(
          "[HINT] Request timed out - server took too long to respond.\n",
        );
        console.error("The server may be overloaded or unreachable.\n");
      }

      console.error("Debugging info:");
      console.error(`  Endpoint: ${syncUrl}`);
      console.error(
        `  Environment: ${args.production ? "production" : "local"}`,
      );
      console.error(`  Token provided: ${syncToken ? "yes" : "no"}\n`);
    } else {
      console.error(`Error: ${error}`);
    }
    Deno.exit(1);
  }
}

await manualSync();
