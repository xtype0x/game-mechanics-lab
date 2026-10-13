import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_UNITS, PROJECT_TEMPLATES, aggregate, battleSetupOf, simulateOne, validateBattle } from "@gml/core";
import { compileProject } from "@gml/data-hsr/equipment";
import { hsrGroup } from "@gml/data-hsr/presets";
import { applyPreset, applyTrialSetup, freshProject, loadSaved, saveProject } from "../src/state";
import { templateGroup } from "../src/presets/templates";

const normalStats = (project: ReturnType<typeof freshProject>, n = 24) => {
  const setup = battleSetupOf(compileProject(project, {}).project);
  return aggregate(Array.from({ length: n }, (_, i) => simulateOne(setup, project.battle.policy, `trial-${i}`)));
};

afterEach(() => vi.unstubAllGlobals());

describe("battle lab trial balance", () => {
  it("keeps normal battles playable when any implemented HSR character replaces a damage slot", () => {
    const original = normalStats(freshProject());
    expect(original.winRate).toBeGreaterThanOrEqual(0.9);
    for (const preset of hsrGroup.presets.filter((p) => p.available && p.apply)) {
      const project = freshProject();
      applyPreset(project, "homura", preset);
      const stats = normalStats(project);
      expect(stats.winRate, preset.name).toBeGreaterThanOrEqual(0.9);
      expect(stats.timeoutRate, preset.name).toBe(0);
      expect(stats.cycles!.mean, preset.name).toBeLessThanOrEqual(8);
    }
  });

  it("builds an immediately playable HSR trial team even from a one-person custom line-up", () => {
    const project = freshProject();
    project.battle.encounter.allies = ["akari"];
    const ids = applyTrialSetup(project);
    expect(ids).toEqual(["hsr_1003", "hsr_1002", "hsr_1103", "hsr_1104"]);
    expect(project.battle.encounter.allies).toEqual(ids);
    expect(project.battle.encounter.enemies).toEqual(["bat", "golem", "bat"]);
    const compiled = compileProject(project, {});
    expect(compiled.problems).toEqual([]);
    expect(validateBattle(compiled.project.battle, battleSetupOf(compiled.project).damage).filter((i) => i.level === "error")).toEqual([]);
    const stats = normalStats(project);
    expect(stats.winRate).toBeGreaterThanOrEqual(0.9);
    expect(stats.timeoutRate).toBe(0);
    expect(stats.cycles!.mean).toBeLessThanOrEqual(8);
    expect(applyTrialSetup(project)).toEqual(ids);
    expect(new Set(project.battle.units.map((u) => u.id)).size).toBe(project.battle.units.length);
  });

  it("uses the same tuned stats in fresh projects and original presets without changing core content", () => {
    const raw = structuredClone(DEFAULT_UNITS);
    const project = freshProject();
    for (const preset of templateGroup.presets) {
      expect(preset.apply!.stats).toEqual(project.battle.units.find((u) => u.id === preset.id)!.stats);
    }
    expect(DEFAULT_UNITS).toEqual(raw);
    const lantern = project.battle.units.find((u) => u.id === "lantern")!;
    expect(lantern.phases![0]!.stats!.hp).toBeLessThan(5000);
    expect(project.battle.units.find((u) => u.id === "dreambell")!.stats.hp).toBe(1);
    expect(project.battle.units.find((u) => u.id === "bat")!.elementRes!.fire).toBe(0);
  });

  it("upgrades untouched saved templates while preserving edited, custom and HSR units", () => {
    const old = PROJECT_TEMPLATES.find((t) => t.id === "boss-mechanics")!.create("old lab");
    // A preset picked from the old menu has no taunt default, and may occupy a duplicate slot.
    const oldPreset = structuredClone(DEFAULT_UNITS.find((u) => u.id === "homura")!);
    old.battle.units.push({ ...oldPreset, id: "homura-2", name: "焰華2" });
    const edited = old.battle.units.find((u) => u.id === "golem")!;
    edited.stats.hp = 12345;
    applyPreset(old, "shimo", hsrGroup.presets.find((p) => p.id === "hsr-1103")!);
    const custom = { ...structuredClone(edited), id: "custom-enemy" };
    old.battle.units.push(custom);
    const editedCopy = structuredClone(edited);
    const hsrCopy = structuredClone(old.battle.units.find((u) => u.id === "hsr_1103")!);
    const data = new Map([["ggt.site.battle.v1", JSON.stringify(old)]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    const loaded = loadSaved();
    expect(loaded.battle.units.find((u) => u.id === "homura")!.stats).toEqual(freshProject().battle.units.find((u) => u.id === "homura")!.stats);
    expect(loaded.battle.units.find((u) => u.id === "homura-2")!.stats.hp).toBeLessThan(1500);
    expect(loaded.battle.units.find((u) => u.id === "golem")).toEqual(editedCopy);
    expect(loaded.battle.units.find((u) => u.id === "custom-enemy")).toEqual(custom);
    expect(loaded.battle.units.find((u) => u.id === "hsr_1103")).toEqual(hsrCopy);
    // Once saved at the new balance version, deliberately restoring an old value remains an edit.
    loaded.battle.units.find((u) => u.id === "homura")!.stats.hp = 3200;
    expect(saveProject(loaded)).toBe(true);
    expect(loadSaved().battle.units.find((u) => u.id === "homura")!.stats.hp).toBe(3200);
  });

  it("keeps phases, summons and event encounters playable for original and HSR teams", () => {
    for (const hsr of [false, true]) {
      const project = freshProject();
      if (hsr) applyTrialSetup(project);
      for (const encounter of project.battle.encounters) {
        project.battle.encounter.enemies = [...encounter.enemies];
        const stats = normalStats(project);
        expect(stats.timeoutRate).toBe(0);
        expect(stats.winRate, `${hsr ? "HSR" : "templates"} ${encounter.id}`).toBeGreaterThanOrEqual(0.9);
        expect(stats.cycles!.mean).toBeLessThanOrEqual(12);
      }
    }
  });
});
