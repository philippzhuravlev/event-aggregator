import { useEffect } from 'react';
import { handleOAuthRedirect } from '../utils/oauth';

/**
 * Hook to handle OAuth redirect from Facebook on component mount
 * Handles all stages of the OAuth flow:
 * 1. Initial Facebook callback with authorization code
 * 2. Backend redirect with success/error after token exchange
 */
export function useOAuthRedirect(): void {
  // this just does an effect when clicked. We've sent the code to oauth.ts to 
  // consolidate URL stuff, but could have honestly also just been here
  useEffect(() => {
    handleOAuthRedirect();
  }, []);
}
