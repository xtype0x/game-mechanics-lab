/**
 * Demo meta-game: save data, stages, levels and summoning. Battle rules come from the project untouched;
 * levels only scale ally stats before the battle is created. Which of these mechanisms run is decided by
 * the project's demo modules (docs/demo-modules.md); the gacha rules come from the project's banner.
 */
import {
  Rng, itemOf, newGachaState, pullOnce, resolveModules, starterAllies,
  type BannerDef, type GachaState, type Project, type PullResult, type RngState, type UnitDef,
} from "@gml/core";
import type { Theme } from "@gml/ui";

export const SAVE_KEY = "ggt.demo.save";
export const MAX_LEVEL = 10;
/** Exp given for a duplicate character. */
export const EXP_DUPE = 5000;

export interface DemoSave {
  version: 2;
  crystals: number;
  exp: number;
  owned: Record<string, { level: number }>;
  team: string[];
  cleared: Record<string, number>;
  /** One rng for all pulls; banner progress (pity, guarantee) is kept per banner id. */
  gacha: { rng: RngState; banners: Record<string, GachaState> };
}

export interface DemoSaveV1 {
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

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

/** What the demo needs to know about the active modules. */
export interface Mods {
  gacha: boolean;
  disclosure: boolean;
  economy: boolean;
  growth: boolean;
  progression: boolean;
  teamEdit: boolean;
  /** Module names the user switched off or that could not run (for the hub badge). */
  removed: string[];
}

export function modsOf(p: Project): Mods {
  const r = resolveModules(p.demo.modules);
  const on = (id: string) => r.active.includes(id);
  return {
    gacha: on("gacha"), disclosure: on("disclosure"), economy: on("economy"), growth: on("growth"),
    progression: on("progression"), teamEdit: on("teamEdit"),
    removed: ["gacha", "economy", "growth", "progression", "teamEdit", "disclosure"].filter((id) => !on(id)),
  };
}

/** Allies the player can use: owned ones with the gacha, every ally without it (free roster). */
export function rosterOf(p: Project, save: DemoSave, mods: Mods): UnitDef[] {
  return p.battle.units.filter((u) => u.team === "ally" && (!mods.gacha || save.owned[u.id]));
}

export function levelOf(save: DemoSave, mods: Mods, id: string): number {
  return mods.growth ? save.owned[id]?.level ?? 1 : 1;
}

/** Who fights: the player's line-up with team editing, otherwise the console's line-up (or the first four). */
export function teamOf(p: Project, save: DemoSave, mods: Mods): string[] {
  const roster = new Set(rosterOf(p, save, mods).map((u) => u.id));
  const pick = mods.teamEdit ? save.team : p.battle.encounter.allies;
  const team = pick.filter((id) => roster.has(id)).slice(0, 4);
  return team.length ? team : [...roster].slice(0, 4);
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export function activeBanner(p: Project): BannerDef | undefined {
  return p.gacha.banners.find((b) => b.id === p.gacha.active) ?? p.gacha.banners[0];
}

export function newSave(p: Project, seed: number): DemoSave {
  const team = starterAllies(p.battle);
  return {
    version: 2,
    crystals: 1600,
    exp: 3000,
    owned: Object.fromEntries(team.map((id) => [id, { level: 1 }])),
    team,
    cleared: {},
    gacha: { rng: new Rng(seed, "demo.gacha").snapshot(), banners: {} },
  };
}

export function upgradeSave(s: DemoSave | DemoSaveV1, p: Project): DemoSave | null {
  if (s.version === 2) return s;
  if (s.version !== 1) return null;
  // v1 had one hard-coded banner; its pity becomes the progress of the project's simple banner.
  const simple = p.gacha.banners.find((b) => b.id === "simple");
  const banners: Record<string, GachaState> = {};
  if (simple) {
    const st = newGachaState(simple);
    st.counters[simple.tiers[0]!.id] = s.gacha.pity;
    st.pulls = s.gacha.total;
    banners[simple.id] = st;
  }
  return { version: 2, crystals: s.crystals, exp: s.exp, owned: s.owned, team: s.team, cleared: s.cleared, gacha: { rng: s.gacha.rng, banners } };
}

export function loadSave(p: Project): DemoSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = upgradeSave(JSON.parse(raw) as DemoSave | DemoSaveV1, p);
      if (s) {
        const ids = new Set(p.battle.units.filter((u) => u.team === "ally").map((u) => u.id));
        // Drop characters the project no longer has (content edited in the console).
        s.owned = Object.fromEntries(Object.entries(s.owned).filter(([id]) => ids.has(id)));
        s.team = s.team.filter((id) => s.owned[id]);
        if (s.team.length) return s;
      }
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

// ---------------------------------------------------------------------------
// Stages, levels
// ---------------------------------------------------------------------------

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
export function battleProject(p: Project, team: string[], level: (id: string) => number, enemies: string[]): Project {
  const units = p.battle.units.map((u) => {
    if (u.team !== "ally" || !team.includes(u.id)) return u;
    const k = levelScale(level(u.id));
    if (k === 1) return u;
    return { ...u, stats: { ...u.stats, hp: Math.round((u.stats.hp ?? 1) * k), atk: Math.round((u.stats.atk ?? 0) * k), def: Math.round((u.stats.def ?? 0) * k) } };
  });
  return { ...p, battle: { ...p.battle, units, encounter: { allies: team, enemies } } };
}

// ---------------------------------------------------------------------------
// Summoning (rules: docs/spec/gacha.md; granting: here)
// ---------------------------------------------------------------------------

export interface Granted {
  pull: PullResult;
  name: string;
  rarity: string;
  /** Top tier = highest rarity. */
  top: boolean;
  unitId?: string;
  dupe?: boolean;
  exp: number;
}

/** One pull on the banner, then grant the item: new character, duplicate → exp, exp resource → exp. */
export function summon(p: Project, banner: BannerDef, save: DemoSave): Granted {
  const rng = Rng.fromState(save.gacha.rng);
  const state = (save.gacha.banners[banner.id] ??= newGachaState(banner));
  const pull = pullOnce(banner, state, rng);
  save.gacha.rng = rng.snapshot();
  const item = itemOf(banner, pull.itemId);
  const tier = banner.tiers.find((t) => t.id === pull.tierId)!;
  const out: Granted = { pull, name: item?.name ?? pull.itemId, rarity: tier.name, top: tier === banner.tiers[0], exp: 0 };
  if (item?.kind === "unit" && item.unitId && p.battle.units.some((u) => u.id === item.unitId)) {
    out.unitId = item.unitId;
    out.dupe = !!save.owned[item.unitId];
    if (out.dupe) out.exp = EXP_DUPE;
    else save.owned[item.unitId] = { level: 1 };
  } else if (item?.kind === "resource" && (item.resource ?? "exp") === "exp") {
    out.exp = item.amount ?? 0;
  }
  save.exp += out.exp;
  return out;
}

/** Characters the banner can give, featured first (for the banner art). */
export function bannerUnits(p: Project, banner: BannerDef): UnitDef[] {
  const top = banner.tiers[0];
  const ids = [...(top?.featured?.items ?? []), ...(top?.items ?? [])];
  return ids.map((id) => itemOf(banner, id)?.unitId).map((uid) => p.battle.units.find((u) => u.id === uid)).filter((u): u is UnitDef => !!u);
}
