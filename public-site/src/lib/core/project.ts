/**
 * Project file format. Always carries schemaVersion; loadProject migrates older versions forward.
 */
import type { BattleSetup } from "./battle/engine";
import type { AllyPolicy, BattleRules, EncounterDef, EncounterPreset, StatusDef, UnitDef } from "./battle/types";
import { DAMAGE_COMPONENTS } from "./library/damage-components";
import { composeRules, type DamageConfig, type Scenario } from "./damage";
import { validateExpr } from "./expr";
import { configFromTemplate, defaultScenario } from "./library/damage-components";
import { SHOWCASE_ALLIES, SHOWCASE_ENCOUNTER, SHOWCASE_ENEMIES, SHOWCASE_STATUSES, SHOWCASE_V07_ALLIES, SHOWCASE_V07_ENCOUNTER, SHOWCASE_V07_ENEMIES, SHOWCASE_V07_STATUSES } from "./library/showcase-content";
import { defaultGachaConfig } from "./library/gacha-content";
import type { GachaConfig } from "./gacha/types";
import { defaultModuleSelection, type ModuleSelection } from "./modules";
import { DEFAULT_BATTLE_RULES, DEFAULT_ENCOUNTER, DEFAULT_ENCOUNTERS, DEFAULT_POLICY_CONFIG, DEFAULT_STATUSES, DEFAULT_UNITS } from "./library/battle-content";

export const SCHEMA_VERSION = 4;
export const RULES_VERSION = "0.8.0";

export interface BattleConfig {
  rules: BattleRules;
  units: UnitDef[];
  statuses: StatusDef[];
  /** The battle currently loaded in the simulators. */
  encounter: EncounterDef;
  /** Saved enemy line-ups (stages/waves are built from these in M5). */
  encounters: EncounterPreset[];
  policy: AllyPolicy;
}

/** A frozen copy of the project's rules and content, for A/B comparison. */
export interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
  damage: Project["damage"];
  battle: BattleConfig;
}

export interface Project {
  schemaVersion: number;
  rulesVersion: string;
  name: string;
  seed: number | string;
  damage: {
    config: DamageConfig;
    scenarios: { A: Scenario; B: Scenario };
  };
  battle: BattleConfig;
  /** Banners (docs/spec/gacha.md). */
  gacha: GachaConfig;
  /** Playable demo settings: which mechanism modules are switched on (docs/demo-modules.md). */
  demo: { modules: ModuleSelection };
  snapshots: Snapshot[];
}

export function defaultBattleConfig(): BattleConfig {
  return JSON.parse(
    JSON.stringify({ rules: DEFAULT_BATTLE_RULES, units: DEFAULT_UNITS, statuses: DEFAULT_STATUSES, encounter: DEFAULT_ENCOUNTER, encounters: DEFAULT_ENCOUNTERS, policy: DEFAULT_POLICY_CONFIG }),
  ) as BattleConfig;
}

export function newProject(name = "未命名專案"): Project {
  const b = defaultScenario("方案 B");
  b.attacker.critRate = 0.3;
  b.attacker.critDmg = 1.8;
  const battle = defaultBattleConfig();
  return {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    name,
    seed: 12345,
    damage: { config: configFromTemplate("tpl.weakness-break"), scenarios: { A: defaultScenario("方案 A"), B: b } },
    battle,
    gacha: defaultGachaConfig(battle),
    demo: { modules: defaultModuleSelection() },
    snapshots: [],
  };
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  create: (name: string) => Project;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "weakness-break",
    name: "弱點擊破型回合制",
    description: "敵人有韌性條與弱點屬性；削韌擊破後受到全額傷害並延後行動。傷害公式含減傷與韌性乘區。",
    create: (name) => newProject(name),
  },
  {
    id: "basic-turn",
    name: "基礎回合制",
    description: "沒有韌性與擊破，只看速度、技能點、能量與狀態效果。傷害公式為標準乘區型。",
    create: (name) => {
      const p = newProject(name);
      p.damage.config = configFromTemplate("tpl.standard");
      for (const u of p.battle.units) {
        if (u.team === "enemy") {
          u.stats.toughness = 0;
          u.weaknesses = [];
        }
        // Break-driven passives never fire without toughness.
        u.passives = u.passives?.filter((x) => x.on !== "allyBreak");
      }
      return p;
    },
  },
  {
    id: "boss-mechanics",
    name: "首領機制型（擴充機制）",
    description: "弱點擊破型加上階段、召喚、護盾、復活、驅散、護韌、嘲諷、插隊行動與自訂計數器的示範首領戰；另附「夢織者」戰鬥示範觸發對象條件、支配與行動條事件。",
    create: (name) => {
      const p = newProject(name);
      const b = p.battle;
      b.statuses.push(...structuredCloneJson([...SHOWCASE_STATUSES, ...SHOWCASE_V07_STATUSES]));
      b.units.push(...structuredCloneJson([...SHOWCASE_ALLIES, ...SHOWCASE_V07_ALLIES, ...SHOWCASE_ENEMIES, ...SHOWCASE_V07_ENEMIES]));
      // Taunt-weighted targeting needs a value on every ally; the defender draws more attacks.
      for (const u of b.units) if (u.team === "ally") u.stats.taunt ??= 100;
      // Lightning ultimate also detonates its shock immediately (DoT detonation).
      b.units.find((u) => u.id === "raimei")?.skills.find((s) => s.id === "ult")?.effects.push({ kind: "detonate", target: "enemy", ratio: 0.5, statusId: "shock" });
      b.encounters.push(structuredCloneJson(SHOWCASE_ENCOUNTER), structuredCloneJson(SHOWCASE_V07_ENCOUNTER));
      b.encounter = { allies: ["shimo", "iwamori", "raimei", "akari"], enemies: [...SHOWCASE_ENCOUNTER.enemies] };
      // Banners reference allies, so rebuild them for the extended roster.
      p.gacha = defaultGachaConfig(b);
      return p;
    },
  },
];

