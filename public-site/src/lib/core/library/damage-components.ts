/**
 * Built-in damage components. Formulas are generic designs written for this tool; they are inspired by
 * common genre conventions but are not copies of any specific game's formula.
 */
import { parseExpr } from "../expr";
import type { DamageComponent, DamageConfig, DamageTemplate, Scenario } from "../damage";

const f = parseExpr;

export const DAMAGE_COMPONENTS: DamageComponent[] = [
  {
    id: "dmg.base-atk",
    name: "基礎傷害（攻擊力 × 倍率）",
    description: "以攻擊方的最終攻擊力乘上技能倍率與該段命中比例，作為傷害起點。",
    provides: ["dmg:base"],
    requires: [],
    stats: [{ side: "attacker", key: "atk", label: "攻擊力", default: 1000, unit: "flat", min: 0 }],
    steps: [{ id: "base", label: "基礎傷害", apply: "set", order: 0, base: f("attacker.atk * skill.multiplier * hit.ratio") }],
  },
  {
    id: "dmg.def-sub",
    name: "防禦減算",
    description: "傷害直接扣除防禦值，最低保留原傷害的 10%。適合數字直觀、早期回合制或像素風遊戲。",
    provides: ["dmg:defense"],
    requires: ["dmg:base"],
    stats: [
      { side: "defender", key: "def", label: "防禦力", default: 300, unit: "flat", min: 0 },
      { side: "attacker", key: "defIgnore", label: "無視防禦", default: 0, unit: "percent", min: 0, max: 1 },
    ],
    steps: [
      {
        id: "defSub",
        label: "防禦減算",
        apply: "set",
        order: 5,
        base: f("max(prev - defender.def * hit.ratio * (1 - attacker.defIgnore), prev * 0.1)"),
        description: "防禦按命中比例分攤，避免多段攻擊被防禦重複扣除。",
      },
    ],
  },
  {
    id: "dmg.crit",
    name: "暴擊",
    description: "每段命中獨立判定暴擊；暴擊時乘上 1 + 暴擊傷害。",
    provides: ["dmg:crit"],
    requires: ["dmg:base"],
    stats: [
      { side: "attacker", key: "critRate", label: "暴擊率", default: 0.05, unit: "percent", min: 0 },
      { side: "attacker", key: "critDmg", label: "暴擊傷害", default: 0.5, unit: "percent", min: 0 },
    ],
    critChance: f("attacker.critRate"),
    steps: [{ id: "crit", label: "暴擊乘區", apply: "mul", order: 10, base: f("if(flags.crit, 1 + attacker.critDmg, 1)") }],
  },
  {
    id: "dmg.bonus",
    name: "增傷乘區",
    description: "所有「傷害提高」類加成在同一乘區相加，再整體乘上。",
    provides: ["dmg:bonus"],
    requires: ["dmg:base"],
    stats: [{ side: "attacker", key: "dmgBonus", label: "增傷", default: 0, unit: "percent" }],
    steps: [{ id: "dmgBonus", label: "增傷乘區", apply: "mul", order: 20, base: f("1 + attacker.dmgBonus"), cap: { min: 0 } }],
  },
  {
    id: "dmg.def-ratio",
    name: "防禦比例減免",
    description: "防禦以比例減傷：1 − 有效防禦 /（有效防禦 + 200 + 10 × 攻擊方等級）。防禦再高也不會讓傷害歸零。",
    provides: ["dmg:defense"],
    requires: ["dmg:base"],
    stats: [
      { side: "attacker", key: "level", label: "等級", default: 80, unit: "level", min: 1 },
      { side: "attacker", key: "defIgnore", label: "無視防禦", default: 0, unit: "percent", min: 0, max: 1 },
      { side: "defender", key: "def", label: "防禦力", default: 1000, unit: "flat", min: 0 },
    ],
    steps: [
      {
        id: "defRatio",
        label: "防禦乘區",
        apply: "mul",
        order: 30,
        base: f("1 - defender.def * (1 - attacker.defIgnore) / (defender.def * (1 - attacker.defIgnore) + 200 + 10 * attacker.level)"),
      },
    ],
  },
  {
    id: "dmg.res",
    name: "抗性乘區",
    description: "1 −（抗性 − 抗性穿透），限制在 0.1 到 2 之間。",
    provides: ["dmg:res"],
    requires: ["dmg:base"],
    stats: [
      { side: "defender", key: "res", label: "抗性", default: 0.2, unit: "percent" },
      { side: "attacker", key: "resPen", label: "抗性穿透", default: 0, unit: "percent" },
    ],
    steps: [{ id: "res", label: "抗性乘區", apply: "mul", order: 40, base: f("1 - (defender.res - attacker.resPen)"), cap: { min: 0.1, max: 2 } }],
  },
  {
    id: "dmg.vuln",
    name: "易傷乘區",
    description: "目標身上的「受到傷害提高」效果相加後整體乘上。",
    provides: ["dmg:vuln"],
    requires: ["dmg:base"],
    stats: [{ side: "defender", key: "vulnerability", label: "易傷", default: 0, unit: "percent" }],
    steps: [{ id: "vuln", label: "易傷乘區", apply: "mul", order: 50, base: f("1 + defender.vulnerability"), cap: { min: 0 } }],
  },
  {
    id: "dmg.reduction",
    name: "減傷乘區",
    description: "目標的「受到傷害降低」效果，最低為 0。",
    provides: ["dmg:reduction"],
    requires: ["dmg:base"],
    stats: [{ side: "defender", key: "dmgReduction", label: "減傷", default: 0, unit: "percent" }],
    steps: [{ id: "reduction", label: "減傷乘區", apply: "mul", order: 60, base: f("1 - defender.dmgReduction"), cap: { min: 0 } }],
  },
  {
    id: "dmg.toughness",
    name: "韌性減免（弱點擊破）",
    description: "目標韌性未被擊破時受到的傷害降低 10%；擊破後恢復全額。",
    provides: ["dmg:toughness"],
    requires: ["dmg:base"],
    stats: [],
    flags: [{ key: "broken", label: "目標已被擊破", default: false }],
    steps: [{ id: "toughness", label: "韌性乘區", apply: "mul", order: 70, base: f("if(flags.broken, 1, 0.9)") }],
  },
];

