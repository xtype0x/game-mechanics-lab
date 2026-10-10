/**
 * Gacha rules (docs/spec/gacha.md) and demo module resolution (docs/demo-modules.md), with hand-computed values.
 */
import { describe, expect, it } from "vitest";
import {
  Rng,
  SCHEMA_VERSION,
  defaultGachaConfig,
  disclosure,
  featuredShare,
  loadProject,
  newGachaState,
  newProject,
  pullMany,
  pullOnce,
  rateUpBanner,
  resolveModules,
  defaultModuleSelection,
  simpleBanner,
  targetDistribution,
  tierCap,
  tierChances,
  tierLongRunRates,
  tierRate,
  validateBanner,
  worstCasePulls,
  type BannerDef,
  type GachaTier,
} from "../src";

const items = (...ids: string[]) => ids.map((id) => ({ id, name: id, kind: "resource" as const, resource: "exp", amount: 1 }));
const banner = (tiers: GachaTier[], ids: string[]): BannerDef => ({ id: "b", name: "b", cost: 1, tiers, items: items(...ids) });
/** Scripted rng: next() returns the queued values; int(n) returns the queued ints (default 0). */
const scripted = (nexts: number[], ints: number[] = []) => ({ next: () => nexts.shift()!, int: () => ints.shift() ?? 0 }) as unknown as Rng;

describe("pull rules (§2)", () => {
  const soft: GachaTier = { id: "5", name: "5★", rate: 0.006, softPityStart: 74, softPityStep: 0.06, hardPity: 90, items: ["a"] };

  it("soft and hard pity raise the tier rate", () => {
    expect(tierRate(soft, 73)).toBe(0.006);
    expect(tierRate(soft, 74)).toBeCloseTo(0.066, 15);
    expect(tierRate(soft, 75)).toBeCloseTo(0.126, 15);
    expect(tierRate(soft, 90)).toBe(1);
    expect(tierCap(soft)).toBe(90);
    expect(tierCap({ ...soft, hardPity: undefined })).toBe(90); // 0.006 + (c − 73) × 0.06 ≥ 1 first at c = 90
    expect(tierCap({ id: "x", name: "x", rate: 0.1, items: [] })).toBe(1);
  });

  it("one shared roll, highest tier first; a higher hard pity pre-empts lower tiers", () => {
    const b = banner([
      { id: "5", name: "5★", rate: 0.02, hardPity: 50, items: ["a"] },
      { id: "4", name: "4★", rate: 0.13, hardPity: 10, items: ["b"] },
      { id: "3", name: "3★", rate: 0, items: ["c"] },
    ], ["a", "b", "c"]);
    const close = (xs: number[], ys: number[]) => xs.forEach((x, i) => expect(x).toBeCloseTo(ys[i]!, 15));
    close(tierChances(b, [1, 1, 1]), [0.02, 0.13, 0.85]);
    close(tierChances(b, [1, 10, 1]), [0.02, 0.98, 0]);
    close(tierChances(b, [50, 10, 1]), [1, 0, 0]);
  });

  it("counters reset only for the hit tier; the 50/50 loss sets the guarantee", () => {
    const b = banner([
      { id: "5", name: "5★", rate: 0.1, featured: { share: 0.5, guarantee: true, items: ["f1", "f2"] }, items: ["o"] },
      { id: "3", name: "3★", rate: 0, items: ["c"] },
    ], ["f1", "f2", "o", "c"]);
    const st = newGachaState(b);
    // Pull 1: 3★ (u = 0.5). Pull 2: 5★ (u = 0.05), split 0.7 ≥ 0.5 → off-banner. Pull 3: 5★ guaranteed (no split roll), int → f2.
    const rng = scripted([0.5, 0.05, 0.7, 0.01], [0, 0, 1]);
    const r = [pullOnce(b, st, rng), pullOnce(b, st, rng), pullOnce(b, st, rng)];
    expect(r.map((x) => [x.tierId, x.itemId, x.featured, x.pity])).toEqual([["3", "c", false, 1], ["5", "o", false, 2], ["5", "f2", true, 1]]);
    expect(st).toEqual({ counters: { "5": 0, "3": 2 }, guaranteed: { "5": false }, pulls: 3 });
  });

  it("hard pity hits exactly on its pull", () => {
    const b = banner([{ id: "5", name: "5★", rate: 0, hardPity: 3, items: ["a"] }, { id: "3", name: "3★", rate: 0, items: ["c"] }], ["a", "c"]);
    const out = pullMany(b, newGachaState(b), new Rng(1, "t"), 7).map((x) => x.tierId).join("");
    expect(out).toBe("3353353");
  });

  it("the default simple banner matches the demo's original pool", () => {
    const p = newProject();
    const b = simpleBanner(p.battle);
    const close = (xs: number[], ys: number[]) => xs.forEach((x, i) => expect(x).toBeCloseTo(ys[i]!, 15));
    close(tierChances(b, [1, 1, 1]), [0.02, 0.13, 0.85]);
    close(tierChances(b, [50, 1, 1]), [1, 0, 0]);
    expect(b.tiers[0]!.items.map((id) => b.items.find((x) => x.id === id)!.unitId)).toEqual(p.battle.units.filter((u) => u.team === "ally" && !p.battle.encounter.allies.includes(u.id)).map((u) => u.id));
    expect(validateBanner(b, new Set(p.battle.units.map((u) => u.id)))).toEqual([]);
  });
});

