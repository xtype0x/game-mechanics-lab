import { analyzeDamage, printExpr, type DamageAnalysis, type DamageRules, type HitResult, type Project, type ValueBreakdown } from "@ggt/core";
import { Fragment, useMemo, useState } from "react";
import type { Updater } from "../useProject";
import { ErrorBox, Section, Segmented, fmt, pct, tryCompute } from "../ui";
import { CompatBadge, useDamageRules } from "./common";
import { ScenarioEditor } from "./ScenarioEditor";

export type ScenarioKey = "A" | "B";

export function DamageBreakdown({ project, update }: { project: Project; update: Updater }) {
  const { rules, compat } = useDamageRules(project);
  const [active, setActive] = useState<ScenarioKey>("A");
  const scenarios = project.damage.scenarios;
  const analyses = useMemo(
    () => ({ A: tryCompute(() => analyzeDamage(rules, scenarios.A)), B: tryCompute(() => analyzeDamage(rules, scenarios.B)) }),
    [rules, scenarios],
  );
  const current = analyses[active];

  return (
    <div className="tool-layout">
      <div className="workspace">
        <div className="workspace-head">
          <Segmented<ScenarioKey>
            value={active}
            onChange={setActive}
            options={[{ value: "A", label: `A：${scenarios.A.name}` }, { value: "B", label: `B：${scenarios.B.name}` }]}
          />
          <button
            className="btn small"
            title={`把方案 ${active} 的全部設定複製到另一個方案`}
            onClick={() => update((p) => {
              const other: ScenarioKey = active === "A" ? "B" : "A";
              const name = p.damage.scenarios[other].name;
              p.damage.scenarios[other] = { ...structuredClone(p.damage.scenarios[active]), name };
            })}
          >
            複製到 {active === "A" ? "B" : "A"}
          </button>
        </div>
        <label className="field inline">
          <span className="field-label">方案名稱</span>
          <input value={scenarios[active].name} onChange={(e) => update((p) => { p.damage.scenarios[active].name = e.target.value; })} />
        </label>
        {compat.status === "incompatible" && <ErrorBox error="目前的乘區組合不相容，請到「乘區組合器」修正。" />}
        <ScenarioEditor scenario={scenarios[active]} rules={rules} onChange={(fn) => update((p) => fn(p.damage.scenarios[active]))} />
      </div>

      <div className="results">
        <div className="results-head">
          <h2>結果・方案 {active}</h2>
          <CompatBadge status={compat.status} />
        </div>
        {current.ok ? <AnalysisView a={current.value} rules={rules} /> : <ErrorBox error={current.error} />}
        {analyses.A.ok && analyses.B.ok && <AbCompare a={analyses.A.value} b={analyses.B.value} names={[scenarios.A.name, scenarios.B.name]} />}
      </div>
    </div>
  );
}

export function SummaryCards({ a }: { a: DamageAnalysis }) {
  return (
    <div className="cards">
      <div className="card"><span>非暴擊總傷</span><strong>{fmt(a.nonCrit.total, 0)}</strong></div>
      <div className="card"><span>暴擊總傷</span><strong>{fmt(a.crit.total, 0)}</strong></div>
      <div className="card accent"><span>期望傷害</span><strong>{fmt(a.expected, 1)}</strong></div>
      <div className="card"><span>暴擊率（實際）</span><strong>{pct(a.critChance)}</strong></div>
    </div>
  );
}

function AnalysisView({ a, rules }: { a: DamageAnalysis; rules: DamageRules }) {
  const [mode, setMode] = useState<"nonCrit" | "crit">("nonCrit");
  const [hitIdx, setHitIdx] = useState(0);
  const result = mode === "crit" ? a.crit : a.nonCrit;
  const hit = result.hits[Math.min(hitIdx, result.hits.length - 1)];

  return (
    <>
      <SummaryCards a={a} />
      <Section
        title="逐乘區展開"
        actions={
          <>
            <Segmented value={mode} onChange={setMode} options={[{ value: "nonCrit", label: "未暴擊" }, { value: "crit", label: "暴擊" }]} />
            {result.hits.length > 1 && (
              <select aria-label="選擇命中段" value={hitIdx} onChange={(e) => setHitIdx(Number(e.target.value))}>
                {result.hits.map((h) => <option key={h.index} value={h.index}>第 {h.index + 1} 段（{pct(h.ratio, 0)}）</option>)}
              </select>
            )}
          </>
        }
      >
        {hit && <StepTable hit={hit} rules={rules} />}
      </Section>
      <StatTable stats={result.stats} rules={rules} />
    </>
  );
}

