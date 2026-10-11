import {
  aggregate,
  batchSeed,
  battleSetupOf,
  projectFromSnapshot,
  simulateOne,
  snapshotOf,
  validateBattle,
  type BatchStats,
  type BattleSummary,
  type Project,
} from "@gml/core";
import { useEffect, useRef, useState } from "react";
import { ErrorBox, Field, fmt, NumberField, pct, Section } from "@gml/ui";
import type { Updater } from "../useProject";

const CURRENT = "current";
const CHUNK = 6;

type Side = { key: string; label: string; project: Project };

export function AbCompare({ project, update }: { project: Project; update: Updater }) {
  const [name, setName] = useState("");
  const [a, setA] = useState<string>(project.snapshots.at(-1)?.id ?? CURRENT);
  const [b, setB] = useState<string>(CURRENT);
  const [n, setN] = useState(200);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ a: BatchStats; b: BatchStats; la: string; lb: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cancel = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const sideOf = (key: string): Side | null => {
    if (key === CURRENT) return { key, label: "目前專案", project };
    const s = project.snapshots.find((x) => x.id === key);
    return s ? { key, label: `快照「${s.name}」`, project: projectFromSnapshot(project, s) } : null;
  };
  const options = [{ id: CURRENT, label: "目前專案" }, ...project.snapshots.map((s) => ({ id: s.id, label: `快照：${s.name}` }))];
  const sa = sideOf(a);
  const sb = sideOf(b);

  const run = () => {
    if (!sa || !sb) return;
    const prep = (s: Side) => {
      const setup = battleSetupOf(s.project);
      const errors = validateBattle(s.project.battle, setup.damage).filter((i) => i.level === "error");
      if (errors.length) throw new Error(`${s.label}：${errors[0]!.message}`);
      return setup;
    };
    let setups: [ReturnType<typeof battleSetupOf>, ReturnType<typeof battleSetupOf>];
    try { setups = [prep(sa), prep(sb)]; } catch (e) { setErr((e as Error).message); return; }
    setErr(null);
    cancel.current = false;
    const ra: BattleSummary[] = [];
    const rb: BattleSummary[] = [];
    const seed = project.seed;
    const step = () => {
      if (cancel.current) { setProgress(null); return; }
      try {
        const end = Math.min(n, ra.length + CHUNK);
        for (let i = ra.length; i < end; i++) {
          // Same seed list on both sides, so differences come from the rules, not luck.
          ra.push(simulateOne(setups[0], sa.project.battle.policy, batchSeed(seed, i)));
          rb.push(simulateOne(setups[1], sb.project.battle.policy, batchSeed(seed, i)));
        }
      } catch (e) { setErr((e as Error).message); setProgress(null); return; }
      setProgress(ra.length / n);
      if (ra.length < n) timer.current = window.setTimeout(step, 0);
      else { setResult({ a: aggregate(ra), b: aggregate(rb), la: sa.label, lb: sb.label }); setProgress(null); }
    };
    setProgress(0);
    timer.current = window.setTimeout(step, 0);
  };

  return (
    <div className="tool-layout">
      <div className="workspace">
        <Section title="快照">
          <p className="muted small">快照會凍結目前的傷害公式、角色、技能、狀態與戰鬥規則，存在專案檔中。改數值前先存一份，就能和改過的版本比較。</p>
          <div className="row-gap">
            <input className="grow" placeholder={`快照名稱，例如「焰華攻擊 +10%」`} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn small primary" onClick={() => {
              const snap = snapshotOf(project, name.trim() || `快照 ${project.snapshots.length + 1}`, new Date().toISOString());
              update((p) => { p.snapshots.push(snap); });
              setName("");
              setA(snap.id);
            }}>儲存目前為快照</button>
          </div>
          <div className="snap-list">
            {project.snapshots.length === 0 && <p className="muted small">還沒有快照。</p>}
            {project.snapshots.map((s) => (
              <div key={s.id} className="snap-row">
                <input aria-label="快照名稱" value={s.name} onChange={(e) => update((p) => { p.snapshots.find((x) => x.id === s.id)!.name = e.target.value; })} />
                <span className="muted small">{new Date(s.createdAt).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" })}</span>
                <button className="btn small ghost" title="用這份快照取代目前的公式與內容" onClick={() => {
                  if (confirm(`用「${s.name}」取代目前的公式與戰鬥內容？目前未存成快照的修改會遺失。`)) update((p) => { p.damage = JSON.parse(JSON.stringify(s.damage)); p.battle = JSON.parse(JSON.stringify(s.battle)); });
                }}>還原</button>
                <button className="btn small ghost" onClick={() => { if (confirm(`刪除快照「${s.name}」？`)) { update((p) => { p.snapshots = p.snapshots.filter((x) => x.id !== s.id); }); if (a === s.id) setA(CURRENT); if (b === s.id) setB(CURRENT); } }}>刪除</button>
              </div>
            ))}
          </div>
        </Section>
        <Section title="比較設定">
          <div className="grid-fields">
            <Field label="方案 A"><select value={a} onChange={(e) => setA(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
            <Field label="方案 B"><select value={b} onChange={(e) => setB(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
            <Field label="每方場數"><NumberField value={n} min={20} max={5000} onChange={(v) => setN(Math.max(20, Math.min(5000, Math.round(v))))} /></Field>
          </div>
          <p className="muted small">兩方各自使用其保存的隊伍、敵人與自動策略，並使用完全相同的種子序列（{String(project.seed)}#0、#1…）。</p>
          <div className="row-gap">
            {progress === null
              ? <button className="btn primary" disabled={!sa || !sb || a === b} onClick={run}>開始比較</button>
              : <button className="btn" onClick={() => { cancel.current = true; }}>取消</button>}
            {a === b && <span className="muted small">請選擇兩個不同的方案。</span>}
          </div>
          {progress !== null && <div className="progress"><div style={{ width: `${progress * 100}%` }} /><span>{Math.round(progress * 100)}%</span></div>}
          {err && <ErrorBox error={err} />}
        </Section>
      </div>

      <div className="results">
        <div className="results-head"><h2>比較結果</h2></div>
        {result ? <Results r={result} /> : <p className="muted">選擇兩個方案後按「開始比較」。</p>}
        {sa && sb && a !== b && <DiffList a={sa} b={sb} />}
      </div>
    </div>
  );
}

function Results({ r }: { r: { a: BatchStats; b: BatchStats; la: string; lb: string } }) {
  const rows: [string, number | null, number | null, (x: number) => string, boolean][] = [
    ["勝率", r.a.winRate, r.b.winRate, (x) => pct(x), false],
    ["平均輪數（勝場）", r.a.cycles?.mean ?? null, r.b.cycles?.mean ?? null, (x) => fmt(x, 2), true],
    ["P90 輪數", r.a.cycles?.p90 ?? null, r.b.cycles?.p90 ?? null, (x) => fmt(x, 0), true],
    ["平均擊破次數", r.a.breaksMean, r.b.breaksMean, (x) => fmt(x, 2), false],
    ["超時率", r.a.timeoutRate, r.b.timeoutRate, (x) => pct(x), true],
  ];
  const names = [...new Set([...r.a.damageShare.map((d) => d.name), ...r.b.damageShare.map((d) => d.name)])];
  return (
    <>
      <Section title="整體">
        <table className="table">
          <thead><tr><th></th><th className="r">A：{r.la}</th><th className="r">B：{r.lb}</th><th className="r">B − A</th></tr></thead>
          <tbody>
            {rows.map(([label, x, y, f, lowerBetter]) => {
              const d = x !== null && y !== null ? y - x : null;
              const good = d !== null && (lowerBetter ? d < 0 : d > 0);
              return (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="r mono">{x !== null ? f(x) : "—"}</td>
                  <td className="r mono">{y !== null ? f(y) : "—"}</td>
                  <td className={`r mono ${d === null || Math.abs(d) < 1e-9 ? "muted" : good ? "up" : "down"}`}>{d === null ? "—" : `${d > 0 ? "+" : ""}${f(d)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small">綠色表示對玩家較有利（勝率高、輪數少）。</p>
      </Section>
      <Section title="角色平均傷害">
        <table className="table">
          <thead><tr><th>角色</th><th className="r">A</th><th className="r">B</th><th className="r">變化</th></tr></thead>
          <tbody>
            {names.map((nm) => {
              const x = r.a.damageShare.find((d) => d.name === nm)?.mean;
              const y = r.b.damageShare.find((d) => d.name === nm)?.mean;
              const ch = x && y !== undefined ? (y - x) / x : null;
              return (
                <tr key={nm}>
                  <td>{nm}</td>
                  <td className="r mono">{x !== undefined ? fmt(x, 0) : "—"}</td>
                  <td className="r mono">{y !== undefined ? fmt(y, 0) : "—"}</td>
                  <td className={`r mono ${ch === null || Math.abs(ch) < 1e-9 ? "muted" : ch > 0 ? "up" : "down"}`}>{ch === null ? "—" : `${ch > 0 ? "+" : ""}${pct(ch)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </>
  );
}

/** Leaf-level differences between the two sides' rules and content. Arrays of objects with `id` are matched by id. */
function DiffList({ a, b }: { a: Side; b: Side }) {
  const lines: { path: string; from: string; to: string }[] = [];
  const show = (v: unknown) => (v === undefined ? "（無）" : typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v));
  const unitName = (id: string) => b.project.battle.units.find((u) => u.id === id)?.name ?? a.project.battle.units.find((u) => u.id === id)?.name ?? id;
  const walk = (x: unknown, y: unknown, path: string) => {
    if (lines.length > 60) return;
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    const isObj = (v: unknown) => v !== null && typeof v === "object";
    if (Array.isArray(x) && Array.isArray(y) && [...x, ...y].every((v) => isObj(v) && typeof (v as { id?: unknown }).id === "string")) {
      const ids = [...new Set([...x, ...y].map((v) => (v as { id: string }).id))];
      for (const id of ids) {
        const label = path.endsWith("units") ? unitName(id) : id;
        walk(x.find((v) => v.id === id), y.find((v) => v.id === id), `${path}［${label}］`);
      }
      return;
    }
    if (isObj(x) && isObj(y) && !Array.isArray(x) && !Array.isArray(y)) {
      for (const k of new Set([...Object.keys(x as object), ...Object.keys(y as object)])) walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
      return;
    }
    lines.push({ path, from: show(x), to: show(y) });
  };
  walk({ damage: a.project.damage.config, battle: a.project.battle }, { damage: b.project.damage.config, battle: b.project.battle }, "");
  return (
    <Section title={`設定差異（${lines.length > 60 ? "60+" : lines.length}）`}>
      {lines.length === 0 ? <p className="muted small">兩方的公式與內容完全相同。</p> : (
        <table className="table diff">
          <thead><tr><th>項目</th><th>A</th><th>B</th></tr></thead>
          <tbody>{lines.slice(0, 60).map((l, i) => <tr key={i}><td className="mono small">{l.path}</td><td className="mono small">{l.from}</td><td className="mono small">{l.to}</td></tr>)}</tbody>
        </table>
      )}
    </Section>
  );
}
