#!/usr/bin/env node
// Builds public-site/src/tools/battle/presets/hsr-enemies.generated.json from the local HSR reference pack
// (data/reference/hsr/pack.json). No dependencies; output is deterministic (no timestamps).
//   node scripts/build-hsr-encounters.mjs
// Stats come from the pack's level curves exactly like packages/core/src/library/reference.ts (unitFromEnemy);
// everything the source does not give (skill multipliers, AI weights, status numbers) is a marked placeholder.
// After writing, scripts/validate-hsr-encounters.mjs runs (validateBattle + one auto-battle per encounter and level).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pack = JSON.parse(readFileSync(join(root, "data/reference/hsr/pack.json"), "utf8"));
const OUT = process.env.HSR_ENEMIES_OUT ?? join(root, "public-site/src/tools/battle/presets/hsr-enemies.generated.json");

/** Levels shipped as fixed variants. Lv80 is the default (same as the character presets). */
const LEVELS = [60, 70, 80];
const DEFAULT_LEVEL = 80;
/**
 * KQM enemy toughness is in the source's raw scale; the character presets use display-scale values (basic 10,
 * skill 20, ultimate 30). The raw-to-display conversion is NOT verified; 1/3 keeps the shape of the original
 * template (mob 30-60 -> 10-20, elite 240-420 -> 80-140, boss 360-450 -> 120-150, template boss = 160).
 */
const TOUGHNESS_SCALE = 1 / 3;

const ELEMENT_MAP = { Physical: "physical", Fire: "fire", Ice: "ice", Lightning: "thunder", Wind: "wind", Quantum: "light", Imaginary: "shadow" };
const STATUS_CATEGORY_MAP = { Burn: "burn", Frozen: "freeze", Shock: "shock", "Wind Shear": "windShear", Entanglement: "entangle", Imprisonment: "imprison", "Control Effects": "control" };

// ---- expression / effect helpers ----
const R = (name) => ({ ref: name });
const K = (n) => ({ const: n });
const X = (op, ...args) => ({ op, args });
const dmg = (target, multiplier, extra = {}) => ({ kind: "damage", target, multiplier, toughness: 0, ...extra });
const status = (target, statusId, chance = 1, extra = {}) => ({ kind: "status", target, statusId, chance, ...extra });
const counter = (target, key, op, value) => ({ kind: "counter", target, key, op, value });

/** Placeholder damage scale by wording of the source text ("minor" / plain / "massive"). */
const SINGLE = { minor: 0.6, normal: 1.0, massive: 1.8 };
const AOE = { minor: 0.35, normal: 0.6, massive: 1.0 };
const BLAST = { minor: [0.5, 0.25], normal: [0.9, 0.45], massive: [1.5, 0.75] };

const PH = "【佔位】";
function skill(id, name, type, targeting, effects, desc, element) {
  const s = { id, name, type, spDelta: 0, energyGain: 0, targeting, effects, description: `${PH}${desc}` };
  if (element) s.element = element;
  return s;
}
/** Single-target attack. */
const single = (id, name, tier, desc, { type = "basic", element, extra = [] } = {}) =>
  skill(id, name, type, "enemy", [dmg("enemy", SINGLE[tier]), ...extra], `倍率 ${Math.round(SINGLE[tier] * 100)}%（依「${{ minor: "輕微", normal: "一般", massive: "重大" }[tier]}」估計）。${desc}`, element);
const blast = (id, name, tier, desc, { type = "basic", element, extra = [] } = {}) =>
  skill(id, name, type, "enemy", [dmg("blast", BLAST[tier][0], { adjMultiplier: BLAST[tier][1] }), ...extra], `主目標 ${Math.round(BLAST[tier][0] * 100)}%、相鄰 ${Math.round(BLAST[tier][1] * 100)}%。${desc}`, element);
const aoe = (id, name, tier, desc, { type = "skill", element, extra = [] } = {}) =>
  skill(id, name, type, "none", [dmg("allEnemies", AOE[tier]), ...extra], `全體 ${Math.round(AOE[tier] * 100)}%。${desc}`, element);
/** Skill without damage. */
const util = (id, name, targeting, effects, desc, type = "skill") => skill(id, name, type, targeting, effects, desc);

const w = (skillId, weight, when) => (when ? { skillId, weight, when } : { skillId, weight });
const passive = (id, name, on, skillId, extra = {}) => ({ id, name, on, skillId, limitPerTurn: 0, ...extra });

/** Status helper: id = hsre_<enemyId>_<short>. */
const stId = (enemy, short) => `hsre_${enemy}_${short}`;
function statusDef(enemy, short, name, kind, def, description) {
  return { id: stId(enemy, short), name, kind, duration: 2, maxStacks: 1, modifiers: [], ...def, description: `${PH}${description}` };
}

