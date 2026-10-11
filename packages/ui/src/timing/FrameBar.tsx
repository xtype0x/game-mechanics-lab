import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Timing } from "@gml/core";
import { actionSpans, attackSpans, pressMarks, traceRanges } from "./frameModel";
import { describeEvent, dropReasonText, eventTone } from "./helpers";

const LABEL_W = 78;
const ZOOMS = [3, 4, 6, 8, 12, 16, 24, 32];
const TICKS = [1, 2, 5, 10, 20, 30, 60, 120];
const FALLBACK = ["#7c95ff", "#f59e0b", "#2dd4bf", "#c084fc", "#fb7185"];

/** Horizontal frame timeline: attacks, each interaction's phases, key presses, resolutions, stun / invulnerability. */
export function FrameBar({ config, run, attacks = [], from, to, playhead, onSeek }: {
  config: Timing.TimingConfig;
  run: { events: Timing.TimingEvent[]; trace: Timing.FrameTrace[] };
  attacks?: { def: Timing.AttackDef; start: number }[];
  from: number;
  to: number;
  playhead: number;
  onSeek?: (frame: number) => void;
}) {
  const [zi, setZi] = useState(3);
  const fw = ZOOMS[zi]!;
  const scroller = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const span = Math.max(1, to - from);
  const width = span * fw;
  const x = (f: number) => (f - from) * fw;
  const seg = (a: number, b: number): CSSProperties => ({ left: x(a), width: Math.max(1, (b - a) * fw) });

  const actions = useMemo(() => actionSpans(config, run.events, to), [config, run.events, to]);
  const presses = useMemo(() => pressMarks(run.events), [run.events]);
  const stun = useMemo(() => traceRanges(run.trace, (t) => t.stunned), [run.trace]);
  const invul = useMemo(() => traceRanges(run.trace, (t) => t.invulnerable), [run.trace]);
  const atk = useMemo(() => attacks.map((a) => attackSpans(config, a.def, a.start)), [config, attacks]);
  const resolves = useMemo(() => run.events.filter((e): e is Extract<Timing.TimingEvent, { type: "resolve" }> => e.type === "resolve"), [run.events]);

  // Keep the playhead in view while it moves.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const px = LABEL_W + x(playhead);
    if (px < el.scrollLeft + LABEL_W + 8 || px > el.scrollLeft + el.clientWidth - 24) el.scrollLeft = Math.max(0, px - el.clientWidth / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playhead, fw]);

  const tickStep = TICKS.find((s) => s * fw >= 44) ?? 120;
  const ticks: number[] = [];
  for (let f = Math.ceil(from / tickStep) * tickStep; f < to; f += tickStep) ticks.push(f);

  const click = (e: React.MouseEvent) => {
    if (!onSeek || !inner.current) return;
    const px = e.clientX - inner.current.getBoundingClientRect().left - LABEL_W;
    if (px < 0) return;
    onSeek(Math.min(to - 1, from + Math.floor(px / fw)));
  };

  const gridStyle: CSSProperties = fw >= 6 ? { backgroundSize: `${fw}px 100%` } : {};
  const colorOf = (i: number, c?: string) => c ?? FALLBACK[i % FALLBACK.length]!;

  return (
    <div className="tm-fb">
      <div className="tm-fb-tools">
        <button type="button" className="tm-btn" onClick={() => setZi((z) => Math.max(0, z - 1))} disabled={zi === 0} aria-label="縮小">－</button>
        <span className="tm-muted">{fw}px／幀</span>
        <button type="button" className="tm-btn" onClick={() => setZi((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zi === ZOOMS.length - 1} aria-label="放大">＋</button>
        <span className="tm-fb-legend">
          <i className="lg k-perfect" />完美 <i className="lg k-success" />成功 <i className="lg k-fail" />失敗 <i className="lg k-neutral" />其他
        </span>
      </div>
      <div className="tm-fb-scroll" ref={scroller}>
        <div className="tm-fb-inner" ref={inner} style={{ width: LABEL_W + width }} onClick={click}>
          <div className="tm-fb-row tm-fb-ruler">
            <div className="tm-fb-label">幀／毫秒</div>
            <div className="tm-fb-track" style={{ width }}>
              {ticks.map((f) => (
                <span key={f} className="tm-fb-tick" style={{ left: x(f) }}>
                  {f}<small>{Math.round(Timing.framesToMs(f, config.fps))}ms</small>
                </span>
              ))}
            </div>
          </div>

          {atk.length > 0 && (
            <div className="tm-fb-row">
              <div className="tm-fb-label">攻擊</div>
              <div className={`tm-fb-track${fw >= 6 ? " grid" : ""}`} style={{ width, ...gridStyle }}>
                {atk.map((a, i) => (
                  <div key={i}>
                    <div className="tm-seg seg-windup" style={{ ...seg(a.windup.from, a.windup.to), background: `color-mix(in srgb, ${colorOf(i, a.color)} 30%, transparent)` }} title={`${a.name}：前搖 ${a.windup.to - a.windup.from} 幀`}>{a.name}</div>
                    {a.telegraph.to > a.telegraph.from && <div className="tm-seg seg-tell" style={seg(a.telegraph.from, a.telegraph.to)} title={`預兆 ${a.telegraph.to - a.telegraph.from} 幀`} />}
                    {a.recovery.to > a.recovery.from && <div className="tm-seg seg-arec" style={seg(a.recovery.from, a.recovery.to)} title={`收招 ${a.recovery.to - a.recovery.from} 幀`} />}
                    {a.hits.map((h, j) => <div key={j} className="tm-mark mk-hit" style={{ left: x(h) + fw / 2, background: colorOf(i, a.color) }} title={`${a.name} 第 ${j + 1} 段命中：第 ${h} 幀`} />)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {config.interactions.map((it, idx) => (
            <div key={it.id} className="tm-fb-row">
              <div className="tm-fb-label" style={{ borderLeftColor: colorOf(idx, it.color) }}>{it.name}</div>
              <div className={`tm-fb-track${fw >= 6 ? " grid" : ""}`} style={{ width, ...gridStyle }}>
                {actions.filter((a) => a.interaction === it.id).map((a, i) => (
                  <div key={i}>
                    {a.startup && <div className="tm-seg seg-startup" style={seg(a.startup.from, a.startup.to)} title={`啟動 ${a.startup.to - a.startup.from} 幀`} />}
                    {a.windows.map((w) => (
                      <div key={w.id} className={`tm-seg seg-window${w.strict ? " strict" : ""}`} style={{ ...seg(w.from, w.to), background: colorOf(idx, it.color) }} title={`${w.name}窗：第 ${w.from}–${w.to - 1} 幀（${w.to - w.from} 幀，${Math.round(Timing.framesToMs(w.to - w.from, config.fps))}ms）${w.strict ? "，嚴格" : ""}`}>
                        {(w.to - w.from) * fw >= 28 ? w.name : ""}
                      </div>
                    ))}
                    {a.recovery && <div className="tm-seg seg-recovery" style={seg(a.recovery.from, a.recovery.to)} title={`收招 ${a.recovery.to - a.recovery.from} 幀`} />}
                  </div>
                ))}
                {presses.filter((p) => p.interaction === it.id).map((p, i) => (
                  <div
                    key={i}
                    className={`tm-mark mk-press ${p.status}`}
                    style={{ left: x(p.frame) + fw / 2 }}
                    title={`第 ${p.frame} 幀按下 ${it.name}：${p.status === "accepted" ? "接受" : p.status === "buffered" ? "進入緩衝" : `丟棄（${dropReasonText(p.reason!)}）`}`}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="tm-fb-row">
            <div className="tm-fb-label">結算</div>
            <div className={`tm-fb-track${fw >= 6 ? " grid" : ""}`} style={{ width, ...gridStyle }}>
              {resolves.map((r, i) => (
                <div key={i} className={`tm-mark mk-resolve k-${eventTone(config, r)}`} style={{ left: x(r.frame) + fw / 2 }} title={describeEvent(config, r)} />
              ))}
            </div>
          </div>

          <div className="tm-fb-row">
            <div className="tm-fb-label">狀態</div>
            <div className="tm-fb-track" style={{ width }}>
              {stun.map((s, i) => <div key={`s${i}`} className="tm-seg seg-stun" style={seg(s.from, s.to)} title={`硬直 ${s.to - s.from} 幀`} />)}
              {invul.map((s, i) => <div key={`i${i}`} className="tm-seg seg-invul" style={seg(s.from, s.to)} title={`無敵 ${s.to - s.from} 幀`} />)}
            </div>
          </div>

          <div className="tm-fb-playhead" style={{ left: LABEL_W + x(playhead) + fw / 2 }} />
        </div>
      </div>
    </div>
  );
}
