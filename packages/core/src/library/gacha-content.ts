/**
 * Default banners. Built from the project's own allies, so they always reference existing characters.
 * All names and numbers are original to this tool.
 */
import type { BattleConfig } from "../project";
import type { BannerDef, GachaConfig, GachaItem } from "../gacha/types";

/** Allies the demo gives at the start: the current battle line-up (or the first four allies). */
export function starterAllies(b: Pick<BattleConfig, "units" | "encounter">): string[] {
  const allies = b.units.filter((u) => u.team === "ally").map((u) => u.id);
  const team = b.encounter.allies.filter((id) => allies.includes(id));
  return (team.length ? team : allies).slice(0, 4);
}

const unitItem = (b: Pick<BattleConfig, "units">, id: string): GachaItem => ({ id: `u.${id}`, name: b.units.find((u) => u.id === id)?.name ?? id, kind: "unit", unitId: id });
const EXP_ITEMS: GachaItem[] = [
  { id: "exp.s", name: "經驗晶", kind: "resource", resource: "exp", amount: 400 },
  { id: "exp.m", name: "高級經驗晶", kind: "resource", resource: "exp", amount: 2000 },
  { id: "exp.l", name: "星輝結晶", kind: "resource", resource: "exp", amount: 5000 },
];

/**
 * The demo's original pool: 5★ 2% with a hard pity on pull 50, split evenly between the non-starter allies;
 * 4★ 13%; the rest 3★. Without non-starter allies the 5★ is a large exp item.
 */
export function simpleBanner(b: Pick<BattleConfig, "units" | "encounter">): BannerDef {
  const starters = new Set(starterAllies(b));
  const featured = b.units.filter((u) => u.team === "ally" && !starters.has(u.id)).map((u) => u.id);
  const chars = featured.map((id) => unitItem(b, id));
  return {
    id: "simple",
    name: "DEMO 簡易池",
    description: "固定機率加硬保底，沒有大小保底。DEMO 原本的卡池。",
    cost: 160,
    tiers: [
      { id: "5", name: "5★", rate: 0.02, hardPity: 50, items: chars.length ? chars.map((c) => c.id) : ["exp.l"] },
      { id: "4", name: "4★", rate: 0.13, items: ["exp.m"] },
      { id: "3", name: "3★", rate: 0, items: ["exp.s"] },
    ],
    items: [...chars, ...EXP_ITEMS.filter((x) => x.id !== "exp.l" || !chars.length)],
  };
}

/**
 * A rate-up banner with soft pity and a 50/50 guarantee on both upper tiers: one non-starter ally is the
 * featured 5★, the starters fill the off-banner 5★ slot, and the other non-starters are featured 4★.
 */
export function rateUpBanner(b: Pick<BattleConfig, "units" | "encounter">): BannerDef {
  const starters = starterAllies(b);
  const others = b.units.filter((u) => u.team === "ally" && !starters.includes(u.id)).map((u) => u.id);
  const [star, ...rest] = others;
  const featured5 = star ? [`u.${star}`] : [];
  const off5 = starters.map((id) => `u.${id}`);
  const featured4 = rest.map((id) => `u.${id}`);
  return {
    id: "rate-up",
    name: "限定祈願（軟保底＋大小保底）",
    description: "5★ 基礎 0.6%，第 74 抽起每抽 +6%，第 90 抽必中；5★ 有 50% 為限定，歪了下次必中。4★ 每 10 抽保底。",
    cost: 160,
    tiers: [
      { id: "5", name: "5★", rate: 0.006, softPityStart: 74, softPityStep: 0.06, hardPity: 90, featured: { share: 0.5, guarantee: true, items: featured5 }, items: off5 },
      { id: "4", name: "4★", rate: 0.051, hardPity: 10, featured: featured4.length ? { share: 0.5, guarantee: true, items: featured4 } : undefined, items: ["exp.m"] },
      { id: "3", name: "3★", rate: 0, items: ["exp.s"] },
    ],
    items: [...[star, ...rest, ...starters].filter((x): x is string => !!x).map((id) => unitItem(b, id)), ...EXP_ITEMS.filter((x) => x.id !== "exp.l")],
  };
}

export function defaultGachaConfig(b: Pick<BattleConfig, "units" | "encounter">): GachaConfig {
  return { banners: [simpleBanner(b), rateUpBanner(b)], active: "simple" };
}
