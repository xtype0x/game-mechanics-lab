/**
 * Gacha rules and exact analysis (docs/spec/gacha.md). Pure functions; randomness only through Rng.
 */
import { Rng } from "../rng";
import type { BannerDef, GachaItem, GachaState, GachaTier, PullResult } from "./types";

/** Version of docs/spec/gacha.md; carried by vectors/gacha.json. */
export const GACHA_RULES_VERSION = "1.0.0";

export class GachaError extends Error {}

// ---------------------------------------------------------------------------
// §2 Pull rules
// ---------------------------------------------------------------------------

/** Chance of hitting `tier` on a pull whose counter value is c (1-based), ignoring higher tiers (§2.1). */
export function tierRate(tier: GachaTier, c: number): number {
  if (tier.hardPity && tier.hardPity > 0 && c >= tier.hardPity) return 1;
  let r = tier.rate;
  if (tier.softPityStart && tier.softPityStart > 0 && c >= tier.softPityStart) r = r + (c - tier.softPityStart + 1) * (tier.softPityStep ?? 0);
  return Math.min(1, Math.max(0, r));
}

/**
 * Selection probability of each tier given every tier's counter value for this pull (§2.2): tiers are
 * tried highest first against one shared roll, so a tier gets min(1, acc) − min(1, previous acc).
 */
export function tierChances(banner: BannerDef, counters: number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  let prev = 0;
  banner.tiers.forEach((t, i) => {
    if (i === banner.tiers.length - 1) { out.push(1 - prev); return; }
    acc = acc + tierRate(t, counters[i]!);
    const cur = Math.min(1, acc);
    out.push(cur - prev);
    prev = cur;
  });
  return out;
}

export function newGachaState(banner: BannerDef): GachaState {
  return {
    counters: Object.fromEntries(banner.tiers.map((t) => [t.id, 0])),
    guaranteed: Object.fromEntries(banner.tiers.filter((t) => t.featured).map((t) => [t.id, false])),
    pulls: 0,
  };
}

/** One pull (§2). Mutates `state`; consumes rng as specified. */
export function pullOnce(banner: BannerDef, state: GachaState, rng: Rng): PullResult {
  const tiers = banner.tiers;
  if (!tiers.length) throw new GachaError("卡池沒有任何稀有度");
  const cs = tiers.map((t) => (state.counters[t.id] ?? 0) + 1);
  // 1. Tier: one roll, highest tier first.
  const u = rng.next();
  let chosen = tiers.length - 1;
  let acc = 0;
  for (let i = 0; i < tiers.length - 1; i++) {
    acc = acc + tierRate(tiers[i]!, cs[i]!);
    if (u < acc) { chosen = i; break; }
  }
  // 2. Counters: the hit tier resets, every other tier keeps counting.
  tiers.forEach((t, i) => { state.counters[t.id] = i === chosen ? 0 : cs[i]!; });
  state.pulls++;
  // 3. Featured split, 4. item.
  const tier = tiers[chosen]!;
  const f = tier.featured;
  let featured = false;
  if (f && f.items.length) {
    if (state.guaranteed[tier.id] || !tier.items.length) featured = true;
    else featured = rng.next() < f.share;
    state.guaranteed[tier.id] = featured ? false : f.guarantee;
  }
  const pool = featured ? f!.items : tier.items;
  if (!pool.length) throw new GachaError(`稀有度「${tier.name}」沒有任何物品`);
  const itemId = pool[rng.int(pool.length)]!;
  return { tierId: tier.id, itemId, featured, pity: cs[chosen]! };
}

export function pullMany(banner: BannerDef, state: GachaState, rng: Rng, n: number): PullResult[] {
  return Array.from({ length: n }, () => pullOnce(banner, state, rng));
}

export function itemOf(banner: BannerDef, id: string): GachaItem | undefined {
  return banner.items.find((x) => x.id === id);
}

