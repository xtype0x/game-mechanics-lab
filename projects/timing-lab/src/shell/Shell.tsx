import { Timing } from "@gml/core";
import type { ProjectHost } from "@gml/ui";
import { LanguageSwitch, localize, useLocale } from "@gml/ui/i18n";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { LabMode } from "../lab/LabMode";
import { loadSharedConfig, saveSharedConfig } from "./config";
import { useText } from "./i18n";
import { relocalizeGameConfig } from "./presets";
import type { ReplayData } from "./replay";

// The game (canvas loop, audio, asset packs) is only fetched when the visitor opens it.
const PlayMode = lazy(() => import("../play/PlayMode").then((m) => ({ default: m.PlayMode })));

type Mode = "lab" | "play";

/** `#play` opens the game; anything else opens the frame lab. */
const modeFromHash = (): Mode => (typeof location !== "undefined" && location.hash === "#play" ? "play" : "lab");

export function Shell({ host = {} }: { host?: ProjectHost }) {
  const [locale] = useLocale();
  const t = useText();
  const [mode, setMode] = useState<Mode>(modeFromHash);
  const [config, setConfig] = useState<Timing.TimingConfig>(loadSharedConfig);
  // A window recorded in the game, waiting for the lab to pick it up.
  const [pendingReplay, setPendingReplay] = useState<ReplayData | null>(null);

  useEffect(() => {
    const onHash = () => setMode(modeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    // replaceState keeps the back button from stepping through tab switches; it fires no hashchange, so state is set above.
    history.replaceState(null, "", next === "play" ? "#play" : location.pathname + location.search);
  }, []);

  // Untouched built-in rules follow the language; edited ones are the visitor's data and stay.
  // The swap is not saved: loading relocalizes anyway, and saving it would let an idle tab (synced through the
  // storage event) overwrite edits made in another tab.
  const lastLocale = useRef(locale);
  const skipSave = useRef(false);
  useEffect(() => {
    if (lastLocale.current === locale) return;
    lastLocale.current = locale;
    setConfig((c) => { const next = relocalizeGameConfig(c, locale); if (next) skipSave.current = true; return next ?? c; });
  }, [locale]);

  // Persist the shared rules (best effort).
  useEffect(() => {
    if (skipSave.current) { skipSave.current = false; return; }
    const timer = window.setTimeout(() => saveSharedConfig(config), 300);
    return () => window.clearTimeout(timer);
  }, [config]);

  const tab = (id: Mode, label: string) => (
    <button type="button" role="tab" id={`tl-tab-${id}`} aria-selected={mode === id} aria-controls="tl-panel" tabIndex={mode === id ? 0 : -1}
      className="tl-tab" onClick={() => switchMode(id)}>{label}</button>
  );

  return (
    <div className="tl">
      <header className="tl-head">
        {host.back && <a className="tl-back" href={host.back.href}>← {localize(host.back.label, locale)}</a>}
        <LanguageSwitch className="tl-lang" />
        <h1>{t.title}</h1>
        <p>{t.intro}</p>
      </header>
      <div className="tl-tabs" role="tablist" aria-label={t.tabsLabel}>
        {tab("lab", t.tabLab)}
        {tab("play", t.tabPlay)}
      </div>
      <div id="tl-panel" role="tabpanel" aria-labelledby={`tl-tab-${mode}`}>
        {mode === "lab" ? (
          <LabMode config={config} onConfigChange={setConfig} onSwitchMode={() => switchMode("play")}
            incomingReplay={pendingReplay} onReplayConsumed={() => setPendingReplay(null)} />
        ) : (
          <Suspense fallback={<p className="tl-loading">{t.loadingPlay}</p>}>
            <PlayMode config={config} onConfigChange={setConfig} onSwitchMode={() => switchMode("lab")}
              onInspect={(r) => { setPendingReplay(r); switchMode("lab"); }} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
