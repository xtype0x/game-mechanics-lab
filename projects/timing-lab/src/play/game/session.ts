import type { Timing } from "@gml/core";
import { createJudgeLog, recordJudge, type JudgeLog } from "./judge";
import { ReplayRecorder } from "./replay";
import { createWorld, stepWorld, type GameEvent, type World } from "./world";

/**
 * Host-side clock around a World. One `tick` = one real 60 Hz frame. Hitstop freezes the world for N ticks;
 * timeScale advances the world at a fractional rate (accumulated). Presses queue until the next world step.
 */
export interface Session {
  world: World;
  hitstop: number;
  scale: number;
  scaleFrames: number;
  acc: number;
  queue: string[];
  /** Real ticks since the run ended (lets the UI wait before showing the game-over screen). */
  overTicks: number;
  /** Last ~4 s of timing events / traces for the judgement strip (bounded). */
  judge: JudgeLog;
  /** Last ~7 s of inputs and state snapshots, for "inspect in the frame lab". */
  replay: ReplayRecorder;
}

export function createSession(config: Timing.TimingConfig, opts: { seed?: number | string; difficulty?: number; practice?: boolean } = {}): Session {
  return { world: createWorld(config, opts), hitstop: 0, scale: 1, scaleFrames: 0, acc: 0, queue: [], overTicks: 0, judge: createJudgeLog(), replay: new ReplayRecorder() };
}

export function pressInteraction(s: Session, id: string): void {
  if (!s.world.over) s.queue.push(id);
}

export function tickSession(s: Session): GameEvent[] {
  const events: GameEvent[] = [];
  if (s.world.over) {
    s.overTicks++;
    return events;
  }
  if (s.hitstop > 0) {
    s.hitstop--;
    return events;
  }
  let rate = 1;
  if (s.scaleFrames > 0) {
    rate = s.scale;
    s.scaleFrames--;
  }
  s.acc += rate;
  for (let n = 0; s.acc >= 1 && n < 4; n++) {
    s.acc -= 1;
    const presses = s.queue.splice(0);
    const f = s.world.frame;
    s.replay.begin(s.world);
    const r = stepWorld(s.world, presses);
    s.replay.end(f, r);
    recordJudge(s.judge, s.world, r);
    events.push(...r.events);
    if (r.timeScale) { s.scale = r.timeScale.scale; s.scaleFrames = Math.max(s.scaleFrames, r.timeScale.frames); }
    if (r.hitstop > 0) { s.hitstop = Math.max(s.hitstop, r.hitstop); break; }
    if (s.world.over) break;
  }
  return events;
}
