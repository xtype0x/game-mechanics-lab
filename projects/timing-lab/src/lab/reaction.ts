// Reaction analysis: for each hit of a move and each interaction that could catch it, how late can the press still be
// valid, and is that humanly reactable given the first visual cue? Pure functions; the rules are run through
// Timing.runTiming, never re-implemented here.
import { Timing } from "@gml/core";
import { stableStringify } from "@gml/ui";
import { DASH, TRAVEL, isRanged } from "./visuals";

type AttackDef = Timing.AttackDef;
type TimingConfig = Timing.TimingConfig;

export type ReactionGrade = "friendly" | "normal" | "challenging" | "harsh" | "anticipate";
/** `impossible` = no press frame can handle the hit with this interaction. */
export type GradeId = ReactionGrade | "impossible";

/** Human simple visual reaction floor (ms); the average person needs about 200-250 ms. */
export const THEORETICAL_MIN_MS = 100;

/** Grades from easiest; the first row whose `minMs` the reaction time reaches wins. */
export const REACTION_GRADES: readonly { id: ReactionGrade; minMs: number }[] = [
  { id: "friendly", minMs: 350 },
  { id: "normal", minMs: 250 },
  { id: "challenging", minMs: 180 },
  { id: "harsh", minMs: 100 },
  { id: "anticipate", minMs: -Infinity },
];

export function gradeOf(ms: number): ReactionGrade {
  return REACTION_GRADES.find((g) => ms >= g.minMs)!.id;
}

/** Frames before the hit the simulated move starts (room for presses before it). */
const START = 150;
const LOOK_BACK = 120;

export interface HitReaction {
  /** Index into `def.hits`. */
  hit: number;
  interaction: string;
  /** Press frames (counted one per frame) that handle the hit with this interaction, perfect or success. */
  validFrames: number;
  perfectFrames: number;
  /** Earliest / latest valid press, in frames relative to the hit's impact frame (negative = before). 0 when none. */
  earliest: number;
  latest: number;
  /** The previous presses already handle this hit, so no extra press is needed (e.g. a dodge window spanning hits). */
  covered: boolean;
  /** Only works if the previous hit is handled earlier than its latest-perfect press (a covering or still-open window). */
  needsEarlier: boolean;
  /** Where the first cue is, relative to the impact frame (negative): -max(tell, melee dash / projectile travel). */
  cueFrame: number;
  /** Frames from the cue to the latest valid press. */
  reactionFrames: number;
  reactionMs: number;
  grade: GradeId | null;
}

export interface HitAnalysis {
  hit: number;
  /** One entry per interaction that could catch this hit. */
  results: HitReaction[];
  /** The interaction with the most reaction time among the ones that work; null when none is valid. */
  best: HitReaction | null;
}

export interface AttackAnalysis {
  hits: HitAnalysis[];
  /** The hardest hit (by its best option); null when every hit is covered or the move has no hits. */
  worst: HitReaction | null;
  /** Some hit cannot be handled by any interaction. */
  impossible: boolean;
}

/** Does the first row matching the tags have a catching cell in a window that exists? */
function catches(it: Timing.InteractionDef, tags: string[]): boolean {
  const row = it.table.find((r) => r.tag === null || tags.includes(r.tag));
  if (!row) return false;
  return it.windows.some((w) => w.frames > 0 && row.cells[w.id] != null);
}

export const bestOfHit = (results: HitReaction[]): HitReaction | null =>
  results.reduce<HitReaction | null>((b, r) => (r.grade === null || r.covered || r.validFrames <= 0 ? b : !b || r.reactionMs > b.reactionMs ? r : b), null);

/** The hit with the least reaction time among the hits' best options. */
export const worstOfAttack = (hits: HitAnalysis[]): HitReaction | null =>
  hits.reduce<HitReaction | null>((w, h) => (h.best && (!w || h.best.reactionMs < w.reactionMs) ? h.best : w), null);