const structuredCloneJson = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function snapshotOf(p: Project, name: string, createdAt: string): Snapshot {
  const copy = JSON.parse(JSON.stringify({ damage: p.damage, battle: p.battle })) as Pick<Snapshot, "damage" | "battle">;
  let n = p.snapshots.length + 1;
  while (p.snapshots.some((s) => s.id === `snap${n}`)) n++;
  return { id: `snap${n}`, name, createdAt, ...copy };
}

/** A project view whose rules/content come from a snapshot (for simulating it). */
export function projectFromSnapshot(p: Project, s: Snapshot): Project {
  return { ...p, damage: s.damage, battle: s.battle };
}

/** The battle uses the project's damage formula, so edits in the composer flow into simulations. */
export function battleSetupOf(p: Project): BattleSetup {
  return {
    damage: composeRules(p.damage.config, DAMAGE_COMPONENTS),
    rules: p.battle.rules,
    statuses: p.battle.statuses,
    units: p.battle.units,
    encounter: p.battle.encounter,
  };
}

export class ProjectError extends Error {}

type Migration = (p: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] upgrades schemaVersion n to n + 1. */
const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2: battle section added (M3). Older projects get the default roster.
  1: (p) => ({ ...p, battle: defaultBattleConfig() }),
  // v2 → v3: saved encounter list and A/B snapshots (M4). Existing content is kept as-is.
  2: (p) => ({ ...p, battle: { ...(p.battle as object), encounters: JSON.parse(JSON.stringify(DEFAULT_ENCOUNTERS)) }, snapshots: [] }),
  // v3 → v4: banners and demo modules (M1). Banners are built from the project's own allies; every module on,
  // which is how the demo behaved before.
  3: (p) => ({ ...p, gacha: defaultGachaConfig(p.battle as BattleConfig), demo: { modules: defaultModuleSelection() } }),
};

export function loadProject(raw: unknown): Project {
  if (raw === null || typeof raw !== "object") throw new ProjectError("檔案內容不是專案物件");
  let p = raw as Record<string, unknown>;
  if (typeof p.schemaVersion !== "number") throw new ProjectError("缺少 schemaVersion");
  let v: number = p.schemaVersion;
  if (v > SCHEMA_VERSION) throw new ProjectError(`檔案版本 ${v} 比工具新（${SCHEMA_VERSION}），請更新工具`);
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new ProjectError(`沒有從版本 ${v} 升級的方法`);
    p = { ...m(p), schemaVersion: v + 1 };
    v = v + 1;
  }
  const errors = validateProject(p);
  if (errors.length) throw new ProjectError(`專案格式錯誤：\n${errors.slice(0, 5).join("\n")}`);
  return p as unknown as Project;
}

function validateProject(p: Record<string, unknown>): string[] {
  const errs: string[] = [];
  const dmg = p.damage as Record<string, unknown> | undefined;
  if (typeof p.name !== "string") errs.push("name 必須是字串");
  if (typeof p.seed !== "number" && typeof p.seed !== "string") errs.push("seed 必須是數字或字串");
  if (!dmg || typeof dmg !== "object") return [...errs, "缺少 damage"];
  const config = dmg.config as DamageConfig | undefined;
  if (!config || !Array.isArray(config.components)) errs.push("damage.config.components 必須是陣列");
  else {
    for (const s of config.customSteps ?? []) errs.push(...validateExpr(s.base, `customSteps.${s.id}`));
    for (const [id, o] of Object.entries(config.overrides ?? {})) if (o.base) errs.push(...validateExpr(o.base, `overrides.${id}`));
  }
  const sc = dmg.scenarios as Record<string, Scenario> | undefined;
  for (const key of ["A", "B"]) {
    const s = sc?.[key];
    if (!s || typeof s !== "object" || !s.skill || !Array.isArray(s.skill.hits)) errs.push(`damage.scenarios.${key} 格式錯誤`);
    else for (const m of s.modifiers ?? []) if (m.condition) errs.push(...validateExpr(m.condition, `modifier.${m.id}`));
  }
  const b = p.battle as BattleConfig | undefined;
  if (!b || typeof b !== "object") return [...errs, "缺少 battle"];
  if (!b.rules || !Array.isArray(b.units) || !Array.isArray(b.statuses) || !b.encounter || !Array.isArray(b.encounters)) errs.push("battle 格式錯誤");
  const g = p.gacha as GachaConfig | undefined;
  if (!g || typeof g !== "object" || !Array.isArray(g.banners) || typeof g.active !== "string") errs.push("gacha 格式錯誤");
  const d = p.demo as Project["demo"] | undefined;
  if (!d || typeof d !== "object" || !d.modules || typeof d.modules !== "object") errs.push("demo 格式錯誤");
  if (!Array.isArray(p.snapshots)) errs.push("snapshots 必須是陣列");
  else {
    errs.push(...validateExpr(b.rules.breakDamage, "battle.rules.breakDamage"));
    for (const u of b.units) {
      for (const r of u.ai ?? []) if (r.when) errs.push(...validateExpr(r.when, `ai.${u.id}.${r.skillId}`));
      for (const x of u.passives ?? []) if (x.when) errs.push(...validateExpr(x.when, `passive.${u.id}.${x.id}`));
    }
  }
  return errs;
}
