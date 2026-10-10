/**
 * Exact analysis of gacha 2.0 models as finite Markov chains (docs/spec/gacha2.md §3). Counters are capped
 * where the rules stop changing, so every model with bounded pity has finitely many states.
 */
import { GachaModelError, modOf, nextVars, pullContext, stateVars, tierRate } from "./engine";
import type { GachaModel, ModelState } from "./model";

/** Number of values a counter can take in analysis (§3.1). Values ≥ cap − 1 behave the same. */
export function varDomain(m: GachaModel, v: string): number {
  const [kind, id] = v.split(":") as [string, string | undefined];
  const ti = m.tiers.findIndex((t) => t.id === id);
  switch (kind) {
    case "since": {
      const hard = modOf(m, "hardPity", id);
      if (hard && hard.at > 0) return hard.at;
      const soft = modOf(m, "softPity", id);
      if (soft && soft.start > 0 && soft.step > 0) {
        let c = soft.start;
        while (tierRate(m, ti, c) < 1 && c < 100000) c++;
        return c;
      }
      return soft && soft.start > 0 ? soft.start : 1;
    }
    case "guar": return 2;
    case "fate": return modOf(m, "epitomized", id)!.points + 1;
    case "miss": return Math.max(...modOf(m, "milestone", id)!.steps.map((s) => s.at)) + 1;
    case "pts": return modOf(m, "exchange")!.cost;
    case "batch": return m.pull.batchSize;
  }
  throw new GachaModelError(`未知的計數器 ${v}`);
}

/** Keep each counter inside its analysis domain. */
function capVars(m: GachaModel, vars: Record<string, number>, names: string[], domains: number[]): Record<string, number> {
  const out = { ...vars };
  names.forEach((v, i) => { if (v !== "pts") out[v] = Math.min(out[v] ?? 0, domains[i]! - 1); });
  return out;
}

export interface Branch {
  p: number;
  tier: number;
  featured: boolean;
  /** Tiers with an epitomized item: whether the hit is that item. */
  chosen?: boolean;
}

/** One pull from a counter state, split into (tier, featured[, chosen]) branches with probabilities (§3.2). */
export function pullBranches(m: GachaModel, vars: Record<string, number>): Branch[] {
  const ctx = pullContext(m, vars);
  const out: Branch[] = [];
  ctx.chances.forEach((c, i) => {
    if (c <= 0) return;
    const f = ctx.featured[i];
    if (!f) { out.push({ p: c, tier: i, featured: false }); return; }
    if (f.chosen !== undefined) {
      if (f.chosenForced) { out.push({ p: c, tier: i, featured: true, chosen: true }); return; }
      const pf = f.forced ? 1 : Math.min(1, Math.max(0, f.share));
      const k = 1 / f.items.length;
      if (pf > 0) out.push({ p: c * pf * k, tier: i, featured: true, chosen: true });
      if (pf > 0 && k < 1) out.push({ p: c * pf * (1 - k), tier: i, featured: true, chosen: false });
      if (pf < 1) out.push({ p: c * (1 - pf), tier: i, featured: false, chosen: false });
      return;
    }
    const pf = f.forced ? 1 : Math.min(1, Math.max(0, f.share));
    if (pf > 0) out.push({ p: c * pf, tier: i, featured: true });
    if (pf < 1) out.push({ p: c * (1 - pf), tier: i, featured: false });
  });
  return out;
}

// ---------------------------------------------------------------------------
// §3.3 Target distribution
// ---------------------------------------------------------------------------

export interface Target {
  tier: string;
  /** "tier": any hit of the tier; "featured": any featured item of it; "item": one specific item of it. */
  mode: "tier" | "featured" | "item";
  itemId?: string;
  copies: number;
  /** Spend exchange points on the target as soon as they suffice (default true). */
  useExchange?: boolean;
}

export interface Distribution {
  /** pmf[n] = P(target completed exactly on pull n); pmf[0] = P(already complete) = 0. */
  pmf: number[];
  cdf: number[];
  /** Probability still incomplete after the last computed pull. */
  tail: number;
  /** Σ n · pmf[n] (excluding tail). */
  mean: number;
  states: number;
}

