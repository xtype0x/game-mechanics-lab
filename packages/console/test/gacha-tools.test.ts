import { disclosure, loadProject, newProject, rateUpBanner } from "@ggt/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXACT_STATE_LIMIT, SAMPLE_PULLS, pityStates, safeDisclosure } from "../src/tools/gacha/common";

describe("safeDisclosure", () => {
  it("is exact (identical to disclosure) for ordinary banners", () => {
    const b = rateUpBanner(newProject().battle);
    expect(pityStates(b)).toBe(900);
    const d = safeDisclosure(b, 1);
    expect(d.exact).toBe(true);
    const { exact: _e, states: _s, ...rest } = d;
    expect(rest).toEqual(disclosure(b));
  });

  it("falls back to sampling for the M6 spark banner instead of freezing", () => {
    const p = loadProject(JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "examples", "m6-extension.json"), "utf8")));
    const b = p.gacha.banners.find((x) => x.id === "spark")!;
    expect(pityStates(b)).toBeGreaterThan(EXACT_STATE_LIMIT);
    const t = performance.now();
    const d = safeDisclosure(b, 1);
    expect(performance.now() - t).toBeLessThan(5000);
    expect(d.exact).toBe(false);
    // The spark is a deterministic counter: exactly one hit per 200 pulls in the long run.
    expect(d.tiers[0]!.consolidated).toBeCloseTo(Math.floor(SAMPLE_PULLS / 200) / SAMPLE_PULLS, 12);
    expect(d.tiers[0]!.base).toBe(0);
    expect(d.rows.reduce((a, r) => a + r.consolidated, 0)).toBeCloseTo(1, 12);
    expect(d.rows.reduce((a, r) => a + r.base, 0)).toBeCloseTo(1, 12);
    // Without the spark tier the 5★ long-run rate is 1.605%; the spark adds 0.5% on top, roughly.
    const fives = d.tiers.find((x) => x.id === "5")!.consolidated;
    expect(Math.abs(fives - 0.016)).toBeLessThan(0.002);
  });
});
