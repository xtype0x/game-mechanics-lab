/**
 * Project file format. Always carries schemaVersion; loadProject migrates older versions forward.
 */
import type { DamageConfig, Scenario } from "./damage";
import { validateExpr } from "./expr";
import { configFromTemplate, defaultScenario } from "./library/damage-components";

export const SCHEMA_VERSION = 1;
export const RULES_VERSION = "0.3.0";

export interface Project {
  schemaVersion: number;
  rulesVersion: string;
  name: string;
  seed: number | string;
  damage: {
    config: DamageConfig;
    scenarios: { A: Scenario; B: Scenario };
  };
}

export function newProject(name = "未命名專案"): Project {
  const b = defaultScenario("方案 B");
  b.attacker.critRate = 0.3;
  b.attacker.critDmg = 1.8;
  return {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    name,
    seed: 12345,
    damage: { config: configFromTemplate("tpl.weakness-break"), scenarios: { A: defaultScenario("方案 A"), B: b } },
  };
}

export class ProjectError extends Error {}

type Migration = (p: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] upgrades schemaVersion n to n + 1. */
const MIGRATIONS: Record<number, Migration> = {};

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
  return errs;
}
