import { describe, expect, it } from "vitest";
import { HSR_PRESET_LEVEL, HSR_PRESET_SKILL_LEVELS, findHsrCharacter, hsrCharacterIdOf, hsrCharacters, hsrSkillParams, hsrStatsAt } from "../src/characters";
import { hsrGroup } from "../src/presets";

const GROWTH_KEYS = ["hp", "atk", "def", "spd", "taunt", "critRate", "critDmg"];

describe("@gml/data-hsr characters", () => {
  it("has one character per preset, in the same order", () => {
    expect(hsrCharacters.map((c) => `hsr-${c.id}`)).toEqual(hsrGroup.presets.map((p) => p.id));
    expect(hsrCharacters.map((c) => c.displayName)).toEqual(hsrGroup.presets.map((p) => p.name));
  });

  it("recomputes the presets' Lv80 base stats exactly from the growth tables", () => {
    expect(HSR_PRESET_LEVEL).toBe(80);
    const available = hsrGroup.presets.filter((p) => p.apply);
    expect(available.length).toBeGreaterThan(0);
    for (const p of available) {
      const id = hsrCharacterIdOf(p.id)!;
      const stats = hsrStatsAt(id, HSR_PRESET_LEVEL);
      for (const k of GROWTH_KEYS) if (k in stats) expect(p.apply!.stats[k], `${p.id} ${k}`).toBe(stats[k]);
    }
  });

  it("grows with level and ascension (Himeko 1003, hand-checked against the growth row)", () => {
    const ch = findHsrCharacter("1003")!;
    const row0 = ch.promotions[0]!;
    // Lv1, ascension 0: base values.
    expect(hsrStatsAt("1003", 1).atk).toBe(row0.atk!.base);
    // Lv20 before ascending vs after: same level, the higher row gives more.
    expect(hsrStatsAt("1003", 20, 1).atk).toBeGreaterThan(hsrStatsAt("1003", 20, 0).atk!);
    expect(hsrStatsAt("1003", 80).atk).toBeGreaterThan(hsrStatsAt("1003", 60).atk!);
  });

  it("returns skill parameters per level, clamped to the skill's range", () => {
    const basic = findHsrCharacter("1003")!.skills.find((s) => s.id === "100301")!;
    expect(hsrSkillParams("1003", "100301", 1)).toEqual(basic.params[0]);
    expect(hsrSkillParams("1003", "100301", 99)).toEqual(basic.params[basic.maxLevel - 1]);
    expect(hsrSkillParams("1003", "100301", 0)).toEqual(basic.params[0]);
    expect(HSR_PRESET_SKILL_LEVELS).toMatchObject({ basic: 6, skill: 10, ultimate: 10, talent: 10 });
  });

  it("maps preset and unit ids to character ids", () => {
    expect(hsrCharacterIdOf("hsr-1003")).toBe("1003");
    expect(hsrCharacterIdOf("hsr_1003")).toBe("1003");
    expect(hsrCharacterIdOf("homura")).toBeNull();
    expect(() => hsrStatsAt("nope", 80)).toThrow();
  });
});
