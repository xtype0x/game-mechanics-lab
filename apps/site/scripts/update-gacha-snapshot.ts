/**
 * Refreshes apps/site/src/tools/gacha/catalog/snapshot.json from the public sources (the same code the app runs in the browser).
 * The app shows the snapshot instantly and offline, and replaces it with live data when the sources respond.
 *   npm run sim:snapshot
 */
import { writeFileSync } from "node:fs";
import { fetchLive } from "../src/tools/gacha/catalog/live.ts";

const data = await fetchLive(20000);
const failed = Object.entries(data.sources).filter(([, v]) => v !== "ok");
if (failed.length === Object.keys(data.sources).length) {
  console.error("all sources failed; snapshot left unchanged:", data.sources);
  process.exit(1);
}
writeFileSync(new URL("../src/tools/gacha/catalog/snapshot.json", import.meta.url), JSON.stringify(data, null, 2) + "\n");
console.log(`snapshot: ${data.banners.length} banners`, data.sources);
