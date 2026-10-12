import { useCallback, useEffect, useRef, useState } from "react";
import type { Timing } from "@gml/core";

export interface PlaybackFx {
  /** Remaining real frames of hitstop (0 = none). */
  freeze: number;
  /** Time scale currently applied (1 = normal). */
  slow: number;
}

/** Host-side timing commands (hitstop, timeScale) at each frame, taken from the effect events. */
export function fxByFrame(events: Timing.TimingEvent[]): Map<number, { hitstop: number; slow?: { scale: number; frames: number } }> {
  const m = new Map<number, { hitstop: number; slow?: { scale: number; frames: number } }>();
  for (const e of events) {
    if (e.type !== "effect") continue;
    if (e.effect === "hitstop" && e.frames) {
      const x = m.get(e.frame) ?? { hitstop: 0 };
      x.hitstop += e.frames;
      m.set(e.frame, x);
    } else if (e.effect === "timeScale" && e.frames && e.value !== undefined) {
      const x = m.get(e.frame) ?? { hitstop: 0 };
      x.slow = { scale: e.value, frames: e.frames };
      m.set(e.frame, x);
    }
  }
  return m;
}

/**
 * Frame playhead driven by requestAnimationFrame. Honours hitstop (playhead holds) and timeScale (playhead slows)
 * commands found in the events; seeking never triggers them.
 */
export function usePlayback(opts: { total: number; fps: number; speed: number; loop: boolean; events: Timing.TimingEvent[]; onWrap?: () => void }) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fx, setFx] = useState<PlaybackFx>({ freeze: 0, slow: 1 });
  const frameRef = useRef(0);
  const o = useRef(opts);
  o.current = opts;
  const fxMap = useRef(fxByFrame(opts.events));
  fxMap.current = fxByFrame(opts.events);
  const sim = useRef({ acc: 0, freeze: 0, slowLeft: 0, slowScale: 1 });

  const seek = useCallback((f: number) => {
    const n = Math.max(0, Math.min(o.current.total - 1, Math.round(f)));
    frameRef.current = n;
    Object.assign(sim.current, { acc: 0, freeze: 0, slowLeft: 0, slowScale: 1 });
    setFrame(n);
    setFx({ freeze: 0, slow: 1 });
  }, []);

  const pause = useCallback(() => setPlaying(false), []);
  const play = useCallback(() => {
    if (frameRef.current >= o.current.total - 1) seek(0);
    setPlaying(true);
  }, [seek]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const s = sim.current;
    const tick = (now: number) => {
      const { fps, speed, total, loop } = o.current;
      let real = (Math.min(100, now - last) / 1000) * fps * speed;
      last = now;
      let stop = false;
      while (real > 0 && !stop) {
        const q = Math.min(real, 1);
        real -= q;
        if (s.freeze > 0) { s.freeze = Math.max(0, s.freeze - q); continue; }
        const rate = s.slowLeft > 0 ? s.slowScale : 1;
        if (s.slowLeft > 0) s.slowLeft = Math.max(0, s.slowLeft - q);
        s.acc += q * rate;
        while (s.acc >= 1 && !stop) {
          s.acc -= 1;
          let next = frameRef.current + 1;
          if (next >= total) {
            if (loop) { next = 0; o.current.onWrap?.(); s.freeze = 0; s.slowLeft = 0; } else { stop = true; break; }
          }
          frameRef.current = next;
          const f = fxMap.current.get(next);
          if (f) {
            if (f.hitstop) s.freeze += f.hitstop;
            if (f.slow) { s.slowLeft = f.slow.frames; s.slowScale = f.slow.scale; }
          }
          if (s.freeze > 0) break;
        }
      }
      setFrame(frameRef.current);
      setFx((p) => {
        const nf = Math.ceil(s.freeze);
        const ns = s.slowLeft > 0 ? s.slowScale : 1;
        return p.freeze === nf && p.slow === ns ? p : { freeze: nf, slow: ns };
      });
      if (stop) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return { frame, frameRef, playing, play, pause, seek, fx };
}
