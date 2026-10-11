// Type-checks every workspace folder that has a tsconfig.json: packages/*, apps/*, projects/* (no list to maintain).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsc = join(dirname(createRequire(join(root, "package.json")).resolve("typescript/package.json")), "bin/tsc");
const dirs = ["packages", "apps", "projects"].flatMap((group) =>
  existsSync(join(root, group)) ? readdirSync(join(root, group), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `${group}/${d.name}`) : [],
).filter((d) => existsSync(join(root, d, "tsconfig.json")));

let failed = 0;
for (const d of dirs) {
  const r = spawnSync(process.execPath, [tsc, "-p", d, "--noEmit"], { cwd: root, stdio: "inherit" });
  console.log(`${r.status === 0 ? "ok  " : "FAIL"} ${d}`);
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
