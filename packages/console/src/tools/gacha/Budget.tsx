import {
  Rng, chanceWithin, newGachaState, percentile, pullOnce, targetDistribution, worstCasePulls,
  type BannerDef, type GachaState, type Project, type PullDistribution, type TargetSpec,
} from "@ggt/core";
import { useMemo, useState } from "react";
import type { Updater } from "../../useProject";
import { ErrorBox, Field, NumberField, Section, Segmented, fmt, pct, tryCompute } from "../../ui";
import { BannerPicker, GachaIssues, itemName, useBanner } from "./common";

type Mode = TargetSpec["mode"];

export function Budget({ project, update }: { project: Project; update: Updater }) {
  const { banner, issues, errors } = useBanner(project, update);
  const top = banner?.tiers[0];
  const hasFeat = !!top?.featured?.items.length;
  const [mode, setMode] = useState<Mode>("featured");
  const [itemId, setItemId] = useState("");
  const [copies, setCopies] = useState(1);
  const [counter, setCounter] = useState(0);
  const [guaranteed, setGuaranteed] = useState(false);
  const [currency, setCurrency] = useState(14400);
  const [tickets, setTickets] = useState(0);

  const effMode: Mode = hasFeat ? mode : "tier";
  const effItem = effMode === "item" ? (top?.featured?.items.includes(itemId) ? itemId : top?.featured?.items[0] ?? "") : undefined;
  const target: TargetSpec = { mode: effMode, copies, itemId: effItem };
  const start: GachaState | undefined = banner ? { counters: { [top!.id]: counter }, guaranteed: { [top!.id]: guaranteed && hasFeat }, pulls: 0 } : undefined;
  const dist = useMemo(
    () => (banner && !errors.length ? tryCompute(() => targetDistribution(banner, target, start)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [banner, errors.length, effMode, effItem, copies, counter, guaranteed],
  );
  const budgetPulls = banner && banner.cost > 0 ? Math.floor(currency / banner.cost) + tickets : tickets;

  return (
    <div className="tool-layout">
      <div className="workspace">
        <Section title="卡池"><BannerPicker project={project} update={update} /></Section>
        {banner && top && (
          <Section title="目標">
            <Segmented<Mode>
              value={effMode}
              onChange={setMode}
              options={[{ value: "tier", label: `任何 ${top.name}` }, ...(hasFeat ? [{ value: "featured" as Mode, label: `限定 ${top.name}` }, { value: "item" as Mode, label: "指定限定物品" }] : [])]}
            />
            <div className="grid-fields">
              {effMode === "item" && (
                <Field label="物品">
                  <select value={effItem} onChange={(e) => setItemId(e.target.value)}>
                    {top.featured!.items.map((id) => <option key={id} value={id}>{itemName(banner, id)}</option>)}
                  </select>
                </Field>
              )}
              <Field label="想要幾個"><NumberField value={copies} min={1} max={20} onChange={(v) => setCopies(Math.min(20, Math.max(1, Math.round(v))))} /></Field>
            </div>
          </Section>
        )}
        {banner && top && (
          <Section title="目前進度">
            <div className="grid-fields">
              <Field label={`已墊抽數（距上次 ${top.name}）`}><NumberField value={counter} min={0} onChange={(v) => setCounter(Math.max(0, Math.round(v)))} /></Field>
              {hasFeat && top.featured!.guarantee && <label className="check"><input type="checkbox" checked={guaranteed} onChange={(e) => setGuaranteed(e.target.checked)} />上次歪了（大保底中）</label>}
            </div>
          </Section>
        )}
        {banner && (
          <Section title="預算">
            <div className="grid-fields">
              <Field label="貨幣"><NumberField value={currency} min={0} onChange={(v) => setCurrency(Math.max(0, v))} /></Field>
              <Field label="免費抽數"><NumberField value={tickets} min={0} onChange={(v) => setTickets(Math.max(0, Math.round(v)))} /></Field>
            </div>
            <p className="muted small">每抽 {fmt(banner.cost, 0)}，可抽 <b>{budgetPulls}</b> 次。</p>
          </Section>
        )}
        <GachaIssues issues={issues} />
      </div>
      <div className="results">
        <div className="results-head"><h2>達成機率</h2></div>
        {errors.length > 0 && <p className="muted">卡池有錯誤，請到「卡池與保底規則編輯器」修正。</p>}
        {dist && !dist.ok && <ErrorBox error={dist.error} />}
        {dist?.ok && banner && <Results banner={banner} d={dist.value} budgetPulls={budgetPulls} target={target} start={start!} seed={project.seed} />}
      </div>
    </div>
  );
}

function Results({ banner, d, budgetPulls, target, start, seed }: { banner: BannerDef; d: PullDistribution; budgetPulls: number; target: TargetSpec; start: GachaState; seed: number | string }) {
  const [mc, setMc] = useState<{ mean: number; within: number; n: number } | null>(null);
  const p = (q: number) => { const n = percentile(d, q); return n < 0 ? "—" : String(n); };
  const within = chanceWithin(d, budgetPulls);
  const marks = [...new Set([10, 20, 50, 80, 90, 160, 180, 270, budgetPulls].filter((x) => x > 0))].sort((a, b) => a - b);
  const maxN = worstCasePulls(banner, target, start);
  const runMc = () => {
    const rng = new Rng(seed, "gacha.budget");
    const n = 5000;
    let sum = 0, ok = 0;
    for (let r = 0; r < n; r++) {
      const st: GachaState = { ...newGachaState(banner), counters: { ...newGachaState(banner).counters, ...start.counters }, guaranteed: { ...start.guaranteed } };
      let got = 0, k = 0;
      while (got < target.copies && k < 100000) {
        k++;
        const res = pullOnce(banner, st, rng);
        if (res.tierId !== banner.tiers[0]!.id) continue;
        if (target.mode === "tier" || (target.mode === "featured" && res.featured) || (target.mode === "item" && res.itemId === target.itemId)) got++;
      }
      sum += k;
      if (k <= budgetPulls) ok++;
    }
    setMc({ mean: sum / n, within: ok / n, n });
  };
  return (
    <>
      <div className="stat-tiles">
        <div className="stat"><span>預算內達成</span><b>{pct(within, 1)}</b></div>
        <div className="stat"><span>平均抽數</span><b>{fmt(d.mean, 1)}</b></div>
        <div className="stat"><span>P50 / P90 / P99</span><b>{p(0.5)} / {p(0.9)} / {p(0.99)}</b></div>
        <div className="stat"><span>保證最多</span><b>{maxN ?? "無上限"}</b></div>
      </div>
      <Section title="累積機率">
        <CdfChart d={d} mark={budgetPulls} />
        <table className="table">
          <thead><tr><th>抽數</th><th className="r">花費</th><th className="r">達成機率</th></tr></thead>
          <tbody>{marks.map((n) => <tr key={n} className={n === budgetPulls ? "hl" : ""}><td>{n}{n === budgetPulls ? "（預算）" : ""}</td><td className="r mono">{fmt(n * banner.cost, 0)}</td><td className="r mono">{pct(chanceWithin(d, n), 2)}</td></tr>)}</tbody>
        </table>
        {d.tail > 1e-9 && <p className="muted small">計算到第 {d.pmf.length - 1} 抽仍有 {pct(d.tail, 4)} 未達成（沒有保底上限）。</p>}
      </Section>
      <Section title="抽樣對照" actions={<button className="btn small" onClick={runMc}>抽樣 5000 次</button>}>
        {mc ? (
          <div className="kv">
            <span>抽樣平均抽數</span><strong>{fmt(mc.mean, 2)}（精確 {fmt(d.mean, 2)}）</strong>
            <span>抽樣預算內達成</span><strong>{pct(mc.within, 1)}（精確 {pct(within, 1)}）</strong>
          </div>
        ) : <p className="muted small">用實際抽卡規則模擬，對照上面的精確計算。</p>}
      </Section>
    </>
  );
}

function CdfChart({ d, mark }: { d: PullDistribution; mark: number }) {
  const last = d.cdf.findIndex((v) => v >= 0.9999);
  const n = Math.max(10, last > 0 ? last : d.cdf.length - 1, mark);
  const pts = Array.from({ length: n + 1 }, (_, i) => `${(i / n) * 100},${100 - (d.cdf[Math.min(i, d.cdf.length - 1)] ?? 0) * 100}`).join(" ");
  const mx = (Math.min(mark, n) / n) * 100;
  return (
    <div className="cdf-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="累積機率">
        {[25, 50, 75].map((y) => <line key={y} x1={0} x2={100} y1={y} y2={y} className="grid" vectorEffect="non-scaling-stroke" />)}
        <polyline points={pts} className="line" fill="none" vectorEffect="non-scaling-stroke" />
        {mark > 0 && <line x1={mx} x2={mx} y1={0} y2={100} className="mark" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="cdf-axis"><span>0</span><span>{n} 抽</span></div>
    </div>
  );
}
