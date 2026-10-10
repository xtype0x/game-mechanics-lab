import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative assets + hash navigation support project subpaths on static hosts.
// The gacha simulator (/gacha/) and the battle lab (/battle/) are extra entry pages so their global styles and hashes stay isolated.
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@ggt/core': fileURLToPath(new URL('./src/lib/core/index.ts', import.meta.url)) } },
  optimizeDeps: { entries: ['index.html', 'gacha/index.html', 'battle/index.html'] },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        gacha: fileURLToPath(new URL('./gacha/index.html', import.meta.url)),
        battle: fileURLToPath(new URL('./battle/index.html', import.meta.url)),
      },
    },
  },
});
