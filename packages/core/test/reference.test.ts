import { describe, expect, it } from "vitest";
import {
  DEFAULT_ELEMENT_MAP,
  DEFAULT_STATUS_CATEGORY_MAP,
  REFERENCE_PACK_KIND,
  ascensionFor,
  characterStatsAt,
  enemyStatsAt,
  renderSkillText,
  unitFromCharacter,
  unitFromEnemy,
  validatePack,
  type ReferencePack,
} from "../src";

// Synthetic pack: made-up names and numbers, same shape as a real one.
const curve = (start: number, step: number) => Array.from({ length: 100 }, (_, i) => start + step * i);
const pack: ReferencePack = {
  kind: REFERENCE_PACK_KIND,
  schemaVersion: 1,
  title: "測試資料包",
  caveats: [],
  sources: [],
  elementNames: Object.keys(DEFAULT_ELEMENT_MAP),
  statusCategoryNames: Object.keys(DEFAULT_STATUS_CATEGORY_MAP),
  enemyCurves: { hp: curve(1, 1), attack: curve(0.5, 0.5), defense: curve(10, 10), speed: curve(1, 0.01), effHitRate: curve(0, 0.001), effRes: curve(0, 0.002) },
  enemies: [{
    key: "src:Training_Bot:0", name: "Training Bot", variantLabel: "Mk II",
    coeff: { hp: 100, atk: 20, def: 2, spd: 100, effectResBase: 0.1 }, toughness: 60,
    weaknesses: ["Fire", "Quantum"], elementRes: { Fire: 0, Ice: 0.2, Quantum: 0 }, statusRes: { Frozen: 0.5, Burn: 0 },
    skills: [
      { name: "Zap", type: "Ability", desc: "Deals minor Lightning DMG to a single target." },
      { name: "Sweep", type: "Ability", desc: "Deals moderate Ice DMG to a single target and adjacent targets." },
      { name: "Harden", type: "Ability", desc: "Gains a shield." },
      { name: "Core", type: "Talent", desc: "Cannot be frozen twice." },
    ],
  }],
  characters: [{
    id: "9001", name: "測試員", element: "Ice", maxEnergy: 120,
    promotions: Array.from({ length: 7 }, (_, a) => ({ hp: { base: 100 + a * 50, step: 5 }, atk: { base: 50 + a * 20, step: 2 }, def: { base: 40, step: 1 }, spd: { base: 101, step: 0 }, taunt: { base: 150, step: 0 }, crit_rate: { base: 0.05, step: 0 }, crit_dmg: { base: 0.5, step: 0 } })),
    skills: [
      { id: "1", name: "戳", type: "Normal", effect: "SingleAttack", maxLevel: 9, desc: "造成#1[i]%傷害。", params: Array.from({ length: 9 }, (_, i) => [0.5 + i * 0.1]) },
      { id: "2", name: "盾", type: "BPSkill", effect: "Defence", maxLevel: 15, desc: "護盾 #1[i]% 防禦 + #2[i]。", params: Array.from({ length: 15 }, (_, i) => [0.38 + i * 0.01, 190 + i]) },
      { id: "3", name: "爆", type: "Ultra", effect: "Blast", maxLevel: 15, desc: "主 #1[i]%，相鄰 #2[i]%。", params: Array.from({ length: 15 }, (_, i) => [1 + i * 0.1, 0.5]) },
      { id: "4", name: "天賦", type: "Talent", effect: "Support", maxLevel: 15, desc: "持續#1[i]回合。", params: Array.from({ length: 15 }, () => [3]) },
    ],
  }],
};
const opts = { level: 80, elementMap: DEFAULT_ELEMENT_MAP, statusCategoryMap: DEFAULT_STATUS_CATEGORY_MAP, toughnessScale: 1 };

