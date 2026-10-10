/**
 * Gacha 2.0 pull rules (docs/spec/gacha2.md §2). One function computes what a pull can do from the counters
 * (`pullContext`); sampling (`pull`) and exact analysis (chain.ts) both use it, so they cannot disagree.
 */
import type { Rng } from "../rng";
import type { GachaModel, ModelState, PullOutcome, RuleModule } from "./model";

export class GachaModelError extends Error {}

type Mod<K extends RuleModule["kind"]> = Extract<RuleModule, { kind: K }>;
const modsOf = <K extends RuleModule["kind"]>(m: GachaModel, kind: K) => m.modules.filter((x): x is Mod<K> => x.kind === kind);
const modOf = <K extends RuleModule["kind"]>(m: GachaModel, kind: K, tier?: string) =>
  m.modules.find((x): x is Mod<K> => x.kind === kind && (tier === undefined || ("tier" in x && x.tier === tier)));

// ---------------------------------------------------------------------------
// §2.1 Counters
// ---------------------------------------------------------------------------

/** Counter names this model uses, in a fixed order (tiers top-down, then global counters). */
export function stateVars(m: GachaModel): string[] {
  const out: string[] = [];
  for (const t of m.tiers) {
    if (modOf(m, "softPity", t.id) || modOf(m, "hardPity", t.id)) out.push(`since:${t.id}`);
    if (modOf(m, "guarantee", t.id)) out.push(`guar:${t.id}`);
    if (modOf(m, "milestone", t.id)) out.push(`miss:${t.id}`);
    if (modOf(m, "epitomized", t.id)) out.push(`fate:${t.id}`);
  }
  if (modOf(m, "exchange")) out.push("pts");
  if (modOf(m, "batchFloor")) out.push("batch");
  return out;
}

export function newState(m: GachaModel): ModelState {
  return { vars: Object.fromEntries(stateVars(m).map((v) => [v, 0])), pulls: 0 };
}

// ---------------------------------------------------------------------------
// §2.2 What one pull can do
// ---------------------------------------------------------------------------

/** Tier rate from its base rate and pity modules at counter value c (1-based). Same as gacha 1.0 tierRate. */
export function tierRate(m: GachaModel, tierIndex: number, c: number): number {
  const t = m.tiers[tierIndex]!;
  const hard = modOf(m, "hardPity", t.id);
  if (hard && hard.at > 0 && c >= hard.at) return 1;
  let r = t.rate;
  const soft = modOf(m, "softPity", t.id);
  if (soft && soft.start > 0 && c >= soft.start) r = r + (c - soft.start + 1) * soft.step;
  return Math.min(1, Math.max(0, r));
}

export interface PullContext {
  /**
   * Thresholds for the shared roll u ∈ [0, 1): the tier is the first i with u < thresholds[i]. The last entry is
   * Infinity. Unclamped running sums of tier rates, so comparisons match gacha 1.0 exactly.
   */
  thresholds: number[];
  /** Probability of each tier: min(1, T_i) − min(1, T_{i−1}). */
  chances: number[];
  /** Tier index forced by a milestone, if any. */
  forced: number | null;
  /** Tier index of the batch floor when this pull is on its slot (and no milestone fired). */
  floor: number | null;
  /** Per tier: featured split if this tier is hit. `chosen`: the epitomized item, `chosenForced`: points are full. */
  featured: ({ forced: boolean; share: number; items: string[]; chosen?: string; chosenForced?: boolean } | null)[];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function pullContext(m: GachaModel, vars: Record<string, number>): PullContext {
  const n = m.tiers.length;
  const thresholds: number[] = [];
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    const t = m.tiers[i]!;
    const c = (vars[`since:${t.id}`] ?? 0) + 1;
    acc = acc + tierRate(m, i, c);
    thresholds.push(acc);
  }
  thresholds.push(Infinity);

  // Milestones: the highest tier whose counter reaches a step this pull is forced.
  let forced: number | null = null;
  let override: number | undefined;
  for (let i = 0; i < n && forced === null; i++) {
    const mile = modOf(m, "milestone", m.tiers[i]!.id);
    if (!mile) continue;
    const c = (vars[`miss:${m.tiers[i]!.id}`] ?? 0) + 1;
    const step = mile.steps.find((s) => s.at === c);
    if (step) { forced = i; override = step.featuredShare; }
  }
  if (forced !== null) {
    for (let i = 0; i < n; i++) thresholds[i] = i < forced ? 0 : Infinity;
  }
  let floor: number | null = null;
  if (forced === null) {
    // Batch floor: on its slot, every tier below minTier is lifted to minTier.
    const bf = modOf(m, "batchFloor");
    if (bf && (vars.batch ?? 0) + 1 === bf.slot) {
      const k = m.tiers.findIndex((t) => t.id === bf.minTier);
      if (k >= 0) { thresholds[k] = Infinity; floor = k; }
    }
  }

