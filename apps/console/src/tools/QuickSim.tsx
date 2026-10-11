import { aggregate, batchSeed, simulateOne, type BatchStats, type BattleIssue, type BattleSummary, type Project } from "@gml/core";
import { useEffect, useRef, useState } from "react";
import { GoLink } from "../nav";
import { fmt, pct } from "../ui";
import { useBattleSetup } from "./battle/common";

/** Max time per slice before yielding to the UI. */
const SLICE_MS = 12;
const DEBOUNCE_MS = 600;

interface Result {
  stats: BatchStats;
  ms: number;
  label: string;
}

/**
 * Always-available strip under every editor: re-runs a small batch of the current battle after each edit
 * (debounced, chunked so typing stays responsive) and compares with a pinned baseline.
 */
export function QuickSim({ project }: { project: Project }) {
  const { setup, issues, error } = useBattleSetup(project);
  // Collapsed by default on phones, where the expanded strip wraps to several rows.
  const [open, setOpen] = useState(() => readPref("open", typeof window === "undefined" || window.innerWidth > 640));
  const [auto, setAuto] = useState(() => readPref("auto", true));
  const [n, setN] = useState(() => readPref("n", 50));
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [base, setBase] = useState<Result | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const runId = useRef(0);
  // Manual mode runs only for the setup that was current when "執行" was clicked.
  const [manualFor, setManualFor] = useState<unknown>(null);

  useEffect(() => { writePref("open", open); writePref("auto", auto); writePref("n", n); }, [open, auto, n]);

  useEffect(() => {
    const id = ++runId.current;
    if (!setup || !open || (!auto && manualFor !== setup)) { setRunning(null); return; }
    const results: BattleSummary[] = [];
    const t0 = performance.now();
    let timer = window.setTimeout(function step() {
      if (id !== runId.current) return;
      try {
        const sliceStart = performance.now();
        do results.push(simulateOne(setup, project.battle.policy, batchSeed(project.seed, results.length)));
        while (results.length < n && performance.now() - sliceStart < SLICE_MS);
      } catch {
        setRunning(null);
        return;
      }
      if (results.length < n) {
        setRunning({ done: results.length, total: n });
        timer = window.setTimeout(step, 0);
      } else {
        setRunning(null);
        setResult({ stats: aggregate(results), ms: performance.now() - t0, label: label(project) });
      }
    }, DEBOUNCE_MS);
    setRunning({ done: 0, total: n });
    return () => window.clearTimeout(timer);
  }, [setup, open, auto, n, manualFor, project.seed, project.battle.policy]); // eslint-disable-line react-hooks/exhaustive-deps

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const s = result?.stats;
  const b = base?.stats;

  return (
    <div className={`quicksim ${open ? "open" : ""}`} role="region" aria-label="快速驗證">
      <div className="qs-bar">
        <button className="btn icon" aria-expanded={open} aria-label={open ? "收合快速驗證" : "展開快速驗證"} onClick={() => setOpen((o) => !o)}>{open ? "▾" : "▴"}</button>
        <strong>快速驗證</strong>
        <button className={`qs-issues ${errors.length ? "err" : warnings.length ? "warn" : "ok"}`} onClick={() => setShowIssues((x) => !x)} aria-expanded={showIssues}>
          {errors.length ? `✕ ${errors.length} 錯誤` : "✓ 可執行"}{warnings.length ? `・${warnings.length} 提醒` : ""}
        </button>
        {open && (
          <>
            {error && !errors.length && <span className="qs-err small">{error}</span>}
            {s && !error && (
              <span className={`qs-stats ${running ? "stale" : ""}`}>
                <span>勝率 <b>{pct(s.winRate, 0)}</b><Delta now={s.winRate} base={b?.winRate} percent /></span>
                <span>平均輪數 <b>{s.cycles ? fmt(s.cycles.mean, 1) : "—"}</b><Delta now={s.cycles?.mean} base={b?.cycles?.mean} invert /></span>
                <span>超時 <b>{pct(s.timeoutRate, 0)}</b><Delta now={s.timeoutRate} base={b?.timeoutRate} percent invert /></span>
                <span>擊破 <b>{fmt(s.breaksMean, 1)}</b></span>
                <span className="muted small" title={result!.label}>{s.n} 場・{fmt(result!.ms, 0)} ms</span>
              </span>
            )}
            {running && <span className="muted small">模擬中 {running.done}/{running.total}…</span>}
            <span className="spacer" />
            <label className="check small"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />改動後自動重跑</label>
            {!auto && <button className="btn small" disabled={!setup || !!running} onClick={() => setManualFor(setup)}>執行</button>}
            <select aria-label="場數" value={n} onChange={(e) => setN(Number(e.target.value))}>
              {[20, 50, 100, 200].map((x) => <option key={x} value={x}>{x} 場</option>)}
            </select>
            {result && <button className="btn small" onClick={() => setBase(result)} title="之後的結果會顯示與基準的差異">釘選為基準</button>}
            {base && <button className="btn small ghost" onClick={() => setBase(null)}>清除基準</button>}
          </>
        )}
      </div>
      {showIssues && <IssuePanel issues={issues} />}
    </div>
  );
}

function IssuePanel({ issues }: { issues: BattleIssue[] }) {
  if (!issues.length) return <div className="qs-panel muted small">沒有錯誤或提醒。</div>;
  return (
    <div className="qs-panel">
      {issues.map((i, k) => (
        <div key={k} className={`issue ${i.level === "error" ? "err" : "warn"}`}>
          {i.level === "error" ? "✕" : "!"} {i.message}
          {i.where.statusId ? <GoLink node={{ kind: "status", id: i.where.statusId }}>前往</GoLink>
            : i.where.passiveId && i.where.unitId ? <GoLink node={{ kind: "passive", id: i.where.passiveId, unitId: i.where.unitId }}>前往</GoLink>
            : i.where.skillId && i.where.unitId ? <GoLink node={{ kind: "skill", id: i.where.skillId, unitId: i.where.unitId }}>前往</GoLink>
            : i.where.unitId ? <GoLink node={{ kind: "unit", id: i.where.unitId }}>前往</GoLink>
            : i.where.encounterId || i.where.field === "encounter" || i.where.field === "rules" ? <GoLink node={{ kind: "encounter", id: i.where.encounterId ?? "" }}>前往</GoLink>
            : null}
        </div>
      ))}
    </div>
  );
}

function Delta({ now, base, percent = false, invert = false }: { now: number | undefined; base: number | undefined; percent?: boolean; invert?: boolean }) {
  if (base === undefined || now === undefined) return null;
  const d = now - base;
  if (Math.abs(d) < 1e-9) return <small className="delta muted">±0</small>;
  const good = invert ? d < 0 : d > 0;
  return <small className={`delta ${good ? "up" : "down"}`}>{d > 0 ? "+" : ""}{percent ? pct(d, 0) : fmt(d, 1)}</small>;
}

function label(p: Project) {
  const names = (ids: string[]) => ids.map((id) => p.battle.units.find((u) => u.id === id)?.name ?? id).join("、");
  return `${names(p.battle.encounter.allies)} vs ${names(p.battle.encounter.enemies)}`;
}

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`ggt.quicksim.${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function writePref(key: string, v: unknown) {
  try { localStorage.setItem(`ggt.quicksim.${key}`, JSON.stringify(v)); } catch { /* preference only */ }
}
