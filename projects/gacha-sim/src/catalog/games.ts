import { sourceText } from "../i18n";
/**
 * Fixed game-rule catalog. Items use generic names; no current banner contents or network sources.
 */
import type { Gacha } from "@gml/core";
export type GameId = "hsr" | "genshin" | "zzz" | "ba" | "wuwa" | "endfield" | "nte";
export type BannerKind = "character" | "weapon" | "pickup" | "standard";

type Model = Gacha.GachaModel;

interface TierRule { name: string; rate: number; softStart?: number; softStep?: number; softMax?: number; hard?: number; share?: number; guarantee?: boolean; epitomized?: number }

export interface BannerType {
  kind: BannerKind;
  region?: "jp" | "global";
  name: string;
  top: TierRule;
  mid: TierRule;
  low: { name: string };
  /** Blue Archive only. */
  floor?: boolean;
  exchange?: number;
  milestone?: { at: number; featuredShare: number }[];
  /** Generic names for all simulated items. */
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
  /** False when the example top-up packs (about 160 currency per pull) do not fit this currency's price. */
  twd?: false;
}

const HOYO_NOTE = sourceText("games1");

export const GAMES: GameDef[] = [
  {
    id: "hsr", name: sourceText("games2"), currency: sourceText("games3"), cost: 160,
    source: sourceText("games4"),
    types: [
      {
        kind: "character", name: sourceText("games5"),
        top: { name: "5★", rate: 0.006, softStart: 74, softStep: 0.06, hard: 90, share: 0.5, guarantee: true },
        mid: { name: "4★", rate: 0.051, softStart: 9, softStep: 0.51, hard: 10, share: 0.5, guarantee: true },
        low: { name: "3★" },
        labels: { top: sourceText("games6"), topStd: sourceText("games7"), mid: sourceText("games8"), low: sourceText("games9") },
        note: sourceText("games10", HOYO_NOTE),
      },
      {
        kind: "weapon", name: sourceText("games11"),
        top: { name: "5★", rate: 0.008, softStart: 66, softStep: 0.07, hard: 80, share: 0.75, guarantee: true },
        mid: { name: "4★", rate: 0.066, hard: 10, share: 0.75, guarantee: true },
        low: { name: "3★" },
        labels: { top: sourceText("games12"), topStd: sourceText("games13"), mid: sourceText("games8"), low: sourceText("games9") },
        note: sourceText("games14", HOYO_NOTE),
      },
      {
        kind: "standard", name: sourceText("games15"),
        top: { name: "5★", rate: 0.006, softStart: 74, softStep: 0.06, hard: 90 },
        mid: { name: "4★", rate: 0.051, softStart: 9, softStep: 0.51, hard: 10 },
        low: { name: "3★" },
        labels: { top: "", topStd: sourceText("games16"), mid: "4★", low: sourceText("games9") },
        note: sourceText("games17", HOYO_NOTE),
      },
    ],
  },
  {
    id: "genshin", name: sourceText("games18"), currency: sourceText("games19"), cost: 160,
    source: sourceText("games20"),
    types: [
      {
        kind: "character", name: sourceText("games5"),
        top: { name: "5★", rate: 0.006, softStart: 74, softStep: 0.06, hard: 90, share: 0.5, guarantee: true },
        mid: { name: "4★", rate: 0.051, softStart: 9, softStep: 0.51, hard: 10, share: 0.5, guarantee: true },
        low: { name: "3★" },
        labels: { top: sourceText("games6"), topStd: sourceText("games7"), mid: sourceText("games8"), low: sourceText("games21") },
        note: sourceText("games22", HOYO_NOTE),
      },
      {
        kind: "weapon", name: sourceText("games23"),
        top: { name: "5★", rate: 0.007, softStart: 63, softStep: 0.07, hard: 80, share: 0.75, guarantee: true, epitomized: 1 },
        mid: { name: "4★", rate: 0.06, hard: 10, share: 0.75, guarantee: true },
        low: { name: "3★" },
        labels: { top: sourceText("games24"), topStd: sourceText("games25"), mid: sourceText("games8"), low: sourceText("games21") },
        note: sourceText("games26", HOYO_NOTE),
      },
      {
        kind: "standard", name: sourceText("games27"),
        top: { name: "5★", rate: 0.006, softStart: 74, softStep: 0.06, hard: 90 },
        mid: { name: "4★", rate: 0.051, softStart: 9, softStep: 0.51, hard: 10 },
        low: { name: "3★" },
        labels: { top: "", topStd: sourceText("games28"), mid: "4★", low: sourceText("games21") },
        note: sourceText("games29", HOYO_NOTE),
      },
    ],
  },
  {
    id: "zzz", name: sourceText("games30"), currency: sourceText("games31"), cost: 160,
    source: sourceText("games32"),
    types: [
      {
        kind: "character", name: sourceText("games33"),
        top: { name: sourceText("games34"), rate: 0.006, softStart: 74, softStep: 0.06, hard: 90, share: 0.5, guarantee: true },
        mid: { name: sourceText("games35"), rate: 0.094, hard: 10, share: 0.5, guarantee: true },
        low: { name: sourceText("games36") },
        labels: { top: sourceText("games37"), topStd: sourceText("games38"), mid: sourceText("games39"), low: sourceText("games40") },
        note: sourceText("games41", HOYO_NOTE),
      },
      {
        kind: "weapon", name: sourceText("games42"),
        top: { name: sourceText("games34"), rate: 0.01, softStart: 65, softStep: 0.055, hard: 80, share: 0.75, guarantee: true },
        mid: { name: sourceText("games35"), rate: 0.15, hard: 10, share: 0.75, guarantee: true },
        low: { name: sourceText("games36") },
        labels: { top: sourceText("games43"), topStd: sourceText("games44"), mid: sourceText("games39"), low: sourceText("games40") },
        note: sourceText("games45", HOYO_NOTE),
      },
      {
        kind: "standard", name: sourceText("games46"),
        top: { name: sourceText("games34"), rate: 0.006, softStart: 74, softStep: 0.06, hard: 90 },
        mid: { name: sourceText("games35"), rate: 0.094, hard: 10 },
        low: { name: sourceText("games36") },
        labels: { top: "", topStd: sourceText("games47"), mid: sourceText("games35"), low: sourceText("games40") },
        note: sourceText("games48", HOYO_NOTE),
      },
    ],
  },
  {
    id: "ba", name: sourceText("games49"), currency: sourceText("games50"), cost: 120, batchCost: 1200,
    source: sourceText("games51"),
    types: [
      {
        kind: "pickup", region: "global", name: sourceText("games52"),
        top: { name: "★3", rate: 0.03, share: 0.7 / 3 }, mid: { name: "★2", rate: 0.185 }, low: { name: "★1" },
        floor: true, exchange: 200,
        labels: { top: sourceText("games53"), topStd: sourceText("games54"), mid: sourceText("games55"), low: sourceText("games56") },
        note: sourceText("games57"),
      },
      {
        kind: "pickup", region: "jp", name: sourceText("games58"),
        top: { name: "★3", rate: 0.03, share: 0.7 / 3 }, mid: { name: "★2", rate: 0.185 }, low: { name: "★1" },
        floor: true, milestone: [{ at: 100, featuredShare: 0.5 }, { at: 200, featuredShare: 1 }],
        labels: { top: sourceText("games53"), topStd: sourceText("games54"), mid: sourceText("games55"), low: sourceText("games56") },
        note: sourceText("games59"),
      },
    ],
  },
  {
    id: "wuwa", name: sourceText("games60"), currency: sourceText("games61"), cost: 160,
    source: sourceText("games62"),
    types: [
      {
        kind: "character", name: sourceText("games63"),
        top: { name: "5★", rate: 0.008, softStart: 66, softStep: 0.02, hard: 80, share: 0.5, guarantee: true },
        mid: { name: "4★", rate: 0.06, hard: 10, share: 0.5, guarantee: true },
        low: { name: "3★" },
        labels: { top: sourceText("games64"), topStd: sourceText("games65"), mid: sourceText("games8"), low: sourceText("games21") },
        note: sourceText("games66"),
      },
      {
        kind: "weapon", name: sourceText("games67"),
        top: { name: "5★", rate: 0.008, softStart: 66, softStep: 0.02, hard: 80, share: 1 },
        mid: { name: "4★", rate: 0.06, hard: 10 },
        low: { name: "3★" },
        labels: { top: sourceText("games24"), topStd: sourceText("games25"), mid: "4★", low: sourceText("games21") },
        note: sourceText("games68"),
      },
      {
        kind: "standard", name: sourceText("games69"),
        top: { name: "5★", rate: 0.008, softStart: 66, softStep: 0.02, hard: 80 },
        mid: { name: "4★", rate: 0.06, hard: 10 },
        low: { name: "3★" },
        labels: { top: "", topStd: sourceText("games65"), mid: "4★", low: sourceText("games21") },
        note: sourceText("games70"),
      },
    ],
  },
  {
    id: "endfield", name: sourceText("games71"), currency: sourceText("games72"), cost: 500, twd: false,
    source: sourceText("games73"),
    types: [
      {
        kind: "character", name: sourceText("games74"),
        top: { name: "6★", rate: 0.008, softStart: 66, softStep: 0.05, hard: 80, share: 0.5 },
        mid: { name: "5★", rate: 0.08, hard: 10 },
        low: { name: "4★" },
        milestone: [{ at: 120, featuredShare: 1 }],
        labels: { top: sourceText("games75"), topStd: sourceText("games76"), mid: sourceText("games77"), low: sourceText("games78") },
        note: sourceText("games79"),
      },
      {
        kind: "standard", name: sourceText("games80"),
        top: { name: "6★", rate: 0.008, softStart: 66, softStep: 0.05, hard: 80 },
        mid: { name: "5★", rate: 0.08, hard: 10 },
        low: { name: "4★" },
        labels: { top: "", topStd: sourceText("games76"), mid: sourceText("games77"), low: sourceText("games78") },
        note: sourceText("games81"),
      },
    ],
  },
  {
    id: "nte", name: sourceText("games82"), currency: sourceText("games83"), cost: 160,
    source: sourceText("games84"),
    types: [
      {
        kind: "character", name: sourceText("games5"),
        top: { name: sourceText("games34"), rate: 0.0099, softStart: 71, softStep: 1, softMax: 0.1959, hard: 90, share: 1 },
        mid: { name: sourceText("games35"), rate: 0.1167, hard: 10 },
        low: { name: sourceText("games36") },
        labels: { top: sourceText("games85"), topStd: sourceText("games86"), mid: sourceText("games35"), low: sourceText("games36") },
        note: sourceText("games87"),
      },
      {
        kind: "standard", name: sourceText("games88"),
        top: { name: sourceText("games34"), rate: 0.0099, softStart: 71, softStep: 1, softMax: 0.1959, hard: 90 },
        mid: { name: sourceText("games35"), rate: 0.1167, hard: 10 },
        low: { name: sourceText("games36") },
        labels: { top: "", topStd: sourceText("games86"), mid: sourceText("games35"), low: sourceText("games36") },
        note: sourceText("games89"),
      },
    ],
  },
];

