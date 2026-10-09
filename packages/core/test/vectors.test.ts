/**
 * Language-neutral test vectors (docs/spec/vectors.md).
 *
 * Vectors are committed under packages/core/vectors/. This test regenerates them in memory and compares;
 * a mismatch means core behavior changed. Run `npm run vectors` (UPDATE_VECTORS=1) to accept the change.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DAMAGE_COMPONENTS,
  DAMAGE_TEMPLATES,
  RULES_VERSION,
  Rng,
  DEFAULT_BATTLE_RULES,
  analyzeDamage,
  autoPlay,
  battleSetupOf,
  checkCompat,
  createBattle,
  newProject,
  predictTimeline,
  composeRules,
  sampleDamage,
  type DamageConfig,
  configFromTemplate,
  defaultScenario,
  evaluate,
  objectScope,
  parseExpr,
  type Scenario,
} from "../src";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "vectors");
const UPDATE = process.env.UPDATE_VECTORS === "1";

function rngVectors() {
  const cases: { seed: number | string; stream: string; u32: number[] }[] = [];
  for (const seed of [0, 1, 42, 4294967295, "demo", "戰鬥"]) {
    for (const stream of ["main", "damage.crit"]) {
      const r = new Rng(seed, stream);
      cases.push({ seed, stream, u32: Array.from({ length: 16 }, () => r.nextU32()) });
    }
  }
  const derived = [];
  for (const seed of [7, "x"]) {
    const r = new Rng(seed, "derived");
    derived.push({
      seed,
      stream: "derived",
      // Sequence of calls on ONE generator, in this exact order.
      calls: [
        ...Array.from({ length: 4 }, () => ({ fn: "next", out: r.next() })),
        ...[0, 0.3, 1].map((p) => ({ fn: "chance", p, out: r.chance(p) })),
        ...[1, 6, 1000, 4294967296].map((n) => ({ fn: "int", n, out: r.int(n) })),
      ],
    });
  }
  return { description: "sfc32 seeded via FNV-1a(`${seed}:${stream}`) → splitmix32 ×4, 12 warm-up steps", cases, derived };
}

function exprVectors() {
  const vars = { a: 2, b: 3.5, n: -1.5, s: "fire", t: true };
  const sources = [
    "1 + 2 * 3", "10 - 4 - 3", "a * (b + 1)", "-a * b", "a / b", "round(n)", "round(2.5)", "floor(n)", "ceil(n)",
    "clamp(b, 0, 3)", "min(a, b, n)", "max(a, b)", "abs(n)", 'if(s == "fire", 1, 0)', "a > 1 && b < 3", "!t || a >= 2",
    "50% + 1", "1e3 / 4", "a != b", "a <= 2", "false && 1 / 0 > 0", "t || 1 / 0 > 0", "if(t, s, 0)", "-(a - b)", "a - -1",
  ];
  // Evaluation must fail (div by zero, undefined variable, string used as number).
  const errors = ["1 / 0", "missing + 1", "s + 1", "s > 1"];
  return {
    variables: vars,
    cases: sources.map((src) => ({ src, tree: parseExpr(src), value: evaluate(parseExpr(src), objectScope(vars)) })),
    errors: errors.map((src) => ({ src, tree: parseExpr(src) })),
  };
}

function damageVectors() {
  const variants: Record<string, (s: Scenario) => void> = {
    default: () => {},
    broken: (s) => { s.flags.broken = true; },
    highDef: (s) => { s.defender.def = 5000; },
    resCapped: (s) => { s.defender.res = 2; },
    fourHits: (s) => { s.skill.hits = [0.1, 0.2, 0.3, 0.4]; },
    buffs: (s) => {
      s.modifiers = [
        { id: "atkPct", label: "攻擊+30%", target: "stat:attacker.atk", op: "pct", value: 0.3 },
        { id: "flat", label: "攻擊+150", target: "stat:attacker.atk", op: "add", value: 150 },
        { id: "ult", label: "大招增傷", target: "step:dmgBonus", op: "add", value: 0.25, condition: parseExpr('skill.type == "ultimate"') },
        { id: "vuln", label: "易傷", target: "stat:defender.vulnerability", op: "add", value: 0.12 },
      ];
      s.skill.type = "ultimate";
    },
  };
  const cases = [];
  const add = (id: string, config: DamageConfig, sc: Scenario) => {
    const rules = composeRules(config, DAMAGE_COMPONENTS);
    const a = analyzeDamage(rules, sc);
    const hitsOf = (res: typeof a.nonCrit) => res.hits.map((h) => ({ damage: h.damage, steps: Object.fromEntries(h.steps.map((s) => [s.id, s.breakdown.value])) }));
    cases.push({
      id,
      input: { config, scenario: sc },
      expected: {
        stepOrder: rules.steps.map((s) => s.id),
        critChance: a.critChance,
        nonCrit: { total: a.nonCrit.total, hits: hitsOf(a.nonCrit) },
        crit: { total: a.crit.total, hits: hitsOf(a.crit) },
        expected: a.expected,
        distribution: a.distribution,
        sample: { n: 64, seed: 2024, samples: sampleDamage(a, 64, 2024).samples },
      },
    });
  };

  for (const t of DAMAGE_TEMPLATES) {
    for (const [name, mutate] of Object.entries(variants)) {
      const sc = structuredClone(defaultScenario());
      mutate(sc);
      add(`${t.id}/${name}`, configFromTemplate(t.id), sc);
    }
  }

  // Coverage of config features and edge cases (from independent QA review).
  const std = () => configFromTemplate("tpl.standard");
  const sc0 = () => structuredClone(defaultScenario());
  {
    const c = std();
    c.customStats = [{ side: "attacker", key: "eliteBonus", label: "精英增傷", default: 0.15, unit: "percent" }];
    c.customFlags = [{ key: "isBoss", label: "首領", default: true }];
    c.customSteps = [{ id: "elite", label: "精英", apply: "mul", order: 25, base: parseExpr("if(flags.isBoss, 1 + attacker.eliteBonus, 1)"), rounding: "round" }];
    c.overrides = { res: { base: parseExpr("1 - defender.res * 0.5"), cap: { min: 0.5, max: 1 }, order: 35 } };
    c.disabledSteps = ["vuln"];
    c.finalRounding = "ceil";
    add("feature/custom-override-disabled", c, sc0());
  }
  {
    const c = std();
    c.overrides = { dmgBonus: { rounding: "round" }, defRatio: { rounding: "ceil" } };
    add("feature/step-rounding", c, sc0());
  }
  {
    const s = sc0();
    s.modifiers = [
      { id: "m", label: "×1.25", target: "step:dmgBonus", op: "mul", value: 1.25 },
      { id: "o1", label: "覆寫", target: "stat:attacker.critDmg", op: "override", value: 2 },
      { id: "o2", label: "覆寫（較後）", target: "stat:attacker.critDmg", op: "override", value: 1.5 },
      { id: "off", label: "停用", target: "stat:attacker.atk", op: "add", value: 99999, enabled: false },
      { id: "cond", label: "擊破時", target: "step:base", op: "pct", value: 0.5, condition: parseExpr("attacker.atk > 1000 && skill.element == \"fire\"") },
    ];
    add("feature/modifier-ops", std(), s);
  }
  {
    const s = sc0();
    s.attacker.critRate = 0;
    s.attacker.atk = 1;
    const c = std();
    c.minDamage = 5;
    add("edge/p0-min-damage", c, s);
  }
  {
    const s = sc0();
    s.attacker.critRate = 1.7; // clamped to 1
    add("edge/p1-clamped", std(), s);
  }
  {
    const s = sc0();
    s.skill.hits = [0.25, 0.25, 0.25, 0.25];
    s.attacker.critRate = 0.35;
    add("edge/equal-hits-merge", std(), s);
  }

  const compat = [
    { id: "template", config: std() },
    { id: "conflict", config: { ...std(), components: [...std().components, "dmg.def-sub"] } },
    { id: "missing-dep", config: { ...std(), components: ["dmg.crit"] } },
    { id: "unknown-component", config: { ...std(), components: [...std().components, "dmg.nope"] } },
    { id: "unknown-ref", config: { ...std(), customSteps: [{ id: "x", label: "x", apply: "mul" as const, order: 1, base: parseExpr("attacker.nope") }] } },
    { id: "forward-step-ref", config: { ...std(), customSteps: [{ id: "x", label: "x", apply: "mul" as const, order: 1, base: parseExpr("step.res") }] } },
    { id: "two-bad-refs-one-step", config: { ...std(), customSteps: [{ id: "x", label: "x", apply: "mul" as const, order: 1, base: parseExpr("attacker.nope + step.res + attacker.nope") }] } },
    { id: "custom-is-experimental", config: { ...std(), customFlags: [{ key: "f", label: "f", default: false }] } },
    { id: "no-set-step", config: { ...std(), components: ["dmg.crit", "dmg.bonus"].filter(Boolean), disabledSteps: [] } },
  ].map(({ id, config }) => {
    const rep = checkCompat(config, DAMAGE_COMPONENTS, DAMAGE_TEMPLATES);
    return {
      id,
      config,
      expected: {
        status: rep.status,
        matchedTemplate: rep.matchedTemplate ?? null,
        errors: rep.issues.filter((i) => i.level === "error").length,
        warnings: rep.issues.filter((i) => i.level === "warning").length,
      },
    };
  });

  return { rulesVersion: RULES_VERSION, components: DAMAGE_COMPONENTS, templates: DAMAGE_TEMPLATES, cases, compat };
}

function battleVectors() {
  const timeline = [
    { cycles: 3, units: [{ uid: "A", name: "A", team: "ally" as const, slot: 0, spd: 100 }, { uid: "B", name: "B", team: "enemy" as const, slot: 0, spd: 150 }] },
    { cycles: 4, units: [{ uid: "A1", name: "A1", team: "ally" as const, slot: 0, spd: 134 }, { uid: "A2", name: "A2", team: "ally" as const, slot: 1, spd: 105 }, { uid: "E1", name: "E1", team: "enemy" as const, slot: 0, spd: 83 }] },
  ].map((c) => {
    const rules = { avBase: DEFAULT_BATTLE_RULES.avBase, firstCycleAv: DEFAULT_BATTLE_RULES.firstCycleAv, cycleAv: DEFAULT_BATTLE_RULES.cycleAv };
    return { input: { rules, ...c }, expected: predictTimeline(rules, c.units, c.cycles) };
  });

  const project = newProject();
  const battles = [
    { id: "normal/seed-1", enemies: ["bat", "golem", "bat"], seed: 1 },
    { id: "sentinel/seed-abc", enemies: ["sentinel", "golem", "sentinel"], seed: "abc" },
    { id: "boss/seed-7", enemies: ["colossus"], seed: 7 },
    // Fragile enemies: kills mid-skill exercise the "dead chosen target is not replaced" rule.
    { id: "fragile/seed-3", enemies: ["bat", "bat", "bat"], seed: 3, batHp: 1500 },
    { id: "passives/seed-5", enemies: ["bat", "golem", "bat", "sentinel"], seed: 5, batHp: 6000 },
  ].map(({ id, enemies, seed, batHp }: { id: string; enemies: string[]; seed: number | string; batHp?: number }) => {
    const p = structuredClone(project);
    p.battle.encounter.enemies = enemies;
    if (batHp) p.battle.units.find((u) => u.id === "bat")!.stats.hp = batHp;
    if (id.startsWith("passives/")) {
      // Every trigger kind + chains: yoru's allyBreak can fire off homura's ember follow-up,
      // and akari gets an enemyKilled follow-up.
      p.battle.encounter.allies = ["homura", "shimo", "yoru", "akari"];
      const akari = p.battle.units.find((u) => u.id === "akari")!;
      akari.skills.push({ id: "bless", name: "祝福", type: "followup", spDelta: 0, energyGain: 5, targeting: "none", effects: [{ kind: "heal", target: "allAllies", scale: "atk", multiplier: 0.1, flat: 50 }] });
      akari.passives = [{ id: "bless", name: "祝福", on: "enemyKilled", skillId: "bless", limitPerTurn: 0 }];
    }
    const setup = battleSetupOf(p);
    const end = autoPlay(setup, createBattle(setup, seed), p.battle.policy);
    return {
      id,
      input: { damageConfig: p.damage.config, battle: p.battle, seed },
      expected: { result: end.result, cycle: end.cycle, turns: end.turns, time: end.time, sp: end.sp, units: end.units, events: end.events },
    };
  });
  return { rulesVersion: RULES_VERSION, timeline, battles };
}

const SUITES = { rng: rngVectors, expr: exprVectors, damage: damageVectors, battle: battleVectors };

describe("test vectors", () => {
  for (const [name, gen] of Object.entries(SUITES)) {
    it(`${name}.json matches current core`, () => {
      const file = join(DIR, `${name}.json`);
      const fresh = JSON.parse(JSON.stringify(gen()));
      if (UPDATE || !existsSync(file)) {
        mkdirSync(DIR, { recursive: true });
        writeFileSync(file, JSON.stringify(fresh, null, 2) + "\n");
      }
      expect(fresh).toEqual(JSON.parse(readFileSync(file, "utf8")));
    });
  }
});
