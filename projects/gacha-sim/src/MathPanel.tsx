import { tr, displayText } from "./i18n";
import { Gacha } from "@gml/core";
import { useState } from "react";
import { LineChart } from "./charts";
import { Card, Fold, fmt, pct } from "./ui";
import type { Analysis, SimState } from "./state";

const VAR_LABEL = (m: Gacha.GachaModel, v: string) => {
  const [kind, id] = v.split(":") as [string, string];
  const t = m.tiers.find((x) => x.id === id)?.name ?? id;
  return { since: tr("mathPanel1", t), guar: tr("mathPanel2", t), miss: tr("mathPanel3", t), fate: tr("mathPanel4", t), pts: tr("modelEditor56"), batch: tr("mathPanel5") }[kind] ?? v;
};

export function MathPanel({ s, a }: { s: SimState; a: Analysis }) {
  const [mc, setMc] = useState<{ key: string; r: Gacha.MonteCarlo } | null>(null);
  if (!a.dist || !a.summary) return null;
  const { dist, summary: sm } = a;
  const m = s.model;
  const relevant = Gacha.relevantVars(m, s.target);
  const key = JSON.stringify([m, s.target, s.start]);
  const freshMc = mc && mc.key === key ? mc.r : null;
  const runMc = () => setMc({ key, r: Gacha.simulateTarget(m, s.target, 5000, Date.now() >>> 0, { start: s.start }) });
  const within = freshMc ? Array.from(freshMc.pulls).filter((n) => n <= (a.budgetPulls ?? 0)).length : 0;
  const ci = freshMc ? Gacha.wilson(within, freshMc.runs) : null;

  return (
    <Card title={tr("mathPanel6")} className="math">
      <p className="hint">{tr("mathPanel7")}<b>{tr("mathPanel8")}</b>{tr("mathPanel9")}</p>

      <Fold title={tr("mathPanel10")} summary={tr("mathPanel11", fmt(sm.mean, 2), fmt(sm.sd, 2))}>
        <table className="table compact">
          <tbody>
            <tr><td>{tr("mathPanel12")}</td><td className="r mono">{fmt(sm.mean, 4)}</td></tr>
            <tr><td>{tr("mathPanel13")}</td><td className="r mono">{fmt(sm.variance, 2)}</td></tr>
            <tr><td>{tr("mathPanel14")}</td><td className="r mono">{fmt(sm.sd, 3)}</td></tr>
            <tr><td>{tr("mathPanel15")}</td><td className="r mono">{fmt(sm.skewness, 3)}</td></tr>
            {(["p10", "p25", "p50", "p75", "p90", "p95", "p99"] as const).map((q) => <tr key={q}><td>{q.toUpperCase()}{tr("mathPanel16")}{q.slice(1)}%</td><td className="r mono">{sm.percentiles[q]}</td></tr>)}
            <tr><td>{tr("mathPanel17")}</td><td className="r mono">{a.worst ?? tr("mathPanel18")}</td></tr>
          </tbody>
        </table>
        {dist.tail > 1e-12 && <p className="hint">{tr("mathPanel19")}{dist.pmf.length - 1}{tr("mathPanel20")}{pct(dist.tail, 4)}{tr("mathPanel21")}</p>}
      </Fold>

      <Fold title={tr("mathPanel22")} summary={tr("mathPanel23", pct(Math.max(...sm.hazard), 1))}>
        <p>{tr("mathPanel24")}</p>
        <LineChart series={[{ label: tr("mathPanel25"), points: sm.hazard }]} xLabel={tr("panels56")} />
      </Fold>

      <Fold title={tr("mathPanel26")} summary={tr("mathPanel27", fmt(dist.states, 0))}>
        <p>{tr("mathPanel28")}</p>
        <ul>
          {relevant.length ? relevant.map((v) => <li key={v}>{VAR_LABEL(m, v)}{tr("mathPanel29")}{Gacha.varDomain(m, v)}{tr("mathPanel30")}</li>) : <li>{tr("mathPanel31")}</li>}
        </ul>
        <p>{tr("mathPanel32")}{s.target.copies}{tr("mathPanel33")}<sub>n+1</sub>{tr("mathPanel34")}<sub>n</sub>{tr("mathPanel35")}{fmt(a.ms, 0)}{tr("mathPanel36")}</p>
        <p>{tr("mathPanel37")}</p>
      </Fold>

      <Fold title={tr("mathPanel38")} summary={a.longRun ? `${displayText(m.tiers[0]!.name)} ${pct(a.longRun.tiers[0]!, 3)}` : tr("mathPanel39")}>
        {a.longRun ? (
          <>
            <p>{tr("mathPanel40")}{fmt(a.longRun.states, 0)}{tr("mathPanel41")}</p>
            <table className="table compact">
              <thead><tr><th>{tr("modelEditor12")}</th><th className="r">{tr("modelEditor13")}</th><th className="r">{tr("mathPanel42")}</th><th className="r">{tr("mathPanel43")}</th></tr></thead>
              <tbody>
                {m.tiers.map((t, i) => (
                  <tr key={t.id}>
                    <td>{displayText(t.name)}</td>
                    <td className="r mono">{i === m.tiers.length - 1 ? tr("modelEditor16") : pct(t.rate, 3)}</td>
                    <td className="r mono">{pct(a.longRun!.tiers[i]!, 3)}</td>
                    <td className="r mono">{a.longRun!.featuredShare[i]! > 0 ? pct(a.longRun!.featuredShare[i]!, 1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">{tr("mathPanel44")}</p>
          </>
        ) : <p className="hint">{displayText(a.longRunError)}{tr("mathPanel45")}</p>}
      </Fold>

      {a.budgetCopies && (a.budgetPulls ?? 0) > 0 && (
        <Fold title={tr("mathPanel46")} summary={tr("mathPanel47", pct(1 - a.budgetCopies[0]!, 1))}>
          <p>{tr("mathPanel48")}{a.budgetPulls}{tr("mathPanel49")}</p>
          <table className="table compact">
            <tbody>{a.budgetCopies.map((p, k) => <tr key={k}><td>{k === a.budgetCopies!.length - 1 ? tr("mathPanel50", k) : tr("mathPanel51", k)}</td><td className="r mono">{pct(p, 2)}</td></tr>)}</tbody>
          </table>
        </Fold>
      )}

      <Fold title={tr("mathPanel52")} summary={freshMc ? tr("mathPanel53", fmt(freshMc.mean, 2)) : tr("mathPanel54")}>
        <p>{tr("mathPanel55")}</p>
        <button className="btn" onClick={runMc}>{tr("mathPanel56")}</button>
        {freshMc && (
          <table className="table compact">
            <tbody>
              <tr><td>{tr("mathPanel57")}</td><td className="r mono">{fmt(freshMc.mean, 2)}{tr("mathPanel29")}{fmt(freshMc.meanCi[0], 2)}–{fmt(freshMc.meanCi[1], 2)}{tr("gachaStage30")}</td></tr>
              <tr><td>{tr("mathPanel58")}</td><td className="r mono">{fmt(sm.mean, 2)}{sm.mean >= freshMc.meanCi[0] && sm.mean <= freshMc.meanCi[1] ? tr("mathPanel59") : tr("mathPanel60")}</td></tr>
              {(a.budgetPulls ?? 0) > 0 && <tr><td>{tr("mathPanel61")}</td><td className="r mono">{pct(within / freshMc.runs, 1)}{tr("mathPanel29")}{pct(ci![0], 1)}–{pct(ci![1], 1)}{tr("gachaStage30")}</td></tr>}
              {(a.budgetPulls ?? 0) > 0 && <tr><td>{tr("mathPanel62")}</td><td className="r mono">{pct(a.budgetChance ?? 0, 1)}</td></tr>}
            </tbody>
          </table>
        )}
      </Fold>
    </Card>
  );
}