// ---------------------------------------------------------------------------
// §3 Exact analysis
// ---------------------------------------------------------------------------

/**
 * Number of counter states that matter (§3.1): beyond `cap` the tier's rate no longer changes.
 * Counter states are 0..cap−1; a counter that would reach cap stays at cap − 1.
 */
export function tierCap(tier: GachaTier): number {
  if (tier.hardPity && tier.hardPity > 0) return tier.hardPity;
  const start = tier.softPityStart ?? 0;
  const step = tier.softPityStep ?? 0;
  if (start > 0 && step > 0) {
    let c = start;
    while (tierRate(tier, c) < 1 && c < 100000) c++;
    return c;
  }
  return start > 0 ? start : 1;
}

export interface TargetSpec {
  /** "tier": any hit of the top tier; "featured": any featured item of it; "item": one featured item. */
  mode: "tier" | "featured" | "item";
  itemId?: string;
  /** Copies wanted (≥ 1). */
  copies: number;
}

export interface PullDistribution {
  /** pmf[n] = P(target reached exactly on pull n); pmf[0] = 0. */
  pmf: number[];
  /** cdf[n] = P(target reached within n pulls). */
  cdf: number[];
  /** Probability not yet reached after the last computed pull. */
  tail: number;
  mean: number;
}

/**
 * Exact distribution of pulls needed to reach a top-tier target (§3.2). The top tier never depends on lower
 * tiers, so the state is (counter, guaranteed, copies). `start` defaults to a fresh banner.
 */
export function targetDistribution(banner: BannerDef, target: TargetSpec, start?: GachaState, opts: { maxPulls?: number; epsilon?: number } = {}): PullDistribution {
  const top = banner.tiers[0];
  if (!top) throw new GachaError("卡池沒有任何稀有度");
  const copies = Math.max(1, Math.floor(target.copies));
  const cap = tierCap(top);
  const f = top.featured && top.featured.items.length ? top.featured : undefined;
  if (target.mode !== "tier" && !f) throw new GachaError(`「${top.name}」沒有限定物品，無法以限定為目標`);
  const nF = f ? f.items.length : 1;
  if (target.mode === "item" && !f!.items.includes(target.itemId ?? "")) throw new GachaError("目標物品不在限定清單中");
  const offEmpty = !top.items.length;
  const maxPulls = opts.maxPulls ?? 100000;
  const eps = opts.epsilon ?? 1e-12;

  // mass[(k * 2 + g) * cap + c]
  const size = copies * 2 * cap;
  let mass = new Array<number>(size).fill(0);
  const c0 = Math.min(start?.counters[top.id] ?? 0, cap - 1);
  const g0 = start?.guaranteed[top.id] ? 1 : 0;
  mass[g0 * cap + c0] = 1;
  const pmf = [0];
  let remaining = 1;
  let mean = 0;
  for (let n = 1; n <= maxPulls && remaining > eps; n++) {
    const next = new Array<number>(size).fill(0);
    let done = 0;
    for (let k = 0; k < copies; k++) {
      for (let g = 0; g < 2; g++) {
        for (let c = 0; c < cap; c++) {
          const m = mass[(k * 2 + g) * cap + c]!;
          if (m === 0) continue;
          const h = tierRate(top, c + 1);
          const cn = Math.min(c + 1, cap - 1);
          if (h < 1) next[(k * 2 + g) * cap + cn] = next[(k * 2 + g) * cap + cn]! + m * (1 - h);
          if (h <= 0) continue;
          const hit = m * h;
          // Branches of one hit: [probability, success, guaranteed afterwards].
          const branches: [number, boolean, number][] = [];
          if (!f) branches.push([1, true, 0]);
          else {
            const pFeat = g === 1 || offEmpty ? 1 : f.share;
            const gAfterOff = f.guarantee ? 1 : 0;
            if (target.mode === "tier") branches.push([pFeat, true, 0], [1 - pFeat, true, gAfterOff]);
            else if (target.mode === "featured") branches.push([pFeat, true, 0], [1 - pFeat, false, gAfterOff]);
            else branches.push([pFeat / nF, true, 0], [pFeat - pFeat / nF, false, 0], [1 - pFeat, false, gAfterOff]);
          }
          for (const [p, ok, gn] of branches) {
            if (p <= 0) continue;
            const kn = ok ? k + 1 : k;
            if (kn >= copies) done = done + hit * p;
            else next[(kn * 2 + gn) * cap + 0] = next[(kn * 2 + gn) * cap + 0]! + hit * p;
          }
        }
      }
    }
    pmf.push(done);
    mean = mean + n * done;
    remaining = remaining - done;
    mass = next;
  }
  const cdf: number[] = [];
  let s = 0;
  for (const p of pmf) { s = s + p; cdf.push(s); }
  return { pmf, cdf, tail: Math.max(0, remaining), mean };
}