const U = (enemy) => `hsre_${enemy}`;

// ---------------------------------------------------------------------------------------------------------
// Enemy specs. key = pack key without the "kqm:" prefix; id = hsre_<short> unit id.
// ---------------------------------------------------------------------------------------------------------
const SPECS = {};
function enemy(short, key, spec) {
  SPECS[short] = { short, key: `kqm:${key}`, ...spec };
}

// ---- 銀鬃 (Jarilo-VI) ----
{
  const e = "Silvermane_Soldier_0";
  enemy(e, "Silvermane_Soldier:0", {
    name: "銀鬃士兵", role: "普通", element: "physical",
    statuses: [statusDef(e, "defdown", "破甲", "debuff", { duration: 3, modifiers: [{ target: "stat:def", op: "pct", value: -0.16 }] }, "防禦力 -16%，3 回合。")],
    skills: [single("charge", "不倦衝鋒", "normal", "有高機率降低目標防禦。", { extra: [status("enemy", stId(e, "defdown"), 0.8)] })],
    ai: [w("charge", 1)],
  });
}
{
  const e = "Silvermane_Gunner_0";
  enemy(e, "Silvermane_Gunner:0", {
    name: "銀鬃槍手", role: "普通", element: "physical",
    statuses: [statusDef(e, "bleed", "裂傷", "debuff", { dot: { multiplier: 0.5, element: "physical" } }, "每回合開始受到物理持續傷害（攻擊力 50%），2 回合。")],
    skills: [single("grenade", "穿甲榴彈", "normal", "有高機率造成裂傷。", { extra: [status("enemy", stId(e, "bleed"), 0.8)] })],
    ai: [w("grenade", 1)],
  });
}
{
  const e = "Silvermane_Cannoneer_0";
  enemy(e, "Silvermane_Cannoneer:0", {
    name: "銀鬃炮手", role: "普通", element: "physical",
    skills: [blast("barrage", "彈幕", "minor", "")],
    ai: [w("barrage", 1)],
    unmodeled: "「掩護支援」（為友方提供追加攻擊）未實作。",
  });
}
{
  const e = "Silvermane_Lieutenant_0";
  const sold = "Silvermane_Soldier_0";
  enemy(e, "Silvermane_Lieutenant:0", {
    name: "銀鬃中尉", role: "精英", element: "physical",
    skills: [
      single("pierce", "穿刺", "massive", "施放後離開反擊姿態。", { type: "skill", extra: [counter("self", "reflect", "set", 0)] }),
      single("assault", "突擊", "normal", "施放後離開反擊姿態。", { extra: [counter("self", "reflect", "set", 0)] }),
      util("reflect", "盾牌反射", "none", [counter("self", "reflect", "set", 1)], "進入反擊姿態：被攻擊時立刻對攻擊者施放穿刺。"),
      util("reinforce", "增援", "none", [{ kind: "summon", unitId: U(sold), count: 1 }], "召喚一名銀鬃士兵（來源為士兵或槍手，這裡固定士兵）。"),
      single("counter_pierce", "反擊穿刺", "massive", "反擊姿態被攻擊時觸發。", { type: "followup", extra: [counter("self", "reflect", "set", 0)] }),
    ],
    passives: [passive("reflect_counter", "盾牌反射", "selfHit", "counter_pierce", { limitPerTurn: 1, when: X("gt", R("self.counter.reflect"), K(0)), description: "反擊姿態中被攻擊時，立刻對攻擊者施放穿刺（每回合一次）。" })],
    ai: [w("assault", 3), w("pierce", 2), w("reflect", 2, X("eq", R("self.counter.reflect"), K(0))), w("reinforce", 1, X("lt", R("battle.allies"), K(3)))],
    summons: [sold],
    unmodeled: "「被單一角色攻擊」的限定未區分（任何攻擊都會觸發反擊）。",
  });
}

