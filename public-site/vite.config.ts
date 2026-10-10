import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative assets + hash navigation support project subpaths on static hosts.
// The gacha simulator is a second entry page (/gacha/) so its global styles and share-link hash stay isolated.
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@ggt/core': fileURLToPath(new URL('./src/lib/core/index.ts', import.meta.url)) } },
  optimizeDeps: { entries: ['index.html', 'gacha/index.html'] },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        gacha: fileURLToPath(new URL('./gacha/index.html', import.meta.url)),
      },
    },
  },
});
