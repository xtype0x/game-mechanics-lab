import { analyzeDamage, sampleDamage, type Project, type SampleResult } from "@gml/core";
import { useMemo, useState, type ReactElement } from "react";
import { BarChart, ErrorBox, Field, fmt, NumberField, pct, Section, Segmented, tryCompute } from "@gml/ui";
import type { Updater } from "../useProject";
import { CompatBadge, useDamageRules } from "./common";
import type { ScenarioKey } from "./DamageBreakdown";

const MAX_BARS = 40;

export function CritDistribution({ project, update }: { project: Project; update: Updater }) {
  const { rules, compat } = useDamageRules(project);
  const [key, setKey] = useState<ScenarioKey>("A");
  const [n, setN] = useState(10000);
  const [sample, setSample] = useState<{ result: SampleResult; for: unknown } | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const sc = project.damage.scenarios[key];
  const analysis = useMemo(() => tryCompute(() => analyzeDamage(rules, sc)), [rules, sc]);
  // A sample is only shown for the exact analysis it was drawn from.
  const freshSample = sample && analysis.ok && sample.for === analysis.value ? sample.result : null;

  const a = analysis.ok ? analysis.value : null;
  const dist = a?.distribution ?? [];
  const sampleFreq = useMemo(() => {
    if (!freshSample) return null;
    const m = new Map<number, number>();
    for (const s of freshSample.samples) m.set(s, (m.get(s) ?? 0) + 1);
    return m;
  }, [freshSample]);

  const thr = threshold ?? (a ? Math.round(a.expected) : 0);
  const pAtLeast = dist.filter((d) => d.value >= thr).reduce((x, d) => x + d.prob, 0);
  const sampledAtLeast = freshSample ? freshSample.samples.filter((s) => s >= thr).length / freshSample.n : null;
  const percentile = (q: number) => {
    let acc = 0;
    for (const d of dist) { acc += d.prob; if (acc >= q - 1e-12) return d.value; }
    return dist.at(-1)?.value ?? 0;
  };

  return (
    <div className="tool-layout">
      <div className="workspace">
        <Section title="分析對象">
          <Segmented<ScenarioKey>
            value={key}
            onChange={(k) => { setKey(k); setThreshold(null); }}
            options={[{ value: "A", label: `A：${project.damage.scenarios.A.name}` }, { value: "B", label: `B：${project.damage.scenarios.B.name}` }]}
          />
          <p className="muted small">數值與增益在「傷害計算與分項檢視」編輯。每段命中各自獨立判定暴擊。</p>
          {a && (
            <div className="kv">
              <span>命中段數</span><strong>{a.nonCrit.hits.length}</strong>
              <span>暴擊率</span><strong>{pct(a.critChance)}</strong>
              <span>可能結果數</span><strong>{dist.length}</strong>
            </div>
          )}
        </Section>
        <Section title="門檻機率">
          <Field label="總傷害至少">
            <NumberField value={thr} onChange={(v) => setThreshold(v)} />
          </Field>
          <p className="muted small">常用於「能不能一擊打死血量 X 的敵人」。</p>
        </Section>
        <Section title="抽樣驗證">
          <div className="grid-fields">
            <Field label="樣本數">
              <NumberField value={n} min={100} max={1000000} onChange={(v) => setN(Math.min(1000000, Math.max(100, Math.round(v))))} />
            </Field>
            <Field label="種子">
              <input className="mono" value={String(project.seed)} onChange={(e) => update((p) => { p.seed = /^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value; })} />
            </Field>
          </div>
          <button className="btn primary" disabled={!a} onClick={() => a && setSample({ result: sampleDamage(a, n, project.seed), for: a })}>
            執行抽樣
          </button>
          <p className="muted small">抽樣只用來對照；圖表的柱狀是精確機率，橫線是抽樣頻率。同種子會得到相同結果。</p>
        </Section>
      </div>

      <div className="results">
        <div className="results-head">
          <h2>暴擊分布・方案 {key}</h2>
          <CompatBadge status={compat.status} />
        </div>
        {!analysis.ok ? <ErrorBox error={analysis.error} /> : a && (
          <>
            <div className="cards">
              <div className="card accent"><span>期望傷害（理論）</span><strong>{fmt(a.expected, 1)}</strong></div>
              <div className="card"><span>中位數</span><strong>{fmt(percentile(0.5), 0)}</strong></div>
              <div className="card"><span>P10 ～ P90</span><strong>{fmt(percentile(0.1), 0)} ～ {fmt(percentile(0.9), 0)}</strong></div>
              <div className="card"><span>≥ {fmt(thr, 0)} 的機率</span><strong>{pct(pAtLeast, 2)}</strong></div>
            </div>
            <Section title="總傷害分布">
              {dist.length > MAX_BARS ? (
                <BarChart bars={bucketize(dist, sampleFreq, freshSample?.n)} />
              ) : (
                <BarChart bars={dist.map((d) => ({ label: fmt(d.value, 0), value: d.prob, compare: sampleFreq && freshSample ? (sampleFreq.get(d.value) ?? 0) / freshSample.n : undefined }))} />
              )}
            </Section>
            {freshSample && (
              <Section title={`理論 vs 抽樣（n = ${fmt(freshSample.n, 0)}，種子 ${String(freshSample.seed)}）`}>
                <table className="table">
                  <thead><tr><th></th><th className="r">理論</th><th className="r">抽樣</th><th className="r">差異</th></tr></thead>
                  <tbody>
                    <tr><td>平均</td><td className="r mono">{fmt(a.expected, 2)}</td><td className="r mono">{fmt(freshSample.mean, 2)}</td><td className="r mono">{pct((freshSample.mean - a.expected) / a.expected, 2)}</td></tr>
                    <tr><td>≥ {fmt(thr, 0)}</td><td className="r mono">{pct(pAtLeast, 2)}</td><td className="r mono">{pct(sampledAtLeast!, 2)}</td><td className="r mono">{pct(sampledAtLeast! - pAtLeast, 2)}</td></tr>
                  </tbody>
                </table>
              </Section>
            )}
            {dist.length <= MAX_BARS && (
              <Section title="完整分布表">
                <table className="table">
                  <thead><tr><th className="r">總傷害</th><th className="r">機率</th><th className="r">累積</th></tr></thead>
                  <tbody>
                    {dist.reduce<{ rows: ReactElement[]; acc: number }>((st, d) => {
                      st.acc += d.prob;
                      st.rows.push(<tr key={d.value}><td className="r mono">{fmt(d.value, 0)}</td><td className="r mono">{pct(d.prob, 2)}</td><td className="r mono muted">{pct(st.acc, 2)}</td></tr>);
                      return st;
                    }, { rows: [], acc: 0 }).rows}
                  </tbody>
                </table>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function bucketize(dist: { value: number; prob: number }[], freq: Map<number, number> | null, n?: number) {
  const lo = dist[0]!.value;
  const hi = dist.at(-1)!.value;
  const width = (hi - lo) / MAX_BARS || 1;
  const bars = Array.from({ length: MAX_BARS }, (_, i) => ({ label: fmt(lo + i * width, 0), value: 0, compare: freq ? 0 : undefined as number | undefined }));
  const idx = (v: number) => Math.min(MAX_BARS - 1, Math.floor((v - lo) / width));
  for (const d of dist) bars[idx(d.value)]!.value += d.prob;
  if (freq && n) for (const [v, c] of freq) bars[idx(v)]!.compare! += c / n;
  return bars;
}