// ---- 反物質軍團 ----
{
  const e = "Voidranger_Reaver_0";
  enemy(e, "Voidranger_Reaver:0", {
    name: "虛卒・掠奪者", role: "普通", element: "shadow",
    skills: [single("blade", "獵殺之刃", "minor", ""), blast("leap", "漩渦躍擊", "minor", "")],
    ai: [w("blade", 1), w("leap", 1)],
  });
}
{
  const e = "Voidranger_Distorter_0";
  enemy(e, "Voidranger_Distorter:0", {
    name: "虛卒・扭曲者", role: "普通", element: "light",
    statuses: [statusDef(e, "lockon", "鎖定", "debuff", { modifiers: [{ target: "stat:taunt", op: "add", value: 2000 }] }, "嘲諷 +2000：敵方攻擊幾乎都會選中此角色，2 回合。")],
    skills: [
      util("command", "虛無號令", "enemy", [status("enemy", stId(e, "lockon"), 1)], "鎖定一名我方角色，使敵方的攻擊集中在他身上（以大幅提高嘲諷值表示）。", "skill"),
      single("strike", "無影虛空擊", "normal", "", { element: "light" }),
    ],
    ai: [w("strike", 2), w("command", 1, X("eq", R("battle.turn"), K(1)))],
  });
}
{
  const e = "Voidranger_Eliminator_0";
  enemy(e, "Voidranger_Eliminator:0", {
    name: "虛卒・殲擊者", role: "普通", element: "shadow",
    statuses: [statusDef(e, "overloaded", "過載", "debuff", { duration: 0, modifiers: [{ target: "stat:vulnerability", op: "add", value: 0.25 }] }, "施放虛空砲後進入：受到的傷害 +25%，直到解除。")],
    skills: [
      single("cannon", "虛空砲", "normal", "施放後自身進入過載（承傷提高）。「引爆」異常未實作。", { extra: [status("self", stId(e, "overloaded"), 1)] }),
      util("barrier", "熱能屏障", "none", [{ kind: "dispel", target: "self", statusKind: "debuff", count: 0 }], "解除自身的過載。"),
    ],
    ai: [w("cannon", 3, X("eq", R(`self.status.${stId(e, "overloaded")}`), K(0))), w("barrier", 3, X("gt", R(`self.status.${stId(e, "overloaded")}`), K(0)))],
  });
}
{
  const e = "Voidranger_Trampler_0";
  enemy(e, "Voidranger_Trampler:0", {
    name: "虛卒・踐踏者", role: "精英", element: "light",
    statuses: [
      statusDef(e, "entangle", "纏繞", "debuff", { category: "entangle", dot: { multiplier: 0.5, element: "light" } }, "每回合開始受到量子持續傷害（攻擊力 50%），2 回合。（原作的行動延遲未實作）"),
      statusDef(e, "lockon", "鎖定", "debuff", { modifiers: [{ target: "stat:taunt", op: "add", value: 2000 }] }, "嘲諷 +2000：敵方攻擊集中在此角色，2 回合。"),
    ],
    skills: [
      single("endbow", "弓盡", "massive", "有高機率造成纏繞。", { type: "skill", element: "light", extra: [status("enemy", stId(e, "entangle"), 0.8)] }),
      single("projection", "虛像投影", "normal", "", { element: "light" }),
      blast("trample", "戰爭踐踏", "minor", "", { element: "light" }),
      util("spiral", "螺旋箭", "enemy", [status("enemy", stId(e, "lockon"), 1), { kind: "queueSkill", target: "self", skillId: "endbow" }], "鎖定一名目標，下一次行動對其施放弓盡。"),
    ],
    ai: [w("projection", 3), w("trample", 2), w("spiral", 2)],
  });
}

// ---- 機兵 ----
{
  const e = "Automaton_Hound_0";
  enemy(e, "Automaton_Hound:0", {
    name: "機兵戰犬", role: "普通", element: "physical",
    skills: [
      single("strike", "垂直打擊", "minor", ""),
      util("heal", "自我修復模組", "none", [{ kind: "heal", target: "allAllies", scale: "maxHp", multiplier: 0.3, flat: 0 }], "立刻回復所有友方生命（這裡為生命上限的 30%）。"),
    ],
    ai: [w("strike", 2), w("heal", 2, X("lt", R("self.hpPct"), K(0.7)))],
  });
}
{
  const e = "Automaton_Beetle_0";
  enemy(e, "Automaton_Beetle:0", {
    name: "機兵甲蟲", role: "普通", element: "physical",
    statuses: [statusDef(e, "barrier", "屏障", "buff", { shield: { scale: "atk", multiplier: 3, flat: 0 } }, "護盾：施放者攻擊力的 300%，2 回合。（原作為抵銷一次攻擊）")],
    skills: [single("forcefield", "不穩定力場", "normal", "同時為另一名友方施加屏障。", { extra: [status("ally", stId(e, "barrier"), 1)] })],
    ai: [w("forcefield", 1)],
  });
}
{
  const e = "Automaton_Spider_0";
  enemy(e, "Automaton_Spider:0", {
    name: "機兵蜘蛛", role: "普通", element: "fire",
    skills: [
      single("ram", "衝撞", "minor", ""),
      util("timed", "定時模組", "none", [{ kind: "queueSkill", target: "self", skillId: "explode" }], "下一次行動使用自爆模組。"),
      skill("explode", "自爆模組", "skill", "enemy", [dmg("blast", 1.2, { adjMultiplier: 0.6 }), { kind: "dismiss" }], "自爆：對目標與相鄰單位造成火屬性傷害（主目標 120%、相鄰 60%），然後離場。", "fire"),
    ],
    ai: [w("ram", 2), w("timed", 1)],
    unmodeled: "天賦「毀滅之鏈」（被擊殺時對相鄰單位造成火傷）未實作。",
  });
}
{
  const e = "Automaton_Grizzly_0";
  const sp = "Automaton_Spider_0";
  enemy(e, "Automaton_Grizzly:0", {
    name: "機兵巨熊", role: "精英", element: "physical",
    skills: [
      aoe("purge", "清除命令", "massive", "只由「過燃命令」指定施放。"),
      util("detonation", "引爆命令", "none", [{ kind: "summon", unitId: U(sp), count: 1 }], "召喚一隻機兵蜘蛛。"),
      util("overcombust", "過燃命令", "none", [{ kind: "queueSkill", target: "self", skillId: "purge" }], "進入蓄力：下一次行動對全體施放清除命令。"),
      single("destruction", "毀滅命令", "normal", ""),
    ],
    ai: [w("destruction", 3), w("detonation", 2, X("lt", R(`battle.count.${U(sp)}`), K(2))), w("overcombust", 2)],
    summons: [sp],
    unmodeled: "「激怒命令」（嘲諷全體）未實作。",
  });
}

