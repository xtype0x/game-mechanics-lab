import {
  CATEGORY_LABELS,
  PROJECT_TEMPLATES,
  RULES_VERSION,
  STATUS_LABELS,
  TIME_MODEL_LABELS,
  TOOLS,
  TOOL_DETAILS,
  type Project,
  type TimeModel,
  type ToolEntry,
  type ToolStatus,
} from "@gml/core";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { AbCompare } from "./tools/AbCompare";
import { Composer } from "./tools/Composer";
import { CritDistribution } from "./tools/CritDistribution";
import { DamageBreakdown } from "./tools/DamageBreakdown";
import { ActionOrder } from "./tools/battle/ActionOrder";
import { AiEditor } from "./tools/battle/AiEditor";
import { BatchSim } from "./tools/battle/BatchSim";
import { BattleStepper } from "./tools/battle/BattleStepper";
import { BreakCurves, EnergyCurves } from "./tools/battle/BattleCurves";
import { CharacterSkills, CharacterStats } from "./tools/battle/CharacterEditor";
import { EncounterEditor } from "./tools/battle/EncounterEditor";
import { StatusEditor } from "./tools/battle/StatusEditor";
import { DependencyMap } from "./tools/DependencyMap";
import { DemoModules } from "./tools/DemoModules";
import { Budget } from "./tools/gacha/Budget";
import { DisclosureTool } from "./tools/gacha/DisclosureTool";
import { PoolEditor } from "./tools/gacha/PoolEditor";
import { QuickSim } from "./tools/QuickSim";
import { ReferenceImport } from "./tools/ReferenceImport";
import { NavProvider, type Focus } from "./nav";
import { Demo } from "./demo/Demo";
import { onOpenDemo, onReplay, type ReplayRequest } from "./demo/link";
import { canExportDemo, downloadDemo } from "./demo/exportDemo";
import { Badge } from "./ui";
import { useProject, type Updater } from "./useProject";

const IMPLEMENTED: Record<string, ComponentType<{ project: Project; update: Updater }>> = {
  "damage.breakdown": DamageBreakdown,
  "damage.composer": Composer,
  "damage.crit-dist": CritDistribution,
  "action.order": ActionOrder,
  "action.energy": EnergyCurves,
  "status.break": BreakCurves,
  "status.effects": StatusEditor,
  "sim.step": BattleStepper,
  "sim.batch": BatchSim,
  "character.stats": CharacterStats,
  "character.skills": CharacterSkills,
  "enemy.ai": AiEditor,
  "enemy.encounter": EncounterEditor,
  "sim.ab": AbCompare,
  "content.deps": DependencyMap,
  "content.import": ReferenceImport,
  "gacha.pool-editor": PoolEditor,
  "gacha.budget": Budget,
  "gacha.disclosure": DisclosureTool,
  "demo.modules": DemoModules,
};

/** Tools that already run their own simulations, so the quick-sim strip would only duplicate them. */
const NO_QUICKSIM = new Set(["sim.batch", "sim.step", "sim.ab", "gacha.pool-editor", "gacha.budget", "gacha.disclosure", "demo.modules"]);

const STATUS_TONE: Record<ToolStatus, "ok" | "warn" | "info" | "muted"> = { available: "ok", experimental: "warn", researching: "info", planned: "muted" };
const STATUS_RANK: Record<ToolStatus, number> = { available: 0, experimental: 1, researching: 2, planned: 3 };

/** Whether a tool is meaningful for the current project (e.g. break tools need enemies with toughness). */
function toolCompat(t: ToolEntry, p: Project): { ok: boolean; reason?: string } {
  if (t.id === "status.break") {
    const ok = p.battle.encounter.enemies.some((id) => (p.battle.units.find((u) => u.id === id)?.stats.toughness ?? 0) > 0);
    return ok ? { ok } : { ok, reason: "目前戰鬥的敵人都沒有韌性，擊破工具不會有資料" };
  }
  if (t.category === "damage" && t.id !== "damage.composer" && !p.damage.config.components.length) return { ok: false, reason: "傷害公式沒有任何元件" };
  return { ok: true };
}

