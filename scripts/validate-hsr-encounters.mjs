#!/usr/bin/env node
// Validates the generated Star Rail enemy encounters with the core's own code (vite SSR loader, like
// validate-hsr-presets.mjs): for every encounter and shipped level, apply it the way the lab does
// (presets/hsr-enemies.ts applyHsrEncounter), then validateBattle must report no errors and one auto-battle must end.
// Optional balance report:  node scripts/validate-hsr-encounters.mjs --rates[=200] [--gear]
//   --rates   win rates of a 4-character team vs every encounter/level, and of the original template team
//   --levels=80,60  and  --only=kafka,cocolia  narrow the rate table (so it can be split across processes)
//   --gear    adds a rough "typical gear" proxy for the Star Rail team (x2.2 ATK, x1.8 HP, +55% crit rate,
//             +80% crit damage, +30% damage bonus); an estimate for balance talk, not shipped data
// Exits non-zero on any problem.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "public-site");
const args = process.argv.slice(2);
const ratesArg = args.find((a) => a.startsWith("--rates"));
const RUNS = ratesArg ? Number(ratesArg.split("=")[1] ?? 200) : 0;
const GEAR = args.includes("--gear");
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]?.split(",");
const ONLY_LEVELS = opt("levels")?.map(Number);
const ONLY_IDS = opt("only");
const TEAM = (process.env.HSR_TEAM ?? "hsr-1209,hsr-1003,hsr-1107,hsr-1104").split(",");

const req = createRequire(join(site, "package.json"));
const viteEntry = (() => { try { return req.resolve("vite"); } catch { return createRequire(join(root, "package.json")).resolve("vite"); } })();
const { createServer } = await import(pathToFileURL(viteEntry).href);
const server = await createServer({ root: site, configFile: false, appType: "custom", logLevel: "error", server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });

const clone = (x) => JSON.parse(JSON.stringify(x));
let problems = 0;
try {
  const core = await server.ssrLoadModule("/src/lib/core/index.ts");
  const enemies = await server.ssrLoadModule("/src/tools/battle/presets/hsr-enemies.ts");
  const chars = JSON.parse(readFileSync(join(site, "src/tools/battle/presets/hsr.generated.json"), "utf8"));

  // Same starting point as the lab (state.ts freshProject).
  const fresh = () => {
    const t = core.PROJECT_TEMPLATES.find((x) => x.id === "boss-mechanics") ?? core.PROJECT_TEMPLATES[0];
    const p = t.create("encounter-check");
    const normal = p.battle.encounters.find((e) => e.id === "normal");
    p.battle.encounter = { allies: ["homura", "shimo", "raimei", "akari"], enemies: [...(normal?.enemies ?? p.battle.encounter.enemies)] };
    return p;
  };
  const withTeam = (p, ids, gear) => {
    const out = [];
    for (const id of ids) {
      const pr = chars.presets.find((x) => x.id === id && x.available);
      if (!pr) throw new Error(`character preset ${id} is not available`);
      const u = clone(pr.apply);
      u.team = "ally";
      if (gear) {
        u.stats.atk *= 2.2; u.stats.hp *= 1.8; u.stats.def *= 1.4;
        u.stats.critRate = Math.min(1, (u.stats.critRate ?? 0.05) + 0.55);
        u.stats.critDmg = (u.stats.critDmg ?? 0.5) + 0.8;
        u.stats.dmgBonus = (u.stats.dmgBonus ?? 0) + 0.3;
      }
      for (const s of clone(pr.statuses ?? [])) {
        const at = p.battle.statuses.findIndex((x) => x.id === s.id);
        if (at >= 0) p.battle.statuses[at] = s; else p.battle.statuses.push(s);
      }
      const at = p.battle.units.findIndex((x) => x.id === u.id);
      if (at >= 0) p.battle.units[at] = u; else p.battle.units.push(u);
      out.push(u.id);
    }
    p.battle.encounter.allies = out;
  };
  const run = (p, n) => {
    const setup = core.battleSetupOf(p);
    const rs = [];
    for (let i = 0; i < n; i++) rs.push(core.simulateOne(setup, p.battle.policy, core.batchSeed(p.seed, i)));
    return core.aggregate(rs);
  };
  const check = (p, label) => {
    const setup = core.battleSetupOf(p);
    const errors = core.validateBattle(p.battle, setup.damage).filter((i) => i.level === "error");
    if (errors.length) {
      problems += errors.length;
      console.error(`[${label}] ${errors.length} validation error(s):`);
      for (const e of errors) console.error(`  - ${e.message}  ${JSON.stringify(e.where)}`);
      return false;
    }
    try {
      const end = core.autoPlay(setup, core.createBattle(setup, "encounter-check"), p.battle.policy);
      if (end.phase !== "ended") throw new Error("battle did not end");
    } catch (e) {
      problems++;
      console.error(`[${label}] auto-battle failed: ${e instanceof Error ? e.message : e}`);
      return false;
    }
    return true;
  };

  let n = 0;
  for (const level of enemies.hsrLevels) {
    for (const enc of enemies.hsrEncounters) {
      const p = fresh();
      if (!enemies.applyHsrEncounter(p, enc, level)) { problems++; console.error(`[${enc.id} Lv${level}] apply failed`); continue; }
      // repeated picks must not pile up leftovers
      enemies.applyHsrEncounter(p, enc, level);
      const hsre = p.battle.units.filter((u) => u.id.startsWith("hsre_"));
      if (hsre.length !== enc.units.length) { problems++; console.error(`[${enc.id} Lv${level}] expected ${enc.units.length} hsre_ units, found ${hsre.length}`); }
      for (const id of [...hsre.map((u) => u.id), ...p.battle.statuses.map((s) => s.id).filter((i) => i.startsWith("hsre_"))]) {
        if (!/^[A-Za-z0-9_]+$/.test(id)) { problems++; console.error(`[${enc.id}] bad identifier ${id}`); }
      }
      withTeam(p, TEAM, false);
      if (check(p, `${enc.id} Lv${level}`)) n++;
    }
  }
  console.log(`validated ${n} encounter x level combination(s): ${problems ? `${problems} problem(s)` : "ok"}`);

  if (RUNS > 0) {
    const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
    const names = (ids) => ids.map((id) => chars.presets.find((x) => x.id === id)?.name ?? id).join("、");
    console.log(`\nWin rates over ${RUNS} runs (policy: ${JSON.stringify(core.newProject("x").battle.policy)})`);
    console.log(`SR team (bare): ${names(TEAM)}${GEAR ? "; SR team (gear proxy)" : ""}; original = homura, shimo, raimei, akari\n`);
    const rateLevels = enemies.hsrLevels.filter((l) => !ONLY_LEVELS || ONLY_LEVELS.includes(l));
    const header = ["encounter", ...rateLevels.flatMap((l) => [`SR@${l}`, ...(GEAR ? [`gear@${l}`] : []), `orig@${l}`])];
    console.log(header.join("\t"));
    for (const enc of enemies.hsrEncounters.filter((e) => !ONLY_IDS || ONLY_IDS.includes(e.id))) {
      const cells = [enc.name];
      for (const level of rateLevels) {
        const mk = (team, gear) => { const p = fresh(); enemies.applyHsrEncounter(p, enc, level); if (team) withTeam(p, team, gear); return run(p, RUNS); };
        cells.push(pct(mk(TEAM, false).winRate));
        if (GEAR) cells.push(pct(mk(TEAM, true).winRate));
        cells.push(pct(mk(null, false).winRate));
      }
      console.log(cells.join("\t"));
    }
  }
} finally {
  await server.close();
}
process.exit(problems ? 1 : 0);
