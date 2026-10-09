/**
 * Demo meta-game: save data, stages, levels and the gacha banner. Battle rules come from the project untouched;
 * levels only scale ally stats before the battle is created.
 */
import { Rng, type Project, type RngState, type UnitDef } from "@ggt/core";
import type { Theme } from "./art/Backdrop";

export const SAVE_KEY = "ggt.demo.save";
export const MAX_LEVEL = 10;
export const PULL_COST = 160;
export const RATE_5 = 0.02;
export const RATE_4 = 0.13;
export const HARD_PITY = 50;
export const EXP_3 = 400;
export const EXP_4 = 2000;
export const EXP_DUPE = 5000;

export interface DemoSave {
  version: 1;
  crystals: number;
  exp: number;
  owned: Record<string, { level: number }>;
  team: string[];
  cleared: Record<string, number>;
  gacha: { pity: number; total: number; rng: RngState };
}

export interface Stage {
  id: string;
  name: string;
  subtitle: string;
  theme: Theme;
  waves: string[][];
  firstReward: { crystals: number; exp: number };
  recommended: number;
}

export function starters(p: Project): string[] {
  const allies = p.battle.units.filter((u) => u.team === "ally").map((u) => u.id);
  const team = p.battle.encounter.allies.filter((id) => allies.includes(id));
  return (team.length ? team : allies).slice(0, 4);
}

/** Allies not given at the start become the gacha's featured characters. */
export function featured(p: Project): UnitDef[] {
  const s = new Set(starters(p));
  return p.battle.units.filter((u) => u.team === "ally" && !s.has(u.id));
}

export function newSave(p: Project, seed: number): DemoSave {
  const team = starters(p);
  return {
    version: 1,
    crystals: 1600,
    exp: 3000,
    owned: Object.fromEntries(team.map((id) => [id, { level: 1 }])),
    team,
    cleared: {},
    gacha: { pity: 0, total: 0, rng: new Rng(seed, "demo.gacha").snapshot() },
  };
}

export function loadSave(p: Project): DemoSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as DemoSave;
      const ids = new Set(p.battle.units.filter((u) => u.team === "ally").map((u) => u.id));
      // Drop characters the project no longer has (content edited in the console).
      s.owned = Object.fromEntries(Object.entries(s.owned).filter(([id]) => ids.has(id)));
      s.team = s.team.filter((id) => s.owned[id]);
      if (s.version === 1 && s.team.length) return s;
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return newSave(p, Date.now() >>> 0);
}

export function storeSave(s: DemoSave) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* ignore: progress just won't persist */
  }
}

export function stagesOf(p: Project): Stage[] {
  const enc = (id: string) => p.battle.encounters.find((e) => e.id === id)?.enemies;
  const normal = enc("normal");
  const elite = enc("elite");
  const boss = enc("boss");
  if (normal && elite && boss) {
    return [
      { id: "s1", name: "1．熔岩荒原", subtitle: "影翼蝠在灰燼中盤旋", theme: "ember", waves: [normal], firstReward: { crystals: 800, exp: 2000 }, recommended: 1 },
      { id: "s2", name: "2．霜晶洞窟", subtitle: "兩波敵人，注意雷晶哨兵的全體攻擊", theme: "frost", waves: [normal, elite], firstReward: { crystals: 1200, exp: 3000 }, recommended: 3 },
      { id: "s3", name: "3．雷雲高塔", subtitle: "最終戰：灰燼巨像", theme: "storm", waves: [elite, boss], firstReward: { crystals: 1600, exp: 5000 }, recommended: 5 },
    ];
  }
  const themes: Theme[] = ["ember", "frost", "storm"];
  return p.battle.encounters.map((e, i) => ({
    id: `e-${e.id}`, name: `${i + 1}．${e.name}`, subtitle: e.description ?? "", theme: themes[i % 3]!, waves: [e.enemies],
    firstReward: { crystals: 800 + i * 400, exp: 2000 + i * 1500 }, recommended: 1 + i * 2,
  }));
}

export const levelCost = (level: number) => 800 * level;
export const levelScale = (level: number) => 1 + 0.08 * (level - 1);

/** Project used for one battle: chosen team and enemies, ally hp/atk/def scaled by level. */
export function battleProject(p: Project, save: DemoSave, enemies: string[]): Project {
  const units = p.battle.units.map((u) => {
    const lv = save.owned[u.id]?.level;
    if (u.team !== "ally" || !lv) return u;
    const k = levelScale(lv);
    return { ...u, stats: { ...u.stats, hp: Math.round((u.stats.hp ?? 1) * k), atk: Math.round((u.stats.atk ?? 0) * k), def: Math.round((u.stats.def ?? 0) * k) } };
  });
  return { ...p, battle: { ...p.battle, units, encounter: { allies: save.team, enemies } } };
}

export type PullResult =
  | { rarity: 5; kind: "char"; unitId: string; dupe: boolean }
  | { rarity: 5; kind: "exp"; exp: number }
  | { rarity: 4; kind: "exp"; exp: number }
  | { rarity: 3; kind: "exp"; exp: number };

/** One pull. 5★ at RATE_5 with a hard pity on pull HARD_PITY; featured characters split the 5★ rate evenly. */
export function pull(p: Project, save: DemoSave): PullResult {
  const rng = Rng.fromState(save.gacha.rng);
  const roll = rng.next();
  save.gacha.total++;
  save.gacha.pity++;
  let out: PullResult;
  if (save.gacha.pity >= HARD_PITY || roll < RATE_5) {
    save.gacha.pity = 0;
    const pool = featured(p);
    if (pool.length) {
      const u = pool[rng.int(pool.length)]!;
      const dupe = !!save.owned[u.id];
      if (dupe) save.exp += EXP_DUPE;
      else save.owned[u.id] = { level: 1 };
      out = { rarity: 5, kind: "char", unitId: u.id, dupe };
    } else {
      save.exp += EXP_DUPE;
      out = { rarity: 5, kind: "exp", exp: EXP_DUPE };
    }
  } else if (roll < RATE_5 + RATE_4) {
    save.exp += EXP_4;
    out = { rarity: 4, kind: "exp", exp: EXP_4 };
  } else {
    save.exp += EXP_3;
    out = { rarity: 3, kind: "exp", exp: EXP_3 };
  }
  save.gacha.rng = rng.snapshot();
  return out;
}

/**
 * Exact pull-count distribution for the 5★ with hard pity: P(first 5★ on pull k) = (1−p)^(k−1)·p for k < N,
 * and the remainder on pull N. Used for the probability disclosure.
 */
export function pityStats(p = RATE_5, n = HARD_PITY) {
  let survive = 1;
  let mean = 0;
  for (let k = 1; k <= n; k++) {
    const hit = k === n ? survive : survive * p;
    mean += k * hit;
    survive -= hit;
  }
  return { mean, consolidated: 1 / mean };
}