// ---- 金人司閽 ----
{
  const e = "Aurumaton_Gatekeeper_0";
  const fish = "Entranced_Ingenium_Illumination_Dragonfish_0";
  enemy(e, "Aurumaton_Gatekeeper:0", {
    name: "金人司閽", role: "精英", element: "shadow",
    statuses: [
      statusDef(e, "imprison", "禁錮", "debuff", { category: "imprison", duration: 1, modifiers: [{ target: "stat:spd", op: "pct", value: -0.1 }] }, "速度 -10%，1 回合。（原作的行動延遲未實作）"),
      statusDef(e, "weaken", "虛弱", "debuff", { modifiers: [{ target: "stat:dmgBonus", op: "add", value: -0.1 }] }, "造成的傷害 -10%，2 回合。"),
    ],
    skills: [
      single("enchain", "束縛", "massive", "有高機率造成禁錮。", { type: "skill", element: "shadow", extra: [status("enemy", stId(e, "imprison"), 0.8)] }),
      single("restraint", "拘束", "normal", "", { element: "shadow" }),
      aoe("dread", "畏懼", "minor", "提高懲戒值，有高機率造成虛弱。", { element: "shadow", extra: [status("allEnemies", stId(e, "weaken"), 0.8), counter("self", "sanction", "add", 1)] }),
      util("sanction_up", "懲戒累積", "none", [counter("self", "sanction", "add", 1)], "我方每使用一次戰技或終結技，懲戒值 +1。", "followup"),
      util("sanction_mode", "懲戒模式", "none", [counter("self", "sanction", "set", 0), { kind: "summon", unitId: U(fish), count: 1 }], "懲戒值滿 8：歸零並召喚燈晝龍魚。", "followup"),
    ],
    passives: [
      passive("sanction_gain", "告別禮儀", "foeAction", "sanction_up", { skillTypes: ["skill", "ultimate"], description: "對手施放戰技或終結技時懲戒值 +1。" }),
      passive("sanction_full", "懲戒模式", "counterChange", "sanction_mode", { limitPerTurn: 1, when: X("gte", R("self.counter.sanction"), K(8)), description: "懲戒值達 8 時歸零並召喚燈晝龍魚。" }),
    ],
    ai: [w("restraint", 3), w("enchain", 2), w("dread", 2)],
    summons: [fish],
    unmodeled: "特殊變體的「鎖定三個目標」未實作。",
  });
}
{
  const e = "Entranced_Ingenium_Illumination_Dragonfish_0";
  enemy(e, "Entranced_Ingenium_Illumination_Dragonfish:0", {
    name: "燈晝龍魚", role: "召喚物", element: "fire",
    statuses: [statusDef(e, "defdown", "破甲", "debuff", { duration: 3, modifiers: [{ target: "stat:def", op: "pct", value: -0.16 }] }, "防禦力 -16%，3 回合。")],
    skills: [aoe("luminosity", "夜間光輝", "minor", "有高機率降低防禦。", { type: "basic", element: "fire", extra: [status("allEnemies", stId(e, "defdown"), 0.8)] })],
    ai: [w("luminosity", 1)],
    unmodeled: "天賦「燭火」（倒下時對我方全體造成火傷）未實作。",
  });
}

