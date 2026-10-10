/**
 * Game catalog: per-game banner rules (stable mechanics, with source notes) + current banner contents from
 * live data (live.ts). Only names come from the sources; no game art is used.
 */
import type { Gacha } from "@ggt/core";
import type { BannerKind, GameId, LiveBanner } from "./live";

type Model = Gacha.GachaModel;

interface TierRule { name: string; rate: number; softStart?: number; softStep?: number; hard?: number; share?: number; guarantee?: boolean; epitomized?: number }

export interface BannerType {
  /** Matches LiveBanner.kind ("standard" has no live data). */
  kind: BannerKind | "standard";
  region?: "jp" | "global";
  name: string;
  top: TierRule;
  mid: TierRule;
  low: { name: string };
  /** Blue Archive only. */
  floor?: boolean;
  exchange?: number;
  milestone?: { at: number; featuredShare: number }[];
  /** Generic item names when there is no live data. */
  labels: { top: string; topStd: string; mid: string; low: string };
  note: string;
}

export interface GameDef {
  id: GameId;
  name: string;
  currency: string;
  cost: number;
  batchCost?: number;
  types: BannerType[];
  source: string;
}

const HOYO_NOTE = "5★ 基礎機率、硬保底、限定比例與大保底為官方公開說明；軟保底的起點與每抽增幅是玩家社群統計推估，官方未公布。";

export const GAMES: GameDef[] = [
  {
    id: "hsr", name: "崩壞：星穹鐵道", currency: "星瓊", cost: 160,
    source: "躍遷規則依官方躍遷詳情與社群統計；目前卡池內容即時取自 api.ennead.cc（官方活動日曆）。",
    types: [
      {
        kind: "character", name: "限定角色",
        top: { name: "5★", rate: 0.006, softStart: 74, softStep: 0.06, hard: 90, share: 0.5, guarantee: true },
        mid: { name: "4★", rate: 0.051, softStart: 9, softStep: 0.51, hard: 10, share: 0.5, guarantee: true },
        low: { name: "3★" },
        labels: { top: "限定 5★ 角色", topStd: "常駐 5★ 角色", mid: "其他 4★", low: "3★ 光錐" },
        note: `角色活動躍遷：5★ 0.6%、90 抽內必得、50% 為限定，歪了下次必中；4★ 5.1%、10 抽內必得、50% 為 UP。${HOYO_NOTE}`,
      },
      {
        kind: "weapon", name: "光錐",
        top: { name: "5★", rate: 0.008, softStart: 66, softStep: 0.07, hard: 80, share: 0.75, guarantee: true },
        mid: { name: "4★", rate: 0.066, hard: 10, share: 0.75, guarantee: true },
        low: { name: "3★" },
        labels: { top: "限定 5★ 光錐", topStd: "常駐 5★ 光錐", mid: "其他 4★", low: "3★ 光錐" },
        note: `光錐活動躍遷：5★ 0.8%、80 抽內必得、75% 為限定，歪了下次必中；4★ 6.6%、75% 為 UP。${HOYO_NOTE}`,
      },
      {
        kind: "standard", name: "常駐（群星躍遷）",
        top: { name: "5★", rate: 0.006, softStart: 74, softStep: 0.06, hard: 90 },
        mid: { name: "4★", rate: 0.051, softStart: 9, softStep: 0.51, hard: 10 },
        low: { name: "3★" },
        labels: { top: "", topStd: "常駐 5★（角色或光錐）", mid: "4★", low: "3★ 光錐" },
        note: `群星躍遷：5★ 0.6%、90 抽內必得。累計 300 抽可自選一名 5★ 的一次性獎勵未模擬。${HOYO_NOTE}`,
      },
    ],
  },
  {
    id: "genshin", name: "原神", currency: "原石", cost: 160,
    source: "祈願規則依官方祈願詳情與社群統計；目前卡池內容即時取自 api.ennead.cc（官方活動日曆）。",
    types: [
      {
        kind: "character", name: "限定角色",
        top: { name: "5★", rate: 0.006, softStart: 74, softStep: 0.06, hard: 90, share: 0.5, guarantee: true },
        mid: { name: "4★", rate: 0.051, softStart: 9, softStep: 0.51, hard: 10, share: 0.5, guarantee: true },
        low: { name: "3★" },
        labels: { top: "限定 5★ 角色", topStd: "常駐 5★ 角色", mid: "其他 4★", low: "3★ 武器" },
        note: `角色活動祈願：5★ 0.6%、90 抽內必得、歪了下次必中；4★ 5.1%。5.0 起的「捕獲明光」會在多次歪掉後提高限定機率（官方公布限定綜合約 55%），此模擬以 50% 計算、略為保守。${HOYO_NOTE}`,
      },
      {
        kind: "weapon", name: "武器（定軌）",
        top: { name: "5★", rate: 0.007, softStart: 63, softStep: 0.07, hard: 80, share: 0.75, guarantee: true, epitomized: 1 },
        mid: { name: "4★", rate: 0.06, hard: 10, share: 0.75, guarantee: true },
        low: { name: "3★" },
        labels: { top: "限定 5★ 武器", topStd: "常駐 5★ 武器", mid: "其他 4★", low: "3★ 武器" },
        note: `武器活動祈願：5★ 0.7%、80 抽內必得（軟保底實際上約 77 抽到頂）、75% 為兩把限定之一；定軌 1 點（5.0 起）：抽到非定軌的 5★ 後，下一個 5★ 必為定軌武器。${HOYO_NOTE}`,
      },
      {
        kind: "standard", name: "常駐（奔行世間）",
        top: { name: "5★", rate: 0.006, softStart: 74, softStep: 0.06, hard: 90 },
        mid: { name: "4★", rate: 0.051, softStart: 9, softStep: 0.51, hard: 10 },
        low: { name: "3★" },
        labels: { top: "", topStd: "常駐 5★（角色或武器）", mid: "4★", low: "3★ 武器" },
        note: `奔行世間：5★ 0.6%、90 抽內必得。${HOYO_NOTE}`,
      },
    ],
  },
  {
    id: "ba", name: "蔚藍檔案", currency: "青輝石", cost: 120, batchCost: 1200,
    source: "招募規則依 Blue Archive Wiki 與 Inven Global 報導；Pickup 學生取自 SchaleDB，可能比遊戲晚更新。",
    types: [
      {
        kind: "pickup", region: "global", name: "國際服 Pickup（天井兌換）",
        top: { name: "★3", rate: 0.03, share: 0.7 / 3 }, mid: { name: "★2", rate: 0.185 }, low: { name: "★1" },
        floor: true, exchange: 200,
        labels: { top: "Pickup ★3 學生", topStd: "其他 ★3 學生", mid: "★2 學生", low: "★1 學生" },
        note: "★3 3%（Pickup 學生 0.7%）、★2 18.5%、★1 78.5%；十連第 10 抽 ★2 以上；每抽 1 點，200 點可兌換 Pickup 學生（活動結束點數不保留）。",
      },
      {
        kind: "pickup", region: "jp", name: "日服 Pickup（累計保底）",
        top: { name: "★3", rate: 0.03, share: 0.7 / 3 }, mid: { name: "★2", rate: 0.185 }, low: { name: "★1" },
        floor: true, milestone: [{ at: 100, featuredShare: 0.5 }, { at: 200, featuredShare: 1 }],
        labels: { top: "Pickup ★3 學生", topStd: "其他 ★3 學生", mid: "★2 學生", low: "★1 學生" },
        note: "2026-07-29 起：沒抽到 Pickup 時累計，第 100 抽必得 ★3（50% 為 Pickup），第 200 抽必得 Pickup，抽到 Pickup 才歸零；第 100 抽的非 Pickup ★3 是否歸零未公開，此處不歸零。",
      },
    ],
  },
];