describe("reference pack import", () => {
  it("validates pack shape", () => {
    expect(validatePack(pack)).toEqual([]);
    expect(validatePack({ kind: "nope" })[0]).toContain("不是參考資料包");
    expect(validatePack({ ...pack, enemyCurves: undefined })).toContain("有敵人資料但缺少 enemyCurves 等級曲線");
  });

  it("enemy stats = coeff × curve[level − 1], effectRes additive, no rounding", () => {
    // Lv80 → index 79: hp curve 80, attack 40, defense 800, speed 1.79, effHit 0.079, effRes 0.158
    expect(enemyStatsAt(pack, pack.enemies[0]!, 80)).toEqual({ hp: 8000, atk: 800, def: 1600, spd: 100 * 1.79, effectHit: 0 + 0.001 * 79, effectRes: 0.1 + 0.002 * 79 });
  });

  it("enemy conversion maps elements, resistances, toughness scale and creates marked placeholder skills", () => {
    const { unit, warnings } = unitFromEnemy(pack, pack.enemies[0]!, { ...opts, toughnessScale: 0.5 }, ["ref_Training_Bot_0"]);
    expect(unit.id).toBe("ref_Training_Bot_0_2");
    expect(unit.name).toBe("Training Bot（Mk II）");
    expect(unit.weaknesses).toEqual(["fire", "light"]);
    expect(unit.element).toBe("thunder"); // first of the tied skill elements (thunder, ice)
    expect(unit.elementRes).toEqual({ fire: 0, ice: 0.2, light: 0 });
    expect(unit.statusRes).toEqual({ freeze: 0.5 }); // zero entries omitted
    expect(unit.stats.toughness).toBe(30);
    expect(unit.skills.map((s) => [s.name, s.element, s.effects[0]])).toEqual([
      ["Zap", "thunder", { kind: "damage", target: "enemy", multiplier: 1, toughness: 0 }],
      ["Sweep", "ice", { kind: "damage", target: "blast", multiplier: 2, adjMultiplier: 1, toughness: 0 }],
    ]);
    expect(unit.skills.every((s) => s.description!.startsWith("【佔位倍率"))).toBe(true);
    expect(unit.ai).toEqual([{ skillId: "s1", weight: 1 }, { skillId: "s2", weight: 1 }]);
    expect(unit.description).toContain("Core");
    expect(unit.source).toEqual({ kind: "reference-enemy", key: "src:Training_Bot:0", note: "Lv80" });
    expect(warnings.some((w) => w.includes("佔位"))).toBe(true);
  });

  it("character stats = base + step × (level − 1) at the ascension the level needs", () => {
    expect(ascensionFor(80)).toBe(6);
    expect(ascensionFor(20)).toBe(0);
    expect(ascensionFor(21)).toBe(1);
    const c = pack.characters[0]!;
    expect(characterStatsAt(c, 80)).toEqual({ hp: 400 + 5 * 79, atk: 170 + 2 * 79, def: 40 + 79, spd: 101, taunt: 150, critRate: 0.05, critDmg: 0.5 });
  });

  it("character conversion picks skill levels, guesses attack multipliers and leaves support effects empty", () => {
    const { unit, warnings } = unitFromCharacter(pack.characters[0]!, opts, []);
    expect(unit).toMatchObject({ id: "ref_c9001", team: "ally", element: "ice" });
    expect(unit.stats.maxEnergy).toBe(120);
    const [basic, sk, ult] = unit.skills;
    expect(basic!.effects).toEqual([{ kind: "damage", target: "enemy", multiplier: 0.5 + 5 * 0.1, toughness: 10 }]); // Lv6
    expect(sk!.effects).toEqual([]);
    expect(sk!.targeting).toBe("ally");
    expect(ult).toMatchObject({ type: "ultimate", energyCost: 120, effects: [{ kind: "damage", target: "blast", multiplier: 1 + 9 * 0.1, adjMultiplier: 0.5, toughness: 20, adjToughness: 10 }] });
    expect(unit.description).toContain("持續3回合");
    expect(warnings.some((w) => w.includes("盾"))).toBe(true);
  });

  it("renders description placeholders", () => {
    expect(renderSkillText("造成#1[i]%傷害，持續#2[i]回合", [0.57, 3])).toBe("造成57%傷害，持續3回合");
  });
});