export function gameOf(id: GameId): GameDef {
  return GAMES.find((g) => g.id === id)!;
}

export function typeFor(g: GameDef, banner: { kind: string; region?: string }): BannerType | undefined {
  return g.types.find((t) => t.kind === banner.kind && (t.region === undefined || t.region === banner.region));
}

const item = (id: string, name: string): Gacha.GachaItem => ({ id, name, kind: "resource" });

/**
 * Builds a fixed generic pool. Epitomized weapon pools offer two generic choices.
 */
export function buildModel(g: GameDef, t: BannerType): Model {
  const f5 = t.top.share === undefined ? [] : t.top.epitomized
    ? [item("f5:any", `${t.labels.top} A`), item("f5:other", `${t.labels.top} B`)]
    : [item("f5:any", t.labels.top)];
  const f4 = t.mid.share === undefined ? [] : [item("f4:any", `UP ${t.mid.name}`)];
  const items = [...f5, item("std5", t.labels.topStd), ...f4, item("std4", t.labels.mid), item("r3", t.labels.low)];
  const modules: Gacha.RuleModule[] = [];
  const tierMods = (tier: string, r: TierRule, featured: Gacha.GachaItem[]) => {
    if (r.softStart && r.softStep) modules.push({ kind: "softPity", tier, start: r.softStart, step: r.softStep, ...(r.softMax !== undefined ? { max: r.softMax } : {}) });
    if (r.hard) modules.push({ kind: "hardPity", tier, at: r.hard });
    if (r.share !== undefined && featured.length) {
      modules.push({ kind: "featured", tier, share: r.share, items: featured.map((x) => x.id) });
      if (r.guarantee) modules.push({ kind: "guarantee", tier });
      if (r.epitomized) modules.push({ kind: "epitomized", tier, item: featured[0]!.id, points: r.epitomized });
    }
  };
  tierMods("top", t.top, f5);
  tierMods("mid", t.mid, f4);
  if (t.floor) modules.push({ kind: "batchFloor", slot: 10, minTier: "mid" });
  if (t.milestone) modules.push({ kind: "milestone", tier: "top", steps: t.milestone.map((x) => ({ ...x })) });
  if (t.exchange && f5.length) modules.push({ kind: "exchange", pointsPerPull: 1, cost: t.exchange, items: f5.map((x) => x.id) });
  return {
    version: 2,
    id: `${g.id}:${t.kind}${t.region ? `:${t.region}` : ""}`,
    name: `${g.name}・${t.name}`,
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
