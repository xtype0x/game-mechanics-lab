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
  const name = (id: string) => m.items.find((x) => x.id === id)?.name ?? id;
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
  const tierName = (id: string) => m.tiers.find((t) => t.id === id)?.name ?? id;

  return (
    <Card title="試抽" actions={<>
      <button className="btn" disabled={!valid} onClick={() => doPull(1)}>抽 1 次</button>
      <button className="btn primary" disabled={!valid} onClick={() => doPull(m.pull.batchSize)}>{m.pull.batchSize} 連抽</button>
      <button className="btn ghost" disabled={!fresh} onClick={() => setRun(null)}>重來</button>
    </>}>
      <div className="counters">
        <span>已抽 <b>{state.pulls}</b> 抽（{fmt(spent, 0)} {m.pull.currency}）</span>
        {Gacha.stateVars(m).filter((v) => v !== "batch").map((v) => {
          const [kind, id] = v.split(":") as [string, string];
          const label = kind === "since" ? `${tierName(id)} 保底` : kind === "guar" ? `${tierName(id)} 大保底` : kind === "miss" ? `${tierName(id)} 累計` : kind === "fate" ? `${tierName(id)} 定軌` : "點數";
          const val = state.vars[v] ?? 0;
          return <span key={v}>{label} <b>{kind === "guar" ? (val ? "是" : "否") : val}</b></span>;
        })}
      </div>
      {ex && (state.vars.pts ?? 0) >= ex.cost && (
        <div className="exchange">點數已達 {ex.cost}：{ex.items.map((id) => <button key={id} className="btn small" onClick={() => doExchange(id)}>兌換 {name(id)}</button>)}</div>
      )}
      {recent.length === 0 ? <p className="hint">按「抽」開始。這裡用和計算相同的規則實際抽卡，方便直覺感受保底怎麼運作。</p> : (
        <div className="pulls">
          {recent.map((l, i) => (
            <div key={log.length - i} className={`pull r${Math.min(tierRank(l.outcome.tierId), 3)} ${l.outcome.featured ? "feat" : ""}`}>
              <small>#{l.n}{l.exchanged ? " 兌換" : l.outcome.forced ? " 保底" : ""}</small>
              <b>{tierName(l.outcome.tierId)}</b>
              <span>{name(l.outcome.itemId)}</span>
            </div>
          ))}
        </div>
      )}
      {tops.length > 0 && (
        <p className="hint">最高稀有度出現 {tops.length} 次，其中限定 {tops.filter((l) => l.outcome.featured).length} 次；出現在第 {tops.slice(-8).map((l) => l.n).join("、")} 抽{tops.length > 8 ? "…" : ""}。</p>
      )}
    </Card>
  );
}
