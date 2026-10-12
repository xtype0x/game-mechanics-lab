import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timing } from "@gml/core";
import { FrameBar, Segmented, TimingEditor, TimingLog, TimingPresetMenu, exportTimingConfig, parseTimingConfig, pct } from "@gml/ui";
import { useLocale } from "@gml/ui/i18n";
import { save } from "../shell/config";
import { bulletParryDefault, gamePresets } from "../shell/presets";
import { attackPhaseAt } from "./attacks";
import { useText } from "./i18n";
import { Scene } from "./Scene";
import { ScriptPanel } from "./ScriptPanel";
import { SequencePanel } from "./SequencePanel";
import { SESSION_KEY, buildScript, defaultSession, loadSession, normalizePresses, relocalizeSession, type PressRec, type Session } from "./session";
import { computeStats } from "./stats";
import { usePlayback } from "./usePlayback";

type Mode = "live" | "replay";
const EMPTY_RUN = { events: [] as Timing.TimingEvent[], trace: [] as Timing.FrameTrace[] };

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

interface LabModeProps {
  /** The timing rules, shared with the bullet-parry mode (owned by the shell, which also saves them). */
  config: Timing.TimingConfig;
  onConfigChange: (config: Timing.TimingConfig) => void;
  onSwitchMode: () => void;
}

