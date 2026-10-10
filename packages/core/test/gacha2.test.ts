/**
 * Gacha rules 2.0 (docs/spec/gacha2.md): equivalence with 1.0 on converted banners, hand-derived closed forms,
 * cost knapsack and Monte Carlo agreement.
 */
import { describe, expect, it } from "vitest";
import {
  Gacha,
  Rng,
  newGachaState,
  newProject,
  pullMany as pullMany1,
  rateUpBanner,
  simpleBanner,
  targetDistribution as targetDistribution1,
  tierLongRunRates,
  type BannerDef,
} from "../src";

const preset = (id: string) => structuredClone(Gacha.PRESETS.find((p) => p.model.id === id)!);
const p3 = 0.03 * (0.7 / 3); // featured ★3 chance per pull in the Blue Archive-style presets
const mini: BannerDef = {
  id: "mini", name: "mini", cost: 1,
  tiers: [
    { id: "5", name: "5★", rate: 0.05, softPityStart: 6, softPityStep: 0.2, hardPity: 10, featured: { share: 0.5, guarantee: false, items: ["f1", "f2"] }, items: ["o"] },
    { id: "4", name: "4★", rate: 0, hardPity: 4, items: ["m"] },
    { id: "3", name: "3★", rate: 0, items: ["c"] },
  ],
  items: ["f1", "f2", "o", "m", "c"].map((id) => ({ id, name: id, kind: "resource" as const, resource: "x", amount: 1 })),
};

describe("2.0 reproduces 1.0 on converted banners (§6)", () => {
  const p = newProject();
  const banners = [simpleBanner(p.battle), rateUpBanner(p.battle), mini];
  for (const b of banners) {
    it(`${b.id}: identical pulls, distributions and long-run rates`, () => {
      const m = Gacha.modelFromBanner(b);
      expect(Gacha.validateModel(m).filter((i) => i.level === "error")).toEqual([]);
      const r1 = pullMany1(b, newGachaState(b), new Rng(9, "eq"), 2000);
      const r2 = Gacha.pullMany(m, Gacha.newState(m), new Rng(9, "eq"), 2000);
      expect(r2.map((x) => [x.tierId, x.itemId, x.featured])).toEqual(r1.map((x) => [x.tierId, x.itemId, x.featured]));
      const top = b.tiers[0]!;
      const modes = top.featured?.items.length ? (["tier", "featured"] as const) : (["tier"] as const);
      for (const mode of modes) {
        const d1 = targetDistribution1(b, { mode, copies: 2 });
        const d2 = Gacha.targetDistribution(m, { tier: top.id, mode, copies: 2 });
        expect(d2.pmf.length).toBe(d1.pmf.length);
        d2.pmf.forEach((x, i) => expect(Math.abs(x - d1.pmf[i]!)).toBeLessThan(1e-12));
        expect(d2.mean).toBeCloseTo(d1.mean, 9);
      }
      const lr1 = tierLongRunRates(b);
      Gacha.longRun(m).tiers.forEach((x, i) => expect(Math.abs(x - lr1[i]!)).toBeLessThan(1e-12));
    });
  }
});

