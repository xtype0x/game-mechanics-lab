/**
 * Gacha rules 2.0 data model (docs/spec/gacha2.md): base rarity rates plus a list of rule modules.
 * Plain JSON. Module semantics do not depend on their order in the list.
 */
import type { GachaItem } from "../gacha/types";

export type { GachaItem };

export interface TierDef {
  id: string;
  name: string;
  /** Base chance per pull. Ignored for the last (lowest) tier, which takes the remainder. */
  rate: number;
  /** Regular items of this tier. */
  items: string[];
}

export type RuleModule =
  /** Rate rises from pull `start` (counted since this tier's last hit) by `step` per pull. */
  | { kind: "softPity"; tier: string; start: number; step: number; /** Optional ceiling on the raised rate (2.2). */ max?: number }
  /** Pull `at` since this tier's last hit always hits it (unless a higher tier is forced first). */
  | { kind: "hardPity"; tier: string; at: number }
  /** Rate-up: a hit of `tier` is featured with chance `share`; featured items replace the regular pool. */
  | { kind: "featured"; tier: string; share: number; items: string[] }
  /** After a non-featured hit of `tier`, its next hit is featured ("big guarantee"). Needs `featured`. */
  | { kind: "guarantee"; tier: string }
  /** The `slot`-th pull of every batch cannot land below `minTier` (lower tiers' chance moves to it). */
  | { kind: "batchFloor"; slot: number; minTier: string }
  /**
   * Counter of pulls since the last featured hit of `tier`. On the pull where it reaches `at`, `tier` is
   * forced and its featured chance becomes `featuredShare` (1 = the featured item is guaranteed).
   */
  | { kind: "milestone"; tier: string; steps: { at: number; featuredShare: number }[] }
  /** Exchange points: `pointsPerPull` per pull; `cost` points buy one of `items` (a player action, not a pull). */
  | { kind: "exchange"; pointsPerPull: number; cost: number; items: string[] }
  /**
   * Chosen item ("Epitomized Path"): every hit of `tier` that is not `item` adds a point; with `points` points
   * the next hit of `tier` is `item`. Getting `item` resets the points. `item` must be a featured item.
   */
  | { kind: "epitomized"; tier: string; item: string; points: number };

export type ModuleKind = RuleModule["kind"];

export interface GachaModel {
  version: 2;
  id: string;
  name: string;
  description?: string;
  /** Where the rules come from, and how certain they are (shown to users). */
  source?: string;
  pull: {
    /** Currency per single pull. */
    cost: number;
    /** Display name of the currency. */
    currency: string;
    /** Pulls per batch ("10-pull"); batch slots are counted from the first pull. */
    batchSize: number;
    /** Price of a full batch when it differs from batchSize × cost. */
    batchCost?: number;
  };
  tiers: TierDef[];
  items: GachaItem[];
  modules: RuleModule[];
}

/** Player state: integer counters keyed by name (see gacha2.md §2.1) and the total pull count. */
export interface ModelState {
  vars: Record<string, number>;
  pulls: number;
}

export interface PullOutcome {
  tierId: string;
  itemId: string;
  featured: boolean;
  /** Whether a milestone or batch floor decided the tier on this pull. */
  forced: boolean;
}

export interface ModelIssue {
  level: "error" | "warning";
  message: string;
  where: { tier?: string; module?: number; item?: string };
}


