import { describe, expect, it } from "vitest";
import { applyLoadout, type Loadout } from "@gml/core";
import { compileProject, applyTemplate, defaultSel } from "@gml/data-hsr/equipment";
import { baseForPanel, baselineOf } from "../src/quickSettings";
import { applyTrialSetup, freshProject } from "../src/state";

describe("quick panel settings", () => {
  it("sets the requested final panel with a cone, percentage relics and traces", () => {
    const project = freshProject();
    const [id] = applyTrialSetup(project);
    const unit = project.battle.units.find((u) => u.id === id)!;
    const compiled = compileProject(project, { [id!]: applyTemplate(unit, defaultSel(unit), "dps") });
    expect(compiled.problems).toEqual([]);
    const loadout = compiled.units[id!]!.loadout;
    const before = structuredClone(unit);
    for (const [key, target] of Object.entries({ hp: 5000, atk: 3000, spd: 160, critRate: 0.9, energyRegen: 0.3 })) {
      const base = baseForPanel(unit, loadout, key, target);
      const result = applyLoadout({ ...unit, stats: { ...unit.stats, [key]: base } }, loadout);
      expect(result.unit.stats[key], key).toBeCloseTo(target, 7);
    }
    expect(unit).toEqual(before);
  });

  it("clamps to the equipment floor and preserves current stats on invalid input", () => {
    const unit = freshProject().battle.units[0]!;
    const loadout: Loadout = { pieces: [{ id: "test", name: "test", slot: "test", base: { atk: 500 }, bonuses: [{ key: "atk", op: "pct", value: 0.5 }] }] };
    expect(baseForPanel(unit, loadout, "atk", 100)).toBe(0);
    expect(baseForPanel(unit, loadout, "atk", NaN)).toBe(unit.stats.atk);
    expect(baseForPanel(unit, { pieces: [] }, "spd", 0, 1)).toBe(1);
  });

  it("finds the original preset for duplicated characters", () => {
    const project = freshProject();
    const [id] = applyTrialSetup(project);
    const unit = project.battle.units.find((u) => u.id === id)!;
    expect(baselineOf({ ...unit, id: `${id}-2` })?.id).toBe(id);
    expect(baselineOf({ ...unit, id: "custom" })).toBeUndefined();
  });

  it("keeps a geared critical rate above 100% when a profile requests a lower value", () => {
    const unit = freshProject().battle.units[0]!;
    const loadout: Loadout = { pieces: [{ id: "critical-gear", name: "critical gear", slot: "test", bonuses: [{ key: "critRate", op: "flat", value: 1.0815 }] }] };
    const base = baseForPanel(unit, loadout, "critRate", 0.7);
    const result = applyLoadout({ ...unit, stats: { ...unit.stats, critRate: base } }, loadout);
    expect(base).toBe(0);
    expect(result.unit.stats.critRate).toBeCloseTo(1.0815, 10);
  });
});
