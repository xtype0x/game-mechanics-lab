/**
 * Original content for the "boss mechanics" template: one unit or status per extension mechanism
 * (docs/spec/battle.md §13). All names and numbers are original to this tool.
 */
import { parseExpr } from "../expr";
import type { EncounterPreset, StatusDef, UnitDef } from "../battle/types";

const f = parseExpr;

const enemyBase = { level: 80, critRate: 0, critDmg: 0, dmgBonus: 0, defIgnore: 0, res: 0.2, resPen: 0, vulnerability: 0, dmgReduction: 0.1, effectHit: 0.1, effectRes: 0.2, breakEffect: 0, maxEnergy: 0, def: 1000 };

export const SHOWCASE_STATUSES: StatusDef[] = [
  { id: "ward", name: "岩壁", kind: "buff", duration: 2, maxStacks: 1, modifiers: [], shield: { scale: "def", multiplier: 0.6, flat: 300 }, description: "護盾：施放者防禦力 60% + 300，持續 2 回合。" },
  { id: "undying", name: "不滅之火", kind: "buff", duration: 0, maxStacks: 1, modifiers: [], revive: { hpPct: 0.3 }, description: "受到致命傷害時改為回復 30% 生命，然後消失。永久，可被驅散。" },
  { id: "bulwark", name: "燈柱庇護", kind: "buff", duration: 0, maxStacks: 1, modifiers: [{ target: "stat:dmgReduction", op: "add", value: 0.2 }], toughnessLock: true, release: "sourceDeath", dispellable: false, description: "韌性無法被削減、減傷 +20%。施加它的燈柱倒下時解除。" },
  { id: "bind", name: "燈鎖", kind: "debuff", category: "control", duration: 0, maxStacks: 1, modifiers: [], skipTurn: true, release: "sourceBreak", description: "無法行動，直到施加它的燈柱被擊破或倒下。" },
  { id: "cinder", name: "餘燼灼燒", kind: "debuff", category: "burn", duration: 2, maxStacks: 3, modifiers: [], dot: { multiplier: 0.4, element: "fire" }, description: "每回合受到火屬性持續傷害，最多 3 層。" },
];

export const SHOWCASE_ALLIES: UnitDef[] = [
  {
    id: "iwamori", name: "岩守", team: "ally", element: "physical", role: "防護", weaknesses: [],
    description: "以防禦力計算的攻擊與護盾，大招驅散全隊減益。嘲諷值較高，較常被敵人選為目標。",
    stats: { level: 80, hp: 4600, atk: 1200, def: 1300, spd: 99, taunt: 150, critRate: 0.05, critDmg: 0.5, dmgBonus: 0, defIgnore: 0, res: 0, resPen: 0, vulnerability: 0, dmgReduction: 0, effectHit: 0, effectRes: 0.1, breakEffect: 0, maxEnergy: 120, startEnergy: 0 },
    skills: [
      { id: "basic", name: "岩拳", type: "basic", spDelta: 1, energyGain: 20, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 0.8, toughness: 10, scale: "def" }] },
      { id: "skill", name: "岩壁", type: "skill", spDelta: -1, energyGain: 30, targeting: "ally", effects: [{ kind: "status", target: "ally", statusId: "ward", chance: 1 }] },
      { id: "ult", name: "淨化之壁", type: "ultimate", spDelta: 0, energyGain: 5, energyCost: 120, targeting: "none", effects: [{ kind: "dispel", target: "allAllies", statusKind: "debuff", count: 0 }, { kind: "status", target: "allAllies", statusId: "ward", chance: 1 }, { kind: "damage", target: "allEnemies", multiplier: 0.6, toughness: 20, scale: "def" }] },
    ],
  },
];

