/**
 * Preset gacha models (generic names; each `source` explains where the rules come from and which numbers are
 * official vs. community-measured) and the converter from gacha 1.0 banners.
 */
import type { BannerDef } from "../gacha/types";
import type { TopUpPack } from "./cost";
import type { GachaItem, GachaModel, RuleModule } from "./model";

const item = (id: string, name: string): GachaItem => ({ id, name, kind: "resource", resource: id, amount: 1 });

export interface Preset {
  model: GachaModel;
  /** Suggested target: the featured item of the top tier. */
  target: { tier: string; mode: "featured"; copies: number };
  /** Example top-up packs in TWD — not any game's real price list. */
  packs: TopUpPack[];
}

/** Example packs shared by the presets (first purchase doubles the currency). */
export const EXAMPLE_PACKS: TopUpPack[] = [
  { id: "p30", name: "30 元", price: 30, amount: 60, firstBonus: 60 },
  { id: "p150", name: "150 元", price: 150, amount: 330, firstBonus: 300 },
  { id: "p490", name: "490 元", price: 490, amount: 1090, firstBonus: 980 },
  { id: "p990", name: "990 元", price: 990, amount: 2240, firstBonus: 1980 },
  { id: "p1690", name: "1690 元", price: 1690, amount: 3880, firstBonus: 3280 },
  { id: "p3290", name: "3290 元", price: 3290, amount: 8080, firstBonus: 6480 },
];

