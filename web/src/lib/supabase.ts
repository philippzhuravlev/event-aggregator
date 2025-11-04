import { createClient } from '@supabase/supabase-js';

// lib folders in frontend is confusingly enough not the same as lib folders in backend, which usually means 
// "shared code". Instead, /lib/ in frontend means setup logic for core and central frameworks, services, 
// libraries, APIs etc. Meanwhile the actual connection to these services is in /services/.

// This file specifically handles Supabase setup and initialization

// Secrets from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize Supabase client (will fail gracefully if env vars are missing)
export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