/**
 * Guaranteed maximum number of pulls for a top-tier target (§3.6), or null when luck can delay it forever
 * (no hard pity, a 50/50 without guarantee, or one specific item among several featured ones).
 */
export function worstCasePulls(banner: BannerDef, target: TargetSpec, start?: GachaState): number | null {
  const top = banner.tiers[0];
  const H = top?.hardPity;
  if (!top || !H || H <= 0) return null;
  const copies = Math.max(1, Math.floor(target.copies));
  const f = top.featured && top.featured.items.length ? top.featured : undefined;
  const g0 = !!start?.guaranteed[top.id];
  const alwaysFeatured = !f || !top.items.length || f.share >= 1;
  let hits: number;
  if (target.mode === "tier") hits = copies;
  else if (target.mode === "item" && f && f.items.length > 1) return null;
  else if (alwaysFeatured) hits = copies;
  else if (!f!.guarantee) return null;
  else hits = 2 * copies - (g0 ? 1 : 0);
  return hits * H - Math.min(start?.counters[top.id] ?? 0, H - 1);
}

/** Smallest n with cdf[n] ≥ q, or −1 if not reached within the computed range. */
export function percentile(d: PullDistribution, q: number): number {
  const i = d.cdf.findIndex((v) => v >= q - 1e-12);
  return i;
}

/** P(target reached within `pulls`). */
export function chanceWithin(d: PullDistribution, pulls: number): number {
  if (pulls <= 0) return 0;
  return d.cdf[Math.min(pulls, d.cdf.length - 1)] ?? 0;
}

/**
 * Long-run share of pulls that land in each tier, counting pity (§3.3). Joint chain over all non-last tiers'
 * counters; solved by iterating the lazy chain (P + I) / 2 from the fresh state until the largest change
 * is below 1e-15 or 200000 steps.
 */