export function App() {
  const { project, update, exportFile, importFile, reset, saveState } = useProject();
  const [toolId, setToolId] = useState("damage.breakdown");
  const [navOpen, setNavOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const nav = useMemo(() => ({
    focus,
    go: (id: string, f?: Omit<Focus, "toolId" | "seq">) => {
      setToolId(id);
      setShowDetail(false);
      setFocus((prev) => ({ ...f, toolId: id, seq: (prev?.seq ?? 0) + 1 }));
      document.querySelector(".main")?.scrollTo({ top: 0 });
    },
  }), [focus]);
  const [demo, setDemo] = useState(() => location.hash === "#demo");
  const openDemo = (on: boolean) => {
    setDemo(on);
    history.replaceState(null, "", on ? "#demo" : location.pathname + location.search);
  };

  const [replay, setReplay] = useState<ReplayRequest | null>(null);
  useEffect(() => onReplay((r) => setReplay(r)), []);
  useEffect(() => onOpenDemo(() => openDemo(true)), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (replay) return <Demo project={project} replay={replay} onExit={() => setReplay(null)} />;
  if (demo) return <Demo project={project} update={update} onExit={() => openDemo(false)} />;
  const tool = TOOLS.find((t) => t.id === toolId)!;
  const Impl = IMPLEMENTED[toolId];
  const compat = toolCompat(tool, project);

  return (
    <NavProvider value={nav}>
    <div className={`app ${navOpen ? "nav-open" : ""}`}>
      <header className="topbar">
        <button className="btn icon nav-toggle" aria-label="機制庫" onClick={() => setNavOpen((o) => !o)}>☰</button>
        <div className="brand">
          <strong>Game Mechanics Lab</strong>
          <span>機制模擬主控台</span>
        </div>
        <div className="tool-title">
          <h1>{tool.name}</h1>
          <Badge tone={STATUS_TONE[tool.status]}>{STATUS_LABELS[tool.status]}</Badge>
          {Impl && <button className="btn icon info-btn" aria-label="工具說明" aria-expanded={showDetail} onClick={() => setShowDetail((s) => !s)}>ⓘ</button>}
        </div>
        <button className="btn small play-btn" onClick={() => openDemo(true)}>▶ 試玩 DEMO</button>
        <ProjectControls project={project} update={update} onExport={exportFile} onImport={importFile} onReset={reset} saveState={saveState} />
      </header>
      <aside className="library">
        <ToolLibrary project={project} selected={toolId} onSelect={(id) => { setToolId(id); setNavOpen(false); setShowDetail(false); }} />
      </aside>
      <main className="main">
        {Impl && showDetail && <div className="detail-strip"><ToolDetail tool={tool} compact /></div>}
        {Impl && !compat.ok && <div className="compat-strip">⚠ {compat.reason}</div>}
        {Impl ? <Impl key={toolId} project={project} update={update} /> : <ToolDetail tool={tool} />}
        {Impl && !NO_QUICKSIM.has(toolId) && tool.category !== "damage" && <QuickSim project={project} />}
      </main>
    </div>
    </NavProvider>
  );
}

function ToolLibrary({ project, selected, onSelect }: { project: Project; selected: string; onSelect: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ToolEntry["category"] | "all">("all");
  const [time, setTime] = useState<TimeModel | "all">("all");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const categories = [...new Set(TOOLS.map((t) => t.category))];

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TOOLS.filter((t) => cat === "all" || t.category === cat)
      .filter((t) => time === "all" || t.timeModel === time)
      .filter((t) => !onlyAvailable || t.status === "available" || t.status === "experimental")
      .filter((t) => !needle || [t.name, t.summary, ...t.tags, ...(t.aliases ?? [])].some((s) => s.toLowerCase().includes(needle)))
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  }, [q, cat, time, onlyAvailable]);

  const filtered = q !== "" || cat !== "all" || time !== "all" || onlyAvailable;

  return (
    <div className="lib">
      <div className="lib-head">
        <h2>機制庫</h2>
        <input type="search" placeholder="搜尋名稱、標籤、別名…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜尋機制工具" />
        <div className="chips">
          <button className={`chip-btn ${cat === "all" ? "on" : ""}`} onClick={() => setCat("all")}>全部</button>
          {categories.map((c) => (
            <button key={c} className={`chip-btn ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{CATEGORY_LABELS[c]}</button>
          ))}
        </div>
        <div className="lib-meta">
          <select aria-label="時間模型" value={time} onChange={(e) => setTime(e.target.value as TimeModel | "all")}>
            <option value="all">所有時間模型</option>
            {(Object.keys(TIME_MODEL_LABELS) as TimeModel[]).map((k) => <option key={k} value={k}>{TIME_MODEL_LABELS[k]}</option>)}
          </select>
          <label className="check small"><input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />只顯示可用</label>
        </div>
        <span className="muted small">
          {list.length} / {TOOLS.length} 項
          {filtered && <button className="link" onClick={() => { setQ(""); setCat("all"); setTime("all"); setOnlyAvailable(false); }}>清除篩選</button>}
        </span>
      </div>
      <ul className="lib-list">
        {list.map((t) => {
          const c = t.status === "available" ? toolCompat(t, project) : { ok: true };
          return (
            <li key={t.id}>
              <button className={`lib-item ${t.id === selected ? "on" : ""} status-${t.status}`} onClick={() => onSelect(t.id)}>
                <span className="lib-item-top">
                  <strong>{t.name}</strong>
                  <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABELS[t.status]}</Badge>
                </span>
                <span className="lib-summary">{t.summary}</span>
                <span className="lib-tags">
                  {CATEGORY_LABELS[t.category]}・{TIME_MODEL_LABELS[t.timeModel]}・{t.milestone}
                  {!c.ok && <span className="incompat" title={c.reason}>・目前專案不適用</span>}
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="muted small pad">沒有符合的工具。</li>}
      </ul>
    </div>
  );
}

function ToolDetail({ tool, compact = false }: { tool: ToolEntry; compact?: boolean }) {
  const d = TOOL_DETAILS[tool.id];
  return (
    <div className={`tool-detail ${compact ? "compact" : ""}`}>
      {!compact && <p className="lead">{tool.summary}</p>}
      <dl>
        <dt>狀態</dt><dd>{STATUS_LABELS[tool.status]}（{tool.status === "available" ? "於" : "預計於"} {tool.milestone} {tool.status === "available" ? "提供" : "提供"}）</dd>
        <dt>分類</dt><dd>{CATEGORY_LABELS[tool.category]}・{TIME_MODEL_LABELS[tool.timeModel]}</dd>
        {d && <><dt>輸入</dt><dd>{d.inputs}</dd><dt>輸出</dt><dd>{d.outputs}</dd></>}
        <dt>標籤</dt><dd>{tool.tags.join("、")}</dd>
        <dt>工具 ID</dt><dd><code>{tool.id}</code></dd>
      </dl>
      {!compact && tool.status !== "available" && <p className="muted">這項工具尚未實作，目前只能查看規劃內容。</p>}
    </div>
  );
}

function ProjectControls({
  project,
  update,
  onExport,
  onImport,
  onReset,
  saveState,
}: {
  project: Project;
  update: Updater;
  onExport: () => void;
  onImport: (f: File) => Promise<void>;
  onReset: (templateId: string) => void;
  saveState: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  return (
    <div className="project-controls">
      <input className="project-name" aria-label="專案名稱" value={project.name} onChange={(e) => update((p) => { p.name = e.target.value; })} />
      <span className="save-state muted small" title="自動保存在這個瀏覽器；要長期保存或分享請用「儲存檔案」">
        {saveState === "saved" ? "已自動保存" : saveState === "pending" ? "保存中…" : "無法自動保存"}
      </span>
      <button className="btn small" aria-expanded={picking} onClick={() => setPicking((x) => !x)}>新專案</button>
      <button className="btn small" onClick={() => fileRef.current?.click()}>開啟檔案</button>
      <button className="btn small primary" onClick={onExport}>儲存檔案</button>
      <button
        className="btn small"
        disabled={!canExportDemo()}
        title={canExportDemo() ? "下載一個只有試玩畫面的單一 HTML 檔，內含目前專案的角色與數值" : "開發模式無法匯出；請開啟建置後的 dist/index.html"}
        onClick={() => { try { downloadDemo(project); } catch (err) { setError((err as Error).message); } }}
      >匯出試玩 DEMO</button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try { await onImport(f); setError(null); } catch (err) { setError((err as Error).message); }
        }}
      />
      <span className="muted small version" title="規則版本會記錄在專案檔中">規則 v{RULES_VERSION}</span>
      {picking && (
        <div className="template-pop" role="dialog" aria-label="選擇範本">
          <strong>從範本建立新專案</strong>
          <p className="muted small">目前專案若沒有「儲存檔案」，建立新專案後會遺失。</p>
          {PROJECT_TEMPLATES.map((t) => (
            <button key={t.id} className="template" onClick={() => { onReset(t.id); setPicking(false); }}>
              <strong>{t.name}</strong>
              <span>{t.description}</span>
            </button>
          ))}
          <button className="btn small ghost" onClick={() => setPicking(false)}>取消</button>
        </div>
      )}
      {error && <div className="error-toast" role="alert" onClick={() => setError(null)}>開啟失敗：{error}（點擊關閉）</div>}
    </div>
  );
}
