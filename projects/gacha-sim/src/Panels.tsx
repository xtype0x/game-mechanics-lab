import { tr, displayText } from "./i18n";
import { Gacha } from "@gml/core";
import { LineChart, PmfBars } from "./charts";
import { Card, Field, NumberInput, Segmented, Stat, fmt, pct, twd } from "./ui";
import { nextId, type Analysis, type SimState } from "./state";

type Set = (fn: (s: SimState) => void) => void;

export function TargetPanel({ s, set }: { s: SimState; set: Set }) {
  const m = s.model;
  const feat = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "featured" }> => x.kind === "featured" && x.tier === s.target.tier);
  const tier = m.tiers.find((t) => t.id === s.target.tier);
  const pool = [...(feat?.items ?? []), ...(tier?.items ?? [])];
  const name = (id: string) => displayText(m.items.find((x) => x.id === id)?.name ?? id);
  const modes: { value: Gacha.Target["mode"]; label: string }[] = [
    ...(feat ? [{ value: "featured" as const, label: tr("panels1") }] : []),
    { value: "item", label: tr("panels2") },
    { value: "tier", label: tr("panels3", tier?.name ?? "") },
  ];
  return (
    <Card title={tr("panels4")}>
      <div className="grid">
        <Field label={tr("modelEditor12")}>
          <select value={s.target.tier} onChange={(e) => set((x) => { x.target.tier = e.target.value; })}>
            {m.tiers.map((t) => <option key={t.id} value={t.id}>{displayText(t.name)}</option>)}
          </select>
        </Field>
        <Field label={tr("panels5")}><NumberInput label={tr("panels6")} value={s.target.copies} min={1} max={20} onChange={(v) => set((x) => { x.target.copies = Math.round(v); })} /></Field>
      </div>
      <Segmented label={tr("panels7")} value={s.target.mode} options={modes} onChange={(v) => set((x) => { x.target.mode = v; })} />
      {s.target.mode === "item" && (
        <Field label={tr("panels8")}>
          <select value={s.target.itemId ?? ""} onChange={(e) => set((x) => { x.target.itemId = e.target.value; })}>
            {pool.map((id) => <option key={id} value={id}>{name(id)}{feat?.items.includes(id) ? tr("panels9") : ""}</option>)}
          </select>
        </Field>
      )}
      {m.modules.some((x) => x.kind === "exchange") && (
        <label className="check"><input type="checkbox" checked={s.target.useExchange !== false} onChange={(e) => set((x) => { x.target.useExchange = e.target.checked; })} />{tr("panels10")}</label>
      )}
    </Card>
  );
}

export function ProgressPanel({ s, set }: { s: SimState; set: Set }) {
  const m = s.model;
  const vars = Gacha.stateVars(m).filter((v) => v !== "batch");
  if (!vars.length) return null;
  const tierName = (id: string) => displayText(m.tiers.find((t) => t.id === id)?.name ?? id);
  return (
    <Card title={tr("panels11")}>
      <div className="grid">
        {vars.map((v) => {
          const [kind, id] = v.split(":") as [string, string];
          if (kind === "guar") return <label key={v} className="check"><input type="checkbox" checked={s.start.vars[v] === 1} onChange={(e) => set((x) => { x.start.vars[v] = e.target.checked ? 1 : 0; })} />{tierName(id)}{tr("panels12")}</label>;
          const label = kind === "since" ? tr("panels13", tierName(id)) : kind === "miss" ? tr("panels14", tierName(id)) : kind === "fate" ? tr("panels15", tierName(id)) : tr("modelEditor56");
          return <Field key={v} label={label}><NumberInput label={label} value={s.start.vars[v] ?? 0} min={0} onChange={(n) => set((x) => { x.start.vars[v] = Math.round(n); })} /></Field>;
        })}
      </div>
    </Card>
  );
}