export function LabMode({ config, onConfigChange, onSwitchMode }: LabModeProps) {
  const [locale] = useLocale();
  const T = useText();
  const t = T.app;
  const [session, setSession] = useState(loadSession);
  const [mode, setMode] = useState<Mode>("live");
  const [speed, setSpeed] = useState(1);
  const [editorOpen, setEditorOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 960);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const presets = useMemo(() => gamePresets(locale), [locale]);

  // Untouched built-in attacks follow the language (the shell does the same for the shared rules); edited ones are the
  // visitor's data and stay. The swap is not saved: loading relocalizes anyway, and saving it would let an idle tab
  // (synced through the storage event) overwrite edits made in another tab.
  const lastLocale = useRef(locale);
  const skipSave = useRef({ session: false });
  useEffect(() => {
    if (lastLocale.current === locale) return;
    lastLocale.current = locale;
    setSession((s) => { const next = relocalizeSession(s, locale); if (next !== s) skipSave.current.session = true; return next; });
  }, [locale]);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const { script, items } = useMemo(() => buildScript(session, config), [session, config]);
  const result = useMemo(() => {
    try {
      return { run: Timing.runTiming(config, script, { trace: true }), error: null as string | null };
    } catch (e) {
      return { run: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [config, script]);
  const run = result.run ?? EMPTY_RUN;

  const editSession = useCallback((fn: (d: Session) => void) => setSession((s) => { const d = structuredClone(s); fn(d); return d; }), []);
  const setPresses = useCallback((presses: PressRec[]) => editSession((d) => { d.presses = presses; }), [editSession]);

  const pb = usePlayback({
    total: script.frames, fps: config.fps, speed, loop: session.loop, events: run.events,
    onWrap: () => { if (modeRef.current === "live") setPresses([]); },
  });

  // Persist the session (best effort); the shell persists the rules.
  useEffect(() => {
    if (skipSave.current.session) { skipSave.current.session = false; return; }
    const t = window.setTimeout(() => save(SESSION_KEY, session), 300);
    return () => window.clearTimeout(t);
  }, [session]);

  const press = useCallback((interaction: string) => {
    if (modeRef.current !== "live") return;
    const frame = pb.frameRef.current + 1;
    setSession((s) => ({ ...s, presses: normalizePresses([...s.presses, { frame, interaction }], config) }));
  }, [config, pb.frameRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || mode !== "live" || !pb.playing) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      const it = config.interactions.find((i) => i.key && i.key === e.code);
      if (!it) return;
      e.preventDefault();
      press(it.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [config, mode, pb.playing, press]);

  const startLive = () => { setPresses([]); pb.seek(0); pb.play(); };
  const trace = run.trace[pb.frame];
  const shown = useMemo(() => (mode === "live" ? run.events.filter((e) => e.frame <= pb.frame) : run.events), [mode, run.events, pb.frame]);
  const barRun = useMemo(() => (mode === "live" ? { events: shown, trace: run.trace.slice(0, pb.frame + 1) } : run), [mode, shown, run, pb.frame]);
  // locale: the "blocked by invulnerability" label is looked up in the current language.
  const stats = useMemo(() => computeStats(config, shown), [config, shown, locale]);
  const phase = attackPhaseAt(items, pb.frame);
  const nameOf = (id: string) => config.interactions.find((i) => i.id === id)?.name ?? id;

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      onConfigChange(parseTimingConfig(await file.text()));
      setNotice(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="tl-lab">
      <div className="tl-bar">
        <button type="button" className="tm-btn" onClick={() => setEditorOpen((o) => !o)} aria-expanded={editorOpen}>{editorOpen ? t.editorCollapse : t.editorExpand}</button>
        <TimingPresetMenu presets={presets} onPick={(c) => { onConfigChange(c); setNotice(null); }} />
        <button type="button" className="tm-btn" onClick={() => download(`${config.id || "timing"}.json`, exportTimingConfig(config))}>{t.exportConfig}</button>
        <button type="button" className="tm-btn" onClick={() => fileInput.current?.click()}>{t.importConfig}</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => void onImport(e.target.files?.[0])} />
        <button type="button" className="tm-btn" onClick={() => { onConfigChange(bulletParryDefault()); setSession(defaultSession()); pb.seek(0); setNotice(null); }}>{t.resetAll}</button>
        <button type="button" className="tm-btn primary" onClick={onSwitchMode}>{t.playWith}</button>
        <span className="tm-muted tl-cfgname">{t.current(config.name)}</span>
      </div>
      {notice && <div className="tl-notice" role="alert">{notice}</div>}
      {result.error && <div className="tl-notice" role="alert">{t.runFailed(result.error)}</div>}

      <div className={`tl-main${editorOpen ? "" : " no-editor"}`}>
        {editorOpen && <aside className="tl-left"><TimingEditor config={config} onChange={onConfigChange} /></aside>}
        <div className="tl-center">
          <Scene config={config} frame={pb.frame} trace={trace} events={shown} items={items} fx={pb.fx} />

          <div className="tl-transport">
            <Segmented<Mode> value={mode} onChange={(m) => { setMode(m); pb.pause(); }} options={[{ value: "live", label: t.modeLive }, { value: "replay", label: t.modeReplay }]} />
            {mode === "live" ? (
              <>
                <button type="button" className="tm-btn primary" onClick={startLive}>{pb.playing ? t.restart : t.start}</button>
                <button type="button" className="tm-btn" onClick={() => (pb.playing ? pb.pause() : pb.play())} disabled={!pb.playing && pb.frame === 0}>{pb.playing ? t.pause : t.resume}</button>
              </>
            ) : (
              <>
                <button type="button" className="tm-btn primary" onClick={() => (pb.playing ? pb.pause() : pb.play())}>{pb.playing ? t.pause : t.play}</button>
                <button type="button" className="tm-btn" onClick={() => { pb.pause(); pb.seek(pb.frame - 1); }} aria-label={t.prevFrameLabel}>{t.prevFrame}</button>
                <button type="button" className="tm-btn" onClick={() => { pb.pause(); pb.seek(pb.frame + 1); }} aria-label={t.nextFrameLabel}>{t.nextFrame}</button>
                <button type="button" className="tm-btn" onClick={() => pb.seek(0)}>{t.toStart}</button>
              </>
            )}
            <label className="tl-inline">{t.speed}
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label={t.speed}>
                <option value={1}>×1</option><option value={0.5}>×0.5</option><option value={0.25}>×0.25</option>
              </select>
            </label>
            <label className="tm-chip"><input type="checkbox" checked={session.loop} onChange={(e) => editSession((d) => { d.loop = e.target.checked; })} />{t.loop}</label>
          </div>
          <input className="tl-scrub" type="range" min={0} max={Math.max(0, script.frames - 1)} value={pb.frame} onChange={(e) => { if (mode === "replay") pb.pause(); pb.seek(Number(e.target.value)); }} aria-label={t.timeline} />

          <div className="tl-keys" aria-label={t.keys}>
            {config.interactions.map((i) => (
              <button key={i.id} type="button" className="tl-key" style={{ borderColor: i.color }} disabled={mode !== "live" || !pb.playing}
                onPointerDown={(e) => { e.preventDefault(); press(i.id); }}>
                {i.name}<small>{i.key ?? ""}</small>
              </button>
            ))}
            <span className="tm-muted tl-keyhint">{mode === "live" ? (pb.playing ? t.keyHintPlaying : t.keyHintIdle) : t.keyHintReplay}</span>
          </div>

          <FrameBar config={config} run={barRun} attacks={items.map((i) => ({ def: i.def, start: i.start }))} from={0} to={script.frames} playhead={pb.frame}
            onSeek={(f) => { if (mode === "replay") pb.pause(); pb.seek(f); }} />

          <div className="tl-cols">
            <section className="tl-card">
              <h3>{t.logTitle}</h3>
              <TimingLog config={config} events={shown} newestFirst={mode === "live"} onSeek={(f) => { pb.pause(); pb.seek(f); }} />
            </section>
            <section className="tl-card">
              <h3>{t.statsTitle}</h3>
              <p>{t.statsSummary(stats.total, pct(stats.perfectRate))}</p>
              <ul className="tl-stats">
                {stats.outcomes.map((o) => <li key={o.outcome ?? "inv"} className={`k-${o.kind}`}><span className="tl-kdot" />{o.label}<b>{o.count}</b></li>)}
                {stats.outcomes.length === 0 && <li className="tm-muted">{t.noStats}</li>}
              </ul>
              <table className="tl-table">
                <thead><tr><th>{t.colInteraction}</th><th>{t.colCatches}</th><th title={t.meanOffsetTip}>{t.colMeanOffset}</th></tr></thead>
                <tbody>
                  {stats.interactions.filter((s) => s.catches > 0).map((s) => (
                    <tr key={s.interaction}><td>{nameOf(s.interaction)}</td><td>{s.catches}</td><td>{s.meanOffset === null ? "—" : t.offsetFrames(`${s.meanOffset > 0 ? "+" : ""}${Math.round(s.meanOffset * 100) / 100}`)}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="tm-muted tm-note">{t.offsetNote}</p>
            </section>
          </div>

          <div className="tl-cols">
            <section className="tl-card">
              <h3>{t.scriptTitle}</h3>
              <ScriptPanel config={config} presses={session.presses} onChange={setPresses} onSeek={(f) => { pb.pause(); pb.seek(f); }} />
            </section>
            <section className="tl-card">
              <SequencePanel session={session} onChange={editSession} config={config} phase={{ phase: phase.phase, ...(phase.item ? { name: phase.item.def.name } : {}) }} />
            </section>
          </div>
        </div>
      </div>
      <footer className="tl-foot">{t.footer}</footer>
    </div>
  );
}
