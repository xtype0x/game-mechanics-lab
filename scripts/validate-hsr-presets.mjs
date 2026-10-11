#!/usr/bin/env node
// Validates every available preset in hsr.generated.json with the core's own code (loaded as TypeScript through
// vite's SSR loader, so the public-site copy of the core is what gets checked):
//   - the preset is placed into a default project's first ally slot (like PresetMenu does) and validateBattle
//     must report no errors for the whole battle config;
//   - one auto-battle per preset against the default encounter must run to an end without throwing.
// Exits non-zero on any problem. Run by build-hsr-presets.mjs; can be run alone.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "public-site");
const generated = JSON.parse(readFileSync(process.env.HSR_PRESETS_OUT ?? join(site, "src/tools/battle/presets/hsr.generated.json"), "utf8"));

const req = createRequire(join(site, "package.json"));
const viteEntry = (() => { try { return req.resolve("vite"); } catch { return createRequire(join(root, "package.json")).resolve("vite"); } })();
const { createServer } = await import(pathToFileURL(viteEntry).href);
const server = await createServer({ root: site, configFile: false, appType: "custom", logLevel: "error", server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });

let problems = 0;
try {
  const core = await server.ssrLoadModule("/src/lib/core/index.ts");
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const available = generated.presets.filter((p) => p.available);
  for (const p of available) {
    const label = `${p.id} ${p.name}`;
    const project = core.newProject("preset-check");
    const unit = clone(p.apply);
    unit.team = "ally";
    for (const s of clone(p.statuses ?? [])) {
      const at = project.battle.statuses.findIndex((x) => x.id === s.id);
      if (at >= 0) project.battle.statuses[at] = s; else project.battle.statuses.push(s);
    }
    project.battle.units.push(unit);
    project.battle.encounter.allies[0] = unit.id;
    const setup = core.battleSetupOf(project);
    const errors = core.validateBattle(project.battle, setup.damage).filter((i) => i.level === "error");
    if (errors.length) {
      problems += errors.length;
      console.error(`[${label}] ${errors.length} validation error(s):`);
      for (const e of errors) console.error(`  - ${e.message}  ${JSON.stringify(e.where)}`);
      continue;
    }
    try {
      const end = core.autoPlay(setup, core.createBattle(setup, "preset-check"), project.battle.policy);
      if (end.phase !== "ended") throw new Error("battle did not end");
    } catch (e) {
      problems++;
      console.error(`[${label}] auto-battle failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`validated ${available.length} available preset(s): ${problems ? `${problems} problem(s)` : "ok"}`);
} finally {
  await server.close();
}
process.exit(problems ? 1 : 0);
