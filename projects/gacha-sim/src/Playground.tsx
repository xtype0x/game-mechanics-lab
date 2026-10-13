import { tr, displayText } from "./i18n";
import { Gacha, Rng } from "@gml/core";
import { useMemo, useState } from "react";
import { Card, fmt } from "./ui";
import type { SimState } from "./state";

interface Log { outcome: Gacha.PullOutcome; n: number; exchanged?: boolean }

/** Try the rules by hand: pull, see the counters move, exchange points. Independent of the analysis. */
export function Playground({ s }: { s: SimState }) {
  const m = s.model;
  const key = JSON.stringify(m);
  const [run, setRun] = useState<{ key: string; state: Gacha.ModelState; rng: ReturnType<Rng["snapshot"]>; log: Log[] } | null>(null);
  const fresh = run && run.key === key ? run : null;
  const state = fresh?.state ?? Gacha.newState(m);
  const valid = useMemo(() => !Gacha.validateModel(m).some((i) => i.level === "error"), [m]);
  const name = (id: string) => displayText(m.items.find((x) => x.id === id)?.name ?? id);
  const tierRank = (id: string) => m.tiers.findIndex((t) => t.id === id);
  const ex = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "exchange" }> => x.kind === "exchange");

  const doPull = (n: number) => {
    const st: Gacha.ModelState = structuredClone(state);
    const rng = fresh ? Rng.fromState(fresh.rng) : new Rng(Date.now() >>> 0, "gacha-sim.play");
    const log = [...(fresh?.log ?? [])];
    for (let i = 0; i < n; i++) log.push({ outcome: Gacha.pull(m, st, rng), n: st.pulls });
    setRun({ key, state: st, rng: rng.snapshot(), log });
  };
  const doExchange = (itemId: string) => {
    const st: Gacha.ModelState = structuredClone(state);
    if (!Gacha.exchange(m, st, itemId) || !fresh) return;
    // The tier whose rate-up or regular pool holds the item (for display).
    const feat = m.modules.find((x) => x.kind === "featured" && x.items.includes(itemId));
    const tierId = feat && feat.kind === "featured" ? feat.tier : m.tiers.find((t) => t.items.includes(itemId))?.id ?? m.tiers[0]!.id;
    setRun({ ...fresh, state: st, log: [...fresh.log, { outcome: { tierId, itemId, featured: !!feat, forced: false }, n: st.pulls, exchanged: true }] });
  };
  const log = fresh?.log ?? [];
  const recent = log.slice(-m.pull.batchSize).reverse();
  const tops = log.filter((l) => tierRank(l.outcome.tierId) === 0);
  const spent = Gacha.currencyFor(m, state.pulls);
  const tierName = (id: string) => displayText(m.tiers.find((t) => t.id === id)?.name ?? id);

  return (
    <Card title={tr("playground1")} actions={<>
      <button className="btn" disabled={!valid} onClick={() => doPull(1)}>{tr("gachaStage33")}</button>
      <button className="btn primary" disabled={!valid} onClick={() => doPull(m.pull.batchSize)}>{m.pull.batchSize}{tr("playground2")}</button>
      <button className="btn ghost" disabled={!fresh} onClick={() => setRun(null)}>{tr("playground3")}</button>
    </>}>
      <div className="counters">
        <span>{tr("gachaStage19")}<b>{state.pulls}</b>{tr("playground4")}{fmt(spent, 0)} {displayText(m.pull.currency)}{tr("gachaStage30")}</span>
        {Gacha.stateVars(m).filter((v) => v !== "batch").map((v) => {
          const [kind, id] = v.split(":") as [string, string];
          const label = kind === "since" ? tr("playground5", tierName(id)) : kind === "guar" ? tr("playground6", tierName(id)) : kind === "miss" ? tr("playground7", tierName(id)) : kind === "fate" ? tr("playground8", tierName(id)) : tr("playground9");
          const val = state.vars[v] ?? 0;
          return <span key={v}>{label} <b>{kind === "guar" ? (val ? tr("gachaStage23") : tr("gachaStage24")) : val}</b></span>;
        })}
      </div>
      {ex && (state.vars.pts ?? 0) >= ex.cost && (
        <div className="exchange">{tr("playground10")}{ex.cost}{tr("playground11")}{ex.items.map((id) => <button key={id} className="btn small" onClick={() => doExchange(id)}>{tr("gachaStage32")}{name(id)}</button>)}</div>
      )}
      {recent.length === 0 ? <p className="hint">{tr("playground12")}</p> : (
        <div className="pulls">
          {recent.map((l, i) => (
            <div key={log.length - i} className={`pull r${Math.min(tierRank(l.outcome.tierId), 3)} ${l.outcome.featured ? "feat" : ""}`}>
              <small>#{l.n}{l.exchanged ? tr("playground13") : l.outcome.forced ? tr("playground14") : ""}</small>
              <b>{tierName(l.outcome.tierId)}</b>
              <span>{name(l.outcome.itemId)}</span>
            </div>
          ))}
        </div>
      )}
      {tops.length > 0 && (
        <p className="hint">{tr("playground15")}{tops.length}{tr("playground16")}{tops.filter((l) => l.outcome.featured).length}{tr("playground17")}{tops.slice(-8).map((l) => l.n).join(tr("gachaStage17"))}{tr("gachaStage21")}{tops.length > 8 ? "…" : ""}{tr("panels45")}</p>
      )}
    </Card>
  );
}
