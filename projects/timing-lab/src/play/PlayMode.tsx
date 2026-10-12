import { Timing } from "@gml/core";
import { LanguageSwitch } from "@gml/ui/i18n";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AssetPanel, PackSwitch } from "./AssetPanel";
import { AssetStore } from "./assets/store";
import { JudgePanel } from "./JudgePanel";
import { soundsForEvents } from "./audio/events";
import {
  BULLET_KINDS, bulletKindName, buildKeyMap, createSession, hudOf, keyHint, keyLabel, playableConfig, pressInteraction, scoreOf, shouldSaveBest,
  startBlocker, tickSession, type Hud, type Session,
} from "./game";
import { useText } from "./i18n";
import { createRenderer, type Renderer } from "./render/renderer";
import { SettingsPanel } from "./SettingsPanel";
import { loadBest, loadSettings, saveBest, saveSettings, type GameSettings } from "./storage";
import "./play.css";

type Screen = "title" | "playing" | "over";
type Panel = null | "settings" | "how" | "assets";

interface Result { score: number; seconds: number; perfects: number; hits: number; newBest: boolean; practice: boolean }

/** Copies `name`/`description` strings from `src` into the same-shaped `dst` (a relocalized copy of the same rules). */
function copyText(dst: unknown, src: unknown): void {
  if (!dst || !src || typeof dst !== "object" || typeof src !== "object") return;
  const d = dst as Record<string, unknown>, s = src as Record<string, unknown>;
  for (const k of Object.keys(s)) {
    if ((k === "name" || k === "description") && typeof s[k] === "string") d[k] = s[k];
    else copyText(d[k], s[k]);
  }
}

/** Session for the current rules and settings; rules with errors fall back to the default so the backdrop still runs. */
const sessionFor = (config: Timing.TimingConfig, s: GameSettings, seed?: number): Session =>
  createSession(playableConfig(config), { difficulty: s.difficulty, practice: s.practice, ...(seed !== undefined ? { seed } : {}) });

const STEP_MS = 1000 / 60;
const GAME_OVER_DELAY_TICKS = 50;

interface PlayModeProps {
  /** The timing rules, shared with the frame lab (owned by the shell). */
  config: Timing.TimingConfig;
  onConfigChange: (config: Timing.TimingConfig) => void;
  onSwitchMode: () => void;
}