export function gameOf(id: GameId): GameDef {
  return GAMES.find((g) => g.id === id)!;
}

export function typeFor(g: GameDef, banner: Pick<LiveBanner, "kind" | "region">): BannerType | undefined {
  return g.types.find((t) => t.kind === banner.kind && (t.region === undefined || t.region === banner.region));
}

const item = (id: string, name: string): Gacha.GachaItem => ({ id, name, kind: "resource" });

/**
 * Builds a gacha model for one banner type, filled with the live banner's names when given.
 * Featured items keep the source ids (`f5:<id>`), so pity state survives a banner change.
 */
export function buildModel(g: GameDef, t: BannerType, live?: LiveBanner): Model {
  const f5 = live?.featured5.length ? live.featured5.map((u) => item(`f5:${u.id}`, u.name)) : t.top.share !== undefined ? [item("f5:any", t.labels.top)] : [];
  const f4 = live?.featured4.length ? live.featured4.map((u) => item(`f4:${u.id}`, u.name)) : [];
  const items = [...f5, item("std5", t.labels.topStd), ...f4, item("std4", t.labels.mid), item("r3", t.labels.low)];
  const modules: Gacha.RuleModule[] = [];
  const tierMods = (tier: string, r: TierRule, featured: Gacha.GachaItem[]) => {
    if (r.softStart && r.softStep) modules.push({ kind: "softPity", tier, start: r.softStart, step: r.softStep });
    if (r.hard) modules.push({ kind: "hardPity", tier, at: r.hard });
    if (r.share !== undefined && featured.length) {
      modules.push({ kind: "featured", tier, share: r.share, items: featured.map((x) => x.id) });
      if (r.guarantee) modules.push({ kind: "guarantee", tier });
      if (r.epitomized) modules.push({ kind: "epitomized", tier, item: featured[0]!.id, points: r.epitomized });
    }
  };
  // Blue Archive: every pickup student has its own 0.7%, so the featured share grows with their number.
  const top = t.kind === "pickup" && f5.length > 1 && t.top.share !== undefined ? { ...t.top, share: Math.min(1, t.top.share * f5.length) } : t.top;
  tierMods("top", top, f5);
  tierMods("mid", t.mid, f4);
  if (t.floor) modules.push({ kind: "batchFloor", slot: 10, minTier: "mid" });
  if (t.milestone) modules.push({ kind: "milestone", tier: "top", steps: t.milestone.map((x) => ({ ...x })) });
  if (t.exchange && f5.length) modules.push({ kind: "exchange", pointsPerPull: 1, cost: t.exchange, items: f5.map((x) => x.id) });
  const title = live?.featured5.length ? live.featured5.map((u) => u.name).join("・") : t.name;
  return {
    version: 2,
    id: `${g.id}:${t.kind}${t.region ? `:${t.region}` : ""}`,
    name: `${g.name}・${t.name}${live?.featured5.length ? `：${title}` : ""}`,
    description: t.note,
    source: `${t.note} ${g.source}`,
    pull: { cost: g.cost, currency: g.currency, batchSize: 10, ...(g.batchCost ? { batchCost: g.batchCost } : {}) },
    tiers: [
      { id: "top", name: t.top.name, rate: t.top.rate, items: ["std5"] },
      { id: "mid", name: t.mid.name, rate: t.mid.rate, items: ["std4"] },
      { id: "low", name: t.low.name, rate: 0, items: ["r3"] },
    ],
    items,
    modules,
  };
}

/** Pity is shared by every banner of the same game and type (as in the games). */
export const pityKey = (m: Pick<Model, "id">) => m.id;
