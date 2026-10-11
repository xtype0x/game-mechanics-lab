import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timing } from "@gml/core";
import { FrameBar, Segmented, TimingEditor, TimingLog, TimingPresetMenu, exportTimingConfig, parseTimingConfig, pct, type ProjectHost } from "@gml/ui";
import { attackPhaseAt } from "./attacks";
import { Scene } from "./Scene";
import { ScriptPanel } from "./ScriptPanel";
import { SequencePanel } from "./SequencePanel";
import { CONFIG_KEY, SESSION_KEY, buildScript, defaultConfig, defaultSession, loadConfig, loadSession, normalizePresses, save, type PressRec, type Session } from "./session";
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

export function App({ host = {} }: { host?: ProjectHost }) {
  const [config, setConfig] = useState(loadConfig);
  const [session, setSession] = useState(loadSession);
  const [mode, setMode] = useState<Mode>("live");
  const [speed, setSpeed] = useState(1);
  const [editorOpen, setEditorOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 960);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  // Persist (best effort).
  useEffect(() => { const t = window.setTimeout(() => save(CONFIG_KEY, { format: "gml-timing-config", version: 1, config }), 300); return () => window.clearTimeout(t); }, [config]);
  useEffect(() => { const t = window.setTimeout(() => save(SESSION_KEY, session), 300); return () => window.clearTimeout(t); }, [session]);

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
  const stats = useMemo(() => computeStats(config, shown), [config, shown]);
  const phase = attackPhaseAt(items, pb.frame);
  const nameOf = (id: string) => config.interactions.find((i) => i.id === id)?.name ?? id;

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      setConfig(parseTimingConfig(await file.text()));
      setNotice(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="tl">
      <header className="tl-top">
        {host.back && <a className="tl-back" href={host.back.href}>← {host.back.label}</a>}
        <h1>格擋閃避判定研究室</h1>
        <p className="tm-muted">格擋和閃避只是兩筆互動資料：可以改判定窗、結果與效果，也能新增自己的互動，再用攻擊序列和按鍵腳本逐幀拆解。</p>
      </header>

      <div className="tl-bar">
        <button type="button" className="tm-btn" onClick={() => setEditorOpen((o) => !o)} aria-expanded={editorOpen}>{editorOpen ? "收起規則編輯器" : "展開規則編輯器"}</button>
        <TimingPresetMenu onPick={(c) => { setConfig(c); setNotice(null); }} />
        <button type="button" className="tm-btn" onClick={() => download(`${config.id || "timing"}.json`, exportTimingConfig(config))}>匯出設定</button>
        <button type="button" className="tm-btn" onClick={() => fileInput.current?.click()}>匯入設定</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => void onImport(e.target.files?.[0])} />
        <button type="button" className="tm-btn" onClick={() => { setConfig(defaultConfig()); setSession(defaultSession()); pb.seek(0); setNotice(null); }}>全部重設</button>
        <span className="tm-muted tl-cfgname">目前：{config.name}</span>
      </div>
      {notice && <div className="tl-notice" role="alert">{notice}</div>}
      {result.error && <div className="tl-notice" role="alert">規則執行失敗：{result.error}。請檢查編輯器的驗證面板。</div>}

      <div className={`tl-main${editorOpen ? "" : " no-editor"}`}>
        {editorOpen && <aside className="tl-left"><TimingEditor config={config} onChange={setConfig} /></aside>}
        <div className="tl-center">
          <Scene config={config} frame={pb.frame} trace={trace} events={shown} items={items} fx={pb.fx} />

          <div className="tl-transport">
            <Segmented<Mode> value={mode} onChange={(m) => { setMode(m); pb.pause(); }} options={[{ value: "live", label: "即時" }, { value: "replay", label: "回放" }]} />
            {mode === "live" ? (
              <>
                <button type="button" className="tm-btn primary" onClick={startLive}>{pb.playing ? "重新開始" : "開始"}</button>
                <button type="button" className="tm-btn" onClick={() => (pb.playing ? pb.pause() : pb.play())} disabled={!pb.playing && pb.frame === 0}>{pb.playing ? "暫停" : "繼續"}</button>
              </>
            ) : (
              <>
                <button type="button" className="tm-btn primary" onClick={() => (pb.playing ? pb.pause() : pb.play())}>{pb.playing ? "暫停" : "播放"}</button>
                <button type="button" className="tm-btn" onClick={() => { pb.pause(); pb.seek(pb.frame - 1); }} aria-label="上一幀">◀ 幀</button>
                <button type="button" className="tm-btn" onClick={() => { pb.pause(); pb.seek(pb.frame + 1); }} aria-label="下一幀">幀 ▶</button>
                <button type="button" className="tm-btn" onClick={() => pb.seek(0)}>回到開頭</button>
              </>
            )}
            <label className="tl-inline">速度
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="速度">
                <option value={1}>×1</option><option value={0.5}>×0.5</option><option value={0.25}>×0.25</option>
              </select>
            </label>
            <label className="tm-chip"><input type="checkbox" checked={session.loop} onChange={(e) => editSession((d) => { d.loop = e.target.checked; })} />循環</label>
          </div>
          <input className="tl-scrub" type="range" min={0} max={Math.max(0, script.frames - 1)} value={pb.frame} onChange={(e) => { if (mode === "replay") pb.pause(); pb.seek(Number(e.target.value)); }} aria-label="時間軸" />

          <div className="tl-keys" aria-label="按鍵">
            {config.interactions.map((i) => (
              <button key={i.id} type="button" className="tl-key" style={{ borderColor: i.color }} disabled={mode !== "live" || !pb.playing}
                onPointerDown={(e) => { e.preventDefault(); press(i.id); }}>
                {i.name}<small>{i.key ?? ""}</small>
              </button>
            ))}
            <span className="tm-muted tl-keyhint">{mode === "live" ? (pb.playing ? "用鍵盤或按鈕出手" : "按「開始」後可按鍵") : "回放模式：按鍵來自腳本"}</span>
          </div>

          <FrameBar config={config} run={barRun} attacks={items.map((i) => ({ def: i.def, start: i.start }))} from={0} to={script.frames} playhead={pb.frame}
            onSeek={(f) => { if (mode === "replay") pb.pause(); pb.seek(f); }} />

          <div className="tl-cols">
            <section className="tl-card">
              <h3>判定紀錄</h3>
              <TimingLog config={config} events={shown} newestFirst={mode === "live"} onSeek={(f) => { pb.pause(); pb.seek(f); }} />
            </section>
            <section className="tl-card">
              <h3>統計</h3>
              <p>結算 <b>{stats.total}</b> 次，完美率 <b>{pct(stats.perfectRate)}</b></p>
              <ul className="tl-stats">
                {stats.outcomes.map((o) => <li key={o.outcome ?? "inv"} className={`k-${o.kind}`}><span className="tl-kdot" />{o.label}<b>{o.count}</b></li>)}
                {stats.outcomes.length === 0 && <li className="tm-muted">尚無結算。</li>}
              </ul>
              <table className="tl-table">
                <thead><tr><th>互動</th><th>攔截</th><th title="命中幀 − 按下幀；正數 = 提早按">平均偏移</th></tr></thead>
                <tbody>
                  {stats.interactions.filter((s) => s.catches > 0).map((s) => (
                    <tr key={s.interaction}><td>{nameOf(s.interaction)}</td><td>{s.catches}</td><td>{s.meanOffset === null ? "—" : `${s.meanOffset > 0 ? "+" : ""}${Math.round(s.meanOffset * 100) / 100} 幀`}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="tm-muted tm-note">偏移 = 命中幀 − 按下幀（正數代表提早按）。</p>
            </section>
          </div>

          <div className="tl-cols">
            <section className="tl-card">
              <h3>腳本（按鍵）</h3>
              <ScriptPanel config={config} presses={session.presses} onChange={setPresses} onSeek={(f) => { pb.pause(); pb.seek(f); }} />
            </section>
            <section className="tl-card">
              <SequencePanel session={session} onChange={editSession} config={config} phase={{ phase: phase.phase, ...(phase.item ? { name: phase.item.def.name } : {}) }} />
            </section>
          </div>
        </div>
      </div>
      <footer className="tl-foot">規則：docs/spec/timing.md（反應判定規格 1.0）。設定與腳本只存在這個瀏覽器（localStorage：gml.timing-lab.*）。</footer>
    </div>
  );
}