export function BudgetPanel({ s, set }: { s: SimState; set: Set }) {
  return (
    <Card title={tr("panels16")}>
      <div className="grid">
        <Field label={tr("panels17")}><NumberInput label={tr("panels18")} value={s.budget} min={0} step={100} onChange={(v) => set((x) => { x.budget = v; })} /></Field>
        <Field label={tr("panels19", s.model.pull.currency)}><NumberInput label={tr("panels20")} value={s.wallet.currency} min={0} onChange={(v) => set((x) => { x.wallet.currency = v; })} /></Field>
        <Field label={tr("panels21")}><NumberInput label={tr("panels21")} value={s.wallet.freePulls} min={0} onChange={(v) => set((x) => { x.wallet.freePulls = Math.round(v); })} /></Field>
      </div>
      <details className="fold inline">
        <summary><span className="fold-title">{tr("panels22")}</span></summary>
        <table className="table compact">
          <thead><tr><th>{tr("panels23")}</th><th>{tr("panels24")}{displayText(s.model.pull.currency)}</th><th>{tr("panels25")}</th><th /></tr></thead>
          <tbody>
            {s.packs.map((p, i) => (
              <tr key={p.id}>
                <td><NumberInput label={tr("panels26")} value={p.price} min={0} onChange={(v) => set((x) => { x.packs[i]!.price = v; })} /></td>
                <td><NumberInput label={tr("panels27")} value={p.amount} min={1} onChange={(v) => set((x) => { x.packs[i]!.amount = Math.round(v); })} /></td>
                <td><NumberInput label={tr("panels25")} value={p.firstBonus ?? 0} min={0} onChange={(v) => set((x) => { x.packs[i]!.firstBonus = Math.round(v); })} /></td>
                <td className="r"><button className="btn tiny ghost" aria-label={tr("panels28")} onClick={() => set((x) => { x.packs.splice(i, 1); })}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn tiny" onClick={() => set((x) => { x.packs.push({ id: nextId("pack", x.packs.map((p) => p.id)), name: tr("panels29"), price: 300, amount: 600, firstBonus: 0 }); })}>{tr("panels30")}</button>
        <p className="hint">{tr("panels31")}</p>
      </details>
    </Card>
  );
}

export function Results({ s, a, pending }: { s: SimState; a: Analysis; pending?: boolean }) {
  if (a.errors.length) return <Card title={tr("panels32")}><p className="issue error">{tr("panels33")}{displayText(a.errors[0]!.message)}</p></Card>;
  if (a.error || !a.dist || !a.summary || !a.spend) return <Card title={tr("panels32")}><p className="issue error">{displayText(a.error) || tr("panels34")}</p></Card>;
  const { dist, summary: sm, spend: sp } = a;
  const cur = displayText(s.model.pull.currency);
  const curFor = (n: number) => fmt(Gacha.currencyFor(s.model, n, s.wallet), 0);
  return (
    <Card title={tr("panels32")} className={`results ${pending ? "pending" : ""}`} actions={pending ? <span className="hint" role="status">{tr("panels35")}</span> : undefined}>
      <p className="lead">{tr("panels36")}<b>{fmt(sm.mean, 1)}</b>{tr("panels37")}<b>{twd(sp.mean)}</b>{tr("panels38")}<b>{sm.percentiles.p50}</b>{tr("panels39")}<b>{sm.percentiles.p90}</b>{tr("panels40")}{a.worst !== null && a.worst !== undefined ? <>{tr("panels41")}<b>{a.worst}</b>{tr("panels42")}</> : <>{tr("panels43")}<b>{tr("panels44")}</b>{tr("panels45")}</>}
      </p>
      <div className="stats">
        <Stat label={tr("panels46")} value={pct(a.budgetChance ?? 0, 1)} sub={tr("panels47", twd(s.budget), a.budgetPulls ?? 0)} />
        <Stat label={tr("panels48")} value={fmt(sm.mean, 1)} sub={`${curFor(Math.round(sm.mean))} ${cur}`} />
        <Stat label={tr("panels49")} value={tr("panels50", sm.percentiles.p50, sm.percentiles.p90)} sub={tr("panels50", twd(sp.p50), twd(sp.p90))} />
        <Stat label={tr("panels51")} value={a.worst ?? tr("panels52")} sub={a.worst ? twd(sp.max) : tr("panels53")} />
      </div>
      <LineChart
        series={[{ label: tr("panels54"), points: dist.cdf }]}
        marker={a.budgetPulls}
        markerLabel={tr("panels55")}
        xLabel={tr("panels56")}
      />
      <table className="table compact">
        <thead><tr><th>{tr("panels57")}</th><th className="r">{tr("panels56")}</th><th className="r">{cur}</th><th className="r">{tr("panels23")}</th></tr></thead>
        <tbody>
          {([["50%", sm.percentiles.p50, sp.p50], ["90%", sm.percentiles.p90, sp.p90], ["99%", sm.percentiles.p99, sp.p99]] as const).map(([q, n, money]) => (
            <tr key={q}><td>{q}{tr("panels58")}</td><td className="r mono">{n}</td><td className="r mono">{curFor(n)}</td><td className="r mono">{twd(money)}</td></tr>
          ))}
        </tbody>
      </table>
      {a.budgetCopies && s.target.copies === 1 && (a.budgetPulls ?? 0) > 0 && (
        <p className="hint">{tr("panels59")}{fmt(a.budgetCopies.reduce((acc, p, k) => acc + p * k, 0), 2)}{tr("panels60")}</p>
      )}
      <h3>{tr("panels61")}</h3>
      <PmfBars pmf={dist.pmf} />
    </Card>
  );
}
