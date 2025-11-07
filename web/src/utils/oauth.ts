// deno-lint-ignore-file
// OAuth utilities for Facebook authentication

/**
 * Build the Facebook OAuth login URL with proper parameters
 * Facebook will redirect to this URL with the authorization code
 */
export function buildFacebookLoginUrl(): string {
  // here we actually make ("build") the url; arguments are passed and separated by "&"
  // we pass things as "state parameters", i.e. just telling the origin/destination
  // the state of things so it can't be hijacked/messed up along the way. This includes:
  // - FB_APP_ID (which app is making the request)
  // - FB_REDIRECT_URI (where to go back to after login)
  // - FB_SCOPES (what permissions are being requested, for us just reading things)
  // - currentOrigin (where the request came from, used as state parameter for validation)
  const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID;
  const FB_REDIRECT_URI = import.meta.env.VITE_OAUTH_CALLBACK_URL || window.location.origin + '/oauth-callback';
  const FB_SCOPES = [ // what permissions we want (just read stuff, basically)
    'pages_show_list',
    'pages_read_engagement'
  ].join(',');

  const currentOrigin = window.location.origin; // e.g. http://localhost:5173 or https://event-aggregator-nine.vercel.app
  // The state parameter is sent to Facebook and will be returned to us
  // We use it to validate the request and know where to redirect after OAuth
  
  return `https://www.facebook.com/v23.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&scope=${FB_SCOPES}&state=${encodeURIComponent(currentOrigin)}`;
}

/**
 * Handle OAuth redirect flow - all stages in one place
 * 
 * This handles the complete OAuth flow:
 * 1. If we have a 'code' param: Facebook sent us here with an auth code → exchange it with backend
 * 2. If we have a 'success' param: Backend redirected us back after successful token exchange
 * 3. If we have an 'error' param: Something went wrong (from Facebook or backend)
 */
export async function handleOAuthRedirect(): Promise<void> {
  try {
    const params = new URLSearchParams(window.location.search); // gets the URL parameters from our browser
    const code = params.get('code');
    const success = params.get('success'); // is param "success" set?
    const error = params.get('error'); // is param "error" set?
    const errorDescription = params.get('error_description');
    const pagesCount = params.get('pages');
    const eventsCount = params.get('events');

    // Case 1: Facebook returned an error (user denied permissions, etc.)
    if (error) {
      console.error(`OAuth Error: ${error}${errorDescription ? ' - ' + errorDescription : ''}`);
      alert(`OAuth failed: ${error}`);
      window.history.replaceState({}, '', '/'); // clean our browser's url
      return;
    }

    // Case 2: Backend has already processed the callback and redirected back with success
    // This happens after the backend exchanges the code for a token and syncs events
    if (success) {
      alert(`Successfully connected ${pagesCount} Facebook page(s)! Synced ${eventsCount} events.`);
      window.history.replaceState({}, '', '/'); // clean our browser's url
      window.location.reload(); // reload our browser to fetch new data
      return;
    }

    // Case 3: We just received the code from Facebook (Step 1 of OAuth flow)
    // Now we need to send it to our backend to exchange it for tokens and sync events
    if (code) {
      // The state parameter should be the original app origin
      // This validates the request wasn't tampered with
      const state = window.location.origin;

      // Call the Supabase Edge Function to exchange code for tokens and sync events
      const edgeFunctionUrl = import.meta.env.VITE_BACKEND_URL || 'https://qdbtgfwxwwzwxpbcpfbn.supabase.co/functions/v1';
      const callbackUrl = `${edgeFunctionUrl}/oauth-callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
      
      const response = await fetch(callbackUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Token exchange failed:', errorData);
        alert(`Failed to sync events: ${errorData.error || 'Unknown error'}`);
        window.history.replaceState({}, '', '/');
        return;
      }

      // Backend exchange succeeded
      const data = await response.json();
      alert(`Successfully connected ${data.pages_count || 0} Facebook page(s)! Synced ${data.events_count || 0} events.`);
      window.history.replaceState({}, '', '/');
      window.location.reload(); // reload to fetch new events
      return;
    }

    // No relevant OAuth params found - nothing to do
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('OAuth error:', error);
    alert(`OAuth error: ${error}`);
    window.history.replaceState({}, '', '/');
  }
}