/** Counters that can change the target tier's probability or its featured split (§3.3). */
export function relevantVars(m: GachaModel, target: Target): string[] {
  const t = m.tiers.findIndex((x) => x.id === target.tier);
  const mileTier = (id: string) => !!modOf(m, "milestone", id);
  const firstMile = m.tiers.findIndex((x) => mileTier(x.id));
  return stateVars(m).filter((v) => {
    const [kind, id] = v.split(":") as [string, string | undefined];
    const i = m.tiers.findIndex((x) => x.id === id);
    if (kind === "since") return i <= t || mileTier(id!);
    if (kind === "guar") return i === t || mileTier(id!);
    if (kind === "miss") return true;
    if (kind === "fate") return i === t;
    if (kind === "pts") return target.useExchange !== false && exchangeCovers(m, target);
    if (kind === "batch") {
      const k = m.tiers.findIndex((x) => x.id === modOf(m, "batchFloor")!.minTier);
      return k <= t || (firstMile >= 0 && k <= Math.max(...m.tiers.map((x, j) => (mileTier(x.id) ? j : -1))));
    }
    return true;
  });
}

function exchangeCovers(m: GachaModel, target: Target): boolean {
  const ex = modOf(m, "exchange");
  if (!ex || target.mode === "tier") return false;
  if (target.mode === "item") return ex.items.includes(target.itemId ?? "");
  const f = modOf(m, "featured", target.tier);
  return !!f && ex.items.some((id) => f.items.includes(id));
}

/** Chance that one hit of the target tier (one branch) counts as a copy. */
function successChance(m: GachaModel, target: Target, b: Branch): number {
  if (target.mode === "tier") return 1;
  if (target.mode === "featured") return b.featured ? 1 : 0;
  const id = target.itemId ?? "";
  const epi = modOf(m, "epitomized", target.tier);
  if (b.chosen === true) return id === epi?.item ? 1 : 0;
  let pool = b.featured ? modOf(m, "featured", target.tier)!.items : m.tiers.find((x) => x.id === target.tier)!.items;
  if (b.featured && b.chosen === false && epi) pool = pool.filter((x) => x !== epi.item);
  return pool.includes(id) ? 1 / pool.length : 0;
}

interface Table {
  names: string[];
  size: number;
  /** Per state: flat [p, to, gain, p, to, gain, …]. gain = copies added (success and/or exchange). */
  edges: Float64Array[];
}

function buildTable(m: GachaModel, target: Target, maxStates: number): Table {
  const t = m.tiers.findIndex((x) => x.id === target.tier);
  if (t < 0) throw new GachaModelError(`目標稀有度「${target.tier}」不存在`);
  if (target.mode === "featured" && !modOf(m, "featured", target.tier)?.items.length) throw new GachaModelError("目標稀有度沒有限定物品");
  const names = relevantVars(m, target);
  const domains = names.map((v) => varDomain(m, v));
  const size = domains.reduce((a, d) => a * d, 1);
  if (size > maxStates) throw new GachaModelError(`狀態太多（${size.toLocaleString()}），無法精確計算`);
  const ex = names.includes("pts") ? modOf(m, "exchange")! : null;
  const decode = (idx: number) => { const v: Record<string, number> = {}; for (let i = names.length - 1; i >= 0; i--) { v[names[i]!] = idx % domains[i]!; idx = Math.floor(idx / domains[i]!); } return v; };
  const encode = (v: Record<string, number>) => names.reduce((a, n, i) => a * domains[i]! + v[n]!, 0);
  const edges: Float64Array[] = [];
  for (let s = 0; s < size; s++) {
    const vars = decode(s);
    const list: number[] = [];
    for (const b of pullBranches(m, vars)) {
      let nv = capVars(m, pick(nextVars(m, vars, b.tier, b.featured, b.chosen === true), names), names, domains);
      let exGain = 0;
      while (ex && nv.pts! >= ex.cost) { nv = { ...nv, pts: nv.pts! - ex.cost }; exGain++; }
      const to = encode(nv);
      const sc = b.tier === t ? successChance(m, target, b) : 0;
      if (sc > 0) list.push(b.p * sc, to, 1 + exGain);
      if (sc < 1) list.push(b.p * (1 - sc), to, exGain);
    }
    edges.push(Float64Array.from(list));
  }
  return { names, size, edges };
}

const pick = (v: Record<string, number>, names: string[]) => Object.fromEntries(names.map((n) => [n, v[n] ?? 0]));

/**
 * Exact distribution of pulls until `target.copies` copies (§3.3). `start` sets the current counters.
 * Iterates until the remaining probability is ≤ epsilon or maxPulls.
 */