describe("closed forms (§3)", () => {
  it("exchange model: geometric until the 200-point exchange", () => {
    const { model } = preset("floor-exchange");
    const d = Gacha.targetDistribution(model, { tier: "3", mode: "featured", copies: 1 });
    const q = 1 - p3;
    expect(d.pmf.length - 1).toBe(200);
    for (const n of [1, 2, 50, 199]) expect(d.pmf[n]).toBeCloseTo(Math.pow(q, n - 1) * p3, 14);
    expect(d.pmf[200]).toBeCloseTo(Math.pow(q, 199), 14);
    expect(d.mean).toBeCloseTo((1 - Math.pow(q, 200)) / p3, 9);
    expect(d.tail).toBe(0);
  });

  it("milestone model: half at pull 100, the rest guaranteed at 200", () => {
    const { model } = preset("floor-milestone");
    const d = Gacha.targetDistribution(model, { tier: "3", mode: "featured", copies: 1 });
    const q = 1 - p3;
    expect(d.pmf[99]).toBeCloseTo(Math.pow(q, 98) * p3, 14);
    expect(d.pmf[100]).toBeCloseTo(Math.pow(q, 99) * 0.5, 14);
    expect(d.pmf[150]).toBeCloseTo(Math.pow(q, 99) * 0.5 * Math.pow(q, 49) * p3, 14);
    expect(d.pmf[200]).toBeCloseTo(Math.pow(q, 99) * 0.5 * Math.pow(q, 99), 14);
    expect(d.pmf.length - 1).toBe(200);
  });

  it("batch floor: the 10th pull of a batch is ★2 or better", () => {
    const { model } = preset("floor-exchange");
    const ctx = Gacha.pullContext(model, { pts: 0, batch: 9 });
    expect(ctx.chances.map((x) => Number(x.toFixed(12)))).toEqual([0.03, 0.97, 0]);
    expect(ctx.floor).toBe(1);
    const st = Gacha.newState(model);
    const res = Gacha.pullMany(model, st, new Rng(3, "floor"), 10000);
    expect(res.filter((r, i) => i % 10 === 9 && r.tierId === "1")).toHaveLength(0);
    expect(res.filter((r, i) => i % 10 === 9 && r.forced).length).toBeGreaterThan(900);
  });

  it("exchange is a player action: points accumulate, 200 buy the featured item", () => {
    const { model } = preset("floor-exchange");
    const st = Gacha.newState(model);
    Gacha.pullMany(model, st, new Rng(1, "x"), 199);
    expect(Gacha.exchange(model, st, "lim3")).toBe(false);
    Gacha.pullMany(model, st, new Rng(1, "y"), 1);
    expect(st.vars.pts).toBe(200);
    expect(Gacha.exchange(model, st, "std3")).toBe(false);
    expect(Gacha.exchange(model, st, "lim3")).toBe(true);
    expect(st.vars.pts).toBe(0);
  });

  it("targets on any tier and one specific item", () => {
    const { model } = preset("soft-pity-5050");
    // One specific rate-up 4★ out of three: slower than "any rate-up 4★".
    const any = Gacha.targetDistribution(model, { tier: "4", mode: "featured", copies: 1 });
    const one = Gacha.targetDistribution(model, { tier: "4", mode: "item", itemId: "up4b", copies: 1 });
    expect(one.mean).toBeGreaterThan(any.mean);
    // 10 + guarantee 10; only a 5★ landing on a 4★-pity pull can push it further, which is rare.
    expect(any.pmf.slice(21).reduce((a, x) => a + x, 0)).toBeLessThan(0.01);
    expect(one.tail).toBeLessThan(1e-12);
  });

  it("moments of a geometric distribution and copies after n pulls", () => {
    const geo: Gacha.GachaModel = {
      version: 2, id: "g", name: "g", pull: { cost: 1, currency: "c", batchSize: 1 },
      tiers: [{ id: "a", name: "a", rate: 0.5, items: ["x"] }, { id: "b", name: "b", rate: 0, items: ["y"] }],
      items: [{ id: "x", name: "x", kind: "resource" }, { id: "y", name: "y", kind: "resource" }], modules: [],
    };
    const s = Gacha.summarize(Gacha.targetDistribution(geo, { tier: "a", mode: "tier", copies: 1 }, undefined, { epsilon: 1e-15 }));
    expect(s.mean).toBeCloseTo(2, 9);
    expect(s.variance).toBeCloseTo(2, 9);
    expect(s.skewness).toBeCloseTo(1.5 / Math.sqrt(0.5), 6);
    expect(s.hazard.slice(1, 4)).toEqual([0.5, 0.5, 0.5]);
    expect(Gacha.copiesAfter(geo, { tier: "a", mode: "tier", copies: 1 }, 2, 3)).toEqual([0.25, 0.5, 0.25, 0]);
  });
});

describe("epitomized / chosen item (§1.2, §2.3)", () => {
  // Weapon-banner style: 0.7%, soft pity from 63, hard 80, 75% featured with guarantee, two featured items.
  const weapon = (points: number): Gacha.GachaModel => ({
    version: 2, id: "w", name: "w", pull: { cost: 160, currency: "c", batchSize: 10 },
    tiers: [{ id: "5", name: "5★", rate: 0.007, items: ["std"] }, { id: "4", name: "4★", rate: 0.06, items: ["r4"] }, { id: "3", name: "3★", rate: 0, items: ["r3"] }],
    items: ["a", "b", "std", "r4", "r3"].map((id) => ({ id, name: id, kind: "resource" as const })),
    modules: [
      { kind: "softPity", tier: "5", start: 63, step: 0.07 },
      { kind: "hardPity", tier: "5", at: 80 },
      { kind: "featured", tier: "5", share: 0.75, items: ["a", "b"] },
      { kind: "guarantee", tier: "5" },
      { kind: "epitomized", tier: "5", item: "a", points },
    ],
  });

  it("guarantees the chosen item after enough misses", () => {
    const t: Gacha.Target = { tier: "5", mode: "item", itemId: "a", copies: 1 };
    expect(Gacha.validateModel(weapon(1))).toEqual([]);
    // Soft pity reaches 100% on pull 77 (0.007 + 15 × 0.07 ≥ 1), before the nominal hard pity of 80.
    expect(Gacha.worstCase(weapon(1), t)).toBe(154);
    expect(Gacha.worstCase(weapon(2), t)).toBe(231);
    // The other featured item has no guarantee.
    expect(Gacha.worstCase(weapon(1), { ...t, itemId: "b" })).toBeNull();
  });

  it("forced pick: featured, the chosen item, and no item roll", () => {
    const m = weapon(1);
    const st: Gacha.ModelState = { vars: { "since:5": 79, "guar:5": 0, "fate:5": 1 }, pulls: 0 };
    const r1 = new Rng(4, "epi");
    const out = Gacha.pull(m, st, r1);
    expect(out).toMatchObject({ tierId: "5", itemId: "a", featured: true });
    expect(st.vars["fate:5"]).toBe(0);
    const r2 = new Rng(4, "epi");
    r2.next(); // only the tier roll was used
    expect(r1.next()).toBe(r2.next());
  });

  it("a 5★ is the chosen item with 0.75 × ½; exact and sampled means agree", () => {
    const m = weapon(1);
    const t: Gacha.Target = { tier: "5", mode: "item", itemId: "a", copies: 1 };
    const br = Gacha.pullBranches(m, { "since:5": 79, "guar:5": 0, "fate:5": 0 }).filter((b) => b.tier === 0);
    expect(br.map((b) => [b.featured, b.chosen, Number(b.p.toFixed(12))])).toEqual([[true, true, 0.375], [true, false, 0.375], [false, false, 0.25]]);
    const exact = Gacha.targetDistribution(m, t);
    const mc = Gacha.simulateTarget(m, t, 4000, 21);
    expect(exact.mean).toBeGreaterThan(mc.meanCi[0] - 2);
    expect(exact.mean).toBeLessThan(mc.meanCi[1] + 2);
    const bad = { ...m, modules: [...m.modules.slice(0, 4), { kind: "epitomized" as const, tier: "5", item: "std", points: 1 }] };
    expect(Gacha.validateModel(bad).map((i) => i.message)).toEqual(["定軌的物品必須是限定物品之一"]);
  });
});

