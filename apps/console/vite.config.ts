import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { singleFile } from "../../tools/vite-single-file";

// Build output is one self-contained HTML file that works offline when opened directly.
export default defineConfig({
  plugins: [react(), singleFile()],
  server: { port: 5173, strictPort: true },
});
