import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Timing } from "@gml/core";
import { actionSpans, attackSpans, pressMarks, traceRanges } from "./frameModel";
import { describeEvent, dropReasonText, eventTone } from "./helpers";
import { useTimingText } from "./i18n";

const LABEL_W = 78;
const ZOOMS = [3, 4, 6, 8, 12, 16, 24, 32];
const TICKS = [1, 2, 5, 10, 20, 30, 60, 120];
const FALLBACK = ["#7c95ff", "#f59e0b", "#2dd4bf", "#c084fc", "#fb7185"];

/** Horizontal frame timeline: attacks, each interaction's phases, key presses, resolutions, stun / invulnerability. */
export function FrameBar({ config, run, attacks = [], from, to, playhead, onSeek, hitTells = true }: {
  config: Timing.TimingConfig;
  run: { events: Timing.TimingEvent[]; trace: Timing.FrameTrace[] };
  attacks?: { def: Timing.AttackDef; start: number }[];
  from: number;
  to: number;
  playhead: number;
  onSeek?: (frame: number) => void;
  /** Draw a tell for every hit (default); false = only the first hit's. */
  hitTells?: boolean;
}) {
  const t = useTimingText().frameBar;
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
  const atk = useMemo(() => attacks.map((a) => attackSpans(config, a.def, a.start, { hitTells })), [config, attacks, hitTells]);
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
        <button type="button" className="tm-btn" onClick={() => setZi((z) => Math.max(0, z - 1))} disabled={zi === 0} aria-label={t.zoomOut}>－</button>{/* i18n-ignore: glyph */}
        <span className="tm-muted">{t.pxPerFrame(fw)}</span>
        <button type="button" className="tm-btn" onClick={() => setZi((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zi === ZOOMS.length - 1} aria-label={t.zoomIn}>＋</button>{/* i18n-ignore: glyph */}
        <span className="tm-fb-legend">
          <i className="lg k-perfect" />{t.legend.perfect} <i className="lg k-success" />{t.legend.success} <i className="lg k-fail" />{t.legend.fail} <i className="lg k-neutral" />{t.legend.neutral}
        </span>
      </div>
      <div className="tm-fb-scroll" ref={scroller}>
        <div className="tm-fb-inner" ref={inner} style={{ width: LABEL_W + width }} onClick={click}>
          <div className="tm-fb-row tm-fb-ruler">
            <div className="tm-fb-label">{t.rulerLabel}</div>
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
              <div className="tm-fb-label">{t.attackRow}</div>
              <div className={`tm-fb-track${fw >= 6 ? " grid" : ""}`} style={{ width, ...gridStyle }}>
                {atk.map((a, i) => (
                  <div key={i}>
                    <div className="tm-seg seg-windup" style={{ ...seg(a.windup.from, a.windup.to), background: `color-mix(in srgb, ${colorOf(i, a.color)} 30%, transparent)` }} title={t.windup(a.name, a.windup.to - a.windup.from)}>{a.name}</div>
                    {a.tells.map((tl) => tl.to > tl.from && <div key={`t${tl.hit}`} className="tm-seg seg-tell" style={seg(tl.from, tl.to)} title={t.telegraph(tl.to - tl.from)} />)}
                    {a.recovery.to > a.recovery.from && <div className="tm-seg seg-arec" style={seg(a.recovery.from, a.recovery.to)} title={t.recovery(a.recovery.to - a.recovery.from)} />}
                    {a.hits.map((h, j) => <div key={j} className="tm-mark mk-hit" style={{ left: x(h) + fw / 2, background: colorOf(i, a.color) }} title={t.attackHit(a.name, j + 1, h)} />)}
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
                    {a.startup && <div className="tm-seg seg-startup" style={seg(a.startup.from, a.startup.to)} title={t.startup(a.startup.to - a.startup.from)} />}
                    {a.windows.map((w) => (
                      <div key={w.id} className={`tm-seg seg-window${w.strict ? " strict" : ""}`} style={{ ...seg(w.from, w.to), background: colorOf(idx, it.color) }} title={t.window(w.name, w.from, w.to - 1, w.to - w.from, Math.round(Timing.framesToMs(w.to - w.from, config.fps)), !!w.strict)}>
                        {(w.to - w.from) * fw >= 28 ? w.name : ""}
                      </div>
                    ))}
                    {a.recovery && <div className="tm-seg seg-recovery" style={seg(a.recovery.from, a.recovery.to)} title={t.recovery(a.recovery.to - a.recovery.from)} />}
                  </div>
                ))}
                {presses.filter((p) => p.interaction === it.id).map((p, i) => (
                  <div
                    key={i}
                    className={`tm-mark mk-press ${p.status}`}
                    style={{ left: x(p.frame) + fw / 2 }}
                    title={t.press(p.frame, it.name, p.status === "accepted" ? t.pressAccepted : p.status === "buffered" ? t.pressBuffered : t.pressDropped(dropReasonText(p.reason!)))}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="tm-fb-row">
            <div className="tm-fb-label">{t.resolveRow}</div>
            <div className={`tm-fb-track${fw >= 6 ? " grid" : ""}`} style={{ width, ...gridStyle }}>
              {resolves.map((r, i) => (
                <div key={i} className={`tm-mark mk-resolve k-${eventTone(config, r)}`} style={{ left: x(r.frame) + fw / 2 }} title={describeEvent(config, r)} />
              ))}
            </div>
          </div>

          <div className="tm-fb-row">
            <div className="tm-fb-label">{t.statusRow}</div>
            <div className="tm-fb-track" style={{ width }}>
              {stun.map((s, i) => <div key={`s${i}`} className="tm-seg seg-stun" style={seg(s.from, s.to)} title={t.stun(s.to - s.from)} />)}
              {invul.map((s, i) => <div key={`i${i}`} className="tm-seg seg-invul" style={seg(s.from, s.to)} title={t.invulnerable(s.to - s.from)} />)}
            </div>
          </div>

          <div className="tm-fb-playhead" style={{ left: LABEL_W + x(playhead) + fw / 2 }} />
        </div>
      </div>
    </div>
  );
}
