// Builds every page as a self-contained HTML file under offline/ (home page first, since it empties the folder).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { allPages, SITE_DIR } from "./pages.mjs";

const vite = join(dirname(createRequire(import.meta.url).resolve("vite/package.json")), "bin/vite.js");
const ids = Object.keys(allPages()).sort((a, b) => (a === "main" ? -1 : b === "main" ? 1 : 0));
for (const id of ids) {
  const r = spawnSync(process.execPath, [vite, "build", "--config", "vite.offline.config.ts", "--mode", id], { cwd: SITE_DIR, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