// ---- 可可利亞 ----
{
  const e = "Cocolia_0";
  const e0 = "Ice_Edge_0";
  const e1 = "Ice_Edge_1";
  enemy(e, "Cocolia:0", {
    name: "可可利亞（劇情）", role: "首領", element: "ice",
    statuses: [statusDef(e, "freeze", "冰凍", "debuff", { category: "freeze", duration: 1, skipTurn: true, dot: { multiplier: 0.4, element: "ice" } }, "無法行動 1 回合，回合開始受到冰屬性持續傷害（攻擊力 40%）。")],
    skills: [
      aoe("punish", "永冬的懲罰", "massive", "只由「冰封聖徒的憤怒」指定施放。", { element: "ice" }),
      single("chill", "刺骨凝固之寒", "normal", "", { element: "ice" }),
      util("omen", "永凍之兆", "none", [{ kind: "summon", unitId: U(e0), count: 1 }, { kind: "summon", unitId: U(e1), count: 1 }], "召喚兩隻冰刃。"),
      single("hoarfrost", "孤絕之霜", "minor", "有高機率冰凍目標。", { element: "ice", extra: [status("enemy", stId(e, "freeze"), 0.8)] }),
      util("wrath", "冰封聖徒的憤怒", "none", [{ kind: "queueSkill", target: "self", skillId: "punish" }], "進入蓄力：下一次行動對全體施放永冬的懲罰。"),
    ],
    ai: [w("chill", 3), w("hoarfrost", 2), w("omen", 2, X("lt", R("battle.allies"), K(2))), w("wrath", 2)],
    summons: [e0, e1],
  });
  for (const [id, key, name] of [[e0, "Ice_Edge:0", "冰刃・甲"], [e1, "Ice_Edge:1", "冰刃・乙"]]) {
    enemy(id, key, {
      name, role: "召喚物", element: "ice", boundToSummoner: true,
      skills: [aoe("wind", "冰風", "minor", "", { type: "basic", element: "ice" })],
      ai: [w("wind", 1)],
    });
  }
}

