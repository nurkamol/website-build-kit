import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Relative base: the page is served at /website-build-kit/ on GitHub Pages and at /
// by the gates in pages.yml, and both must resolve the same assets.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 4320, strictPort: true, host: '127.0.0.1' },
});