export const DAMAGE_TEMPLATES: DamageTemplate[] = [
  {
    id: "tpl.standard",
    name: "標準乘區型",
    description: "現代手遊常見的多乘區結構：基礎 × 暴擊 × 增傷 × 防禦 × 抗性 × 易傷。",
    components: ["dmg.base-atk", "dmg.crit", "dmg.bonus", "dmg.def-ratio", "dmg.res", "dmg.vuln"],
  },
  {
    id: "tpl.subtraction",
    name: "防禦減算型",
    description: "攻擊減防禦的直觀算法，數字好懂，但防禦影響很劇烈。",
    components: ["dmg.base-atk", "dmg.def-sub", "dmg.crit", "dmg.bonus"],
  },
  {
    id: "tpl.weakness-break",
    name: "弱點擊破型",
    description: "標準乘區再加上減傷與韌性乘區；擊破前後傷害差距是戰鬥節奏的核心。",
    components: ["dmg.base-atk", "dmg.crit", "dmg.bonus", "dmg.def-ratio", "dmg.res", "dmg.vuln", "dmg.reduction", "dmg.toughness"],
  },
];

export function configFromTemplate(templateId: string): DamageConfig {
  const t = DAMAGE_TEMPLATES.find((x) => x.id === templateId);
  if (!t) throw new Error(`Unknown template ${templateId}`);
  return { components: [...t.components], customSteps: [], overrides: {}, disabledSteps: [], finalRounding: "floor", minDamage: 1 };
}

export function defaultScenario(name = "方案 A"): Scenario {
  return {
    name,
    attacker: { atk: 2400, critRate: 0.6, critDmg: 1.2, dmgBonus: 0.4, level: 80, defIgnore: 0, resPen: 0 },
    defender: { def: 1000, res: 0.2, vulnerability: 0, dmgReduction: 0.1 },
    skill: { name: "戰技", multiplier: 2, type: "skill", element: "fire", hits: [0.5, 0.5] },
    flags: { broken: false },
    modifiers: [],
  };
}