// ---- 玄鹿 ----
{
  const e = "Abundant_Ebon_Deer_0";
  const T = { wind: "Twig_of_Wintry_Wind_0", maple: "Twig_of_Marple_Leaf_0", bloom: "Twig_of_Glorious_Blooms_0", fruit: "Twig_of_Lavish_Fruits_0" };
  const count = (id) => R(`battle.count.${U(id)}`);
  const twigCount = X("add", X("add", count(T.wind), count(T.maple)), X("add", count(T.bloom), count(T.fruit)));
  const none = (id) => X("eq", count(id), K(0));
  enemy(e, "Abundant_Ebon_Deer:0", {
    name: "豐饒玄鹿", role: "首領", element: "thunder",
    skills: [
      single("bleat", "搖曳的咩鳴", "normal", "", { element: "thunder" }),
      aoe("caress", "風之撫", "minor", "", { element: "wind" }),
      util("pedicel_wind", "花梗：凜風", "none", [{ kind: "summon", unitId: U(T.wind), count: 1 }], "召喚凜風之梢。"),
      util("pedicel_maple", "花梗：楓葉", "none", [{ kind: "summon", unitId: U(T.maple), count: 1 }], "召喚楓葉之梢。"),
      util("pedicel_bloom", "花梗：繁花", "none", [{ kind: "summon", unitId: U(T.bloom), count: 1 }], "召喚繁花之梢。"),
      util("pedicel_fruit", "花梗：豐實", "none", [{ kind: "summon", unitId: U(T.fruit), count: 1 }], "召喚豐實之梢。"),
      skill(
        "gore", "華麗抵角", "followup", "none",
        [
          dmg("allEnemies", X("add", K(0.6), X("mul", K(0.15), twigCount)), { }),
          counter("self", "fruit", "set", 0),
          { kind: "dismiss", unitId: U(T.wind) }, { kind: "dismiss", unitId: U(T.maple) }, { kind: "dismiss", unitId: U(T.bloom) }, { kind: "dismiss", unitId: U(T.fruit) },
        ],
        `雷屬性全體，倍率 60% + 場上每個枝條 15%；施放後移除全部枝條。豐實累積到 2 時立刻觸發。`, "thunder",
      ),
    ],
    passives: [passive("gore_trigger", "豐實滿溢", "counterChange", "gore", { limitPerTurn: 1, when: X("gte", R("self.counter.fruit"), K(2)), description: "豐實之梢累積 2 個果實時，立刻施放華麗抵角。" })],
    ai: [
      w("bleat", 3), w("caress", 2),
      w("pedicel_fruit", 2, none(T.fruit)), w("pedicel_wind", 1, none(T.wind)), w("pedicel_maple", 1, none(T.maple)), w("pedicel_bloom", 1, none(T.bloom)),
    ],
    summons: Object.values(T),
    unmodeled: "「護葉」（提高防禦並禁止削韌）未實作；本資料為普通變體。",
  });
  enemy(T.wind, "Twig_of_Wintry_Wind:0", {
    name: "凜風之梢", role: "召喚物", element: "wind", boundToSummoner: true,
    statuses: [statusDef(T.wind, "outrage", "暴怒", "debuff", { category: "control", duration: 1, charm: true }, "下一個回合改為攻擊自己的隊友（支配）。")],
    skills: [single("outrage", "暴怒", "minor", "有高機率使目標暴怒（支配 1 回合）。", { element: "wind", extra: [status("enemy", stId(T.wind, "outrage"), 0.8)] })],
    ai: [w("outrage", 1)],
  });
  enemy(T.maple, "Twig_of_Marple_Leaf:0", {
    name: "楓葉之梢", role: "召喚物", element: "thunder", boundToSummoner: true,
    statuses: [statusDef(T.maple, "engender", "孕育", "buff", { modifiers: [{ target: "stat:dmgBonus", op: "add", value: 0.15 }] }, "增傷 +15%，2 回合（原作為提高玄鹿攻擊力）。")],
    skills: [
      util("engender", "孕育", "none", [status("allAllies", stId(T.maple, "engender"), 1)], "強化友方（玄鹿）。"),
      single("hinging", "葉蝕", "minor", "", { element: "thunder" }),
    ],
    ai: [w("hinging", 2), w("engender", 1, X("eq", R(`self.status.${stId(T.maple, "engender")}`), K(0)))],
    unmodeled: "「報復」（反擊姿態）未實作。",
  });
  enemy(T.bloom, "Twig_of_Glorious_Blooms:0", {
    name: "繁花之梢", role: "召喚物", element: "wind", boundToSummoner: true,
    skills: [util("spring", "最後之春", "none", [{ kind: "heal", target: "allAllies", scale: "maxHp", multiplier: 0.2, flat: 0 }], "立刻回復所有友方生命（生命上限的 20%）。")],
    ai: [w("spring", 1)],
  });
  enemy(T.fruit, "Twig_of_Lavish_Fruits:0", {
    name: "豐實之梢", role: "召喚物", element: "wind", boundToSummoner: true,
    skills: [util("fruit", "結出果實", "none", [counter("allAllies", "fruit", "add", 1)], "結出一顆果實：友方（玄鹿）的豐實計數 +1，累積到 2 時玄鹿施放華麗抵角。")],
    ai: [w("fruit", 1)],
  });
}

// ---- 卡芙卡 ----
{
  const e = "Stellaron_Hunter_Kafka_0";
  const shock = stId(e, "shock");
  const dom = stId(e, "dominate");
  enemy(e, "Stellaron_Hunter_Kafka:0", {
    name: "卡芙卡（普通）", role: "首領", element: "thunder",
    statuses: [
      statusDef(e, "shock", "觸電", "debuff", { category: "shock", dot: { multiplier: 0.6, element: "thunder" } }, "每回合開始受到雷屬性持續傷害（攻擊力 60%），2 回合。"),
      statusDef(e, "dominate", "支配", "debuff", { category: "control", duration: 1, charm: true }, "下一個回合自動行動並攻擊自己的隊友（不消耗技能點）。"),
    ],
    skills: [
      skill("whisper", "靈魂低語", "skill", "enemy", [status("enemy", dom, 0.9), { kind: "advance", target: "enemy", amount: 1, when: X("gt", R(`target.status.${dom}`), K(0)) }], "有高機率支配目標，並讓其立刻行動、攻擊隊友。"),
      single("tumult", "午夜騷動", "minor", "有高機率造成觸電，並立刻結算一次觸電傷害（天賦「顫慄」）。", { element: "thunder", extra: [status("enemy", shock, 0.8), { kind: "detonate", target: "enemy", ratio: 1, statusId: shock }] }),
      blast("moonlight", "撫慰的月光", "normal", "對目標與相鄰單位有機率造成觸電（原作只在主目標已觸電時擴散）。", { type: "skill", element: "thunder", extra: [status("blast", shock, 0.7)] }),
      aoe("mockery", "沉默而尖銳的嘲弄", "minor", "", { element: "thunder" }),
      single("cruelty", "殘酷", "normal", "追加攻擊。", { type: "followup", element: "thunder" }),
    ],
    passives: [passive("cruelty", "殘酷", "allyHit", "cruelty", { limitPerTurn: 1, when: X("gt", R(`target.status.${shock}`), K(0)), description: "命中帶觸電的目標時追加一次雷屬性攻擊（每回合一次）。" })],
    ai: [w("tumult", 3), w("moonlight", 3), w("whisper", 2), w("mockery", 2)],
    unmodeled: "天賦「殘酷」只計 Kafka 自己的命中（原作含友方與被支配者）；完整體的行動條事件未做。",
  });
}

