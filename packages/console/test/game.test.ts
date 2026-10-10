import { newProject, simpleBanner, targetDistribution, tierLongRunRates } from "@ggt/core";
import { describe, expect, it } from "vitest";
import {
  EXP_DUPE, activeBanner, battleProject, levelOf, levelScale, modsOf, newSave, rosterOf, stagesOf, summon, teamOf, upgradeSave,
  type DemoSaveV1,
} from "../src/demo/game";

describe("demo gacha (project banner)", () => {
  it("the default banner keeps the original 2% / pull-50 pity: mean pulls match a direct sum", () => {
    const p = newProject();
    const b = activeBanner(p)!;
    expect(b.id).toBe("simple");
    // Independent formula: E[pulls] = Σ_{k=0}^{N−1} (1−p)^k for a hard pity at N.
    let expected = 0;
    for (let k = 0; k < 50; k++) expected += Math.pow(1 - 0.02, k);
    const mean = targetDistribution(b, { mode: "tier", copies: 1 }).mean;
    expect(mean).toBeCloseTo(expected, 10);
    expect(tierLongRunRates(b)[0]! * 100).toBeCloseTo(3.14, 1);
  });

  it("never goes more than 50 pulls without a 5★", () => {
    const p = newProject();
    const b = activeBanner(p)!;
    const save = newSave(p, 7);
    let since = 0;
    for (let i = 0; i < 20000; i++) {
      const r = summon(p, b, save);
      since++;
      if (r.top) { expect(since).toBeLessThanOrEqual(50); since = 0; }
    }
  });

  it("is deterministic for the same save seed", () => {
    const p = newProject();
    const b = activeBanner(p)!;
    const a = newSave(p, 99);
    const c = newSave(p, 99);
    expect(Array.from({ length: 30 }, () => summon(p, b, a))).toEqual(Array.from({ length: 30 }, () => summon(p, b, c)));
  });

  it("5★ characters are the allies not in the starting team; duplicates turn into exp", () => {
    const p = newProject();
    const b = activeBanner(p)!;
    expect(newSave(p, 1).team).toEqual(["homura", "shimo", "raimei", "akari"]);
    expect(b.tiers[0]!.items.map((id) => b.items.find((x) => x.id === id)!.unitId).sort()).toEqual(["aoba", "yoru"]);
    const save = newSave(p, 1);
    const force = () => { save.gacha.banners[b.id]!.counters["5"] = 49; return summon(p, b, save); };
    summon(p, b, save); // create the banner state
    const first = force();
    expect(first).toMatchObject({ top: true, dupe: false });
    for (let i = 0; i < 20; i++) {
      const before = save.exp;
      const r = force();
      if (r.unitId === first.unitId) { expect(r.dupe).toBe(true); expect(save.exp - before).toBe(EXP_DUPE); return; }
    }
    throw new Error("no duplicate in 20 guaranteed pulls");
  });

  it("v1 saves keep their pity on the simple banner", () => {
    const p = newProject();
    const v1: DemoSaveV1 = { version: 1, crystals: 10, exp: 20, owned: { homura: { level: 2 } }, team: ["homura"], cleared: { s1: 1 }, gacha: { pity: 37, total: 80, rng: newSave(p, 3).gacha.rng } };
    const s = upgradeSave(v1, p)!;
    expect(s.version).toBe(2);
    expect(s.gacha.banners.simple).toMatchObject({ counters: { "5": 37 }, pulls: 80 });
    expect(simpleBanner(p.battle).id).toBe("simple");
  });
});

describe("demo modules", () => {
  it("everything on: owned roster, saved team, saved levels", () => {
    const p = newProject();
    const mods = modsOf(p);
    const save = newSave(p, 1);
    save.owned.homura!.level = 3;
    expect(rosterOf(p, save, mods).map((u) => u.id)).toEqual(["homura", "shimo", "raimei", "akari"]);
    expect(levelOf(save, mods, "homura")).toBe(3);
    save.team = ["akari"];
    expect(teamOf(p, save, mods)).toEqual(["akari"]);
  });

  it("gacha off: every ally is selectable; growth off: level 1; teamEdit off: the console line-up", () => {
    const p = newProject();
    p.demo.modules = { ...p.demo.modules, gacha: false, growth: false, teamEdit: false };
    const mods = modsOf(p);
    expect(mods.removed).toEqual(["gacha", "growth", "teamEdit", "disclosure"]);
    const save = newSave(p, 1);
    save.owned.homura!.level = 5;
    save.team = ["akari"];
    expect(rosterOf(p, save, mods).map((u) => u.id)).toEqual(p.battle.units.filter((u) => u.team === "ally").map((u) => u.id));
    expect(levelOf(save, mods, "homura")).toBe(1);
    expect(teamOf(p, save, mods)).toEqual(p.battle.encounter.allies);
  });

  it("economy off also stops gacha and growth (they need currency)", () => {
    const p = newProject();
    p.demo.modules = { ...p.demo.modules, economy: false };
    expect(modsOf(p)).toMatchObject({ economy: false, gacha: false, growth: false, disclosure: false, teamEdit: true, progression: true });
  });
});

describe("demo progression", () => {
  it("levels scale only ally hp/atk/def and only for the team", () => {
    const p = newProject();
    const team = ["homura", "shimo"];
    const bp = battleProject(p, team, (id) => (id === "homura" ? 3 : 1), ["bat"]);
    const base = p.battle.units.find((u) => u.id === "homura")!;
    const lv = bp.battle.units.find((u) => u.id === "homura")!;
    expect(lv.stats.atk).toBe(Math.round(base.stats.atk! * levelScale(3)));
    expect(lv.stats.spd).toBe(base.stats.spd);
    expect(bp.battle.units.find((u) => u.id === "shimo")).toBe(p.battle.units.find((u) => u.id === "shimo"));
    expect(bp.battle.units.find((u) => u.id === "bat")!.stats).toEqual(p.battle.units.find((u) => u.id === "bat")!.stats);
    expect(bp.battle.encounter).toEqual({ allies: team, enemies: ["bat"] });
  });

  it("default project yields three stages with the designed wave counts", () => {
    expect(stagesOf(newProject()).map((s) => s.waves.length)).toEqual([1, 2, 2]);
  });
});
