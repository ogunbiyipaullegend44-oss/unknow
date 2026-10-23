import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: 'asset-manifest.json',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: false,
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:3001',
    },
  },
});
