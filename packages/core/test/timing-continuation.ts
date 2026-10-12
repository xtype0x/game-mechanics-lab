/**
 * Shared by timing.test.ts and vectors.test.ts: split a run at frame `cut` and describe its continuation
 * (docs/spec/timing.md §7.3).
 */
import { Timing } from "../src";

/** Shift every absolute frame field of an event by `-origin`. `frames` (a duration) is NOT a frame. */
export function shiftEvent(e: Timing.TimingEvent, origin: number): Timing.TimingEvent {
  const o = structuredClone(e) as Timing.TimingEvent & { pressFrame?: number; impactFrame?: number; windows?: Timing.WindowSpan[] };
  o.frame -= origin;
  if (o.pressFrame !== undefined) o.pressFrame -= origin;
  if (o.impactFrame !== undefined) o.impactFrame -= origin;
  if (o.windows) for (const w of o.windows) { w.from -= origin; w.to -= origin; }
  return o;
}

/** The script of the continuation: presses/attacks at frames >= cut, shifted by -cut, `frames - cut` long. */
export function continuationScript(script: Timing.TimingScript, cut: number): Timing.TimingScript {
  return {
    frames: script.frames - cut,
    presses: script.presses.filter((p) => p.frame >= cut).map((p) => ({ frame: p.frame - cut, interaction: p.interaction })),
    attacks: script.attacks.filter((a) => a.frame >= cut).map((a) => ({ ...a, frame: a.frame - cut, tags: a.tags.slice() })),
  };
}

export interface Continuation {
  /** State after `cut` frames (absolute frames). */
  mid: Timing.TimingState;
  /** `rebaseTimingState(mid, cut)`. */
  rebased: Timing.TimingState;
  script: Timing.TimingScript;
  run: Timing.TimingRun;
}

export function continueFrom(config: Timing.TimingConfig, script: Timing.TimingScript, cut: number): Continuation {
  const mid = Timing.runTiming(config, { ...script, frames: cut }).final;
  const rebased = Timing.rebaseTimingState(mid, cut);
  const cs = continuationScript(script, cut);
  return { mid, rebased, script: cs, run: Timing.runTiming(config, cs, { initial: rebased }) };
}
