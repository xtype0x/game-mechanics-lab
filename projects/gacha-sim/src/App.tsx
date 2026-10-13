import { tr, displayText } from "./i18n";
import { Gacha } from "@gml/core";
import type { ProjectHost } from "@gml/ui";
import { LanguageSwitch, localize, useLocale } from "@gml/ui/i18n";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { GAMES } from "./catalog/games";
import { Compare } from "./Compare";
import { GachaStage } from "./GachaStage";
import { GameMenu, type CatalogPick } from "./GameMenu";
import { MathPanel } from "./MathPanel";
import { ModelEditor } from "./ModelEditor";
import { BudgetPanel, ProgressPanel, Results, TargetPanel } from "./Panels";
import { Playground } from "./Playground";
import { clearHash, decodeRules, rulesInHash, type ParseResult, type SharedRules } from "./share";
import { SharePanel } from "./SharePanel";
import { analyze, fromCatalog, fromPreset, fromShared, hasSavedState, loadState, normalize, saveState, type SimState } from "./state";

type View = "gacha" | "lab";

export function App({ host = {} }: { host?: ProjectHost }) {
  const [locale] = useLocale();
  const [s, setS] = useState<SimState>(() => {
    // Deep link from a game hub (?game=<id>): pre-selects that game on this load only. A shared-rules link (#rules=) wins.
    const wanted = rulesInHash() ? null : GAMES.find((g) => g.id === new URLSearchParams(window.location.search).get("game"));
    if (wanted) {
      const first = wanted.types[0]!;
      return normalize(fromCatalog({ game: wanted.id, kind: first.kind, region: first.region }, hasSavedState() ? loadState() : undefined));
    }
    if (hasSavedState()) return normalize(loadState());
    return normalize(loadState());
  });
  const [view, setView] = useState<View>("gacha");
  useEffect(() => { try { localStorage.removeItem('ggt.gacha-sim.live.v1'); } catch { /* storage unavailable */ } }, []);
  useEffect(() => saveState(s), [s]);
  const set = (fn: (x: SimState) => void) => setS((prev) => { const x = structuredClone(prev); fn(x); return normalize(x); });
  const editModel = (fn: (m: Gacha.GachaModel) => void) => set((x) => { fn(x.model); x.presetId = null; });
  const pick = (p: CatalogPick) => setS((prev) => normalize(fromCatalog(p, prev)));

  // A shared link (#rules=…) asks before replacing the current rules.
  const [incoming, setIncoming] = useState<ParseResult | null>(null);
  useEffect(() => {
    const check = () => { const code = rulesInHash(); if (code) decodeRules(code).then(setIncoming); };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  const loadShared = (r: SharedRules) => { setS((prev) => normalize(fromShared(r, prev))); setView("lab"); };
  const closeIncoming = () => { setIncoming(null); clearHash(); };

  const deferred = useDeferredValue(s);
  const a = useMemo(() => (view === "lab" ? analyze(deferred) : null), [deferred, view]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          {host.back && <a className="back-link" href={host.back.href}>← {localize(host.back.label, locale)}</a>}
          <h1>{tr("app1")}</h1>
          <p className="tagline">{tr("app2")}</p>
        </div>
        <LanguageSwitch className="gacha-language"/>
        <div className="view-switch" role="tablist" aria-label={tr("app3")}>
          <button role="tab" aria-selected={view === "gacha"} className={view === "gacha" ? "on" : ""} onClick={() => setView("gacha")}>{tr("app4")}</button>
          <button role="tab" aria-selected={view === "lab"} className={view === "lab" ? "on" : ""} onClick={() => setView("lab")}>{tr("app5")}</button>
        </div>
      </header>
      {incoming && (incoming.ok ? (
        <div className="incoming" role="alert">
          <span>{tr("app6")}<b>{displayText(incoming.rules.model.name)}</b>{tr("app7")}</span>
          <div><button className="btn primary" onClick={() => { loadShared(incoming.rules); closeIncoming(); }}>{tr("app8")}</button><button className="btn" onClick={closeIncoming}>{tr("app9")}</button></div>
        </div>
      ) : (
        <div className="incoming error" role="alert"><span>{tr("app10")}{displayText(incoming.error)}</span><div><button className="btn" onClick={closeIncoming}>{tr("app11")}</button></div></div>
      ))}
      <GameMenu current={s.presetId} onPick={pick} onPreset={(id) => setS((prev) => normalize(fromPreset(id, prev)))} />

      {view === "gacha" ? (
        <GachaStage s={s} onAnalyze={() => setView("lab")} onTarget={(item) => setS((prev) => normalize(chooseEpitomized(prev, item)))} />
      ) : a && (
        <>
          {s.model.source && <p className="source"><b>{tr("app12")}</b>{displayText(s.model.source)}{!s.presetId && tr("app13")}</p>}
          <main className="layout">
            <div className="col rules">
              <SharePanel s={s} onImport={loadShared} />
              <ModelEditor model={s.model} edit={editModel} issues={a.issues} />
            </div>
            <div className="col outcome">
              <TargetPanel s={s} set={set} />
              <ProgressPanel s={s} set={set} />
              <BudgetPanel s={s} set={set} />
              <Results s={deferred} a={a} pending={deferred !== s} />
            </div>
          </main>
          <Playground s={s} />
          <Compare s={deferred} set={set} />
          <MathPanel s={deferred} a={a} />
        </>
      )}
      <footer className="foot">
        <p>{tr("app14")}{Gacha.RULES_VERSION}{tr("app15")}</p>
      </footer>
    </div>
  );
}

/** Picking the epitomized item is a player choice, not a rule edit: the pool stays the game's pool. */
function chooseEpitomized(prev: SimState, item: string): SimState {
  const x = structuredClone(prev);
  for (const mod of x.model.modules) if (mod.kind === "epitomized") mod.item = item;
  x.target = { ...x.target, mode: "item", itemId: item };
  return x;
}
