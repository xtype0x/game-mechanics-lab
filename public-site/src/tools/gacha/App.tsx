import { Gacha } from "@ggt/core";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLiveBanners } from "./catalog/useLive";
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

export function App() {
  const { data: live, status, refresh } = useLiveBanners();
  const [s, setS] = useState<SimState>(() => {
    if (hasSavedState()) return normalize(loadState());
    // First visit: the earliest current character banner of the first game.
    const now = Date.now() / 1000;
    const b = live.banners.find((x) => x.game === "hsr" && x.kind === "character" && x.start <= now && (!x.end || x.end > now));
    return normalize(b ? fromCatalog({ game: "hsr", kind: "character", bannerId: b.id }, live) : loadState());
  });
  const [view, setView] = useState<View>("gacha");
  useEffect(() => saveState(s), [s]);
  const set = (fn: (x: SimState) => void) => setS((prev) => { const x = structuredClone(prev); fn(x); return normalize(x); });
  const editModel = (fn: (m: Gacha.GachaModel) => void) => set((x) => { fn(x.model); x.presetId = null; });
  const pick = (p: CatalogPick) => setS((prev) => normalize(fromCatalog(p, live, prev)));

  // An unedited game pool follows fresh banner data (e.g. live data replacing the snapshot).
  const lastLive = useRef(live);
  useEffect(() => {
    if (lastLive.current === live) return;
    lastLive.current = live;
    setS((prev) => (prev.presetId?.startsWith("game:") && prev.catalog ? normalize({ ...fromCatalog(prev.catalog, live, prev), target: prev.target, start: prev.start }) : prev));
  }, [live]);

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
          <a className="back-link" href="../#/lab">← gacha-game-tool 工具遊樂場</a>
          <h1>抽卡模擬器</h1>
          <p className="tagline">選一款遊戲直接抽，或到「設定與分析」調整規則、精確計算要抽幾抽與花費。</p>
        </div>
        <div className="view-switch" role="tablist" aria-label="畫面">
          <button role="tab" aria-selected={view === "gacha"} className={view === "gacha" ? "on" : ""} onClick={() => setView("gacha")}>🎴 抽卡</button>
          <button role="tab" aria-selected={view === "lab"} className={view === "lab" ? "on" : ""} onClick={() => setView("lab")}>⚙ 設定與分析</button>
        </div>
      </header>
      {incoming && (incoming.ok ? (
        <div className="incoming" role="alert">
          <span>有人分享了卡池規則「<b>{incoming.rules.model.name}</b>」。載入後會取代目前的設定（抽卡進度另外保存，不受影響）。</span>
          <div><button className="btn primary" onClick={() => { loadShared(incoming.rules); closeIncoming(); }}>載入</button><button className="btn" onClick={closeIncoming}>略過</button></div>
        </div>
      ) : (
        <div className="incoming error" role="alert"><span>分享連結無法載入：{incoming.error}</span><div><button className="btn" onClick={closeIncoming}>關閉</button></div></div>
      ))}
      <GameMenu live={live} status={status} current={s.presetId} onPick={pick} onPreset={(id) => setS((prev) => normalize(fromPreset(id, prev)))} onRefresh={refresh} />

      {view === "gacha" ? (
        <GachaStage s={s} live={live} onAnalyze={() => setView("lab")} onTarget={(item) => setS((prev) => normalize(chooseEpitomized(prev, item)))} />
      ) : a && (
        <>
          {s.model.source && <p className="source"><b>規則來源：</b>{s.model.source}{!s.presetId && "（已修改）"}</p>}
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
        <p>計算核心：Gacha Game Tool 抽卡規則 {Gacha.RULES_VERSION}（開放規格與測試向量）。遊戲名稱與角色名稱只用來說明卡池內容，著作權屬各遊戲公司；本工具與任何遊戲公司無關。規則依公開資料整理，可能與實際遊戲有出入；儲值價格為範例。</p>
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