// ---------------------------------------------------------------------------------------------------------
// Encounters (each lists its starting enemy ids; summons are bundled automatically).
// ---------------------------------------------------------------------------------------------------------
const ENCOUNTERS = [
  { id: "silvermane_patrol", name: "銀鬃巡邏隊", kind: "普通", enemies: ["Silvermane_Soldier_0", "Silvermane_Gunner_0", "Silvermane_Cannoneer_0", "Silvermane_Soldier_0"], description: "四名普通敵人：降防、裂傷、小範圍彈幕。基本的多目標戰鬥。" },
  { id: "voidranger_squad", name: "虛卒小隊", kind: "普通", enemies: ["Voidranger_Reaver_0", "Voidranger_Distorter_0", "Voidranger_Eliminator_0", "Voidranger_Reaver_0"], description: "扭曲者會鎖定一名我方角色（集火）；殲擊者過載後承傷提高，是輸出時機。" },
  { id: "automaton_patrol", name: "機兵巡邏", kind: "普通", enemies: ["Automaton_Hound_0", "Automaton_Beetle_0", "Automaton_Spider_0", "Automaton_Hound_0"], description: "戰犬群體回血、甲蟲替友方上護盾、蜘蛛自爆，需要決定先打誰。" },
  { id: "silvermane_lieutenant", name: "銀鬃中尉", kind: "精英", enemies: ["Silvermane_Lieutenant_0", "Silvermane_Soldier_0", "Silvermane_Gunner_0"], description: "中尉進入反擊姿態時被攻擊會立刻反擊穿刺，還會召喚增援。" },
  { id: "automaton_grizzly", name: "機兵巨熊", kind: "精英", enemies: ["Automaton_Grizzly_0"], description: "召喚蜘蛛、蓄力後對全體施放清除命令（蓄力回合是擊破的好時機）。" },
  { id: "voidranger_trampler", name: "虛卒・踐踏者", kind: "精英", enemies: ["Voidranger_Trampler_0", "Voidranger_Reaver_0", "Voidranger_Distorter_0"], description: "螺旋箭鎖定目標後下一次行動施放弓盡（重擊＋纏繞），搭配扭曲者的集火。" },
  { id: "aurumaton_gatekeeper", name: "金人司閽", kind: "精英", enemies: ["Aurumaton_Gatekeeper_0"], description: "我方每用一次戰技或終結技累積懲戒值，滿 8 時召喚燈晝龍魚；節奏取捨題。" },
  { id: "cocolia", name: "可可利亞", kind: "首領", enemies: ["Cocolia_0"], description: "召喚冰刃（全體小傷害）、冰凍控制、蓄力後的全體重擊。首領倒下時冰刃一起消失。" },
  { id: "ebon_deer", name: "豐饒玄鹿", kind: "首領", enemies: ["Abundant_Ebon_Deer_0"], description: "召喚四種枝條：凜風（暴怒支配）、楓葉、繁花（治療）、豐實（累積 2 果實觸發全體重擊，傷害隨枝條數增加）。優先處理豐實之梢。" },
  { id: "kafka", name: "卡芙卡", kind: "首領", enemies: ["Stellaron_Hunter_Kafka_0"], description: "支配我方角色讓其立刻攻擊隊友、觸電持續傷害與引爆、命中觸電目標時追加攻擊。" },
];

// ---------------------------------------------------------------------------------------------------------
// Conversion (ported from packages/core/src/library/reference.ts: enemyStatsAt / unitFromEnemy)
// ---------------------------------------------------------------------------------------------------------
const byKey = new Map(pack.enemies.map((e) => [e.key, e]));
const curves = pack.enemyCurves;

function statsAt(e, level) {
  const i = Math.min(curves.hp.length, Math.max(1, Math.round(level))) - 1;
  return {
    hp: e.coeff.hp * curves.hp[i], atk: e.coeff.atk * curves.attack[i], def: e.coeff.def * curves.defense[i], spd: e.coeff.spd * curves.speed[i],
    effectHit: curves.effHitRate[i], effectRes: e.coeff.effectResBase + curves.effRes[i],
  };
}

