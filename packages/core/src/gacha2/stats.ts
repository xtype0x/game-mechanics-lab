/**
 * Summary statistics of pull-count distributions and Monte Carlo cross-checks (docs/spec/gacha2.md §4).
 */
import { Rng } from "../rng";
import type { Distribution, Target } from "./chain";
import { exchange, modOf, newState, pull } from "./engine";
import type { GachaModel, ModelState } from "./model";

export interface Summary {
  mean: number;
  variance: number;
  sd: number;
  /** Third standardized moment. */
  skewness: number;
  /** Smallest n with cdf[n] ≥ q (−1 if not reached in the computed range). */
  percentiles: Record<"p10" | "p25" | "p50" | "p75" | "p90" | "p95" | "p99", number>;
  /** Largest n with pmf[n] > 0 (the guaranteed worst case when tail = 0). */
  max: number;
  /** hazard[n] = P(finish on pull n | not finished before n). */
  hazard: number[];
  tail: number;
}

export function percentileOf(d: Pick<Distribution, "cdf">, q: number): number {
  return d.cdf.findIndex((v) => v >= q - 1e-12);
}

export function summarize(d: Distribution): Summary {
  let m2 = 0, m3 = 0;
  d.pmf.forEach((p, n) => { const x = n - d.mean; m2 = m2 + p * x * x; m3 = m3 + p * x * x * x; });
  const sd = Math.sqrt(m2);
  let max = 0;
  d.pmf.forEach((p, n) => { if (p > 0) max = n; });
  const hazard = d.pmf.map((p, n) => { const alive = n === 0 ? 1 : 1 - d.cdf[n - 1]!; return alive > 1e-15 ? p / alive : 0; });
  const q = (x: number) => percentileOf(d, x);
  return {
    mean: d.mean, variance: m2, sd, skewness: sd > 0 ? m3 / (sd * sd * sd) : 0,
    percentiles: { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95), p99: q(0.99) },
    max, hazard, tail: d.tail,
  };
}

export interface MonteCarlo {
  runs: number;
  /** Pulls each run needed (maxPulls + 1 when it did not finish). */
  pulls: Int32Array;
  mean: number;
  /** 95% confidence interval of the mean (normal approximation). */
  meanCi: [number, number];
}

/**
 * Plays the model `runs` times until the target is complete, spending exchange points on the target as soon as
 * they suffice (the same policy as the exact analysis). One rng stream for all runs.
 */
export function simulateTarget(m: GachaModel, target: Target, runs: number, seed: number | string, opts: { start?: ModelState; maxPulls?: number } = {}): MonteCarlo {
  const rng = new Rng(seed, "gacha2.mc");
  const maxPulls = opts.maxPulls ?? 100000;
  const ex = modOf(m, "exchange");
  const exItem = ex && target.useExchange !== false ? exchangeItemFor(m, target) : undefined;
  const pulls = new Int32Array(runs);
  let sum = 0, sum2 = 0;
  for (let r = 0; r < runs; r++) {
    const st: ModelState = opts.start ? { vars: { ...newState(m).vars, ...opts.start.vars }, pulls: 0 } : newState(m);
    let got = 0, n = 0;
    while (exItem && got < target.copies && exchange(m, st, exItem)) got++;
    while (got < target.copies && n < maxPulls) {
      n++;
      const o = pull(m, st, rng);
      if (o.tierId === target.tier && (target.mode === "tier" || (target.mode === "featured" && o.featured) || (target.mode === "item" && o.itemId === target.itemId))) got++;
      while (exItem && got < target.copies && exchange(m, st, exItem)) got++;
    }
    const v = got >= target.copies ? n : maxPulls + 1;
    pulls[r] = v;
    sum += v;
    sum2 += v * v;
  }
  const mean = sum / runs;
  const sd = Math.sqrt(Math.max(0, sum2 / runs - mean * mean));
  const h = (1.96 * sd) / Math.sqrt(runs);
  return { runs, pulls, mean, meanCi: [mean - h, mean + h] };
}

function exchangeItemFor(m: GachaModel, target: Target): string | undefined {
  const ex = modOf(m, "exchange")!;
  if (target.mode === "item") return ex.items.includes(target.itemId ?? "") ? target.itemId : undefined;
  if (target.mode === "featured") {
    const f = modOf(m, "featured", target.tier);
    return ex.items.find((id) => f?.items.includes(id));
  }
  return undefined;
}

/** Wilson score interval for a proportion k/n at 95%. */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96, p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