export function PlayMode({ config, onConfigChange, onSwitchMode }: PlayModeProps) {
  const t = useText().app;
  const th = useText().how;
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [store] = useState(() => new AssetStore({ activeId: settings.packActive, lastId: settings.packLast, volume: settings.volume, muted: settings.muted }));
  const assets = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [screen, setScreen] = useState<Screen>("title");
  const [paused, setPaused] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [best, setBest] = useState(loadBest);
  const [result, setResult] = useState<Result | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const sessionRef = useRef<Session>(sessionFor(config, settings));
  const live = useRef({ screen, paused, panel, best, settings, config });
  live.current = { screen, paused, panel, best, settings, config };

  useEffect(() => { void store.init(); }, [store]);

  // Browsers only start audio after a user gesture.
  useEffect(() => {
    const unlock = () => store.audio.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, [store]);

  // Persist the active pack and audio settings next to the other settings.
  useEffect(() => {
    const cur = live.current.settings;
    if (cur.packActive === assets.activeId && cur.packLast === assets.lastId && cur.volume === assets.volume && cur.muted === assets.muted) return;
    const next = { ...cur, packActive: assets.activeId, packLast: assets.lastId, volume: assets.volume, muted: assets.muted };
    setSettings(next);
    saveSettings(next);
  }, [assets.activeId, assets.lastId, assets.volume, assets.muted]);

  // ?debug exposes the live session for manual QA scripts.
  useEffect(() => {
    if (new URLSearchParams(location.search).has("debug")) (window as unknown as { __bp: unknown }).__bp = { session: () => sessionRef.current, store };
  }, [store]);

  const keyMap = useMemo(() => buildKeyMap(config, settings.keys), [config, settings.keys]);
  const hint = useCallback((id: string) => keyHint(live.current.config, id, keyLabel, live.current.settings.keys), []);

  const start = useCallback(() => {
    const s = live.current.settings;
    if (startBlocker(live.current.config)) return;
    sessionRef.current = sessionFor(live.current.config, s, Math.floor(Math.random() * 0x7fffffff));
    rendererRef.current?.reset();
    setResult(null);
    setPaused(false);
    setPanel(null);
    setHud(hudOf(sessionRef.current.world));
    setScreen("playing");
  }, []);

  const toTitle = useCallback(() => {
    sessionRef.current = sessionFor(live.current.config, live.current.settings);
    rendererRef.current?.reset();
    setHud(hudOf(sessionRef.current.world));
    setPaused(false);
    setPanel(null);
    setScreen("title");
  }, []);

  const press = useCallback((id: string) => {
    const l = live.current;
    if (l.screen === "playing" && !l.paused && !l.panel) pressInteraction(sessionRef.current, id);
  }, []);

  const changeSettings = useCallback((s: GameSettings, persist = true) => {
    setSettings(s);
    if (persist) saveSettings(s);
    if (live.current.screen === "title") {
      sessionRef.current = sessionFor(live.current.config, s);
      setHud(hudOf(sessionRef.current.world));
    }
  }, []);

  // The rules are owned by the shell (shared with the frame lab); follow them when they change (a language switch
  // relocalizing built-ins, a preset, an import, an edit in the editor). On the title screen the backdrop session is rebuilt.
  // A game in progress keeps its world; only the display names change (same structure, so copy the text in place), and
  // structural edits apply from the next round.
  const lastConfig = useRef(config);
  useEffect(() => {
    if (lastConfig.current === config) return;
    lastConfig.current = config;
    if (live.current.screen === "title") {
      sessionRef.current = sessionFor(config, live.current.settings);
    } else {
      copyText(sessionRef.current.world.config, playableConfig(config));
    }
    setHud(hudOf(sessionRef.current.world));
  }, [config]);

  // Main loop: fixed 60 Hz ticks, render every animation frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const renderer = createRenderer(canvas, store.registry);
    rendererRef.current = renderer;
    let raf = 0;
    let prev = performance.now();
    let acc = 0;
    let n = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      acc += Math.min(100, now - prev);
      prev = now;
      const l = live.current;
      const s = sessionRef.current;
      const running = l.screen === "playing" && !l.paused && !l.panel;
      if (running) {
        for (let i = 0; acc >= STEP_MS && i < 5; i++) {
          const events = tickSession(s);
          renderer.push(events);
          if (events.length) store.audio.playAll(soundsForEvents(events));
          acc -= STEP_MS;
          if (s.world.over && s.overTicks > GAME_OVER_DELAY_TICKS) break;
        }
        if (acc > STEP_MS) acc = 0;
      } else acc = 0;
      renderer.render(s, {
        best: l.best, hint: (id) => keyHint(l.config, id, keyLabel, l.settings.keys),
        screenArt: l.screen === "over" ? "screen.gameOver" : l.screen === "title" && !l.panel ? "screen.title" : null,
      });
      if (running) {
        if (n++ % 3 === 0) setHud(hudOf(s.world));
        if (s.world.over && s.overTicks > GAME_OVER_DELAY_TICKS) {
          const score = scoreOf(s.world);
          const practice = s.world.practice;
          const newBest = shouldSaveBest(practice, score, l.best);
          if (newBest) { saveBest(score); setBest(score); }
          setHud(hudOf(s.world));
          setResult({
            score, seconds: s.world.frame / 60, perfects: s.world.stats.perfects,
            hits: s.world.stats.hits, newBest, practice,
          });
          setScreen("over");
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); rendererRef.current = null; };
  }, [store]);

  // Keyboard.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const l = live.current;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (l.screen === "playing" && (e.code === "Escape" || e.code === "KeyP")) {
        e.preventDefault();
        setPanel(null);
        setPaused((p) => !p);
        return;
      }
      const id = keyMap.get(e.code);
      if (id && l.screen === "playing") {
        e.preventDefault();
        press(id);
      } else if (l.screen === "title" && e.code === "Enter" && !l.panel) {
        start();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [keyMap, press, start]);

  // Pause when the tab is hidden.
  useEffect(() => {
    const hide = () => { if (live.current.screen === "playing") setPaused(true); };
    const vis = () => { if (document.hidden) hide(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", hide);
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("blur", hide); };
  }, []);

  const blocker = startBlocker(config);
  const keyChips = (
    <p className="bp-keychips" aria-label={t.keysLabel}>
      {config.interactions.map((i, n) => (
        <span key={n + ":" + i.id}><b style={{ color: i.color }}>{i.name}</b><kbd>{hint(i.id) || t.buttonFallback}</kbd></span>
      ))}
      <span><b>{t.pause}</b><kbd>Esc / P</kbd></span>
    </p>
  );
  const items = (hud ?? hudOf(sessionRef.current.world)).interactions;
  const showHow = panel === "how";
  const manage = () => setPanel("assets");
  const artClass = (slot: string) => (assets.version >= 0 && store.registry.has(slot) ? " art" : "");

  return (
    <div className="bp-root">
      <p className="bp-rules bp-dim">{t.rulesLabel(config.name)}</p>

      <div className="bp-stage">
        <canvas ref={canvasRef} className="bp-canvas" />

        {screen === "playing" && !paused && !panel ? (
          <button type="button" className="bp-pause" aria-label={t.pauseAria} onClick={() => setPaused(true)}>Ⅱ</button>
        ) : null}

        {screen === "playing" && !paused && !panel ? (
          <PackSwitch store={store} snap={assets} onManage={manage} compact />
        ) : null}

        {screen === "title" && !panel ? (
          <div className={"bp-overlay" + artClass("screen.title")}>
            <h2 className="bp-title">{t.gameTitle}</h2>
            <p className="bp-sub">{t.tagline}</p>
            {best > 0 ? <p className="bp-dim">{t.bestScore(best)}</p> : null}
            {settings.practice ? <p className="bp-practice">{t.practiceNote}</p> : null}
            {blocker ? <p className="bp-error" role="alert">{blocker}</p> : null}
            <div className="bp-row">
              <button type="button" className="bp-btn primary" onClick={start} autoFocus disabled={!!blocker}>{t.startGame}</button>
              <button type="button" className="bp-btn" onClick={() => setPanel("settings")}>{t.settings}</button>
              <button type="button" className="bp-btn" onClick={() => setPanel("assets")}>{t.assets}</button>
              <button type="button" className="bp-btn" onClick={() => setPanel("how")}>{t.howToPlay}</button>
              <button type="button" className="bp-btn" onClick={onSwitchMode}>{t.frameLab}</button>
            </div>
            <PackSwitch store={store} snap={assets} onManage={manage} />
            {keyChips}
            <p className="bp-dim bp-hint">{t.enterToStart}</p>
          </div>
        ) : null}

        {screen === "playing" && paused && !panel ? (
          <div className="bp-overlay">
            <h2>{t.paused}</h2>
            {keyChips}
            <div className="bp-row">
              <button type="button" className="bp-btn primary" onClick={() => setPaused(false)}>{t.resume}</button>
              <button type="button" className="bp-btn" onClick={() => setPanel("settings")}>{t.settings}</button>
              <button type="button" className="bp-btn" onClick={() => setPanel("assets")}>{t.assets}</button>
              <button type="button" className="bp-btn" onClick={() => setPanel("how")}>{t.howToPlay}</button>
              <button type="button" className="bp-btn ghost" onClick={toTitle}>{t.toTitle}</button>
            </div>
            <PackSwitch store={store} snap={assets} onManage={manage} />
          </div>
        ) : null}

        {screen === "over" && result ? (
          <div className={"bp-overlay" + artClass("screen.gameOver")}>
            <h2>{t.gameOver}</h2>
            <p className="bp-score">{result.score}</p>
            {result.practice ? <p className="bp-dim">{t.practiceOver}</p> : result.newBest ? <p className="bp-newbest">{t.newBest}</p> : <p className="bp-dim">{t.best(best)}</p>}
            <p className="bp-dim">
              {t.survived(`${Math.floor(result.seconds / 60)}:${String(Math.floor(result.seconds % 60)).padStart(2, "0")}`, result.perfects, result.hits)}
            </p>
            <div className="bp-row">
              <button type="button" className="bp-btn primary" onClick={start} autoFocus disabled={!!blocker}>{t.retry}</button>
              <button type="button" className="bp-btn" onClick={() => setPanel("settings")}>{t.settings}</button>
              <button type="button" className="bp-btn ghost" onClick={toTitle}>{t.toTitle}</button>
            </div>
          </div>
        ) : null}

        {panel === "settings" ? (
          <div className="bp-overlay solid">
            <SettingsPanel settings={settings} onChange={changeSettings} config={config} onConfigChange={onConfigChange} store={store} assets={assets} onClose={() => setPanel(null)} inGame={screen !== "title"} />
          </div>
        ) : null}

        {panel === "assets" ? (
          <div className="bp-overlay solid">
            <AssetPanel store={store} snap={assets} config={config} onClose={() => setPanel(null)} />
          </div>
        ) : null}

        {showHow ? (
          <div className="bp-overlay solid">
            <div className="bp-panel">
              <div className="bp-panel-head">
                <h2>{t.howToPlay}</h2>
                <LanguageSwitch className="bp-lang bp-lang-panel" />
                <button type="button" className="bp-btn ghost" onClick={() => setPanel(null)}>{t.close}</button>
              </div>
              <p>{th.intro()}</p>
              <ul className="bp-list">
                {config.interactions.map((i) => (
                  <li key={i.id}>
                    <b style={{ color: i.color }}>{i.name}</b>
                    <span className="bp-key">{keyHint(config, i.id, keyLabel)}</span>
                    <span className="bp-dim">
                      {i.id === "parry" ? th.parry
                        : i.id === "dodge" ? th.dodge
                        : i.id === "skill" ? th.skill
                        : th.custom}
                    </span>
                  </li>
                ))}
              </ul>
              <h3>{th.bulletsHeading}</h3>
              <ul className="bp-list">
                {Object.values(BULLET_KINDS).map((k) => (
                  <li key={k.id}><i className="bp-dot" style={{ background: k.color }} /><b>{bulletKindName(k.id)}</b>
                    <span className="bp-dim">
                      {k.id === "red" ? th.bulletRed : k.id === "bounce" ? th.bulletBounce
                        : k.id === "low" ? th.bulletLow : k.id === "energy" ? th.bulletEnergy : k.id === "feint" ? th.bulletFeint : th.bulletNormal}
                    </span></li>
                ))}
              </ul>
              <p className="bp-dim">{th.footer}</p>
            </div>
          </div>
        ) : null}
      </div>

      {settings.showFrameBar && screen !== "title" ? (
        <JudgePanel sessionRef={sessionRef} paused={paused || panel !== null || screen === "over"} freeze={settings.judgeFreeze} />
      ) : null}

      <div className="bp-controls" aria-label={t.controlsAria}>
        {items.map((it) => {
          const costFrac = it.cost ? Math.min(1, it.cost.have / it.cost.amount) : null;
          return (
            <button
              key={it.id} type="button" tabIndex={-1}
              className={"bp-act" + (it.ready ? " ready" : " wait") + (it.active ? " active" : "")}
              style={{ ["--c" as string]: it.color ?? "#9aa7c7" }}
              onPointerDown={(e) => { e.preventDefault(); press(it.id); }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {costFrac !== null ? <span className="bp-fill" style={{ width: costFrac * 100 + "%" }} /> : null}
              <span className="bp-act-name">{it.name}</span>
              <span className="bp-act-key">{hint(it.id)}</span>
              {it.charges ? (
                <span className="bp-pips">
                  {Array.from({ length: it.charges.max }, (_, i) => (
                    <i key={i} className={i < it.charges!.count ? "on" : ""}>
                      {i === it.charges!.count ? <b style={{ height: it.charges!.progress * 100 + "%" }} /> : null}
                    </i>
                  ))}
                </span>
              ) : null}
              {it.cost && it.reason === "noResource" ? <span className="bp-act-sub">{Math.floor(it.cost.have)}/{it.cost.amount}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