  const chances: number[] = [];
  let prev = 0;
  for (let i = 0; i < n; i++) {
    // Monotone: tiers after a lifted threshold get nothing.
    const cur = Math.max(prev, clamp01(thresholds[i]!));
    chances.push(i === n - 1 ? 1 - prev : cur - prev);
    prev = i === n - 1 ? 1 : cur;
  }

  const featured = m.tiers.map((t, i) => {
    const f = modOf(m, "featured", t.id);
    if (!f || !f.items.length) return null;
    const ov = i === forced && override !== undefined ? override : undefined;
    const epi = modOf(m, "epitomized", t.id);
    const chosenForced = !!epi && (vars[`fate:${t.id}`] ?? 0) >= epi.points;
    const isForced = chosenForced || (vars[`guar:${t.id}`] ?? 0) === 1 || !t.items.length || (ov !== undefined && ov >= 1);
    return { forced: isForced, share: ov ?? f.share, items: f.items, ...(epi ? { chosen: epi.item, chosenForced } : {}) };
  });
  return { thresholds, chances, forced, floor, featured };
}

/**
 * Counters after a pull that hit tier `tierIndex` (featured or not). `chosenHit`: the hit was the epitomized
 * item of that tier (only matters when the tier has one). Pure.
 */
export function nextVars(m: GachaModel, vars: Record<string, number>, tierIndex: number, featured: boolean, chosenHit = false): Record<string, number> {
  const out: Record<string, number> = { ...vars };
  m.tiers.forEach((t, i) => {
    const s = `since:${t.id}`;
    if (s in vars) out[s] = i === tierIndex ? 0 : vars[s]! + 1;
    const g = `guar:${t.id}`;
    if (g in vars && i === tierIndex) out[g] = featured ? 0 : 1;
    const ms = `miss:${t.id}`;
    if (ms in vars) out[ms] = i === tierIndex && featured ? 0 : vars[ms]! + 1;
    const fa = `fate:${t.id}`;
    if (fa in vars && i === tierIndex) out[fa] = chosenHit ? 0 : vars[fa]! + 1;
  });
  const ex = modOf(m, "exchange");
  if (ex && "pts" in vars) out.pts = vars.pts! + ex.pointsPerPull;
  if ("batch" in vars) out.batch = (vars.batch! + 1) % m.pull.batchSize;
  return out;
}

// ---------------------------------------------------------------------------
// §2.3 Sampling
// ---------------------------------------------------------------------------

/**
 * One pull. Mutates `state`; rng use: next (tier), next (featured split, when rolled), int (item; skipped when the
 * epitomized item is forced).
 */
export function pull(m: GachaModel, state: ModelState, rng: Rng): PullOutcome {
  if (!m.tiers.length) throw new GachaModelError("模型沒有任何稀有度");
  const ctx = pullContext(m, state.vars);
  const u = rng.next();
  let chosen = m.tiers.length - 1;
  for (let i = 0; i < m.tiers.length - 1; i++) if (u < ctx.thresholds[i]!) { chosen = i; break; }
  const f = ctx.featured[chosen];
  let featured = false;
  if (f) featured = f.forced ? true : rng.next() < f.share;
  const pool = featured ? f!.items : m.tiers[chosen]!.items;
  if (!pool.length) throw new GachaModelError(`稀有度「${m.tiers[chosen]!.name}」沒有任何物品`);
  const itemId = f?.chosenForced ? f.chosen! : pool[rng.int(pool.length)]!;
  state.vars = nextVars(m, state.vars, chosen, featured, !!f?.chosen && itemId === f.chosen);
  state.pulls++;
  return { tierId: m.tiers[chosen]!.id, itemId, featured, forced: ctx.forced === chosen || ctx.floor === chosen };
}

export function pullMany(m: GachaModel, state: ModelState, rng: Rng, n: number): PullOutcome[] {
  return Array.from({ length: n }, () => pull(m, state, rng));
}

/** Exchange points for an item (§2.4). Returns false when points are short or the item is not offered. */
export function exchange(m: GachaModel, state: ModelState, itemId: string): boolean {
  const ex = modOf(m, "exchange");
  if (!ex || !ex.items.includes(itemId) || (state.vars.pts ?? 0) < ex.cost) return false;
  state.vars = { ...state.vars, pts: state.vars.pts! - ex.cost };
  return true;
}

export { modOf, modsOf };
