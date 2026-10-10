/**
 * Mechanism modules of the playable demo (docs/demo-modules.md). Each module declares the capabilities it
 * provides and requires; a demo is playable when every required capability has an active provider.
 * The demo is a test harness for one mechanism at a time, so most modules can be switched off; this file is
 * the single list to extend when new mechanisms are added.
 */

/** What a playable demo needs, and what modules exchange. */
export type Capability =
  | "battle" // turn-based combat with win/lose
  | "content" // stages / encounters to play
  | "roster" // a way to get characters
  | "team" // choosing who fights
  | "currency" // earning and spending a resource
  | "growth" // making characters stronger between battles
  | "gacha"; // random character acquisition

/** Capabilities without which there is nothing to play. */
export const REQUIRED_CAPABILITIES: Capability[] = ["battle", "content", "roster", "team"];

export interface ModuleDef {
  id: string;
  name: string;
  /**
   * "core": always on (the backbone). "slot-default": the built-in provider used when no optional module
   * provides the same capability. "optional": can be switched off for experiments.
   */
  kind: "core" | "slot-default" | "optional";
  provides: Capability[];
  requires: Capability[];
  summary: string;
  /** What the demo does without it. */
  whenOff: string;
}

export const DEMO_MODULES: ModuleDef[] = [
  { id: "battle", name: "回合制戰鬥", kind: "core", provides: ["battle"], requires: [], summary: "行動值、技能、傷害公式、敵人 AI、勝負判定（主控台的戰鬥規則）。", whenOff: "不能關閉：沒有戰鬥就沒有可玩的內容。" },
  { id: "stages", name: "關卡", kind: "core", provides: ["content"], requires: ["battle"], summary: "由主控台的戰鬥清單組成關卡與波次。", whenOff: "不能關閉：沒有要打的對象。" },
  { id: "freeRoster", name: "自由選角", kind: "slot-default", provides: ["roster"], requires: [], summary: "所有我方角色一開始就能使用。", whenOff: "有其他「角色來源」模組開啟時自動讓位。" },
  { id: "autoTeam", name: "固定隊伍", kind: "slot-default", provides: ["team"], requires: ["roster"], summary: "使用目前隊伍設定（或角色清單前 4 人）出戰。", whenOff: "開啟「編隊」時自動讓位。" },
  { id: "teamEdit", name: "編隊", kind: "optional", provides: ["team"], requires: ["roster"], summary: "玩家自選 1～4 人與站位。", whenOff: "改用固定隊伍。" },
  { id: "economy", name: "貨幣與獎勵", kind: "optional", provides: ["currency"], requires: ["content"], summary: "通關獲得星晶與經驗，首通獎勵較多。", whenOff: "不發獎勵、不顯示錢包；需要貨幣的模組會一併停用。" },
  { id: "gacha", name: "抽卡", kind: "optional", provides: ["roster", "gacha"], requires: ["currency"], summary: "用星晶召喚角色；機率、保底與限定規則來自主控台的卡池設定。", whenOff: "角色改為自由選取。" },
  { id: "disclosure", name: "機率公示", kind: "optional", provides: [], requires: ["gacha"], summary: "在召喚畫面顯示每個物品的基礎與綜合機率。", whenOff: "召喚畫面不顯示機率表。" },
  { id: "growth", name: "角色升級", kind: "optional", provides: ["growth"], requires: ["currency"], summary: "用經驗提升等級，生命、攻擊、防禦隨等級成長。", whenOff: "所有角色固定 1 級（使用主控台的原始數值）。" },
  { id: "progression", name: "關卡解鎖順序", kind: "optional", provides: [], requires: ["content"], summary: "通關前一關才能挑戰下一關。", whenOff: "所有關卡一開始就能挑戰。" },
];

export type ModuleSelection = Record<string, boolean>;

export function defaultModuleSelection(): ModuleSelection {
  return Object.fromEntries(DEMO_MODULES.filter((m) => m.kind === "optional").map((m) => [m.id, true]));
}

export interface ModuleResolution {
  /** Module ids that run, in DEMO_MODULES order. */
  active: string[];
  /** Optional modules the user turned on that cannot run, with the capabilities they lack. */
  blocked: { id: string; missing: Capability[] }[];
  /** Built-in providers filling a slot because no optional module provides it. */
  fallbacks: string[];
  /** Required capabilities nobody provides (empty when playable). */
  missing: Capability[];
  playable: boolean;
}

/**
 * Which modules run for a selection (docs/demo-modules.md §3):
 * 1. Core modules and selected optional modules are candidates.
 * 2. Repeatedly drop candidates whose requirements are not provided by other candidates or slot defaults.
 * 3. A slot default is active only when no remaining optional candidate provides its capability.
 */
export function resolveModules(selection: ModuleSelection): ModuleResolution {
  const byId = new Map(DEMO_MODULES.map((m) => [m.id, m]));
  let candidates = DEMO_MODULES.filter((m) => m.kind === "core" || (m.kind === "optional" && selection[m.id])).map((m) => m.id);
  const defaults = DEMO_MODULES.filter((m) => m.kind === "slot-default");
  const activeDefaults = (cands: string[]) => {
    const fromOptional = new Set(cands.flatMap((id) => (byId.get(id)!.kind === "optional" ? byId.get(id)!.provides : [])));
    return defaults.filter((d) => d.provides.some((c) => !fromOptional.has(c))).map((d) => d.id);
  };
  const provided = (ids: string[]) => new Set(ids.flatMap((id) => byId.get(id)!.provides));
  const blocked: ModuleResolution["blocked"] = [];
  for (let changed = true; changed; ) {
    changed = false;
    const have = provided([...candidates, ...activeDefaults(candidates)]);
    for (const id of candidates) {
      const missing = byId.get(id)!.requires.filter((c) => !have.has(c));
      if (missing.length) {
        candidates = candidates.filter((x) => x !== id);
        if (byId.get(id)!.kind === "optional") blocked.push({ id, missing });
        changed = true;
        break;
      }
    }
  }
  const fallbacks = activeDefaults(candidates).filter((id) => byId.get(id)!.requires.every((c) => provided([...candidates, ...activeDefaults(candidates)]).has(c)));
  const all = new Set([...candidates, ...fallbacks]);
  const active = DEMO_MODULES.filter((m) => all.has(m.id)).map((m) => m.id);
  const have = provided(active);
  const missing = REQUIRED_CAPABILITIES.filter((c) => !have.has(c));
  return { active, blocked, fallbacks, missing, playable: missing.length === 0 };
}