export function analyzeAttack(def: AttackDef, config: TimingConfig, hitTells = true): AttackAnalysis {
  const sim = structuredClone(config);
  const hitOutcome = sim.outcomes.find((o) => o.id === sim.hitOutcome);
  if (hitOutcome) hitOutcome.effects = []; // being hit must not stun or protect the simulated player
  const kindOf = (id: string | null): string | undefined => (id === null ? undefined : sim.outcomes.find((o) => o.id === id)?.kind);

  const events = Timing.expandAttack(def, START);
  const order = events.map((_, i) => i).sort((a, b) => events[a]!.frame - events[b]!.frame || a - b);

  // Stepping the rules frame by frame (same as runTiming) lets a sweep share the state before its first candidate press
  // and stop as soon as the hit is resolved, instead of re-running the whole timeline for every candidate.
  const step = (state: Timing.TimingState, presses: { frame: number; interaction: string }[]) => {
    const t = state.frame;
    return Timing.stepTiming(sim, state, {
      presses: presses.filter((p) => p.frame === t).map((p) => p.interaction),
      attacks: events.filter((a) => a.frame === t),
    });
  };
  /** State at frame `to` (exclusive) after the given presses, from the start. */
  const prefixCache = new Map<string, Timing.TimingState>();
  const prefix = (presses: { frame: number; interaction: string }[], to: number): Timing.TimingState => {
    const key = `${to}|${presses.map((p) => `${p.frame}:${p.interaction}`).join(",")}`;
    let s = prefixCache.get(key);
    if (!s) {
      s = Timing.createTimingState(sim);
      while (s.frame < to) s = step(s, presses).state;
      prefixCache.set(key, s);
    }
    return s;
  };
  /** Outcome kind of hit `i` when it is resolved by interaction `x`, else null. Presses before `from` must all be in `presses`. */
  const kindVia = (presses: { frame: number; interaction: string }[], i: number, x: string, from = 0): string | null => {
    const target = events[i]!;
    const end = target.frame + Math.max(0, config.inputOffset) + 1;
    let s = prefix(presses.filter((p) => p.frame < from), from);
    while (s.frame < end) {
      const r = step(s, presses);
      s = r.state;
      const ev = r.events.find((e) => e.type === "resolve" && e.attack === target.id);
      if (ev && ev.type === "resolve") return ev.via === "interaction" && ev.interaction === x ? (kindOf(ev.outcome) ?? null) : null;
    }
    return null;
  };
  const sorted = (ps: { frame: number; interaction: string }[]) => ps.slice().sort((a, b) => a.frame - b.frame);

  const hits: HitAnalysis[] = def.hits.map((_, i) => ({ hit: i, results: [], best: null }));
  type Press = { frame: number; interaction: string };
  type Cand = { p: number; k: string };
  for (const it of config.interactions) {
    if (!it.windows.some((w) => w.frames > 0)) continue;
    let chosen: Press[] = [];
    /** The most recent press added for a hit: what it was added to, and every press that would have worked instead. */
    let prev = null as { base: Press[]; cands: Cand[]; at: number } | null;
    for (const i of order) {
      const ev = events[i]!;
      if (!catches(it, ev.tags)) continue; // this interaction never catches the hit; earlier presses stay as they are
      // A candidate press must come after the previous impact: earlier than that it would be answering that hit instead.
      const prevFrame = Math.max(-1, ...events.filter((o) => o.frame < ev.frame).map((o) => o.frame));
      const lo = Math.max(0, ev.frame - LOOK_BACK, prevFrame + 1);
      const hi = Math.max(lo, ev.frame + config.inputOffset);
      const isCovered = (base: Press[]) => { const k = kindVia(sorted(base), i, it.id); return k === "perfect" || k === "success"; };
      const scan = (base: Press[]): Cand[] => {
        const out: Cand[] = [];
        for (let p = lo; p <= hi; p++) {
          if (base.some((c) => c.frame === p)) continue;
          // every base press before `lo` is shared by all candidates, so the state at `lo` is computed once
          const k = kindVia(sorted([...base, { frame: p, interaction: it.id }]), i, it.id, lo);
          if (k === "perfect" || k === "success") out.push({ p, k });
        }
        return out;
      };
      let covers = isCovered(chosen);
      let cands = covers ? [] : scan(chosen);
      let needsEarlier = false;
      const pv = prev;
      if (!covers && cands.length === 0 && pv) {
        // No answer after the latest-perfect choice for the previous hit: maybe handling that one earlier helps.
        const alts: Cand[] = pv.cands.filter((c) => c.p !== pv.at).sort((a, b) => b.p - a.p);
        const coverAlt = alts.find((a) => isCovered([...pv.base, { frame: a.p, interaction: it.id }]));
        if (coverAlt) {
          chosen = [...pv.base, { frame: coverAlt.p, interaction: it.id }];
          prev = { ...pv, at: coverAlt.p };
          covers = needsEarlier = true;
        } else {
          let bestAlt: { base: Press[]; cands: Cand[]; at: number } | null = null;
          for (const a of alts) {
            const base: Press[] = [...pv.base, { frame: a.p, interaction: it.id }];
            const c = scan(base);
            if (c.length && (!bestAlt || c[c.length - 1]!.p > bestAlt.cands[bestAlt.cands.length - 1]!.p)) bestAlt = { base, cands: c, at: a.p };
          }
          if (bestAlt) { chosen = bestAlt.base; cands = bestAlt.cands; prev = { base: bestAlt.base, cands: pv.cands, at: bestAlt.at }; needsEarlier = true; }
        }
      }
      const validFrames = cands.length, perfectFrames = cands.filter((c) => c.k === "perfect").length;
      const earliest = cands.length ? cands[0]!.p - ev.frame : 0, latest = cands.length ? cands[cands.length - 1]!.p - ev.frame : 0;
      if (!covers && cands.length) {
        const best = [...cands].reverse().find((c) => c.k === "perfect") ?? cands[cands.length - 1]!;
        prev = { base: chosen, cands, at: best.p };
        chosen = [...chosen, { frame: best.p, interaction: it.id }];
      }
      const tel = hitTells || i === 0 ? Timing.hitTelegraph(def, i) : 0;
      const lead = Math.max(tel, isRanged(ev.tags) ? TRAVEL : DASH);
      const reactionFrames = latest + lead;
      const reactionMs = Timing.framesToMs(reactionFrames, config.fps);
      const ok = covers || validFrames > 0;
      hits[i]!.results.push({
        hit: i, interaction: it.id, validFrames, perfectFrames, earliest, latest, covered: covers, needsEarlier,
        cueFrame: -lead, reactionFrames: ok && !covers ? reactionFrames : 0, reactionMs: ok && !covers ? reactionMs : 0,
        grade: covers ? null : ok ? gradeOf(reactionMs) : "impossible",
      });
    }
  }
  for (const h of hits) h.best = bestOfHit(h.results);
  const impossible = hits.some((h) => h.results.length === 0 || h.results.every((r) => !r.covered && r.validFrames === 0));
  return { hits, worst: worstOfAttack(hits), impossible };
}

const cache = new WeakMap<TimingConfig, Map<string, AttackAnalysis>>();

/** analyzeAttack memoized by (move contents, config object, hitTells). */
export function analyzeCached(def: AttackDef, config: TimingConfig, hitTells: boolean): AttackAnalysis {
  let m = cache.get(config);
  if (!m) cache.set(config, (m = new Map()));
  const key = `${hitTells ? 1 : 0}|${stableStringify(def)}`;
  let r = m.get(key);
  if (!r) { r = analyzeAttack(def, config, hitTells); m.set(key, r); }
  return r;
}
