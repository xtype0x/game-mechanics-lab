/**
 * Loadout compilation (docs/spec/loadout.md): equipment, set tiers and passives folded into a unit
 * definition before a battle is created. Pure functions; the battle engine only sees the result.
 */
import type { PassiveDef, SkillDef, StatusDef, UnitDef } from "./battle/types";

export const LOADOUT_VERSION = "0.1.0";

export interface StatBonus {
  key: string;
  op: "flat" | "pct";
  value: number;
}

export interface EquipmentPiece {
  id: string;
  name: string;
  /** Unique within one loadout. */
  slot: string;
  setId?: string;
  /** Added to the base pool first (e.g. a weapon's hp / atk / def). */
  base?: Record<string, number>;
  bonuses?: StatBonus[];
  /** Statuses held from the start of battle (battle.md §17.2). */
  innateStatuses?: string[];
  passives?: PassiveDef[];
  skills?: SkillDef[];
}

export interface SetTier {
  /** Pieces of the set needed (>= 1). */
  pieces: number;
  bonuses?: StatBonus[];
  innateStatuses?: string[];
  passives?: PassiveDef[];
}

export interface SetDef {
  id: string;
  name: string;
  tiers: SetTier[];
}

export interface Loadout {
  pieces: EquipmentPiece[];
  sets?: SetDef[];
  /** Status definitions the loadout brings along. */
  statuses?: StatusDef[];
}

export interface LoadoutResult {
  unit: UnitDef;
  statuses: StatusDef[];
}

export interface LoadoutIssue {
  level: "error" | "warning";
  message: string;
}

/** Tiers of a set that are active for the given piece count, in tier order (spec §2.2). */
function activeTiers(loadout: Loadout): SetTier[] {
  const out: SetTier[] = [];
  for (const set of loadout.sets ?? []) {
    const n = loadout.pieces.filter((p) => p.setId === set.id).length;
    for (const tier of set.tiers) if (n >= tier.pieces) out.push(tier);
  }
  return out;
}

/** Compiles a loadout into a unit definition (spec §2). The input is not modified. */
export function applyLoadout(unit: UnitDef, loadout: Loadout): LoadoutResult {
  // 1. Base pool.
  const base: Record<string, number> = { ...unit.stats };
  for (const piece of loadout.pieces) for (const [k, v] of Object.entries(piece.base ?? {})) base[k] = (base[k] ?? 0) + v;

  // 2. Bonuses in collection order: pieces, then active set tiers.
  const tiers = activeTiers(loadout);
  const bonuses: StatBonus[] = [...loadout.pieces.flatMap((p) => p.bonuses ?? []), ...tiers.flatMap((t) => t.bonuses ?? [])];

  // 3. Totals per key, accumulated from 0 in collection order.
  const pct: Record<string, number> = {};
  const flat: Record<string, number> = {};
  const keys: string[] = [];
  for (const b of bonuses) {
    if (!(b.key in pct)) { pct[b.key] = 0; flat[b.key] = 0; keys.push(b.key); }
    if (b.op === "pct") pct[b.key] = pct[b.key]! + b.value;
    else flat[b.key] = flat[b.key]! + b.value;
  }

  // 4. Final stats: (B) × (1 + P) + F, no rounding.
  const stats: Record<string, number> = { ...base };
  for (const k of keys) stats[k] = (base[k] ?? 0) * (1 + pct[k]!) + flat[k]!;

  // 5. Skills, passives and innate statuses are concatenated after the unit's own.
  const out: UnitDef = { ...unit, stats, skills: [...unit.skills, ...loadout.pieces.flatMap((p) => p.skills ?? [])] };
  const passives = [...(unit.passives ?? []), ...loadout.pieces.flatMap((p) => p.passives ?? []), ...tiers.flatMap((t) => t.passives ?? [])];
  if (unit.passives !== undefined || passives.length) out.passives = passives;
  const innate = [...(unit.innateStatuses ?? []), ...loadout.pieces.flatMap((p) => p.innateStatuses ?? []), ...tiers.flatMap((t) => t.innateStatuses ?? [])];
  if (unit.innateStatuses !== undefined || innate.length) out.innateStatuses = innate;

  // 6. Statuses brought by the loadout.
  return { unit: out, statuses: [...(loadout.statuses ?? [])] };
}

