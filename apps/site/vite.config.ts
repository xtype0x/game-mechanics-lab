import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { allPages } from './build/pages.mjs';

// Relative assets + hash navigation support project subpaths on static hosts.
// Pages: the home page, old-link redirects, and one generated page per projects/<id> (see build/pages.mjs).
const pages = allPages();

export default defineConfig({
  plugins: [react()],
  base: './',
  optimizeDeps: { entries: Object.values(pages) },
  build: {
    rollupOptions: {
      input: Object.fromEntries(Object.entries(pages).map(([id, file]) => [id, fileURLToPath(new URL(`./${file}`, import.meta.url))])),
    },
  },
});
