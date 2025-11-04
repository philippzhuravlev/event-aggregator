// Simple health-check Edge Function for Supabase
export default async function handler(req: Request) {
  const now = new Date().toISOString();
  const body = {
    status: 'ok',
    timestamp: now,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}


