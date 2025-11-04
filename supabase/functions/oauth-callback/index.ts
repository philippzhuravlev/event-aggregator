// @ts-ignore - Deno import
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

// You're in /supabase/functions, which is where Supabase Edge Functions live.
// A "function" is often called "serverless" because it runs on-demand without
// a dedicated server, like e.g. when you deploy to AWS Lambda or Vercel Functions.
// Edge Functions are similar, but run on the "edge" closer to the user for lower latency.
// They're meant to be lightweight and fast, so that's why we haven't imported the entire
// /functions backend code here. "deno" is the runtime used by Supabase Edge Functions,
// similar to Node.js but with some differences (e.g. built-in fetch, different module system).

interface Request {
  method: string;
  url: string;
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // This is the frontend origin
    const error = url.searchParams.get("error");

    if (error) {
      // Redirect back to frontend with error
      const redirectUrl = `${state}?error=${encodeURIComponent(error)}`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectUrl,
        },
      });
    }

    if (!code) {
      return new Response(
        JSON.stringify({ error: "No authorization code provided" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Call your backend to exchange code for tokens and sync events
    // For local dev, Edge Functions can't access localhost
    // In production, set BACKEND_URL environment variable
    // @ts-ignore - Deno runtime available in Supabase Edge Functions
    const backendBaseUrl = typeof Deno !== 'undefined' && Deno.env ? (Deno.env.get("BACKEND_URL") || "http://localhost:8080") : "http://localhost:8080";
    const backendUrl = `${backendBaseUrl}/facebook-callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || "")}`;
    
    console.log(`Calling backend at: ${backendUrl}`);
    
    const backendResponse = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    const backendText = await backendResponse.text();
    console.log(`Backend response status: ${backendResponse.status}, body: ${backendText}`);
    
    let backendData;
    try {
      backendData = JSON.parse(backendText);
    } catch (e) {
      console.error(`Failed to parse backend response: ${backendText}`);
      const redirectUrl = `${state}?error=${encodeURIComponent("Backend response parsing failed")}`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectUrl,
        },
      });
    }

    if (!backendResponse.ok) {
      const redirectUrl = `${state}?error=${encodeURIComponent(backendData.error || "Backend error")}`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectUrl,
        },
      });
    }

    // Redirect back to frontend with success
    const { pages_count = 0, events_count = 0 } = backendData;
    const redirectUrl = `${state}?success=true&pages=${pages_count}&events=${events_count}`;
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
