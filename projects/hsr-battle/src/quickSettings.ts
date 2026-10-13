import { applyLoadout, type Loadout, type UnitDef } from "@gml/core";
import { hsrGroup } from "@gml/data-hsr/presets";
import { templateGroup } from "./presets/templates";

export interface QuickStat {
  key: string; label: string; icon: string; percent?: boolean; values: number[]; min?: number; max?: number;
}
export const BASIC_STATS: QuickStat[] = [
  { key: "hp", label: "生命值", icon: "♡", values: [1000, 3000, 5000], min: 1 },
  { key: "atk", label: "攻擊力", icon: "⚔", values: [600, 2000, 3000], min: 0 },
  { key: "def", label: "防禦力", icon: "◇", values: [500, 1000, 2000], min: 0 },
  { key: "spd", label: "速度", icon: "»", values: [100, 134, 160], min: 1 },
];
export const EXTRA_STATS: QuickStat[] = [
  { key: "critRate", label: "暴擊率", icon: "✦", percent: true, values: [0.05, 0.5, 0.7], min: 0, max: 1 },
  { key: "critDmg", label: "暴擊傷害", icon: "✧", percent: true, values: [0.5, 1, 1.5], min: 0 },
  { key: "breakEffect", label: "擊破特攻", icon: "⌁", percent: true, values: [0, 1, 2], min: 0 },
  { key: "effectHit", label: "效果命中", icon: "◎", percent: true, values: [0, 0.3, 0.67], min: 0 },
  { key: "effectRes", label: "效果抵抗", icon: "◈", percent: true, values: [0, 0.3, 0.5], min: 0 },
  { key: "dmgBonus", label: "傷害提高", icon: "◉", percent: true, values: [0, 0.3888, 0.6], min: 0 },
  { key: "energyRegen", label: "能量恢復效率", icon: "↻", percent: true, values: [0, 0.1944, 0.3], min: 0 },
  { key: "healBonus", label: "治療量加成", icon: "✚", percent: true, values: [0, 0.3456, 0.5], min: 0 },
];

export function baselineOf(unit: UnitDef): UnitDef | undefined {
  const id = unit.id.replace(/-\d+$/, "");
  return [...templateGroup.presets, ...hsrGroup.presets].find((p) => p.apply?.id === id)?.apply ?? undefined;
}

/** Equipment is affine in each base stat. Solve the displayed panel value without applying gear twice. */
export function baseForPanel(unit: UnitDef, loadout: Loadout, key: string, target: number, minBase = 0): number {
  const at = (base: number) => applyLoadout({ ...unit, stats: { ...unit.stats, [key]: base } }, loadout).unit.stats[key] ?? 0;
  const offset = at(0);
  const slope = at(1) - offset;
  if (!Number.isFinite(target) || !Number.isFinite(slope) || slope <= 0) return unit.stats[key] ?? minBase;
  return Math.max(minBase, (target - offset) / slope);
}

export const PANEL_PROFILES: { id: string; name: string; description: string; stats: Record<string, number> }[] = [
  { id: "damage", name: "均衡輸出", description: "攻擊 2,800・速度 134・雙暴 70 / 140", stats: { hp: 3000, atk: 2800, def: 1000, spd: 134, critRate: 0.7, critDmg: 1.4 } },
  { id: "support", name: "高速輔助", description: "生命 4,000・速度 160・抵抗 30%", stats: { hp: 4000, atk: 1600, def: 1200, spd: 160, effectRes: 0.3 } },
  { id: "break", name: "擊破配置", description: "生命 3,500・速度 145・擊破 200%", stats: { hp: 3500, atk: 2000, def: 1000, spd: 145, breakEffect: 2 } },
];
