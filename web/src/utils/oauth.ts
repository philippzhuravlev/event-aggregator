// OAuth utilities for Facebook authentication

/**
 * Build the Facebook OAuth login URL with proper parameters
 */
export function buildFacebookLoginUrl(): string {
  // here we actually make ("build") the url; arguments are passed and separated by "&"
  // we pass things as "state parameters", i.e. just telling the origin/destination
  // the state of things so it can't be hijacked/messed up along the way. This includes:
  // - FB_APP_ID (which app is making the request)
  // - FB_REDIRECT_URI (where to go back to after login)
  // - FB_SCOPES (what permissions are being requested, for us just reading things)
  // - currentOrigin (where the request came from, i.e. localhost, dtuevent.dk etc)
  const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID;
  const FB_REDIRECT_URI = encodeURIComponent(
    import.meta.env.VITE_OAUTH_CALLBACK_URL || 'https://europe-west1-dtuevent-8105b.cloudfunctions.net/facebookCallback'
  );
  const FB_SCOPES = [ // again, what permissions we want (just read stuff, basically
    'pages_show_list',
    'pages_read_engagement'
  ].join(',');

  const currentOrigin = encodeURIComponent(window.location.origin); // again, e.g. https://dtuevent.dk or http://localhost:3000;
  // this way, after oauth, we can return to the right place: localhost for dev, dtuevent.dk for prod
  
  return `https://www.facebook.com/v23.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${FB_REDIRECT_URI}&scope=${FB_SCOPES}&state=${currentOrigin}`;
}

/**
 * Handle OAuth redirect callback from Facebook
 * Checks URL params for success/error and displays appropriate messages
 */
export function handleOAuthRedirect(): void {
  // so when our user has been redirected to facebook, accepted/denied permissions, we need to handle that
  // return to our app by checking the URL parameters for success or errors.
  const params = new URLSearchParams(window.location.search); // gets the URL parameters from our browser
  const success = params.get('success'); // is param "success" set? 
  const error = params.get('error'); // is param "error" set? etc
  const pagesCount = params.get('pages');
  const eventsCount = params.get('events');
  
  if (success) { // so if set, show success message. TODO: In future, the UI should be improved
    alert(`Successfully connected ${pagesCount} Facebook page(s)! Synced ${eventsCount} events.`);
    window.history.replaceState({}, '', '/'); // clean our browser's url
    window.location.reload(); // reload our browser to fetch new data
  }
  if (error) { // if error param is set, show error message. Again, TODO: Better UI in future
    console.error(`OAuth Error: ${error}`); 
    alert(`OAuth failed: ${error}`);
    window.history.replaceState({}, '', '/');
  }
}