/**
 * Checks a loadout against its unit (spec §3). `projectStatuses` are the statuses already defined by the
 * project; `damageStatKeys` (optional) are the stats declared by the damage rules, used for the unused-bonus
 * warning, which is skipped when omitted.
 */
export function validateLoadout(unit: UnitDef, loadout: Loadout, projectStatuses: StatusDef[], damageStatKeys?: string[]): LoadoutIssue[] {
  const out: LoadoutIssue[] = [];
  const err = (message: string) => out.push({ level: "error", message });
  const warn = (message: string) => out.push({ level: "warning", message });

  const slots = new Set<string>();
  for (const p of loadout.pieces) {
    if (slots.has(p.slot)) err(`欄位「${p.slot}」出現兩次`);
    slots.add(p.slot);
  }

  const setIds = new Set((loadout.sets ?? []).map((s) => s.id));
  for (const p of loadout.pieces) if (p.setId !== undefined && !setIds.has(p.setId)) err(`裝備「${p.name}」的套裝「${p.setId}」不在 sets 中`);
  for (const s of loadout.sets ?? []) for (const t of s.tiers) if (!(t.pieces >= 1)) err(`套裝「${s.name}」的件數必須至少為 1`);

  const statusById = new Map<string, StatusDef>();
  for (const s of [...projectStatuses, ...(loadout.statuses ?? [])]) statusById.set(s.id, s);
  const innate: [string, string][] = [
    ...(unit.innateStatuses ?? []).map((id) => [id, `單位「${unit.name}」`] as [string, string]),
    ...loadout.pieces.flatMap((p) => (p.innateStatuses ?? []).map((id) => [id, `裝備「${p.name}」`] as [string, string])),
    ...(loadout.sets ?? []).flatMap((s) => s.tiers.flatMap((t) => (t.innateStatuses ?? []).map((id) => [id, `套裝「${s.name}」`] as [string, string]))),
  ];
  for (const [id, who] of innate) {
    const def = statusById.get(id);
    if (!def) err(`${who}的開場狀態「${id}」不存在`);
    else if (def.dot) err(`${who}的開場狀態「${def.name}」是持續傷害，不能作為開場狀態`);
  }

  const skillIds = new Set(unit.skills.map((s) => s.id));
  for (const p of loadout.pieces) for (const s of p.skills ?? []) if (skillIds.has(s.id)) err(`裝備「${p.name}」的技能 ID「${s.id}」與單位原有的重複`);
  const passiveIds = new Set((unit.passives ?? []).map((x) => x.id));
  const passives: [PassiveDef, string][] = [
    ...loadout.pieces.flatMap((p) => (p.passives ?? []).map((x) => [x, `裝備「${p.name}」`] as [PassiveDef, string])),
    ...(loadout.sets ?? []).flatMap((s) => s.tiers.flatMap((t) => (t.passives ?? []).map((x) => [x, `套裝「${s.name}」`] as [PassiveDef, string]))),
  ];
  for (const [x, who] of passives) if (passiveIds.has(x.id)) err(`${who}的被動 ID「${x.id}」與單位原有的重複`);

  if (damageStatKeys) {
    const known = new Set([...Object.keys(unit.stats), ...loadout.pieces.flatMap((p) => Object.keys(p.base ?? {})), ...damageStatKeys]);
    const bonuses = [...loadout.pieces.flatMap((p) => p.bonuses ?? []), ...(loadout.sets ?? []).flatMap((s) => s.tiers.flatMap((t) => t.bonuses ?? []))];
    for (const key of new Set(bonuses.map((b) => b.key))) if (!known.has(key)) warn(`加成的數值「${key}」不是單位數值也不是傷害規則的統計值，不會有效果`);
  }
  return out;
}
