import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { allPages } from './build/pages.mjs';

// A convenient preview artifact; normal web deployment still uses vite.config.ts.
// Single-file output cannot hold several pages, so build/offline.mjs builds each page on its own with
// `--mode <page id>` (ids from build/pages.mjs; "main" is the home page) into the same folder.
export default defineConfig(({ mode }) => {
  const pages = allPages();
  const id = mode in pages ? mode : 'main';
  return {
    plugins: [react(), viteSingleFile()],
    base: './',
    build: {
      outDir: 'offline',
      emptyOutDir: id === 'main',
      rollupOptions: { input: fileURLToPath(new URL(`./${pages[id]}`, import.meta.url)) },
    },
  };
});