export function targetDistribution(m: GachaModel, target: Target, start?: ModelState, opts: { maxPulls?: number; epsilon?: number; maxStates?: number } = {}): Distribution {
  const copies = Math.max(1, Math.floor(target.copies));
  const tb = buildTable(m, target, opts.maxStates ?? 200000);
  const domains = tb.names.map((v) => varDomain(m, v));
  const init = capVars(m, pick(start?.vars ?? {}, tb.names), tb.names, domains);
  let initCopies = 0;
  if (init.pts !== undefined) {
    const ex = modOf(m, "exchange")!;
    // Points already enough at the start are spent right away.
    while (init.pts >= ex.cost && initCopies < copies) { init.pts -= ex.cost; initCopies++; }
    init.pts = Math.min(init.pts, ex.cost - 1);
  }
  const maxPulls = opts.maxPulls ?? 100000;
  const eps = opts.epsilon ?? 1e-12;
  const pmf = [0];
  if (initCopies >= copies) return { pmf: [1], cdf: [1], tail: 0, mean: 0, states: tb.size };
  let mass = new Float64Array(copies * tb.size);
  mass[initCopies * tb.size + tb.names.reduce((a, n, i) => a * domains[i]! + init[n]!, 0)] = 1;
  let remaining = 1;
  let mean = 0;
  for (let n = 1; n <= maxPulls && remaining > eps; n++) {
    const next = new Float64Array(copies * tb.size);
    let done = 0;
    for (let k = 0; k < copies; k++) {
      for (let s = 0; s < tb.size; s++) {
        const w = mass[k * tb.size + s]!;
        if (w === 0) continue;
        const e = tb.edges[s]!;
        for (let j = 0; j < e.length; j += 3) {
          const kn = k + e[j + 2]!;
          const q = w * e[j]!;
          if (kn >= copies) done = done + q;
          else next[kn * tb.size + e[j + 1]!] = next[kn * tb.size + e[j + 1]!]! + q;
        }
      }
    }
    pmf.push(done);
    mean = mean + n * done;
    remaining = remaining - done;
    mass = next;
  }
  const cdf: number[] = [];
  let acc = 0;
  for (const p of pmf) { acc = acc + p; cdf.push(acc); }
  return { pmf, cdf, tail: Math.max(0, remaining), mean, states: tb.size };
}

/**
 * Guaranteed maximum pulls to complete the target (§3.6): the longest path through edges with positive
 * probability, or null when some cycle can avoid completion forever (no guarantee).
 */
export function worstCase(m: GachaModel, target: Target, start?: ModelState, maxStates = 200000): number | null {
  const copies = Math.max(1, Math.floor(target.copies));
  const tb = buildTable(m, target, maxStates);
  const domains = tb.names.map((v) => varDomain(m, v));
  const init = capVars(m, pick(start?.vars ?? {}, tb.names), tb.names, domains);
  let k0 = 0;
  if (init.pts !== undefined) {
    const ex = modOf(m, "exchange")!;
    while (init.pts >= ex.cost && k0 < copies) { init.pts -= ex.cost; k0++; }
    init.pts = Math.min(init.pts, ex.cost - 1);
  }
  if (k0 >= copies) return 0;
  const N = copies * tb.size;
  const node0 = k0 * tb.size + tb.names.reduce((a, n, i) => a * domains[i]! + init[n]!, 0);
  // Iterative DFS: longest[v] = 1 + max over successors (completion counts as 0 further pulls).
  const longest = new Int32Array(N).fill(-1);
  const color = new Uint8Array(N); // 0 new, 1 on stack, 2 done
  const stack: [number, number][] = [[node0, 0]];
  color[node0] = 1;
  while (stack.length) {
    const top = stack[stack.length - 1]!;
    const [v, j] = top;
    const k = Math.floor(v / tb.size), s = v % tb.size;
    const e = tb.edges[s]!;
    if (j < e.length) {
      top[1] = j + 3;
      if (e[j]! <= 0) continue;
      const kn = k + e[j + 2]!;
      if (kn >= copies) continue;
      const w = kn * tb.size + e[j + 1]!;
      if (color[w] === 1) return null;
      if (color[w] === 0) { color[w] = 1; stack.push([w, 0]); }
      continue;
    }
    let best = 0;
    for (let i = 0; i < e.length; i += 3) {
      if (e[i]! <= 0) continue;
      const kn = k + e[i + 2]!;
      best = Math.max(best, kn >= copies ? 1 : 1 + longest[kn * tb.size + e[i + 1]!]!);
    }
    longest[v] = best;
    color[v] = 2;
    stack.pop();
  }
  return longest[node0]!;
}

