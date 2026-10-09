/**
 * Original sample roster for the turn-based templates. All names and numbers are original to this tool.
 */
import { parseExpr } from "../expr";
import type { AllyPolicy, BattleRules, EncounterDef, SkillDef, StatusDef, UnitDef } from "../battle/types";

const f = parseExpr;

export const ELEMENT_LABELS: Record<string, string> = {
  fire: "火",
  ice: "冰",
  thunder: "雷",
  wind: "風",
  light: "光",
  shadow: "暗",
};

export const DEFAULT_BATTLE_RULES: BattleRules = {
  avBase: 10000,
  firstCycleAv: 150,
  cycleAv: 100,
  spStart: 3,
  spMax: 5,
  energyOnHitTaken: 10,
  energyOnKill: 10,
  breakDelay: 0.25,
  breakDamage: f("attacker.atk * (1 + attacker.breakEffect) * (0.5 + defender.maxToughness / 120)"),
  maxCycles: 20,
  rounding: "floor",
};

export const DEFAULT_STATUSES: StatusDef[] = [
  { id: "freeze", name: "冰封", kind: "debuff", duration: 1, maxStacks: 1, modifiers: [], skipTurn: true, description: "無法行動一回合。" },
  { id: "exposed", name: "破綻", kind: "debuff", duration: 2, maxStacks: 1, modifiers: [{ target: "stat:vulnerability", op: "add", value: 0.2 }], description: "受到的傷害提高 20%。" },
  { id: "shock", name: "感電", kind: "debuff", duration: 3, maxStacks: 1, modifiers: [], dot: { multiplier: 0.8, element: "thunder" }, description: "每回合開始時受到攻擊力 80% 的雷屬性傷害。" },
  { id: "armorBreak", name: "碎甲", kind: "debuff", duration: 2, maxStacks: 1, modifiers: [{ target: "stat:def", op: "pct", value: -0.3 }], description: "防禦力降低 30%。" },
  { id: "haste", name: "疾風", kind: "buff", duration: 2, maxStacks: 1, modifiers: [{ target: "stat:spd", op: "pct", value: 0.1 }, { target: "stat:dmgBonus", op: "add", value: 0.25 }], description: "速度 +10%、增傷 +25%。" },
  { id: "rage", name: "狂怒", kind: "buff", duration: 3, maxStacks: 2, modifiers: [{ target: "stat:dmgBonus", op: "add", value: 0.3 }], description: "增傷 +30%，可疊 2 層。" },
];

const basic = (element?: string, mult = 1, toughness = 10): SkillDef => ({
  id: "basic", name: "普攻", type: "basic", spDelta: 1, energyGain: 20, targeting: "enemy", element,
  effects: [{ kind: "damage", target: "enemy", multiplier: mult, toughness }],
});

const allyStats = (s: Record<string, number>) => ({
  level: 80, def: 700, critRate: 0.05, critDmg: 0.5, dmgBonus: 0, defIgnore: 0, res: 0, resPen: 0, vulnerability: 0, dmgReduction: 0,
  effectHit: 0, effectRes: 0.1, breakEffect: 0, startEnergy: 0, ...s,
});

const enemyStats = (s: Record<string, number>) => ({
  level: 80, critRate: 0, critDmg: 0, dmgBonus: 0, defIgnore: 0, res: 0.2, resPen: 0, vulnerability: 0, dmgReduction: 0.1,
  effectHit: 0, effectRes: 0.2, breakEffect: 0, maxEnergy: 0, def: 1000, ...s,
});

