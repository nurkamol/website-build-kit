import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `npm run dev` serves the page with hot reload on 4318 and sends /api to the
// real server, which `npm run serve -- --site <dir>` runs on 4319.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4318,
    strictPort: true,
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:4319' },
  },
});
