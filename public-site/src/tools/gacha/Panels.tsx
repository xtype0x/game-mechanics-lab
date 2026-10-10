import { Gacha } from "@ggt/core";
import { LineChart, PmfBars } from "./charts";
import { Card, Field, NumberInput, Segmented, Stat, fmt, pct, twd } from "./ui";
import { nextId, type Analysis, type SimState } from "./state";

type Set = (fn: (s: SimState) => void) => void;

export function TargetPanel({ s, set }: { s: SimState; set: Set }) {
  const m = s.model;
  const feat = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "featured" }> => x.kind === "featured" && x.tier === s.target.tier);
  const tier = m.tiers.find((t) => t.id === s.target.tier);
  const pool = [...(feat?.items ?? []), ...(tier?.items ?? [])];
  const name = (id: string) => m.items.find((x) => x.id === id)?.name ?? id;
  const modes: { value: Gacha.Target["mode"]; label: string }[] = [
    ...(feat ? [{ value: "featured" as const, label: "任一限定" }] : []),
    { value: "item", label: "指定物品" },
    { value: "tier", label: `任一${tier?.name ?? ""}` },
  ];
  return (
    <Card title="我想要">
      <div className="grid">
        <Field label="稀有度">
          <select value={s.target.tier} onChange={(e) => set((x) => { x.target.tier = e.target.value; })}>
            {m.tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="幾個"><NumberInput label="想要幾個" value={s.target.copies} min={1} max={20} onChange={(v) => set((x) => { x.target.copies = Math.round(v); })} /></Field>
      </div>
      <Segmented label="目標種類" value={s.target.mode} options={modes} onChange={(v) => set((x) => { x.target.mode = v; })} />
      {s.target.mode === "item" && (
        <Field label="哪一個">
          <select value={s.target.itemId ?? ""} onChange={(e) => set((x) => { x.target.itemId = e.target.value; })}>
            {pool.map((id) => <option key={id} value={id}>{name(id)}{feat?.items.includes(id) ? "（限定）" : ""}</option>)}
          </select>
        </Field>
      )}
      {m.modules.some((x) => x.kind === "exchange") && (
        <label className="check"><input type="checkbox" checked={s.target.useExchange !== false} onChange={(e) => set((x) => { x.target.useExchange = e.target.checked; })} />點數一夠就兌換</label>
      )}
    </Card>
  );
}

export function ProgressPanel({ s, set }: { s: SimState; set: Set }) {
  const m = s.model;
  const vars = Gacha.stateVars(m).filter((v) => v !== "batch");
  if (!vars.length) return null;
  const tierName = (id: string) => m.tiers.find((t) => t.id === id)?.name ?? id;
  return (
    <Card title="目前進度">
      <div className="grid">
        {vars.map((v) => {
          const [kind, id] = v.split(":") as [string, string];
          if (kind === "guar") return <label key={v} className="check"><input type="checkbox" checked={s.start.vars[v] === 1} onChange={(e) => set((x) => { x.start.vars[v] = e.target.checked ? 1 : 0; })} />{tierName(id)}：上次歪了（下次必定限定）</label>;
          const label = kind === "since" ? `${tierName(id)}：已墊幾抽` : kind === "miss" ? `${tierName(id)}：未抽到限定的累計抽數` : kind === "fate" ? `${tierName(id)}：定軌點數` : "兌換點數";
          return <Field key={v} label={label}><NumberInput label={label} value={s.start.vars[v] ?? 0} min={0} onChange={(n) => set((x) => { x.start.vars[v] = Math.round(n); })} /></Field>;
        })}
      </div>
    </Card>
  );
}

