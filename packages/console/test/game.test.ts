import { newProject } from "@ggt/core";
import { describe, expect, it } from "vitest";
import { HARD_PITY, RATE_5, battleProject, featured, levelScale, newSave, pityStats, pull, stagesOf, starters } from "../src/demo/game";

describe("demo gacha", () => {
  it("pity statistics match a direct sum over the pull-count distribution", () => {
    // Independent formula: E[pulls] = Σ_{k=0}^{N−1} (1−p)^k for a hard pity at N.
    let expected = 0;
    for (let k = 0; k < HARD_PITY; k++) expected += Math.pow(1 - RATE_5, k);
    const s = pityStats();
    expect(s.mean).toBeCloseTo(expected, 10);
    expect(s.consolidated).toBeCloseTo(1 / expected, 12);
    expect(s.consolidated * 100).toBeCloseTo(3.14, 1);
  });

  it("never goes more than HARD_PITY pulls without a 5★, and the sampled rate matches", () => {
    const p = newProject();
    const save = newSave(p, 7);
    let since = 0;
    let fives = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      save.crystals = 1e9;
      const r = pull(p, save);
      since++;
      if (r.rarity === 5) { fives++; expect(since).toBeLessThanOrEqual(HARD_PITY); since = 0; }
    }
    expect(Math.abs(fives / n - pityStats().consolidated)).toBeLessThan(0.004);
  });

  it("is deterministic for the same save seed", () => {
    const p = newProject();
    const a = newSave(p, 99);
    const b = newSave(p, 99);
    const ra = Array.from({ length: 30 }, () => pull(p, a));
    const rb = Array.from({ length: 30 }, () => pull(p, b));
    expect(ra).toEqual(rb);
  });

  it("featured characters are the allies not in the starting team; duplicates turn into exp", () => {
    const p = newProject();
    expect(starters(p)).toEqual(["homura", "shimo", "raimei", "akari"]);
    expect(featured(p).map((u) => u.id).sort()).toEqual(["aoba", "yoru"]);
    const save = newSave(p, 1);
    save.gacha.pity = HARD_PITY - 1;
    const first = pull(p, save);
    expect(first).toMatchObject({ rarity: 5, kind: "char", dupe: false });
    const id = (first as { unitId: string }).unitId;
    save.gacha.pity = HARD_PITY - 1;
    const before = save.exp;
    // Force the same character until a duplicate shows up.
    for (let i = 0; i < 20; i++) {
      save.gacha.pity = HARD_PITY - 1;
      const r = pull(p, save);
      if (r.kind === "char" && r.unitId === id) { expect(r.dupe).toBe(true); expect(save.exp).toBeGreaterThan(before); return; }
    }
    throw new Error("no duplicate in 20 guaranteed pulls");
  });
});

describe("demo progression", () => {
  it("levels scale only ally hp/atk/def and only for owned units", () => {
    const p = newProject();
    const save = newSave(p, 1);
    save.owned.homura!.level = 3;
    const bp = battleProject(p, save, ["bat"]);
    const base = p.battle.units.find((u) => u.id === "homura")!;
    const lv = bp.battle.units.find((u) => u.id === "homura")!;
    expect(lv.stats.atk).toBe(Math.round(base.stats.atk! * levelScale(3)));
    expect(lv.stats.spd).toBe(base.stats.spd);
    expect(bp.battle.units.find((u) => u.id === "bat")!.stats).toEqual(p.battle.units.find((u) => u.id === "bat")!.stats);
    expect(bp.battle.encounter).toEqual({ allies: save.team, enemies: ["bat"] });
  });

  it("default project yields three stages with the designed wave counts", () => {
    expect(stagesOf(newProject()).map((s) => s.waves.length)).toEqual([1, 2, 2]);
  });
});
