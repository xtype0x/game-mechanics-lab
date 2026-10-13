import { tr, displayText } from "./i18n";
import { Gacha, Rng, type RngState } from "@gml/core";
import { useEffect, useMemo, useState } from "react";
import { Reveal, type RevealCard } from "./Reveal";
import { gameOf, pityKey } from "./catalog/games";
import { fmt, twd } from "./ui";
import type { SimState } from "./state";

interface Entry { tierId: string; itemId: string; featured: boolean; forced: boolean; n: number; pity: number; exchanged?: boolean }
interface Run { state: Gacha.ModelState; rng: RngState; log: Entry[] }

const RUNS_KEY = "ggt.gacha-sim.pulls.v1";
const loadRuns = (): Record<string, Run> => { try { return JSON.parse(localStorage.getItem(RUNS_KEY) ?? "{}") as Record<string, Run>; } catch { return {}; } };
const saveRuns = (r: Record<string, Run>) => { try { localStorage.setItem(RUNS_KEY, JSON.stringify(r)); } catch { /* ignore */ } };
const FAST_KEY = "ggt.gacha-sim.fast";
const loadFast = () => { try { return localStorage.getItem(FAST_KEY) === "1"; } catch { return false; } };

/** Ensure the saved counters match the model's counters (rules may have changed). */
function fit(m: Gacha.GachaModel, st: Gacha.ModelState): Gacha.ModelState {
  return { vars: Object.fromEntries(Gacha.stateVars(m).map((v) => [v, st.vars[v] ?? 0])), pulls: st.pulls };
}

