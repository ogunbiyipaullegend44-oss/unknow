import { spawnSync } from 'node:child_process';

const apiBaseUrl = process.env.NATIVE_API_BASE_URL || 'https://unknow-dun.vercel.app';
let parsedApiUrl;
try {
  parsedApiUrl = new URL(apiBaseUrl);
} catch {
  throw new Error('NATIVE_API_BASE_URL must be a valid HTTPS URL.');
}
if (parsedApiUrl.protocol !== 'https:') {
  throw new Error('NATIVE_API_BASE_URL must use HTTPS.');
}

const result = spawnSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build'],
  {
    env: {
      ...process.env,
      VITE_API_BASE_URL: parsedApiUrl.origin,
    },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
