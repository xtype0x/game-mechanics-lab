import { aggregate, batchSeed, simulateOne, type AllyPolicy, type BatchStats, type BattleSummary, type Project } from "@gml/core";
import { useEffect, useRef, useState } from "react";
import { BarChart, ErrorBox, Field, NumberField, Section, fmt, pct } from "./ui";
import { useBattleSetup, type Updater } from "./common";

const CHUNK = 4;
const MAX_RUNS = 1000;

interface Run {
  stats: BatchStats;
  label: string;
}

export function BatchSim({ project, update }: { project: Project; update: Updater }) {
  const { setup, error } = useBattleSetup(project);
  const [n, setN] = useState(200);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Run | null>(null);
  const [baseline, setBaseline] = useState<Run | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const start = () => {
    if (!setup) return;
    cancelRef.current = false;
    setRunError(null);
    const results: BattleSummary[] = [];
    const label = describe(project);
    const seed = project.seed;
    const policy = project.battle.policy;
    const step = () => {
      if (cancelRef.current) { setProgress(null); return; }
      try {
        const end = Math.min(n, results.length + CHUNK);
        for (let i = results.length; i < end; i++) results.push(simulateOne(setup, policy, batchSeed(seed, i)));
      } catch (e) {
        setRunError((e as Error).message);
        setProgress(null);
        return;
      }
      setProgress({ done: results.length, total: n });
      if (results.length < n) timer.current = window.setTimeout(step, 0);
      else { setResult({ stats: aggregate(results), label }); setProgress(null); }
    };
    setProgress({ done: 0, total: n });
    timer.current = window.setTimeout(step, 0);
  };

  const setPolicy = (fn: (p: AllyPolicy) => void) => update((p) => fn(p.battle.policy));
  const pol = project.battle.policy;

  return (
    <>
      <div className="workspace">
        <Section title="我方自動策略">
          <div className="grid-fields">
            <Field label="大招">
              <select value={pol.ult} onChange={(e) => setPolicy((p) => { p.ult = e.target.value as AllyPolicy["ult"]; })}>
                <option value="asap">能量滿就放</option>
                <option value="never">不放</option>
              </select>
            </Field>
            <Field label="戰技">
              <select value={pol.skill} onChange={(e) => setPolicy((p) => { p.skill = e.target.value as AllyPolicy["skill"]; })}>
                <option value="whenSp">有技能點就用（治療只在需要時）</option>
                <option value="always">有技能點就用（含治療）</option>
                <option value="never">只用普攻</option>
              </select>
            </Field>
            <Field label="選擇目標">
              <select value={pol.target} onChange={(e) => setPolicy((p) => { p.target = e.target.value as AllyPolicy["target"]; })}>
                <option value="weaknessFirst">優先打弱點、韌性低者</option>
                <option value="lowestHp">血量最低</option>
                <option value="highestHp">血量最高</option>
                <option value="first">第一個</option>
              </select>
            </Field>
          </div>
        </Section>
        <Section title="執行">
          <div className="grid-fields">
            <Field label="場數"><NumberField value={n} min={10} max={MAX_RUNS} onChange={(v) => setN(Math.max(10, Math.min(MAX_RUNS, Math.round(v))))} /></Field>
            <Field label="種子"><input className="mono" value={String(project.seed)} onChange={(e) => update((p) => { p.seed = /^d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value; })} /></Field>
          </div>
          <div className="row-gap">
            {progress ? (
              <button className="btn" onClick={() => { cancelRef.current = true; }}>取消</button>
            ) : (
              <button className="btn primary" disabled={!setup} onClick={start}>開始模擬</button>
            )}
            {result && !progress && <button className="btn small" onClick={() => setBaseline(result)}>設為比較基準</button>}
            {baseline && <button className="btn small ghost" onClick={() => setBaseline(null)}>清除基準</button>}
          </div>
          {progress && (
            <div className="progress" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
              <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              <span>{progress.done} / {progress.total}</span>
            </div>
          )}
          <p className="muted small">第 i 場使用種子「{String(project.seed)}#i」，相同設定與種子會得到完全相同的結果。改變角色數值後重跑，即可和上一次的結果比較差異。</p>
        </Section>
        {error && <ErrorBox error={error} />}
        {runError && <ErrorBox error={runError} />}
      </div>

      <div className="results">
        <div className="results-head"><h3>批量結果</h3></div>
        {!result && <p className="muted">按「開始模擬」執行。</p>}
        {result && <Results run={result} baseline={baseline} />}
      </div>
    </>
  );
}