export const SHOWCASE_ENEMIES: UnitDef[] = [
  {
    id: "lantern", name: "冥燈祭司", team: "enemy", element: "fire", role: "首領", weaknesses: ["ice", "wind", "physical"],
    description: "兩階段首領。對手施放大招會累積「聚光」，滿 3 層時立刻插隊施放燈滅；進入第二階段時召喚燈柱。",
    stats: { ...enemyBase, hp: 22000, atk: 1150, spd: 100, toughness: 120 },
    elementRes: { fire: 0.4, ice: 0, wind: 0, physical: 0.1 },
    statusRes: { freeze: 0.5 },
    phases: [{ name: "燃燈形態", stats: { hp: 18000, spd: 115, toughness: 120 }, weaknesses: ["thunder", "light", "physical"], clearDebuffs: true }],
    skills: [
      { id: "flare", name: "燈焰", type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "damage", target: "blast", multiplier: 1.5, adjMultiplier: 0.7, toughness: 0 }, { kind: "status", target: "enemy", statusId: "cinder", chance: 0.6 }] },
      { id: "pillar", name: "立燈", type: "skill", spDelta: 0, energyGain: 0, targeting: "none", effects: [{ kind: "summon", unitId: "pillar", count: 1 }] },
      { id: "bless", name: "庇火", type: "skill", spDelta: 0, energyGain: 0, targeting: "none", description: "每場一次。", effects: [{ kind: "status", target: "allAllies", statusId: "undying", chance: 1 }, { kind: "counter", target: "self", key: "blessed", op: "set", value: 1 }] },
      { id: "cataclysm", name: "燈滅", type: "skill", spDelta: 0, energyGain: 0, targeting: "none", description: "只由「滿溢」指定施放。", effects: [{ kind: "damage", target: "allEnemies", multiplier: 1.6, toughness: 0 }] },
      { id: "gather", name: "聚光", type: "followup", spDelta: 0, energyGain: 0, targeting: "none", effects: [{ kind: "counter", target: "self", key: "charge", op: "add", value: 1 }] },
      { id: "overload", name: "滿溢", type: "followup", spDelta: 0, energyGain: 0, targeting: "none", effects: [{ kind: "counter", target: "self", key: "charge", op: "set", value: 0 }, { kind: "queueSkill", target: "self", skillId: "cataclysm" }, { kind: "advance", target: "self", amount: 1 }] },
      { id: "rekindle", name: "重燃", type: "followup", spDelta: 0, energyGain: 0, targeting: "none", effects: [{ kind: "summon", unitId: "pillar", count: 1 }] },
    ],
    passives: [
      { id: "gather", name: "聚光", on: "foeAction", skillTypes: ["ultimate"], skillId: "gather", limitPerTurn: 0, description: "對手每施放一次大招，聚光 +1。" },
      { id: "overload", name: "滿溢", on: "counterChange", skillId: "overload", limitPerTurn: 1, when: f("self.counter.charge >= 3"), description: "聚光達 3 層時歸零，並立刻插隊施放燈滅。" },
      { id: "rekindle", name: "重燃", on: "phaseChange", skillId: "rekindle", limitPerTurn: 0, description: "進入新階段時召喚一根燈柱。" },
    ],
    ai: [
      { skillId: "flare", weight: 3 },
      { skillId: "pillar", weight: 2, when: f("battle.allies < 3") },
      { skillId: "bless", weight: 2, when: f("self.counter.blessed == 0 && battle.turn > 3") },
    ],
  },
  {
    id: "pillar", name: "燈柱", team: "enemy", element: "fire", role: "召喚物", weaknesses: ["ice", "physical", "wind"], boundToSummoner: true,
    description: "召喚物。為友方施加庇護（鎖韌性），鎖住我方一人；被擊破即解除燈鎖。召喚者倒下時一起消失。",
    stats: { ...enemyBase, hp: 6000, atk: 1000, spd: 85, toughness: 30, def: 800 },
    skills: [
      { id: "shelter", name: "庇護", type: "skill", spDelta: 0, energyGain: 0, targeting: "none", effects: [{ kind: "status", target: "allAllies", statusId: "bulwark", chance: 1 }] },
      { id: "chain", name: "燈鎖", type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 0.8, toughness: 0 }, { kind: "status", target: "enemy", statusId: "bind", chance: 0.7 }] },
      { id: "drain", name: "噬光", type: "skill", spDelta: 0, energyGain: 0, targeting: "none", effects: [{ kind: "sp", amount: -1 }, { kind: "damage", target: "allEnemies", multiplier: 0.4, toughness: 0 }] },
    ],
    ai: [
      { skillId: "shelter", weight: 1, when: f("self.status.bulwark == 0") },
      { skillId: "chain", weight: 2, when: f("self.status.bulwark > 0") },
      { skillId: "drain", weight: 1, when: f("self.status.bulwark > 0") },
    ],
  },
  {
    id: "wisp", name: "燈靈", team: "enemy", element: "fire", role: "普通", weaknesses: ["ice", "wind"],
    stats: { ...enemyBase, hp: 7000, atk: 900, spd: 110, toughness: 30 },
    skills: [{ id: "ember", name: "火星", type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 1.3, toughness: 0 }] }],
  },
];

