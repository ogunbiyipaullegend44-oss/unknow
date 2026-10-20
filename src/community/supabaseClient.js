import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

let configError = null;
if (!url || !anonKey) {
  configError = 'Community sharing is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment, then restart the app.';
} else {
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) throw new Error();
  } catch {
    configError = 'VITE_SUPABASE_URL must be a valid HTTP or HTTPS project URL.';
  }
}

export const supabaseConfigError = configError;

export const supabase = supabaseConfigError
  ? null
  : createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