export function BudgetPanel({ s, set }: { s: SimState; set: Set }) {
  return (
    <Card title="預算">
      <div className="grid">
        <Field label="願意花（台幣）"><NumberInput label="願意花的台幣" value={s.budget} min={0} step={100} onChange={(v) => set((x) => { x.budget = v; })} /></Field>
        <Field label={`已有${s.model.pull.currency}`}><NumberInput label="已有貨幣" value={s.wallet.currency} min={0} onChange={(v) => set((x) => { x.wallet.currency = v; })} /></Field>
        <Field label="免費抽數"><NumberInput label="免費抽數" value={s.wallet.freePulls} min={0} onChange={(v) => set((x) => { x.wallet.freePulls = Math.round(v); })} /></Field>
      </div>
      <details className="fold inline">
        <summary><span className="fold-title">儲值方案（範例價格，請改成實際價格）</span></summary>
        <table className="table compact">
          <thead><tr><th>台幣</th><th>得到{s.model.pull.currency}</th><th>首儲加贈</th><th /></tr></thead>
          <tbody>
            {s.packs.map((p, i) => (
              <tr key={p.id}>
                <td><NumberInput label="價格" value={p.price} min={0} onChange={(v) => set((x) => { x.packs[i]!.price = v; })} /></td>
                <td><NumberInput label="數量" value={p.amount} min={1} onChange={(v) => set((x) => { x.packs[i]!.amount = Math.round(v); })} /></td>
                <td><NumberInput label="首儲加贈" value={p.firstBonus ?? 0} min={0} onChange={(v) => set((x) => { x.packs[i]!.firstBonus = Math.round(v); })} /></td>
                <td className="r"><button className="btn tiny ghost" aria-label="刪除方案" onClick={() => set((x) => { x.packs.splice(i, 1); })}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn tiny" onClick={() => set((x) => { x.packs.push({ id: nextId("pack", x.packs.map((p) => p.id)), name: "新方案", price: 300, amount: 600, firstBonus: 0 }); })}>＋ 方案</button>
        <p className="hint">計算時自動選最便宜的組合（含首儲加贈），並假設隨抽隨買。</p>
      </details>
    </Card>
  );
}

export function Results({ s, a, pending }: { s: SimState; a: Analysis; pending?: boolean }) {
  if (a.errors.length) return <Card title="結果"><p className="issue error">規則有錯誤，請先修正：{a.errors[0]!.message}</p></Card>;
  if (a.error || !a.dist || !a.summary || !a.spend) return <Card title="結果"><p className="issue error">{a.error ?? "無法計算"}</p></Card>;
  const { dist, summary: sm, spend: sp } = a;
  const cur = s.model.pull.currency;
  const curFor = (n: number) => fmt(Gacha.currencyFor(s.model, n, s.wallet), 0);
  return (
    <Card title="結果" className={`results ${pending ? "pending" : ""}`} actions={pending ? <span className="hint" role="status">計算中…</span> : undefined}>
      <p className="lead">
        平均要 <b>{fmt(sm.mean, 1)}</b> 抽（約 <b>{twd(sp.mean)}</b>）。
        一半的人在 <b>{sm.percentiles.p50}</b> 抽內完成，九成在 <b>{sm.percentiles.p90}</b> 抽內。
        {a.worst !== null && a.worst !== undefined ? <> 最多 <b>{a.worst}</b> 抽一定拿到。</> : <> 這個目標<b>沒有保證上限</b>。</>}
      </p>
      <div className="stats">
        <Stat label="預算內達成" value={pct(a.budgetChance ?? 0, 1)} sub={`${twd(s.budget)} 可抽 ${a.budgetPulls ?? 0} 抽`} />
        <Stat label="平均抽數" value={fmt(sm.mean, 1)} sub={`${curFor(Math.round(sm.mean))} ${cur}`} />
        <Stat label="中位數／P90" value={`${sm.percentiles.p50}／${sm.percentiles.p90}`} sub={`${twd(sp.p50)}／${twd(sp.p90)}`} />
        <Stat label="保證上限" value={a.worst ?? "無"} sub={a.worst ? twd(sp.max) : "運氣差可能更多"} />
      </div>
      <LineChart
        series={[{ label: "累積達成機率", points: dist.cdf }]}
        marker={a.budgetPulls}
        markerLabel="你的預算"
        xLabel="抽數"
      />
      <table className="table compact">
        <thead><tr><th>機率</th><th className="r">抽數</th><th className="r">{cur}</th><th className="r">台幣</th></tr></thead>
        <tbody>
          {([["50%", sm.percentiles.p50, sp.p50], ["90%", sm.percentiles.p90, sp.p90], ["99%", sm.percentiles.p99, sp.p99]] as const).map(([q, n, money]) => (
            <tr key={q}><td>{q} 的人在這之內完成</td><td className="r mono">{n}</td><td className="r mono">{curFor(n)}</td><td className="r mono">{twd(money)}</td></tr>
          ))}
        </tbody>
      </table>
      {a.budgetCopies && s.target.copies === 1 && (a.budgetPulls ?? 0) > 0 && (
        <p className="hint">預算內預期拿到 {fmt(a.budgetCopies.reduce((acc, p, k) => acc + p * k, 0), 2)} 個（5 個以上計為 5）。</p>
      )}
      <h3>在第幾抽完成</h3>
      <PmfBars pmf={dist.pmf} />
    </Card>
  );
}
