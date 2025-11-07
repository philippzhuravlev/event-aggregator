// Debug file to verify environment variables are accessible
export function debugEnv() {
  const vars = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_BACKEND_URL: import.meta.env.VITE_BACKEND_URL,
    VITE_USE_BACKEND_API: import.meta.env.VITE_USE_BACKEND_API,
    VITE_FACEBOOK_APP_ID: import.meta.env.VITE_FACEBOOK_APP_ID,
  };
  
  console.log('=== ENVIRONMENT VARIABLES ===');
  Object.entries(vars).forEach(([key, value]) => {
    console.log(`${key}: ${value ? '✓ SET' : '✗ MISSING'}`);
    if (value) {
      // Show first 20 chars of sensitive values
      if (key.includes('KEY')) {
        console.log(`  → ${String(value).substring(0, 20)}...`);
      } else {
        console.log(`  → ${value}`);
      }
    }
  });
  
  return vars;
}