describe("guaranteed worst case (§3.6)", () => {
  it("matches the pity structure, and is null without a guarantee", () => {
    const wc = (id: string, copies = 1) => { const p = preset(id); return Gacha.worstCase(p.model, { ...p.target, copies }); };
    expect(wc("soft-pity-5050")).toBe(180);
    expect(wc("soft-pity-5050", 2)).toBe(360);
    expect(wc("floor-exchange")).toBe(200);
    expect(wc("floor-milestone")).toBe(200);
    const { model } = preset("soft-pity-5050");
    expect(Gacha.worstCase(model, { tier: "5", mode: "featured", copies: 1 }, { vars: { "since:5": 30, "guar:5": 1 }, pulls: 0 })).toBe(60);
    const noG = preset("soft-pity-5050").model;
    noG.modules = noG.modules.filter((x) => !(x.kind === "guarantee" && x.tier === "5"));
    expect(Gacha.worstCase(noG, { tier: "5", mode: "featured", copies: 1 })).toBeNull();
    // Exchange model without the exchange: no ceiling.
    const p = preset("floor-exchange");
    expect(Gacha.worstCase(p.model, { ...p.target, useExchange: false })).toBeNull();
  });
});

describe("cost (§5)", () => {
  it("cheapest packs with first-purchase bonuses", () => {
    const t = Gacha.topUpTable(Gacha.EXAMPLE_PACKS, 20000);
    const price = (need: number) => t.price[Math.ceil(need / t.unit)];
    expect(price(0)).toBe(0);
    expect(price(160)).toBe(60); // 30 (first, 120) + 30 (60) = 180 ≥ 160
    expect(t.plan(160)).toEqual({ p30: 1, "p30#first": 1 });
    expect(price(120)).toBe(30);
    const { model } = preset("floor-exchange");
    expect(Gacha.currencyFor(model, 25, { currency: 100, freePulls: 10 })).toBe(15 * 120 - 100);
  });

  it("spend percentiles follow pull percentiles", () => {
    const { model, packs } = preset("floor-exchange");
    const d = Gacha.targetDistribution(model, { tier: "3", mode: "featured", copies: 1 });
    const sp = Gacha.spend(model, d, packs);
    const t = Gacha.topUpTable(packs, Gacha.currencyFor(model, 200));
    expect(sp.max).toBe(Gacha.priceFor(model, t, 200));
    expect(sp.p50).toBeLessThanOrEqual(sp.p90);
    expect(sp.mean).toBeGreaterThan(0);
  });
});

describe("Monte Carlo agrees with the exact chain", () => {
  for (const id of ["soft-pity-5050", "floor-exchange", "floor-milestone"]) {
    it(id, () => {
      const { model, target } = preset(id);
      const exact = Gacha.targetDistribution(model, target);
      const mc = Gacha.simulateTarget(model, target, 4000, 11);
      expect(exact.mean).toBeGreaterThan(mc.meanCi[0] - 2);
      expect(exact.mean).toBeLessThan(mc.meanCi[1] + 2);
    });
  }
});

describe("validation", () => {
  it("flags broken modules", () => {
    const { model } = preset("soft-pity-5050");
    model.modules.push({ kind: "guarantee", tier: "3" }, { kind: "hardPity", tier: "5", at: 80 }, { kind: "batchFloor", slot: 11, minTier: "4" });
    expect(Gacha.validateModel(model).filter((i) => i.level === "error").map((i) => i.message)).toEqual([
      "大保底需要同一稀有度的限定規則",
      "硬保底重複設定（規則 2 與 10）",
      "連抽保底的位置必須在 1 到 10 之間",
    ]);
  });
});
