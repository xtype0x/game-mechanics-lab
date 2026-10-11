import type { Rng } from "@gml/core";
import { BULLET_KINDS, DIRECTOR, FPS, OPENING, type BulletKindId } from "./config";

export interface ShotSpec { offset: number; kind: BulletKindId }
/** A shot waiting for its fire frame. */
export interface Shot { frame: number; kind: BulletKindId }

export interface PatternDef {
  id: string;
  name: string;
  /** World seconds at which the pattern joins the pool. */
  unlock: number;
  /** Only in the pool at this difficulty or higher. */
  minDifficulty?: number;
  weight: number;
  /** `d` = difficulty (tempo); patterns may add shots at higher tempo. */
  build: (rng: Rng, d: number) => ShotSpec[];
}

/** Extra shots for dense patterns: +1 per 0.5 difficulty above 1. */
const extra = (d: number) => Math.max(0, Math.floor((d - 1) * 2));

const range = (rng: Rng, lo: number, hi: number) => lo + rng.int(hi - lo + 1);
const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[rng.int(xs.length)] as T;

export const PATTERNS: PatternDef[] = [
  { id: "single", name: "單發", unlock: 0, weight: 3, build: () => [{ offset: 0, kind: "normal" }] },
  { id: "double", name: "瞄準雙發", unlock: 16, weight: 3, build: (rng) => [{ offset: 0, kind: "normal" }, { offset: range(rng, 34, 46), kind: "normal" }] },
  { id: "low", name: "低空彈", unlock: 24, weight: 2, build: () => [{ offset: 0, kind: "low" }] },
  {
    id: "red", name: "紅色特殊彈", unlock: 30, weight: 3,
    build: (rng) => (rng.chance(0.5) ? [{ offset: 0, kind: "red" }, { offset: range(rng, 48, 64), kind: "normal" }] : [{ offset: 0, kind: "red" }]),
  },
  { id: "energy", name: "能量彈", unlock: 36, weight: 2, build: () => [{ offset: 0, kind: "energy" }] },
  {
    id: "bounce", name: "彈跳齊射", unlock: 44, weight: 3,
    build: (rng, d) => Array.from({ length: range(rng, 2, 3) + Math.min(2, extra(d)) }, (_, i) => ({ offset: i * range(rng, 34, 44), kind: "bounce" as const })),
  },
  {
    id: "burst", name: "密集連射", unlock: 55, weight: 3,
    build: (rng, d) => {
      const n = range(rng, 5, 8) + extra(d);
      const gap = range(rng, 10, 14);
      return Array.from({ length: n }, (_, i) => ({ offset: i * gap, kind: "normal" as const }));
    },
  },
  { id: "feint", name: "變速佯攻", unlock: 65, weight: 3, build: (rng) => [{ offset: 0, kind: "feint" }, { offset: range(rng, 18, 30), kind: "normal" }] },
  {
    id: "mixed", name: "混合彈幕", unlock: 80, weight: 4,
    build: (rng, d) => {
      const pool: BulletKindId[] = ["normal", "red", "bounce", "low", "feint", "energy"];
      const n = range(rng, 3, 4) + Math.min(3, extra(d));
      let t = 0;
      return Array.from({ length: n }, (_, i) => {
        if (i > 0) t += range(rng, 28, 46);
        return { offset: t, kind: pick(rng, pool) };
      });
    },
  },
];

/** Asura tier only (difficulty ≥ 2.6): normal and red alternate, forcing parry → dodge → parry → dodge. */
PATTERNS.push({
  id: "switch", name: "交錯彈幕", unlock: 70, minDifficulty: 2.6, weight: 3,
  build: (rng) => {
    const gap = range(rng, 22, 30);
    return ["normal", "red", "normal", "red"].map((kind, i) => ({ offset: i * gap, kind: kind as BulletKindId }));
  },
});

/**
 * Difficulty is tempo: the director's clock runs `d`× faster, so patterns unlock sooner and the interval ramp
 * advances faster. Bullet speed does not depend on difficulty.
 */
export const directorSeconds = (frame: number, difficulty: number): number => (frame / FPS) * difficulty;