export const DEFAULT_UNITS: UnitDef[] = [
  {
    id: "homura", name: "焰華", team: "ally", element: "fire", role: "主輸出", weaknesses: [],
    description: "範圍火焰輸出。戰技擴散傷害，大招全體爆發。",
    stats: allyStats({ hp: 3200, atk: 2300, spd: 105, critRate: 0.55, critDmg: 1.1, dmgBonus: 0.3, maxEnergy: 120 }),
    skills: [
      basic(),
      { id: "skill", name: "灼流", type: "skill", spDelta: -1, energyGain: 30, targeting: "enemy", effects: [{ kind: "damage", target: "blast", multiplier: 2, adjMultiplier: 0.8, toughness: 20, adjToughness: 10, hits: [0.3, 0.3, 0.4] }] },
      { id: "ult", name: "焚天", type: "ultimate", spDelta: 0, energyGain: 5, energyCost: 120, targeting: "none", effects: [{ kind: "damage", target: "allEnemies", multiplier: 2.4, toughness: 20 }] },
    ],
  },
  {
    id: "shimo", name: "霜語", team: "ally", element: "ice", role: "控制", weaknesses: [],
    description: "冰封單體並讓全體敵人出現破綻。",
    stats: allyStats({ hp: 3500, atk: 1700, spd: 115, critRate: 0.3, critDmg: 0.8, effectHit: 0.3, maxEnergy: 110 }),
    skills: [
      basic(),
      { id: "skill", name: "霜縛", type: "skill", spDelta: -1, energyGain: 30, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 1.5, toughness: 20 }, { kind: "status", target: "enemy", statusId: "freeze", chance: 0.6 }] },
      { id: "ult", name: "雪幕", type: "ultimate", spDelta: 0, energyGain: 5, energyCost: 110, targeting: "none", effects: [{ kind: "damage", target: "allEnemies", multiplier: 1.2, toughness: 20 }, { kind: "status", target: "allEnemies", statusId: "exposed", chance: 1 }] },
    ],
  },
  {
    id: "raimei", name: "雷鳴", team: "ally", element: "thunder", role: "持續傷害", weaknesses: [],
    description: "施加感電，靠持續傷害累積總輸出。",
    stats: allyStats({ hp: 3300, atk: 2000, spd: 108, critRate: 0.2, critDmg: 0.6, dmgBonus: 0.2, effectHit: 0.2, maxEnergy: 120 }),
    skills: [
      basic(),
      { id: "skill", name: "落雷", type: "skill", spDelta: -1, energyGain: 30, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 1.2, toughness: 20 }, { kind: "status", target: "enemy", statusId: "shock", chance: 1 }] },
      { id: "ult", name: "雷霆萬鈞", type: "ultimate", spDelta: 0, energyGain: 5, energyCost: 120, targeting: "enemy", effects: [{ kind: "damage", target: "blast", multiplier: 1.8, adjMultiplier: 0.9, toughness: 30, adjToughness: 15 }, { kind: "status", target: "blast", statusId: "shock", chance: 1 }] },
    ],
  },
  {
    id: "aoba", name: "蒼羽", team: "ally", element: "wind", role: "輔助", weaknesses: [],
    description: "加速隊友並提高其傷害。",
    stats: allyStats({ hp: 3800, atk: 1400, spd: 134, maxEnergy: 100 }),
    skills: [
      basic(),
      { id: "skill", name: "順風", type: "skill", spDelta: -1, energyGain: 30, targeting: "ally", effects: [{ kind: "status", target: "ally", statusId: "haste", chance: 1 }, { kind: "advance", target: "ally", amount: 0.5 }] },
      { id: "ult", name: "長風", type: "ultimate", spDelta: 0, energyGain: 5, energyCost: 100, targeting: "none", effects: [{ kind: "status", target: "allAllies", statusId: "haste", chance: 1 }, { kind: "energy", target: "allAllies", amount: 15 }] },
    ],
  },
  {
    id: "akari", name: "晨曦", team: "ally", element: "light", role: "治療", weaknesses: [],
    description: "單體與全體治療。",
    stats: allyStats({ hp: 4200, atk: 1300, spd: 102, maxEnergy: 100 }),
    skills: [
      basic(),
      { id: "skill", name: "祈光", type: "skill", spDelta: -1, energyGain: 30, targeting: "ally", effects: [{ kind: "heal", target: "ally", scale: "atk", multiplier: 0.6, flat: 300 }] },
      { id: "ult", name: "曙光", type: "ultimate", spDelta: 0, energyGain: 5, energyCost: 100, targeting: "none", effects: [{ kind: "heal", target: "allAllies", scale: "atk", multiplier: 0.5, flat: 400 }] },
    ],
  },
  {
    id: "yoru", name: "夜歌", team: "ally", element: "shadow", role: "擊破", weaknesses: [],
    description: "高削韌，擊破後造成大量擊破傷害並碎甲。",
    stats: allyStats({ hp: 3300, atk: 1800, spd: 112, breakEffect: 1, maxEnergy: 110 }),
    skills: [
      basic(undefined, 1, 15),
      { id: "skill", name: "影刃", type: "skill", spDelta: -1, energyGain: 30, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 1.6, toughness: 30 }, { kind: "status", target: "enemy", statusId: "armorBreak", chance: 0.8 }] },
      { id: "ult", name: "夜幕斬", type: "ultimate", spDelta: 0, energyGain: 5, energyCost: 110, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 3, toughness: 40 }] },
    ],
  },
  {
    id: "golem", name: "岩甲獸", team: "enemy", element: "fire", weaknesses: ["ice", "wind", "shadow"], role: "普通",
    stats: enemyStats({ hp: 22000, atk: 1700, spd: 83, toughness: 60 }),
    skills: [{ id: "bite", name: "撕咬", type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 1.8, toughness: 0 }] }],
  },
  {
    id: "bat", name: "影翼蝠", team: "enemy", element: "shadow", weaknesses: ["fire", "light"], role: "普通",
    stats: enemyStats({ hp: 13000, atk: 1500, spd: 110, toughness: 30, def: 900 }),
    skills: [{ id: "claw", name: "利爪", type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 1.5, toughness: 0 }] }],
  },
  {
    id: "sentinel", name: "雷晶哨兵", team: "enemy", element: "thunder", weaknesses: ["fire", "shadow"], role: "普通",
    stats: enemyStats({ hp: 16000, atk: 1450, spd: 95, toughness: 45 }),
    skills: [
      { id: "shot", name: "晶射", type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 1.6, toughness: 0 }] },
      { id: "burst", name: "電弧爆發", type: "skill", spDelta: 0, energyGain: 0, targeting: "none", effects: [{ kind: "damage", target: "allEnemies", multiplier: 0.7, toughness: 0 }] },
    ],
    ai: [{ skillId: "shot", weight: 3 }, { skillId: "burst", weight: 1 }],
  },
  {
    id: "colossus", name: "灰燼巨像", team: "enemy", element: "fire", weaknesses: ["ice", "thunder", "light"], role: "首領",
    stats: enemyStats({ hp: 70000, atk: 2500, spd: 100, toughness: 160, def: 1100, effectRes: 0.3 }),
    skills: [
      { id: "smash", name: "重擊", type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 2.2, toughness: 0 }] },
      { id: "quake", name: "震地", type: "skill", spDelta: 0, energyGain: 0, targeting: "none", effects: [{ kind: "damage", target: "allEnemies", multiplier: 1.1, toughness: 0 }] },
      { id: "roar", name: "怒吼", type: "skill", spDelta: 0, energyGain: 0, targeting: "none", effects: [{ kind: "status", target: "self", statusId: "rage", chance: 1 }] },
    ],
    ai: [
      { skillId: "smash", weight: 3 },
      { skillId: "quake", weight: 2, when: f("self.hpPct < 0.6") },
      { skillId: "roar", weight: 1, when: f("battle.turn > 4") },
    ],
  },
];

export const DEFAULT_ENCOUNTER: EncounterDef = { allies: ["homura", "shimo", "raimei", "akari"], enemies: ["bat", "golem", "bat"] };

export const DEFAULT_POLICY_CONFIG: AllyPolicy = { ult: "asap", skill: "whenSp", target: "weaknessFirst" };