function StepTable({ hit, rules }: { hit: HitResult; rules: DamageRules }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <table className="table steps">
      <thead>
        <tr><th>乘區</th><th>公式</th><th className="r">乘區值</th><th className="r">累計</th></tr>
      </thead>
      <tbody>
        {hit.steps.map((s) => {
          const def = rules.steps.find((d) => d.id === s.id);
          const bd = s.breakdown;
          const hasDetail = bd.contributions.length > 0 || bd.inactive.length > 0 || bd.capped;
          return (
            <Fragment key={s.id}>
              <tr className={hasDetail ? "clickable" : ""} onClick={() => hasDetail && setOpen(open === s.id ? null : s.id)}>
                <td>
                  {hasDetail && <span className="caret">{open === s.id ? "▾" : "▸"}</span>}
                  {s.label}
                  {bd.contributions.length > 0 && <span className="pill">{bd.contributions.length} 個效果</span>}
                  {bd.capped && <span className="pill warn">觸及上下限</span>}
                </td>
                <td className="mono formula">{s.apply === "mul" ? "× " : "= "}{def ? printExpr(def.base) : ""}</td>
                <td className="r mono">{s.apply === "mul" ? `×${fmt(bd.value, 4)}` : fmt(bd.value, 2)}</td>
                <td className="r mono strong">{fmt(s.after, 2)}</td>
              </tr>
              {open === s.id && (
                <tr className="detail"><td colSpan={4}><BreakdownDetail bd={bd} /></td></tr>
              )}
            </Fragment>
          );
        })}
        <tr className="total">
          <td colSpan={3}>本段傷害（套用最低傷害與「{roundingLabel(rules.finalRounding)}」）</td>
          <td className="r mono strong">{fmt(hit.damage, 2)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function roundingLabel(m: string) {
  return { none: "不取整", floor: "無條件捨去", ceil: "無條件進位", round: "四捨五入" }[m] ?? m;
}

export function BreakdownDetail({ bd }: { bd: ValueBreakdown }) {
  return (
    <div className="bd-detail">
      <div className="mono">
        {bd.override !== undefined
          ? `強制覆寫為 ${fmt(bd.override, 4)}`
          : `(${fmt(bd.base, 4)} × (1 + ${fmt(bd.pctSum, 4)}) + ${fmt(bd.addSum, 4)}) × ${fmt(bd.mulProd, 4)} = ${fmt(bd.raw, 4)}`}
        {bd.capped && ` → 限制為 ${fmt(bd.value, 4)}`}
      </div>
      <ul>
        {bd.contributions.map((c) => <li key={c.modId}>✓ {c.label}：{opText(c.op, c.value)}</li>)}
        {bd.inactive.map((c) => <li key={c.modId} className="muted">✕ {c.label}（條件不成立）：{opText(c.op, c.value)}</li>)}
      </ul>
    </div>
  );
}

function opText(op: string, v: number) {
  switch (op) {
    case "pct": return `${v >= 0 ? "+" : ""}${pct(v)}（乘基礎）`;
    case "add": return `${v >= 0 ? "+" : ""}${fmt(v, 4)}`;
    case "mul": return `×${fmt(v, 4)}`;
    default: return `= ${fmt(v, 4)}`;
  }
}

function StatTable({ stats, rules }: { stats: DamageAnalysis["nonCrit"]["stats"]; rules: DamageRules }) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = rules.stats.map((s) => ({ def: s, bd: stats[s.side][s.key]! })).filter((r) => r.bd);
  return (
    <Section title="最終數值">
      <table className="table">
        <tbody>
          {rows.map(({ def, bd }) => {
            const key = `${def.side}.${def.key}`;
            const changed = bd.value !== bd.base;
            const show = (v: number) => (def.unit === "percent" ? pct(v) : fmt(v, 2));
            return (
              <Fragment key={key}>
                <tr className={changed ? "clickable" : ""} onClick={() => changed && setOpen(open === key ? null : key)}>
                  <td>{changed && <span className="caret">{open === key ? "▾" : "▸"}</span>}{def.side === "attacker" ? "攻方" : "守方"}・{def.label}</td>
                  <td className="r mono muted">{changed ? show(bd.base) : ""}</td>
                  <td className="r mono strong">{show(bd.value)}</td>
                </tr>
                {open === key && <tr className="detail"><td colSpan={3}><BreakdownDetail bd={bd} /></td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

function AbCompare({ a, b, names }: { a: DamageAnalysis; b: DamageAnalysis; names: [string, string] }) {
  const rows: [string, number, number, (n: number) => string][] = [
    ["期望傷害", a.expected, b.expected, (n) => fmt(n, 1)],
    ["非暴擊總傷", a.nonCrit.total, b.nonCrit.total, (n) => fmt(n, 0)],
    ["暴擊總傷", a.crit.total, b.crit.total, (n) => fmt(n, 0)],
    ["暴擊率", a.critChance, b.critChance, (n) => pct(n)],
  ];
  return (
    <Section title="A/B 比較">
      <table className="table">
        <thead><tr><th></th><th className="r">A：{names[0]}</th><th className="r">B：{names[1]}</th><th className="r">B 相對 A</th></tr></thead>
        <tbody>
          {rows.map(([label, x, y, f]) => {
            const d = x === 0 ? 0 : (y - x) / x;
            return (
              <tr key={label}>
                <td>{label}</td>
                <td className="r mono">{f(x)}</td>
                <td className="r mono">{f(y)}</td>
                <td className={`r mono ${d > 1e-9 ? "up" : d < -1e-9 ? "down" : "muted"}`}>{d > 0 ? "+" : ""}{pct(d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}