export function GachaStage({ s, onAnalyze, onTarget }: { s: SimState; onAnalyze: () => void; onTarget: (item: string) => void }) {
  const m = s.model;
  const key = pityKey(m);
  const [runs, setRuns] = useState<Record<string, Run>>(loadRuns);
  const [reveal, setReveal] = useState<Entry[] | null>(null);
  const [fast, setFast] = useState(loadFast);
  useEffect(() => saveRuns(runs), [runs]);
  useEffect(() => { try { localStorage.setItem(FAST_KEY, fast ? "1" : "0"); } catch { /* ignore */ } }, [fast]);
  const valid = useMemo(() => !Gacha.validateModel(m).some((i) => i.level === "error"), [m]);
  const run: Run = runs[key] ? { ...runs[key]!, state: fit(m, runs[key]!.state) } : { state: Gacha.newState(m), rng: new Rng(Date.now() >>> 0, "gacha-sim.stage").snapshot(), log: [] };
  const st = run.state;
  const top = m.tiers[0]!;
  const name = (id: string) => displayText(m.items.find((x) => x.id === id)?.name ?? (id.startsWith("f5:") ? m.items.find(x => x.id === "f5:any")?.name : id.startsWith("f4:") ? m.items.find(x => x.id === "f4:any")?.name : undefined) ?? id);
  const tierIdx = (id: string) => m.tiers.findIndex((t) => t.id === id);
  const feat = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "featured" }> => x.kind === "featured" && x.tier === top.id);
  const feat4 = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "featured" }> => x.kind === "featured" && x.tier === m.tiers[1]?.id);
  const hard = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "hardPity" }> => x.kind === "hardPity" && x.tier === top.id);
  const epi = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "epitomized" }> => x.kind === "epitomized" && x.tier === top.id);
  const ex = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "exchange" }> => x.kind === "exchange");
  const mile = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "milestone" }> => x.kind === "milestone" && x.tier === top.id);
  const cat = s.catalog ? gameOf(s.catalog.game) : undefined;
  const poolName = cat ? `${cat.name}・${cat.types.find((t) => t.kind === s.catalog!.kind && (t.region === undefined || t.region === s.catalog!.region))?.name ?? ""}` : m.name;

  const doPull = (n: number) => {
    const state = structuredClone(st);
    const rng = Rng.fromState(run.rng);
    const out: Entry[] = [];
    for (let i = 0; i < n; i++) {
      const pity = (state.vars[`since:${top.id}`] ?? state.pulls) + 1;
      const o = Gacha.pull(m, state, rng);
      out.push({ ...o, n: state.pulls, pity });
    }
    setRuns((r) => ({ ...r, [key]: { state, rng: rng.snapshot(), log: [...run.log, ...out].slice(-500) } }));
    setReveal(out);
  };
  const doExchange = (itemId: string) => {
    const state = structuredClone(st);
    if (!Gacha.exchange(m, state, itemId)) return;
    const e: Entry = { tierId: top.id, itemId, featured: true, forced: false, n: state.pulls, pity: 0, exchanged: true };
    setRuns((r) => ({ ...r, [key]: { ...run, state, log: [...run.log, e].slice(-500) } }));
    setReveal([e]);
  };
  const reset = () => setRuns((r) => { const x = { ...r }; delete x[key]; return x; });

  const hits = run.log.filter((e) => tierIdx(e.tierId) === 0);
  const spent = Gacha.currencyFor(m, st.pulls);
  const money = useMemo(() => { try { const t = Gacha.topUpTable(s.packs, spent); return Gacha.priceFor(m, t, st.pulls); } catch { return NaN; } }, [s.packs, spent, m, st.pulls]);
  const chips = [
    `${displayText(top.name)} ${+(top.rate * 100).toFixed(2)}%`,
    hard ? tr("gachaStage1", hard.at) : "",
    feat ? tr("gachaStage2", Math.round(feat.share * 100)) : "",
    m.modules.some((x) => x.kind === "guarantee" && x.tier === top.id) ? tr("gachaStage3") : "",
    epi ? tr("gachaStage4", epi.points) : "",
    m.modules.some((x) => x.kind === "batchFloor") ? tr("gachaStage5") : "",
    mile ? tr("gachaStage6", mile.steps.map((x) => tr("gachaStage7", x.at, x.featuredShare >= 1 ? tr("gachaStage8") : tr("gachaStage9"))).join(tr("gachaStage10"))) : "",
    ex ? tr("gachaStage11", ex.cost) : "",
  ].filter(Boolean);

  return (
    <section className={`stage game-${s.catalog?.game ?? "custom"}`} aria-label={tr("gachaStage12")}>
      <div className="banner">
        <div className="banner-head">
          <span className="banner-kind">{displayText(poolName)}{s.presetId ? "" : tr("app13")}</span>
        </div>
        <div className="banner-main">
          {feat ? (
            <>
              <small>{epi ? tr("gachaStage13") : tr("gachaStage14")}</small>
              <h2 className="featured">{feat.items.map(name).join("・")}</h2>
            </>
          ) : <h2 className="featured">{displayText(top.name)}{tr("gachaStage15")}</h2>}
          {feat4 && <p className="featured4">{tr("gachaStage16")}{feat4.items.map(name).join(tr("gachaStage17"))}</p>}
          <div className="rule-chips">{chips.map((c) => <span key={c}>{c}</span>)}</div>
          {epi && feat && feat.items.length > 1 && (
            <label className="epi">{tr("gachaStage18")}<select value={epi.item} onChange={(e) => onTarget(e.target.value)}>
                {feat.items.map((id) => <option key={id} value={id}>{name(id)}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="counters">
          <span>{tr("gachaStage19")}<b>{st.pulls}</b></span>
          {hard && <span>{tr("gachaStage20")}<b>{Math.max(0, hard.at - (st.vars[`since:${top.id}`] ?? 0))}</b>{tr("gachaStage21")}</span>}
          {`guar:${top.id}` in st.vars && <span>{tr("gachaStage22")}<b>{st.vars[`guar:${top.id}`] ? tr("gachaStage23") : tr("gachaStage24")}</b></span>}
          {epi && <span>{tr("gachaStage25")}<b>{st.vars[`fate:${top.id}`] ?? 0}/{epi.points}</b></span>}
          {mile && <span>{tr("gachaStage26")}<b>{st.vars[`miss:${top.id}`] ?? 0}</b>{tr("gachaStage21")}</span>}
          {ex && <span>{tr("gachaStage27")}<b>{st.vars.pts ?? 0}/{ex.cost}</b></span>}
          <span>{tr("gachaStage28")}<b>{fmt(spent, 0)}</b> {displayText(m.pull.currency)}{cat?.twd !== false && Number.isFinite(money) && money > 0 ? <>{tr("gachaStage29")}{twd(money)}{tr("gachaStage30")}</> : null}</span>
        </div>
        {ex && (st.vars.pts ?? 0) >= ex.cost && (
          <div className="exchange">{tr("gachaStage31")}{ex.items.map((id) => <button key={id} className="btn small" onClick={() => doExchange(id)}>{tr("gachaStage32")}{name(id)}</button>)}</div>
        )}
        <div className="pull-actions">
          <button className="pull-btn" disabled={!valid} onClick={() => doPull(1)}>{tr("gachaStage33")}<small>{fmt(m.pull.cost, 0)} {displayText(m.pull.currency)}</small></button>
          <button className="pull-btn ten" disabled={!valid} onClick={() => doPull(m.pull.batchSize)}>{tr("gachaStage34")}{m.pull.batchSize}{tr("gachaStage35")}<small>{fmt(m.pull.batchCost ?? m.pull.cost * m.pull.batchSize, 0)} {displayText(m.pull.currency)}</small></button>
        </div>
        <div className="stage-links">
          <button className="link" onClick={onAnalyze}>{tr("gachaStage36")}</button>
          <span className="stage-opts">
            <label className="fast"><input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} />{tr("gachaStage37")}</label>
            {run.log.length > 0 && <button className="link" onClick={reset}>{tr("gachaStage38")}</button>}
          </span>
        </div>
      </div>

      {hits.length > 0 && (
        <div className="history">
          <b>{displayText(top.name)}{tr("gachaStage39")}</b>
          <ol>
            {hits.slice(-12).reverse().map((e, i) => (
              <li key={i} className={e.featured ? "feat" : ""}>{name(e.itemId)}<span>{e.exchanged ? tr("gachaStage40") : tr("gachaStage41", e.pity)}</span></li>
            ))}
          </ol>
          <p className="hint">{tr("gachaStage42")}{hits.length}{tr("gachaStage43")}{hits.filter((e) => e.featured).length}{tr("gachaStage44")}{fmt(st.pulls / Math.max(1, hits.filter((e) => !e.exchanged).length), 1)}{tr("gachaStage45")}</p>
        </div>
      )}

      {reveal && (
        <Reveal
          instant={fast || reveal.every((e) => e.exchanged)}
          onClose={() => setReveal(null)}
          cards={reveal.map((e, i): RevealCard => ({
            key: `${i}`,
            name: name(e.itemId),
            tierName: displayText(m.tiers[tierIdx(e.tierId)]?.name ?? ""),
            rank: Math.min(tierIdx(e.tierId), 2) as 0 | 1 | 2,
            tag: e.exchanged ? tr("gachaStage40") : e.featured ? tr("gachaStage14") : e.forced ? tr("gachaStage9") : "",
            featured: e.featured,
          }))}
        />
      )}
    </section>
  );
}