describe("exact analysis (§3)", () => {
  it("geometric without pity, truncated by hard pity", () => {
    const geo = targetDistribution(banner([{ id: "5", name: "5★", rate: 0.5, items: ["a"] }, { id: "3", name: "3★", rate: 0, items: ["c"] }], ["a", "c"]), { mode: "tier", copies: 1 });
    expect(geo.pmf.slice(0, 4)).toEqual([0, 0.5, 0.25, 0.125]);
    expect(geo.mean).toBeCloseTo(2, 9);
    const hard = targetDistribution(banner([{ id: "5", name: "5★", rate: 0.5, hardPity: 2, items: ["a"] }, { id: "3", name: "3★", rate: 0, items: ["c"] }], ["a", "c"]), { mode: "tier", copies: 2 });
    // Each copy takes 1 pull (½) or 2 pulls (½): totals 2, 3, 4 with ¼, ½, ¼.
    expect(hard.pmf).toEqual([0, 0, 0.25, 0.5, 0.25]);
    expect(hard.mean).toBe(3);
  });

  it("50/50 with guarantee, and one specific featured item", () => {
    const always = (f: GachaTier["featured"], off: string[]) => banner([{ id: "5", name: "5★", rate: 1, featured: f, items: off }, { id: "3", name: "3★", rate: 0, items: ["c"] }], ["f1", "f2", "o", "c"]);
    const fifty = targetDistribution(always({ share: 0.5, guarantee: true, items: ["f1"] }, ["o"]), { mode: "featured", copies: 1 });
    expect(fifty.pmf).toEqual([0, 0.5, 0.5]);
    const noGuarantee = targetDistribution(always({ share: 0.5, guarantee: false, items: ["f1"] }, ["o"]), { mode: "featured", copies: 1 });
    expect(noGuarantee.pmf.slice(0, 4)).toEqual([0, 0.5, 0.25, 0.125]);
    const item = targetDistribution(always({ share: 1, guarantee: false, items: ["f1", "f2"] }, []), { mode: "item", itemId: "f2", copies: 1 });
    expect(item.pmf.slice(0, 3)).toEqual([0, 0.5, 0.25]);
    // Starting with the guarantee already set: the first hit is featured.
    const st = { counters: { "5": 0 }, guaranteed: { "5": true }, pulls: 0 };
    expect(targetDistribution(always({ share: 0.5, guarantee: true, items: ["f1"] }, ["o"]), { mode: "featured", copies: 1 }, st).pmf).toEqual([0, 1]);
  });

  it("guaranteed maximum pulls", () => {
    const b = rateUpBanner(newProject().battle); // hard pity 90, 50/50 with guarantee, one featured 5★
    expect(worstCasePulls(b, { mode: "tier", copies: 1 })).toBe(90);
    expect(worstCasePulls(b, { mode: "featured", copies: 1 })).toBe(180);
    expect(worstCasePulls(b, { mode: "featured", copies: 2 })).toBe(360);
    expect(worstCasePulls(b, { mode: "featured", copies: 1 }, { counters: { "5": 30 }, guaranteed: { "5": true }, pulls: 0 })).toBe(60);
    const noG = { ...b, tiers: [{ ...b.tiers[0]!, featured: { ...b.tiers[0]!.featured!, guarantee: false } }, ...b.tiers.slice(1)] };
    expect(worstCasePulls(noG, { mode: "featured", copies: 1 })).toBeNull();
    // The bound matches the exact distribution: nothing beyond it, and the last pull before it is reachable.
    const d = targetDistribution(b, { mode: "featured", copies: 1 }, undefined, { epsilon: 0 , maxPulls: 200 });
    expect(d.pmf.slice(181).every((p) => p < 1e-15)).toBe(true);
    expect(d.pmf[180]).toBeGreaterThan(0);
  });

  it("long-run tier rates: 1/mean for the top tier, exact for a deterministic pity", () => {
    const det = banner([{ id: "5", name: "5★", rate: 0, hardPity: 10, items: ["a"] }, { id: "3", name: "3★", rate: 0, items: ["c"] }], ["a", "c"]);
    const lr = tierLongRunRates(det);
    expect(lr[0]).toBeCloseTo(0.1, 12);
    const b = simpleBanner(newProject().battle);
    const mean = targetDistribution(b, { mode: "tier", copies: 1 }).mean;
    expect(tierLongRunRates(b)[0]).toBeCloseTo(1 / mean, 12);
    expect(featuredShare({ id: "5", name: "5★", rate: 0.1, featured: { share: 0.5, guarantee: true, items: ["f"] }, items: ["o"] })).toBeCloseTo(2 / 3, 15);
  });

  it("disclosure rows sum to 1 and agree with sampling", () => {
    const b = rateUpBanner(newProject().battle);
    const d = disclosure(b);
    expect(d.rows.reduce((a, r) => a + r.consolidated, 0)).toBeCloseTo(1, 10);
    expect(d.rows.reduce((a, r) => a + r.base, 0)).toBeCloseTo(1, 12);
    const st = newGachaState(b);
    const rng = new Rng(7, "gacha.sample");
    const n = 200000;
    const res = pullMany(b, st, rng, n);
    const freq5 = res.filter((r) => r.tierId === "5").length / n;
    const freq4 = res.filter((r) => r.tierId === "4").length / n;
    expect(Math.abs(freq5 - d.tiers[0]!.consolidated)).toBeLessThan(0.002);
    expect(Math.abs(freq4 - d.tiers[1]!.consolidated)).toBeLessThan(0.004);
    const hits5 = res.filter((r) => r.tierId === "5");
    expect(Math.abs(hits5.filter((r) => r.featured).length / hits5.length - 2 / 3)).toBeLessThan(0.03);
  });
});