function unitOf(spec, level) {
  const ref = byKey.get(spec.key);
  if (!ref) throw new Error(`pack has no enemy ${spec.key}`);
  const s = statsAt(ref, level);
  const elementRes = {};
  for (const [el, v] of Object.entries(ref.elementRes)) elementRes[ELEMENT_MAP[el]] = v;
  const statusRes = {};
  for (const [cat, v] of Object.entries(ref.statusRes)) if (STATUS_CATEGORY_MAP[cat] && v !== 0) statusRes[STATUS_CATEGORY_MAP[cat]] = v;
  const weaknesses = [...new Set(ref.weaknesses.map((x) => ELEMENT_MAP[x]))];
  const notes = [
    `${PH}技能倍率、AI 權重與狀態數值皆為估計值，來源（KQM Star Rail Library）沒有提供；僅屬性、弱點、抗性、韌性與等級曲線數值來自資料。`,
    spec.unmodeled && `未實作：${spec.unmodeled}`,
    ...ref.skills.filter((k) => k.type !== "Ability").map((k) => `天賦（原文）：${k.name}`),
  ].filter(Boolean);
  const unit = {
    id: U(spec.short),
    name: spec.name,
    team: "enemy",
    element: spec.element,
    role: spec.role,
    stats: {
      level, hp: s.hp, atk: s.atk, def: s.def, spd: s.spd, effectHit: s.effectHit, effectRes: s.effectRes,
      toughness: ref.toughness * TOUGHNESS_SCALE, res: 0, critRate: 0, critDmg: 0, dmgBonus: 0, defIgnore: 0, resPen: 0, vulnerability: 0, dmgReduction: 0, breakEffect: 0, maxEnergy: 0,
    },
    weaknesses,
    elementRes,
    statusRes,
    skills: spec.skills,
    ai: spec.ai,
    source: { kind: "reference-enemy", key: spec.key, note: `Lv${level}` },
    description: notes.join("\n"),
  };
  if (spec.passives) unit.passives = spec.passives;
  if (spec.boundToSummoner) unit.boundToSummoner = true;
  return unit;
}

// Resolve each encounter's unit set (starting enemies + everything summoned, recursively) and its statuses.
const statusById = new Map();
for (const sp of Object.values(SPECS)) for (const st of sp.statuses ?? []) statusById.set(st.id, st);
function closure(ids) {
  const out = [];
  const visit = (id) => {
    if (out.includes(id)) return;
    const sp = SPECS[id];
    if (!sp) throw new Error(`unknown enemy spec ${id}`);
    out.push(id);
    for (const s of sp.summons ?? []) visit(s);
  };
  ids.forEach(visit);
  return out;
}
const encounters = ENCOUNTERS.map((enc) => {
  const unitShorts = closure(enc.enemies);
  return {
    id: enc.id, name: enc.name, kind: enc.kind, description: `${enc.description}（${PH}技能數值為估計）`,
    enemies: enc.enemies.map(U),
    units: unitShorts.map(U),
    statuses: unitShorts.flatMap((s) => (SPECS[s].statuses ?? []).map((x) => x.id)),
  };
});
const used = new Set(encounters.flatMap((e) => e.units.map((u) => u.slice(5))));

const units = {};
for (const level of LEVELS) units[level] = Object.keys(SPECS).filter((s) => used.has(s)).map((s) => unitOf(SPECS[s], level));
const statuses = [...statusById.values()].filter((st) => encounters.some((e) => e.statuses.includes(st.id)));

const out = {
  source: {
    text: "敵人數值來自 KQM Star Rail Library 敵人資料（固定修訂 de0e5c09，2025-11-04 的社群整理，適用遊戲版本未確認、授權條款未確認）。遊戲內容著作權屬於 HoYoverse，本站與其無關。僅屬性、弱點、抗性、韌性與等級曲線數值來自資料；技能倍率、AI、狀態數值與韌性換算皆為【佔位】估計，不代表遊戲內實際強度（沒有關卡、精英或首領加成倍率）。",
    version: "KQM de0e5c09",
  },
  levels: LEVELS,
  defaultLevel: DEFAULT_LEVEL,
  toughnessScale: TOUGHNESS_SCALE,
  encounters,
  statuses,
  units,
};
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`wrote ${OUT}: ${encounters.length} encounters, ${units[DEFAULT_LEVEL].length} enemies x ${LEVELS.length} levels, ${statuses.length} statuses`);

if (!process.env.HSR_ENEMIES_OUT) {
  const r = spawnSync(process.execPath, [join(root, "scripts/validate-hsr-encounters.mjs")], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
