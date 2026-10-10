import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Standalone gacha simulator: one self-contained HTML file (works offline, easy to embed or host statically).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: { "@ggt/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)) },
  },
  server: { port: 5190, strictPort: true },
  preview: { port: 4190, strictPort: true },
});