export function validateModel(m: GachaModel, unitIds?: Set<string>): ModelIssue[] {
  const out: ModelIssue[] = [];
  const err = (message: string, where: ModelIssue["where"] = {}) => out.push({ level: "error", message, where });
  const warn = (message: string, where: ModelIssue["where"] = {}) => out.push({ level: "warning", message, where });
  const itemIds = new Set<string>();
  for (const it of m.items) {
    if (itemIds.has(it.id)) err(`物品 ID「${it.id}」重複`, { item: it.id });
    itemIds.add(it.id);
    if (it.kind === "unit" && unitIds && it.unitId && !unitIds.has(it.unitId)) err(`物品「${it.name}」指向不存在的角色「${it.unitId}」`, { item: it.id });
  }
  if (!(m.pull.cost >= 0)) err("每抽花費不能是負數");
  if (!(Number.isInteger(m.pull.batchSize) && m.pull.batchSize >= 1)) err("連抽數量必須是正整數");
  if (!m.tiers.length) { err("至少需要一個稀有度"); return out; }
  const tierIds = new Set<string>();
  let baseSum = 0;
  m.tiers.forEach((t, i) => {
    if (tierIds.has(t.id)) err(`稀有度 ID「${t.id}」重複`, { tier: t.id });
    tierIds.add(t.id);
    if (i < m.tiers.length - 1) {
      if (!(t.rate >= 0 && t.rate <= 1)) err(`「${t.name}」的機率必須在 0 到 100% 之間`, { tier: t.id });
      baseSum += t.rate;
    }
    for (const id of t.items) if (!itemIds.has(id)) err(`「${t.name}」使用不存在的物品「${id}」`, { tier: t.id, item: id });
  });
  if (m.tiers.length > 1 && baseSum > 1) warn(`高稀有度的基礎機率合計 ${(baseSum * 100).toFixed(2)}% 超過 100%`);

  const seen = new Map<string, number>();
  m.modules.forEach((mod, i) => {
    const w = { module: i };
    const tierOk = (id: string) => { if (!tierIds.has(id)) { err(`規則 ${i + 1} 使用不存在的稀有度「${id}」`, w); return false; } return true; };
    const once = (key: string, label: string) => { if (seen.has(key)) err(`${label}重複設定（規則 ${seen.get(key)! + 1} 與 ${i + 1}）`, w); else seen.set(key, i); };
    switch (mod.kind) {
      case "softPity":
        if (tierOk(mod.tier)) once(`soft:${mod.tier}`, "軟保底");
        if (!(Number.isInteger(mod.start) && mod.start >= 1)) err("軟保底起點必須是正整數", w);
        if (!(mod.step >= 0)) err("軟保底每抽增加量不能是負數", w);
        if (mod.max !== undefined && !(mod.max >= 0 && mod.max <= 1)) err("軟保底上限必須在 0 到 100% 之間", w);
        else if (mod.max !== undefined && tierIds.has(mod.tier) && mod.max < m.tiers.find((t) => t.id === mod.tier)!.rate) err("軟保底上限不能低於基礎機率", w);
        break;
      case "hardPity":
        if (tierOk(mod.tier)) once(`hard:${mod.tier}`, "硬保底");
        if (!(Number.isInteger(mod.at) && mod.at >= 1)) err("硬保底必須是正整數", w);
        break;
      case "featured":
        if (tierOk(mod.tier)) once(`feat:${mod.tier}`, "限定規則");
        if (!(mod.share >= 0 && mod.share <= 1)) err("限定比例必須在 0 到 100% 之間", w);
        if (!mod.items.length) err("限定規則沒有限定物品", w);
        for (const id of mod.items) if (!itemIds.has(id)) err(`限定規則使用不存在的物品「${id}」`, { ...w, item: id });
        break;
      case "guarantee":
        if (tierOk(mod.tier)) once(`guar:${mod.tier}`, "大保底");
        if (!m.modules.some((x) => x.kind === "featured" && x.tier === mod.tier)) err("大保底需要同一稀有度的限定規則", w);
        break;
      case "batchFloor":
        tierOk(mod.minTier);
        once("floor", "連抽保底");
        if (!(Number.isInteger(mod.slot) && mod.slot >= 1 && mod.slot <= m.pull.batchSize)) err(`連抽保底的位置必須在 1 到 ${m.pull.batchSize} 之間`, w);
        break;
      case "milestone": {
        if (tierOk(mod.tier)) once(`mile:${mod.tier}`, "累計保底");
        if (!mod.steps.length) err("累計保底沒有任何門檻", w);
        const ats = mod.steps.map((s) => s.at);
        if (ats.some((a) => !(Number.isInteger(a) && a >= 1))) err("累計保底門檻必須是正整數", w);
        if (new Set(ats).size !== ats.length) err("累計保底門檻重複", w);
        if (mod.steps.some((s) => !(s.featuredShare >= 0 && s.featuredShare <= 1))) err("累計保底的限定機率必須在 0 到 100% 之間", w);
        if (!m.modules.some((x) => x.kind === "featured" && x.tier === mod.tier)) err("累計保底需要同一稀有度的限定規則", w);
        break;
      }
      case "epitomized": {
        if (tierOk(mod.tier)) once(`epi:${mod.tier}`, "定軌");
        if (!(Number.isInteger(mod.points) && mod.points >= 1)) err("定軌點數必須是正整數", w);
        const f = m.modules.find((x) => x.kind === "featured" && x.tier === mod.tier);
        if (!f || f.kind !== "featured") err("定軌需要同一稀有度的限定規則", w);
        else if (!f.items.includes(mod.item)) err("定軌的物品必須是限定物品之一", { ...w, item: mod.item });
        break;
      }
      case "exchange":
        once("exchange", "兌換");
        if (!(mod.pointsPerPull > 0) || !(mod.cost > 0)) err("兌換點數必須大於 0", w);
        if (!mod.items.length) err("兌換沒有可選物品", w);
        for (const id of mod.items) if (!itemIds.has(id)) err(`兌換使用不存在的物品「${id}」`, { ...w, item: id });
        break;
    }
  });
  m.tiers.forEach((t, i) => {
    const hasFeat = m.modules.some((x) => x.kind === "featured" && x.tier === t.id && x.items.length);
    if (!t.items.length && !hasFeat) err(`「${t.name}」沒有任何物品`, { tier: t.id });
    if (i === 0 && m.tiers.length > 1 && t.rate <= 0 && !m.modules.some((x) => (x.kind === "hardPity" || x.kind === "milestone" || (x.kind === "softPity" && x.step > 0)) && x.tier === t.id)) {
      err(`「${t.name}」機率為 0 又沒有保底，永遠不會出現`, { tier: t.id });
    }
  });
  return out;
}