export function tierLongRunRates(banner: BannerDef): number[] {
  const tiers = banner.tiers;
  const k = tiers.length - 1;
  if (k <= 0) return tiers.map(() => 1);
  const caps = tiers.slice(0, k).map(tierCap);
  const total = caps.reduce((a, c) => a * c, 1);
  if (total > 2_000_000) throw new GachaError("保底狀態太多，無法精確計算綜合機率");
  const decode = (idx: number) => { const cs: number[] = []; for (let i = k - 1; i >= 0; i--) { cs[i] = idx % caps[i]!; idx = Math.floor(idx / caps[i]!); } return cs; };
  const encode = (cs: number[]) => cs.reduce((a, c, i) => a * caps[i]! + c, 0);
  // Precompute transitions as flat arrays: state s, tier t → probability P[s·n + t], next state TO[s·n + t].
  const n = tiers.length;
  const P = new Float64Array(total * n);
  const TO = new Int32Array(total * n);
  for (let s = 0; s < total; s++) {
    const cs = decode(s);
    const p = tierChances(banner, [...cs.map((c) => c + 1), 1]);
    for (let t = 0; t < n; t++) {
      P[s * n + t] = p[t]!;
      TO[s * n + t] = encode(cs.map((c, i) => (i === t ? 0 : Math.min(c + 1, caps[i]! - 1))));
    }
  }
  let pi = new Float64Array(total);
  let next = new Float64Array(total);
  pi[0] = 1;
  for (let step = 0; step < 200000; step++) {
    for (let s = 0; s < total; s++) next[s] = pi[s]! / 2;
    for (let s = 0; s < total; s++) {
      const m = pi[s]! / 2;
      if (m === 0) continue;
      for (let t = 0; t < n; t++) {
        const p = P[s * n + t]!;
        if (p > 0) next[TO[s * n + t]!] = next[TO[s * n + t]!]! + m * p;
      }
    }
    let diff = 0;
    for (let s = 0; s < total; s++) diff = Math.max(diff, Math.abs(next[s]! - pi[s]!));
    [pi, next] = [next, pi];
    if (diff < 1e-15) break;
  }
  return tiers.map((_, t) => { let a = 0; for (let s = 0; s < total; s++) a = a + pi[s]! * P[s * n + t]!; return a; });
}

/** Long-run share of a tier's hits that are featured (§3.4): 1 / (2 − s) with the guarantee, s without. */
export function featuredShare(tier: GachaTier): number {
  const f = tier.featured;
  if (!f || !f.items.length) return 0;
  if (!tier.items.length) return 1;
  return f.guarantee ? 1 / (2 - f.share) : f.share;
}

export interface DisclosureRow {
  tierId: string;
  tierName: string;
  itemId: string;
  itemName: string;
  featured: boolean;
  /** Per-pull chance with no pity progress (base rate × share). */
  base: number;
  /** Long-run per-pull chance including pity and guarantees. */
  consolidated: number;
}

export interface Disclosure {
  rows: DisclosureRow[];
  tiers: { id: string; name: string; base: number; consolidated: number; pity: string[] }[];
}

/** Probability table for every item (§3.5). Base rates of the last tier are 1 − the other base rates. */
export function disclosure(banner: BannerDef): Disclosure {
  const longRun = tierLongRunRates(banner);
  const baseRates = tierChances(banner, banner.tiers.map(() => 1));
  const name = (id: string) => itemOf(banner, id)?.name ?? id;
  const rows: DisclosureRow[] = [];
  const tiers = banner.tiers.map((t, i) => {
    const fs = featuredShare(t);
    const baseFs = t.featured && t.featured.items.length ? (t.items.length ? t.featured.share : 1) : 0;
    const add = (ids: string[], featured: boolean, shareBase: number, shareLong: number) => {
      for (const id of ids) rows.push({ tierId: t.id, tierName: t.name, itemId: id, itemName: name(id), featured, base: (baseRates[i]! * shareBase) / ids.length, consolidated: (longRun[i]! * shareLong) / ids.length });
    };
    if (t.featured?.items.length) add(t.featured.items, true, baseFs, fs);
    add(t.items, false, 1 - baseFs, 1 - fs);
    const pity: string[] = [];
    if (t.softPityStart && t.softPityStep) pity.push(`第 ${t.softPityStart} 抽起，每抽機率增加 ${fmtPct(t.softPityStep)}`);
    if (t.hardPity) pity.push(`連續 ${t.hardPity - 1} 抽未獲得時，第 ${t.hardPity} 抽必定獲得`);
    if (t.featured?.items.length && t.items.length) pity.push(`獲得時有 ${fmtPct(t.featured.share)} 為限定${t.featured.guarantee ? "；若不是限定，下一次必定為限定" : ""}`);
    return { id: t.id, name: t.name, base: baseRates[i]!, consolidated: longRun[i]!, pity };
  });
  return { rows, tiers };
}

const fmtPct = (x: number) => `${Number((x * 100).toFixed(4))}%`;
