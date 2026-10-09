import type { Effect, PassiveDef, SkillDef, SkillType, TargetMode } from "@ggt/core";

export interface StatMeta {
  key: string;
  label: string;
  percent?: boolean;
  hint?: string;
  enemyOnly?: boolean;
  allyOnly?: boolean;
}

export const STAT_GROUPS: { title: string; stats: StatMeta[] }[] = [
  {
    title: "生存",
    stats: [
      { key: "hp", label: "生命值" },
      { key: "def", label: "防禦力" },
      { key: "res", label: "抗性", percent: true },
      { key: "dmgReduction", label: "減傷", percent: true },
      { key: "effectRes", label: "效果抵抗", percent: true },
      { key: "toughness", label: "韌性", enemyOnly: true, hint: "0 表示沒有韌性條、不會被擊破" },
    ],
  },
  {
    title: "輸出",
    stats: [
      { key: "atk", label: "攻擊力" },
      { key: "critRate", label: "暴擊率", percent: true },
      { key: "critDmg", label: "暴擊傷害", percent: true },
      { key: "dmgBonus", label: "增傷", percent: true },
      { key: "defIgnore", label: "無視防禦", percent: true },
      { key: "resPen", label: "抗性穿透", percent: true },
      { key: "breakEffect", label: "擊破特攻", percent: true },
      { key: "effectHit", label: "效果命中", percent: true },
    ],
  },
  {
    title: "行動與資源",
    stats: [
      { key: "spd", label: "速度" },
      { key: "level", label: "等級" },
      { key: "maxEnergy", label: "能量上限", allyOnly: true },
      { key: "startEnergy", label: "初始能量", allyOnly: true },
    ],
  },
];

export const KNOWN_STATS = new Set(STAT_GROUPS.flatMap((g) => g.stats.map((s) => s.key)));

export const SKILL_TYPES: { value: SkillType; label: string }[] = [
  { value: "basic", label: "普攻" },
  { value: "skill", label: "戰技" },
  { value: "ultimate", label: "大招" },
  { value: "followup", label: "追加攻擊（由被動觸發）" },
];

export const TARGETING: { value: SkillDef["targeting"]; label: string }[] = [
  { value: "enemy", label: "選擇一名敵人" },
  { value: "ally", label: "選擇一名隊友" },
  { value: "none", label: "不需選擇" },
];

export const TARGET_MODES: { value: TargetMode; label: string }[] = [
  { value: "enemy", label: "所選敵人" },
  { value: "blast", label: "所選敵人＋相鄰（擴散）" },
  { value: "allEnemies", label: "全體敵人" },
  { value: "self", label: "自己" },
  { value: "ally", label: "所選隊友" },
  { value: "allAllies", label: "全體隊友" },
];

export const EFFECT_KINDS: { value: Effect["kind"]; label: string }[] = [
  { value: "damage", label: "傷害" },
  { value: "heal", label: "治療" },
  { value: "status", label: "施加狀態" },
  { value: "advance", label: "行動提前" },
  { value: "energy", label: "回復能量" },
];

export const TRIGGERS: { value: PassiveDef["on"]; label: string }[] = [
  { value: "allyUltimate", label: "隊友（含自己）施放大招後" },
  { value: "allyBreak", label: "隊友（含自己）擊破敵人時" },
  { value: "selfHit", label: "自己受到攻擊時" },
  { value: "enemyKilled", label: "隊友（含自己）擊倒敵人時" },
];

export function defaultEffect(kind: Effect["kind"], statusId: string): Effect {
  switch (kind) {
    case "damage": return { kind, target: "enemy", multiplier: 1, toughness: 10 };
    case "heal": return { kind, target: "ally", scale: "atk", multiplier: 0.5, flat: 0 };
    case "status": return { kind, target: "enemy", statusId, chance: 1 };
    case "advance": return { kind, target: "ally", amount: 0.25 };
    case "energy": return { kind, target: "self", amount: 10 };
  }
}

export const AI_VARS = "self.hpPct（血量比例 0~1）、self.broken、self.toughnessPct、battle.turn（總回合數）、battle.cycle（輪數）、battle.allies（己方存活數）、battle.foes（對手存活數）";

/** Next free id like "skill3" given existing ids. */
export function nextId(prefix: string, taken: string[]): string {
  let n = 1;
  while (taken.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
