/** Rolling record of the last few seconds of timing activity, for the judgement strip. Pure data, bounded size. */
import { Timing } from "@gml/core";
import { BULLET_KINDS, HIT_X, feintProfile, type BulletKindId } from "./config";
import type { Bullet, StepResult, World } from "./world";

/** Fixed-capacity ring: pushing past capacity overwrites the oldest entry. */
export class Ring<T> {
  private buf: (T | undefined)[];
  private head = 0;
  private count = 0;
  constructor(readonly capacity: number) {
    this.buf = new Array<T | undefined>(Math.max(1, capacity));
  }
  get size(): number { return this.count; }
  push(x: T): void {
    const cap = this.buf.length;
    if (this.count < cap) this.buf[(this.head + this.count++) % cap] = x;
    else { this.buf[this.head] = x; this.head = (this.head + 1) % cap; }
  }
  /** Oldest-first index. */
  at(i: number): T | undefined { return i < 0 || i >= this.count ? undefined : this.buf[(this.head + i) % this.buf.length]; }
  forEach(fn: (x: T, i: number) => void): void { for (let i = 0; i < this.count; i++) fn(this.at(i) as T, i); }
  toArray(): T[] { const out: T[] = []; this.forEach((x) => out.push(x)); return out; }
  clear(): void { this.buf.fill(undefined); this.head = 0; this.count = 0; }
}

/** Frames of history kept (4 s). The strip shows less; the rest lets a paused player scrub back. */
export const JUDGE_HISTORY = 240;

export interface ImpactMark { frame: number; kind: BulletKindId }

export interface JudgeLog {
  traces: Ring<Timing.FrameTrace>;
  events: Ring<Timing.TimingEvent>;
  impacts: Ring<ImpactMark>;
  /** Bumps on every record (cache key for derived views). */
  version: number;
}

export function createJudgeLog(): JudgeLog {
  return { traces: new Ring(JUDGE_HISTORY), events: new Ring(JUDGE_HISTORY), impacts: new Ring(64), version: 0 };
}

/** Call once per stepped world frame, right after `stepWorld`. */
export function recordJudge(log: JudgeLog, w: World, r: StepResult): void {
  log.traces.push(Timing.traceFrame(w.config, w.timing));
  for (const e of r.timing) log.events.push(e);
  for (const im of r.impacts) log.impacts.push(im);
  log.version++;
}

/** World frames until a flying bullet reaches the hit line (0 = on the next step), or Infinity. */
export function framesToImpact(b: Bullet): number {
  if (b.state !== "flying") return Number.POSITIVE_INFINITY;
  const variable = BULLET_KINDS[b.kind].motion === "variable";
  let x = b.x;
  let p = b.p;
  for (let n = 0; n < 600; n++) {
    x -= b.speed * (variable ? feintProfile(p) : 1);
    p = (b.x0 - x) / (b.x0 - HIT_X);
    if (x <= HIT_X) return n;
  }
  return Number.POSITIVE_INFINITY;
}

/** Predicted impact marks of bullets still flying, as absolute world frames (fills `out`). */
export function upcomingImpacts(w: World, out: ImpactMark[] = []): ImpactMark[] {
  out.length = 0;
  for (const b of w.bullets) {
    const n = framesToImpact(b);
    if (Number.isFinite(n)) out.push({ frame: w.frame + n, kind: b.kind });
  }
  return out;
}
