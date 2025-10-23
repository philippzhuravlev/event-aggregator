import { useEffect } from 'react';
import { handleOAuthRedirect } from '../utils/oauth';

/**
 * Hook to handle OAuth redirect from Facebook on component mount
 */
export function useOAuthRedirect(): void {
  // this just does an effect when clicked. We've sent the code to oauth.ts to 
  // consolidate URL stuff, but could have honestly also just been here
  useEffect(() => {
    handleOAuthRedirect();
  }, []);
}