// --- Rules 0.7 (battle.md §14): trigger subjects, charm, timeline events ---

export const SHOWCASE_V07_STATUSES: StatusDef[] = [
  { id: "galeMark", name: "風痕", kind: "debuff", duration: 2, maxStacks: 1, modifiers: [], description: "標記。霞織的隊友命中帶風痕的敵人時，霞織會追擊。" },
  { id: "watch", name: "凝視", kind: "debuff", duration: 0, maxStacks: 1, modifiers: [], release: "sourceDeath", description: "被夢織者盯上：施放戰技或大招後會遭到反擊。永久，夢織者倒下時解除，可被驅散。" },
  { id: "daze", name: "迷夢", kind: "debuff", category: "control", duration: 1, maxStacks: 1, modifiers: [], charm: true, description: "支配：下一個回合自動行動並攻擊自己的隊友（不消耗技能點）。" },
];

export const SHOWCASE_V07_ALLIES: UnitDef[] = [
  {
    id: "kasumi", name: "霞織", team: "ally", element: "wind", role: "追擊",
    description: "替敵人留下風痕；隊友每次命中帶風痕的敵人，霞織就追擊一次（每回合最多 2 次）。",
    weaknesses: [],
    stats: { level: 80, hp: 3400, atk: 1900, def: 900, spd: 110, critRate: 0.35, critDmg: 0.9, dmgBonus: 0.15, defIgnore: 0, res: 0, resPen: 0, vulnerability: 0, dmgReduction: 0, effectHit: 0.2, effectRes: 0.1, breakEffect: 0.3, maxEnergy: 110, startEnergy: 0 },
    skills: [
      { id: "basic", name: "疾風", type: "basic", spDelta: 1, energyGain: 20, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 1, toughness: 10 }] },
      { id: "skill", name: "留痕", type: "skill", spDelta: -1, energyGain: 30, targeting: "enemy", effects: [{ kind: "status", target: "enemy", statusId: "galeMark", chance: 1 }, { kind: "damage", target: "blast", multiplier: 1.4, adjMultiplier: 0.6, toughness: 20, adjToughness: 10 }] },
      { id: "ult", name: "千風", type: "ultimate", spDelta: 0, energyGain: 5, energyCost: 110, targeting: "none", effects: [{ kind: "status", target: "allEnemies", statusId: "galeMark", chance: 1 }, { kind: "damage", target: "allEnemies", multiplier: 1.6, toughness: 20 }] },
      { id: "chase", name: "追風", type: "followup", spDelta: 0, energyGain: 5, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 0.5, toughness: 5 }] },
    ],
    passives: [{ id: "chase", name: "追風", on: "allyHit", skillId: "chase", limitPerTurn: 2, when: parseExpr("target.status.galeMark > 0 && target.hpPct > 0"), description: "隊友命中帶風痕的敵人時追擊，每回合最多 2 次。" }],
  },
];