function describe(p: Project) {
  const names = (ids: string[]) => ids.map((id) => p.battle.units.find((u) => u.id === id)?.name ?? id).join("、");
  return `${names(p.battle.encounter.allies)} vs ${names(p.battle.encounter.enemies)}`;
}

function Delta({ now, base, digits = 1, percent = false, invert = false }: { now: number; base?: number; digits?: number; percent?: boolean; invert?: boolean }) {
  if (base === undefined) return null;
  const d = now - base;
  if (Math.abs(d) < 1e-9) return <small className="delta muted">±0</small>;
  const good = invert ? d < 0 : d > 0;
  return <small className={`delta ${good ? "up" : "down"}`}>{d > 0 ? "+" : ""}{percent ? pct(d) : fmt(d, digits)}</small>;
}

function Results({ run, baseline }: { run: Run; baseline: Run | null }) {
  const s = run.stats;
  const b = baseline?.stats;
  const maxMean = Math.max(1, ...s.damageShare.map((d) => d.mean));
  return (
    <>
      <p className="muted small">{run.label}・{s.n} 場{baseline && <>（比較基準：{baseline.label}，{baseline.stats.n} 場）</>}</p>
      <div className="cards">
        <div className="card accent"><span>勝率</span><strong>{pct(s.winRate)}</strong><Delta now={s.winRate} base={b?.winRate} percent /></div>
        <div className="card"><span>平均輪數（勝場）</span><strong>{s.cycles ? fmt(s.cycles.mean, 2) : "—"}</strong><Delta now={s.cycles?.mean ?? 0} base={b?.cycles?.mean} digits={2} invert /></div>
        <div className="card"><span>P50 ～ P90 輪數</span><strong>{s.cycles ? `${s.cycles.p50} ～ ${s.cycles.p90}` : "—"}</strong></div>
        <div className="card"><span>平均擊破次數</span><strong>{fmt(s.breaksMean, 2)}</strong><Delta now={s.breaksMean} base={b?.breaksMean} digits={2} /></div>
      </div>
      <Section title="結果分布">
        <div className="outcome-bar">
          <span className="win" style={{ width: `${s.winRate * 100}%` }}>{s.winRate > 0.08 ? `勝 ${pct(s.winRate, 0)}` : ""}</span>
          <span className="lose" style={{ width: `${s.loseRate * 100}%` }}>{s.loseRate > 0.08 ? `敗 ${pct(s.loseRate, 0)}` : ""}</span>
          <span className="timeout" style={{ width: `${s.timeoutRate * 100}%` }}>{s.timeoutRate > 0.08 ? `超時 ${pct(s.timeoutRate, 0)}` : ""}</span>
        </div>
      </Section>
      {s.cycles && (
        <Section title="勝場的結束輪數">
          <BarChart bars={s.cycles.histogram.map((h) => ({ label: `${h.cycle}`, value: h.count / s.n }))} height={150} />
        </Section>
      )}
      <Section title="我方傷害來源（每場平均）">
        <div className="share-list">
          {s.damageShare.map((d) => {
            const bd = b?.damageShare.find((x) => x.uid === d.uid && x.name === d.name);
            return (
              <div key={d.uid} className="share-row">
                <span className="share-name">{d.name}</span>
                <div className="share-bar">
                  <i className="hit" style={{ width: `${(d.hit / maxMean) * 100}%` }} title={`直接傷害 ${fmt(d.hit, 0)}`} />
                  <i className="brk" style={{ width: `${(d.break / maxMean) * 100}%` }} title={`擊破傷害 ${fmt(d.break, 0)}`} />
                  <i className="dot" style={{ width: `${(d.dot / maxMean) * 100}%` }} title={`持續傷害 ${fmt(d.dot, 0)}`} />
                </div>
                <span className="mono share-val">{fmt(d.mean, 0)}<small className="muted"> {pct(d.share, 0)}</small>{bd && <Delta now={d.mean} base={bd.mean} digits={0} />}</span>
              </div>
            );
          })}
        </div>
        <div className="legend"><span className="lg hit"><i />直接傷害</span><span className="lg brk"><i />擊破傷害</span><span className="lg dot"><i />持續傷害</span></div>
      </Section>
      <Section title="存活率">
        <table className="table">
          <tbody>
            {s.survival.map((x) => (
              <tr key={x.uid}><td>{x.name}</td><td className="r mono">{pct(x.rate)}</td><td className="r"><Delta now={x.rate} base={b?.survival.find((y) => y.uid === x.uid && y.name === x.name)?.rate} percent /></td></tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