/** Shots inside a pattern close up by 1/√d, but never below MIN_SHOT_GAP frames apart (or the original gap if smaller). */
export const MIN_SHOT_GAP = 10;
export function compressOffsets(specs: ShotSpec[], difficulty: number): ShotSpec[] {
  if (difficulty <= 1) return specs;
  const k = 1 / Math.sqrt(difficulty);
  const sorted = [...specs].sort((a, b) => a.offset - b.offset);
  let prevOld = sorted[0]?.offset ?? 0;
  let prevNew = prevOld;
  return sorted.map((s, i) => {
    if (i === 0) return s;
    const diff = s.offset - prevOld;
    const nd = Math.max(Math.min(diff, MIN_SHOT_GAP), Math.round(diff * k));
    prevOld = s.offset;
    prevNew += nd;
    return { ...s, offset: prevNew };
  });
}

export const unlockedPatterns = (sec: number, difficulty = 1): PatternDef[] =>
  PATTERNS.filter((p) => p.unlock <= sec && difficulty >= (p.minDifficulty ?? 0) - 1e-9);

export function pickPattern(rng: Rng, sec: number, difficulty = 1): PatternDef {
  const pool = unlockedPatterns(sec, difficulty);
  // Newly unlocked patterns are favoured for 20 s so the player actually sees them.
  const w = (p: PatternDef) => p.weight * (sec - p.unlock < 20 && p.unlock > 0 ? 2 : 1);
  const total = pool.reduce((s, p) => s + w(p), 0);
  let x = rng.next() * total;
  for (const p of pool) {
    x -= w(p);
    if (x < 0) return p;
  }
  return pool[pool.length - 1] as PatternDef;
}

/** Frames between patterns at world frame `frame`. */
export function intervalAt(frame: number, difficulty: number): number {
  const steps = directorSeconds(frame, Math.max(1, difficulty)) / 30;
  const base = Math.max(DIRECTOR.minInterval, DIRECTOR.startInterval * Math.pow(DIRECTOR.intervalRamp, steps));
  return Math.max(DIRECTOR.floorInterval, Math.round(base / difficulty));
}

export function speedMultAt(frame: number, difficulty: number): number {
  const ramp = Math.min(DIRECTOR.maxSpeedMult, 1 + DIRECTOR.speedRamp * (frame / (30 * FPS)));
  // The calm opening ends sooner at higher tempo; speed itself does not scale with difficulty.
  const open = Math.min(1, directorSeconds(frame, Math.max(1, difficulty)) / OPENING.seconds);
  return ramp * (OPENING.speedStart + (1 - OPENING.speedStart) * open);
}

export interface DirectorState {
  nextPatternAt: number;
  queue: Shot[];
  /** Pattern ids in the order they were started (kept for tests and stats). */
  fired: string[];
}

export const createDirector = (): DirectorState => ({ nextPatternAt: DIRECTOR.firstDelay, queue: [], fired: [] });

/** Start a new pattern when due; return the shots whose fire frame is `frame`. */
export function directorStep(d: DirectorState, rng: Rng, frame: number, difficulty: number): Shot[] {
  if (frame >= d.nextPatternAt) {
    const pat = pickPattern(rng, directorSeconds(frame, Math.max(1, difficulty)), difficulty);
    const specs = compressOffsets(pat.build(rng, difficulty), difficulty);
    let last = 0;
    for (const s of specs) {
      // The first shot never fires before its own telegraph has played.
      d.queue.push({ frame: frame + BULLET_KINDS[s.kind].telegraph + s.offset, kind: s.kind });
      last = Math.max(last, s.offset);
    }
    d.fired.push(pat.id);
    d.nextPatternAt = frame + last + BULLET_KINDS[specs[0]?.kind ?? "normal"].telegraph + intervalAt(frame, difficulty);
  }
  const due: Shot[] = [];
  d.queue = d.queue.filter((s) => (s.frame <= frame ? (due.push(s), false) : true));
  return due;
}

/** 0..1 muzzle glow for the nearest upcoming shot, and which kind it is. */
export function telegraphOf(d: DirectorState, frame: number): { level: number; kind: BulletKindId } | null {
  let best: { level: number; kind: BulletKindId } | null = null;
  for (const s of d.queue) {
    const tele = BULLET_KINDS[s.kind].telegraph;
    const left = s.frame - frame;
    if (left > tele || left < 0) continue;
    const level = 1 - left / tele;
    if (!best || level > best.level) best = { level, kind: s.kind };
  }
  return best;
}
