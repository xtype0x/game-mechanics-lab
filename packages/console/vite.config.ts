import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Build output is one self-contained HTML file that works offline when opened directly.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: { "@ggt/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
});
