import { getLocale } from "@gml/ui/i18n";
import { useEffect, useRef, useState } from "react";
import { useText } from "./i18n";
import { JUDGE_HISTORY, upcomingImpacts, type ImpactMark, type Session } from "./game";
import { buildLogLines, buildStripModel, STRIP_AHEAD, STRIP_PAST, type LogLine } from "./judge/model";
import { drawStrip, stripHeight } from "./judge/strip";

const MAX_SCRUB = JUDGE_HISTORY - STRIP_PAST;

/**
 * Judgement strip under the stage: last ~2 s of incoming impacts, each interaction's phases, presses and results,
 * plus a rolling log. While paused (and `freeze`) a slider scrubs back through the ring buffer.
 */
export function JudgePanel({ sessionRef, paused, freeze }: {
  sessionRef: { current: Session };
  paused: boolean;
  freeze: boolean;
}) {
  const t = useText().judge;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [scrub, setScrub] = useState(0);
  const live = useRef({ paused, freeze, scrub });
  live.current = { paused, freeze, scrub };

  useEffect(() => { if (!paused) setScrub(0); }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    let raf = 0;
    let lastKey = "";
    let lastLog = "";
    const upcoming: ImpactMark[] = [];
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const l = live.current;
      const s = sessionRef.current;
      const back = l.paused && l.freeze ? l.scrub : 0;
      const end = s.world.frame - 1 - back;
      const cfg = s.world.config;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth || 600;
      const h = stripHeight(cfg);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.height = h + "px";
        lastKey = "";
      }
      // Redraw only when the log, playhead or layout changed (upcoming impacts shift with every world step).
      const key = `${getLocale()}|${s.judge.version}|${end}|${Math.round(w)}|${cfg.id}|${cfg.interactions.length}`;
      if (key === lastKey) return;
      lastKey = key;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const m = buildStripModel(cfg, s.judge, end, back === 0 ? upcomingImpacts(s.world, upcoming) : [], STRIP_PAST, STRIP_AHEAD);
      drawStrip(ctx, w, m, cfg, end);
      const next = buildLogLines(cfg, s.judge, end);
      const sig = getLocale() + "|" + next.map((x) => x.key).join(",");
      if (sig !== lastLog) { lastLog = sig; setLines(next); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sessionRef]);

  const frozen = paused && freeze;
  return (
    <section className="bp-judge" aria-label={t.aria}>
      <div className="bp-judge-head">
        <b>{t.title}</b>
        <span className="bp-dim">{t.legend}</span>
        {frozen ? <span className="bp-judge-frozen">{t.frozen}</span> : null}
      </div>
      <canvas ref={canvasRef} className="bp-judge-canvas" />
      {frozen ? (
        <label className="bp-judge-scrub">
          <span>{t.scrub((scrub / 60).toFixed(1))}</span>
          <input type="range" min={0} max={MAX_SCRUB} step={1} value={scrub} onChange={(e) => setScrub(Number(e.target.value))} aria-label={t.scrubAria} />
        </label>
      ) : null}
      <ol className="bp-judge-log" role="log" aria-live="off">
        {lines.length === 0 ? <li className="bp-dim">{t.empty}</li> : lines.map((ln) => (
          <li key={ln.key} className={"tone-" + ln.tone}><i>{ln.frame}</i>{ln.text}</li>
        ))}
      </ol>
    </section>
  );
}
