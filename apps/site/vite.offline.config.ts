import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// A convenient preview artifact; normal web deployment still uses vite.config.ts.
// Single-file output cannot hold several pages, so each page is built on its own:
// the default mode builds index.html, `--mode <name>` builds the matching page into the same folder.
// Mode names cannot contain slashes, so nested pages use a dash: `hsr-battle` -> hsr/battle/index.html.
const SUB_PAGES: Record<string, string> = { gacha: 'gacha', 'hsr-battle': 'hsr/battle', battle: 'battle' };

export default defineConfig(({ mode }) => {
  const page = SUB_PAGES[mode] ?? null;
  return {
    plugins: [react(), viteSingleFile()],
    base: './',
    resolve: { alias: { '@ggt/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)) } },
    build: {
      outDir: 'offline',
      emptyOutDir: page === null,
      rollupOptions: { input: fileURLToPath(new URL(page ? `./${page}/index.html` : './index.html', import.meta.url)) },
    },
  };
});
