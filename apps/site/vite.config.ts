import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative assets + hash navigation support project subpaths on static hosts.
// The gacha simulator (/gacha/) and the battle lab (/hsr/battle/) are extra entry pages so their global styles and hashes stay isolated.
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@ggt/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)) } },
  optimizeDeps: { entries: ['index.html', 'gacha/index.html', 'hsr/battle/index.html', 'battle/index.html'] },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        gacha: fileURLToPath(new URL('./gacha/index.html', import.meta.url)),
        'hsr-battle': fileURLToPath(new URL('./hsr/battle/index.html', import.meta.url)),
        battle: fileURLToPath(new URL('./battle/index.html', import.meta.url)), // tiny redirect to hsr/battle for old links
      },
    },
  },
});