describe("validation", () => {
  it("flags broken references and impossible tiers", () => {
    const b = banner([
      { id: "5", name: "5★", rate: 0, items: ["a", "zz"] },
      { id: "3", name: "3★", rate: 0, items: [] },
    ], ["a"]);
    b.items.push({ id: "u", name: "角色", kind: "unit", unitId: "ghost" });
    const msgs = validateBanner(b, new Set(["hero"])).map((i) => `${i.level}:${i.message}`);
    expect(msgs).toEqual([
      "error:物品「角色」指向不存在的角色「ghost」",
      "error:「5★」機率為 0 又沒有保底，永遠不會出現",
      "error:「5★」使用不存在的物品「zz」",
      "error:「3★」沒有任何物品",
      "warning:物品「角色」沒有放進任何稀有度",
    ]);
  });
});

describe("demo modules (docs/demo-modules.md)", () => {
  it("everything on: optional providers replace the slot defaults", () => {
    const r = resolveModules(defaultModuleSelection());
    expect(r.active).toEqual(["battle", "stages", "teamEdit", "economy", "gacha", "disclosure", "growth", "progression"]);
    expect(r.fallbacks).toEqual([]);
    expect(r.playable).toBe(true);
  });

  it("gacha off: characters become freely selectable", () => {
    const r = resolveModules({ ...defaultModuleSelection(), gacha: false });
    expect(r.active).toContain("freeRoster");
    expect(r.active).not.toContain("gacha");
    expect(r.blocked).toEqual([{ id: "disclosure", missing: ["gacha"] }]);
    expect(r.playable).toBe(true);
  });

  it("economy off takes down everything that spends currency", () => {
    const r = resolveModules({ ...defaultModuleSelection(), economy: false, teamEdit: false });
    expect(r.blocked.map((b) => b.id).sort()).toEqual(["disclosure", "gacha", "growth"]);
    expect(r.fallbacks).toEqual(["freeRoster", "autoTeam"]);
    expect(r.active).toEqual(["battle", "stages", "freeRoster", "autoTeam", "progression"]);
    expect(r.playable).toBe(true);
  });
});

describe("project v4", () => {
  it("migrates v3 files: banners from the project's allies, every module on", () => {
    const p = newProject();
    const v3 = JSON.parse(JSON.stringify(p));
    delete v3.gacha;
    delete v3.demo;
    v3.schemaVersion = 3;
    const loaded = loadProject(v3);
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.gacha).toEqual(defaultGachaConfig(p.battle));
    expect(loaded.demo.modules).toEqual(defaultModuleSelection());
  });
});
