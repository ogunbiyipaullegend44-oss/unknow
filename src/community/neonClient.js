import { BetterAuthVanillaAdapter, createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim() || '';
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL?.trim() || '';

let configError = null;
if (!authUrl || !dataApiUrl) {
  configError = 'Neon is not configured. Set VITE_NEON_AUTH_URL and VITE_NEON_DATA_API_URL, then restart the app.';
} else {
  try {
    for (const value of [authUrl, dataApiUrl]) {
      const parsedUrl = new URL(value);
      if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) throw new Error();
    }
  } catch {
    configError = 'Neon Auth and Data API URLs must be valid HTTP or HTTPS URLs.';
  }
}

export const neonConfigError = configError;

export const neon = neonConfigError
  ? null
  : createClient({
    auth: { url: authUrl, adapter: SupabaseAuthAdapter() },
    dataApi: { url: dataApiUrl },
  });

export const neonRegistration = neonConfigError
  ? null
  : createClient({
    auth: { url: authUrl, adapter: BetterAuthVanillaAdapter() },
    dataApi: { url: dataApiUrl },
  });