export const SHOWCASE_V07_ENEMIES: UnitDef[] = [
  {
    id: "weaver", name: "夢織者", team: "enemy", element: "shadow", role: "精英",
    description: "凝視一名對手，對方施放戰技或大招就反擊；迷夢會讓我方角色攻擊隊友；場上沒有夢鐘時會敲響一座。",
    weaknesses: ["wind", "light", "fire"],
    stats: { ...enemyBase, hp: 30000, atk: 1050, spd: 105, toughness: 100 },
    statusRes: { control: 0.2 },
    skills: [
      { id: "thread", name: "絲刃", type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 1.3, toughness: 0 }] },
      { id: "gaze", name: "凝視", type: "skill", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "status", target: "enemy", statusId: "watch", chance: 0.9 }, { kind: "damage", target: "enemy", multiplier: 0.6, toughness: 0 }] },
      { id: "lull", name: "迷夢", type: "skill", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "status", target: "enemy", statusId: "daze", chance: 0.8 }] },
      { id: "ring", name: "喚鐘", type: "skill", spDelta: 0, energyGain: 0, targeting: "none", effects: [{ kind: "summon", unitId: "dreambell", count: 1 }] },
      { id: "nightmare", name: "夢魘", type: "skill", spDelta: 0, energyGain: 0, targeting: "none", description: "只由夢鐘指定施放。", effects: [{ kind: "damage", target: "allEnemies", multiplier: 1.2, toughness: 0 }] },
      { id: "glare", name: "反照", type: "followup", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 0.9, toughness: 0 }] },
    ],
    passives: [{ id: "glare", name: "反照", on: "foeAction", skillTypes: ["skill", "ultimate"], skillId: "glare", limitPerTurn: 1, when: parseExpr("target.status.watch > 0"), description: "被凝視的對手施放戰技或大招後反擊它。" }],
    ai: [
      { skillId: "thread", weight: 3 },
      { skillId: "gaze", weight: 2 },
      { skillId: "lull", weight: 2, when: f("battle.turn > 2") },
      { skillId: "ring", weight: 3, when: f("battle.count.dreambell == 0") },
    ],
  },
  {
    id: "dreambell", name: "夢鐘", team: "enemy", element: "shadow", role: "事件", weaknesses: [], timelineEvent: true, boundToSummoner: true,
    description: "行動條上的倒數事件：不能被攻擊。響兩次後讓夢織者立刻施放夢魘，然後消失；夢織者倒下時一起消失。",
    stats: { ...enemyBase, hp: 1, atk: 0, spd: 90 },
    skills: [
      { id: "tick", name: "滴答", type: "skill", spDelta: 0, energyGain: 0, targeting: "none", effects: [{ kind: "counter", target: "self", key: "toll", op: "add", value: 1 }] },
      { id: "toll", name: "鐘響", type: "skill", spDelta: 0, energyGain: 0, targeting: "none", effects: [{ kind: "queueSkill", target: "allAllies", skillId: "nightmare" }, { kind: "advance", target: "allAllies", amount: 1 }, { kind: "dismiss" }] },
    ],
    ai: [
      { skillId: "tick", weight: 1, when: f("self.counter.toll < 2") },
      { skillId: "toll", weight: 1, when: f("self.counter.toll >= 2") },
    ],
  },
];

export const SHOWCASE_V07_ENCOUNTER: EncounterPreset = { id: "dream", name: "夢織者", enemies: ["wisp", "weaver", "wisp"], description: "觸發對象條件、支配與行動條事件（規則 0.7）。" };

export const SHOWCASE_ENCOUNTER: EncounterPreset ={ id: "mechanics", name: "機制首領戰", enemies: ["wisp", "lantern", "wisp"], description: "冥燈祭司：階段、召喚、護韌、復活、插隊行動。" };