export const PRESETS: Preset[] = [
  {
    model: {
      version: 2,
      id: "soft-pity-5050",
      name: "軟保底＋大小保底型",
      description: "最高稀有度有軟保底、90 抽硬保底；抽中時一半機率是限定，歪了下次必定限定。次高稀有度每 10 抽保底。",
      source: "規則參考常見於米哈遊系列角色活動池的公開機率說明：5★ 基礎 0.6%、90 抽內必得、50% 為限定且歪了下次必中；4★ 基礎 5.1%、10 抽內必得。軟保底起點與增幅（5★ 第 74 抽起每抽 +6%、4★ 第 9 抽 +51%）是玩家社群的統計推估，官方未公布。部分作品近年加入提高限定機率的機制，此模型未包含。",
      pull: { cost: 160, currency: "抽卡貨幣", batchSize: 10 },
      tiers: [
        { id: "5", name: "5★", rate: 0.006, items: ["std5"] },
        { id: "4", name: "4★", rate: 0.051, items: ["std4"] },
        { id: "3", name: "3★", rate: 0, items: ["r3"] },
      ],
      items: [item("lim5", "限定 5★ 角色"), item("std5", "常駐 5★ 角色"), item("up4a", "UP 4★ 角色 A"), item("up4b", "UP 4★ 角色 B"), item("up4c", "UP 4★ 角色 C"), item("std4", "其他 4★"), item("r3", "3★ 物品")],
      modules: [
        { kind: "softPity", tier: "5", start: 74, step: 0.06 },
        { kind: "hardPity", tier: "5", at: 90 },
        { kind: "featured", tier: "5", share: 0.5, items: ["lim5"] },
        { kind: "guarantee", tier: "5" },
        { kind: "softPity", tier: "4", start: 9, step: 0.51 },
        { kind: "hardPity", tier: "4", at: 10 },
        { kind: "featured", tier: "4", share: 0.5, items: ["up4a", "up4b", "up4c"] },
        { kind: "guarantee", tier: "4" },
      ],
    },
    target: { tier: "5", mode: "featured", copies: 1 },
    packs: EXAMPLE_PACKS,
  },
  {
    model: {
      version: 2,
      id: "floor-exchange",
      name: "十連保底＋天井兌換型",
      description: "最高稀有度固定機率、沒有保底；十連的第 10 抽至少次高稀有度。每抽累積 1 點，200 點可直接兌換限定角色。",
      source: "規則參考蔚藍檔案國際版（以及 2026-07-29 改版前日服）的公開說明：★3 3%（其中限定學生 0.7%）、★2 18.5%、★1 78.5%；十連第 10 抽 ★2 以上；每抽 1 點招募點數，200 點可兌換限定學生，活動結束後點數不保留。資料來源：Blue Archive Wiki、Inven Global 報導。",
      pull: { cost: 120, currency: "抽卡貨幣", batchSize: 10, batchCost: 1200 },
      tiers: [
        { id: "3", name: "★3", rate: 0.03, items: ["std3"] },
        { id: "2", name: "★2", rate: 0.185, items: ["r2"] },
        { id: "1", name: "★1", rate: 0, items: ["r1"] },
      ],
      items: [item("lim3", "限定 ★3 角色"), item("std3", "其他 ★3 角色"), item("r2", "★2 角色"), item("r1", "★1 角色")],
      modules: [
        { kind: "featured", tier: "3", share: 0.7 / 3, items: ["lim3"] },
        { kind: "batchFloor", slot: 10, minTier: "2" },
        { kind: "exchange", pointsPerPull: 1, cost: 200, items: ["lim3"] },
      ],
    },
    target: { tier: "3", mode: "featured", copies: 1 },
    packs: EXAMPLE_PACKS,
  },
  {
    model: {
      version: 2,
      id: "floor-milestone",
      name: "十連保底＋累計保底型",
      description: "機率同上；改為累計保底：沒抽到限定時計數，第 100 抽必得最高稀有度（一半機率是限定），第 200 抽必得限定，抽到限定才歸零。",
      source: "規則參考蔚藍檔案日服 2026-07-29 改版後的「招募 Charge」說明：100 Charge 必得 ★3（50% 為限定學生），200 Charge 必得限定學生；只有抽到該卡池限定學生才歸零，同類型卡池共用並跨期保留。第 100 抽若得到非限定 ★3 是否歸零未公開，此模型依「抽到限定才歸零」不歸零；改版附帶的免費十連券未計入。資料來源：Blue Archive Wiki、Inven Global 報導。",
      pull: { cost: 120, currency: "抽卡貨幣", batchSize: 10, batchCost: 1200 },
      tiers: [
        { id: "3", name: "★3", rate: 0.03, items: ["std3"] },
        { id: "2", name: "★2", rate: 0.185, items: ["r2"] },
        { id: "1", name: "★1", rate: 0, items: ["r1"] },
      ],
      items: [item("lim3", "限定 ★3 角色"), item("std3", "其他 ★3 角色"), item("r2", "★2 角色"), item("r1", "★1 角色")],
      modules: [
        { kind: "featured", tier: "3", share: 0.7 / 3, items: ["lim3"] },
        { kind: "batchFloor", slot: 10, minTier: "2" },
        { kind: "milestone", tier: "3", steps: [{ at: 100, featuredShare: 0.5 }, { at: 200, featuredShare: 1 }] },
      ],
    },
    target: { tier: "3", mode: "featured", copies: 1 },
    packs: EXAMPLE_PACKS,
  },
];

/** A gacha 1.0 banner as a 2.0 model (§6): same rules, same rng use, so pulls are identical. */
export function modelFromBanner(b: BannerDef): GachaModel {
  const modules: RuleModule[] = [];
  for (const t of b.tiers) {
    if (t.softPityStart && t.softPityStart > 0) modules.push({ kind: "softPity", tier: t.id, start: t.softPityStart, step: t.softPityStep ?? 0 });
    if (t.hardPity && t.hardPity > 0) modules.push({ kind: "hardPity", tier: t.id, at: t.hardPity });
    if (t.featured && t.featured.items.length) {
      modules.push({ kind: "featured", tier: t.id, share: t.featured.share, items: [...t.featured.items] });
      if (t.featured.guarantee) modules.push({ kind: "guarantee", tier: t.id });
    }
  }
  return {
    version: 2,
    id: b.id,
    name: b.name,
    description: b.description,
    pull: { cost: b.cost, currency: "抽卡貨幣", batchSize: 10 },
    tiers: b.tiers.map((t) => ({ id: t.id, name: t.name, rate: t.rate, items: [...t.items] })),
    items: b.items.map((x) => ({ ...x })),
    modules,
  };
}