/** P(exactly k copies after n pulls), k = 0..maxCopies (the last bucket is "maxCopies or more") (§3.4). */
export function copiesAfter(m: GachaModel, target: Target, pulls: number, maxCopies = 10, start?: ModelState): number[] {
  const tb = buildTable(m, { ...target, copies: 1 }, 200000);
  const domains = tb.names.map((v) => varDomain(m, v));
  const init = capVars(m, pick(start?.vars ?? {}, tb.names), tb.names, domains);
  const K = maxCopies + 1;
  let mass = new Float64Array(K * tb.size);
  mass[tb.names.reduce((a, n, i) => a * domains[i]! + Math.min(init[n]!, domains[i]! - 1), 0)] = 1;
  for (let n = 0; n < pulls; n++) {
    const next = new Float64Array(K * tb.size);
    for (let k = 0; k < K; k++) {
      for (let s = 0; s < tb.size; s++) {
        const w = mass[k * tb.size + s]!;
        if (w === 0) continue;
        const e = tb.edges[s]!;
        for (let j = 0; j < e.length; j += 3) {
          const kn = Math.min(maxCopies, k + e[j + 2]!);
          next[kn * tb.size + e[j + 1]!] = next[kn * tb.size + e[j + 1]!]! + w * e[j]!;
        }
      }
    }
    mass = next;
  }
  return Array.from({ length: K }, (_, k) => { let a = 0; for (let s = 0; s < tb.size; s++) a = a + mass[k * tb.size + s]!; return a; });
}

// ---------------------------------------------------------------------------
// §3.5 Long-run rates
// ---------------------------------------------------------------------------

export interface LongRun {
  /** Long-run share of pulls landing in each tier. */
  tiers: number[];
  /** Long-run share of each tier's hits that are featured. */
  featuredShare: number[];
  states: number;
}

/**
 * Stationary pull outcomes, counting pity and guarantees but not exchanges (a player action). Lazy chain
 * (P + I)/2 from the fresh state until the largest change < 1e-15 or 200000 steps (same method as gacha 1.0).
 */
export function longRun(m: GachaModel, opts: { maxStates?: number } = {}): LongRun {
  const names = stateVars(m).filter((v) => v !== "pts");
  const domains = names.map((v) => varDomain(m, v));
  const size = domains.reduce((a, d) => a * d, 1);
  if (size > (opts.maxStates ?? 50000)) throw new GachaModelError(`狀態太多（${size.toLocaleString()}），無法精確計算`);
  const n = m.tiers.length;
  const decode = (idx: number) => { const v: Record<string, number> = {}; for (let i = names.length - 1; i >= 0; i--) { v[names[i]!] = idx % domains[i]!; idx = Math.floor(idx / domains[i]!); } return v; };
  const encode = (v: Record<string, number>) => names.reduce((a, nm, i) => a * domains[i]! + v[nm]!, 0);
  const P: number[][] = [];
  const TO: number[][] = [];
  const TIER: number[][] = [];
  const FEAT: number[][] = [];
  for (let s = 0; s < size; s++) {
    const vars = decode(s);
    const br = pullBranches(m, vars);
    P.push(br.map((b) => b.p));
    TO.push(br.map((b) => encode(capVars(m, pick(nextVars(m, vars, b.tier, b.featured, b.chosen === true), names), names, domains))));
    TIER.push(br.map((b) => b.tier));
    FEAT.push(br.map((b) => (b.featured ? 1 : 0)));
  }
  let pi = new Float64Array(size);
  let next = new Float64Array(size);
  pi[0] = 1;
  for (let step = 0; step < 200000; step++) {
    for (let s = 0; s < size; s++) next[s] = pi[s]! / 2;
    for (let s = 0; s < size; s++) {
      const w = pi[s]! / 2;
      if (w === 0) continue;
      const p = P[s]!, to = TO[s]!;
      for (let j = 0; j < p.length; j++) next[to[j]!] = next[to[j]!]! + w * p[j]!;
    }
    let diff = 0;
    for (let s = 0; s < size; s++) diff = Math.max(diff, Math.abs(next[s]! - pi[s]!));
    [pi, next] = [next, pi];
    if (diff < 1e-15) break;
  }
  const tiers = new Array<number>(n).fill(0);
  const feat = new Array<number>(n).fill(0);
  for (let s = 0; s < size; s++) {
    const p = P[s]!;
    for (let j = 0; j < p.length; j++) {
      const q = pi[s]! * p[j]!;
      tiers[TIER[s]![j]!] = tiers[TIER[s]![j]!]! + q;
      if (FEAT[s]![j]) feat[TIER[s]![j]!] = feat[TIER[s]![j]!]! + q;
    }
  }
  return { tiers, featuredShare: tiers.map((x, i) => (x > 0 ? feat[i]! / x : 0)), states: size };
}
