import { Gacha, Rng, type RngState } from "@ggt/core";
import { useEffect, useMemo, useState } from "react";
import { bannerStatus } from "./GameMenu";
import { Reveal, type RevealCard } from "./Reveal";
import type { LiveData } from "./catalog/live";
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

export function GachaStage({ s, live, onAnalyze, onTarget }: { s: SimState; live: LiveData; onAnalyze: () => void; onTarget: (item: string) => void }) {
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
  const name = (id: string) => m.items.find((x) => x.id === id)?.name ?? id;
  const tierIdx = (id: string) => m.tiers.findIndex((t) => t.id === id);
  const feat = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "featured" }> => x.kind === "featured" && x.tier === top.id);
  const feat4 = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "featured" }> => x.kind === "featured" && x.tier === m.tiers[1]?.id);
  const hard = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "hardPity" }> => x.kind === "hardPity" && x.tier === top.id);
  const epi = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "epitomized" }> => x.kind === "epitomized" && x.tier === top.id);
  const ex = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "exchange" }> => x.kind === "exchange");
  const mile = m.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "milestone" }> => x.kind === "milestone" && x.tier === top.id);
  const banner = s.catalog?.bannerId ? live.banners.find((b) => b.id === s.catalog!.bannerId) : undefined;
  const status = banner ? bannerStatus(banner) : null;
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
    `${top.name} ${+(top.rate * 100).toFixed(2)}%`,
    hard ? `${hard.at} 抽保底` : "",
    feat ? `${Math.round(feat.share * 100)}% 限定` : "",
    m.modules.some((x) => x.kind === "guarantee" && x.tier === top.id) ? "歪了必中" : "",
    epi ? `定軌 ${epi.points} 點` : "",
    m.modules.some((x) => x.kind === "batchFloor") ? "十連保底" : "",
    mile ? `累計 ${mile.steps.map((x) => `${x.at} 抽${x.featuredShare >= 1 ? "必得限定" : "保底"}`).join("／")}` : "",
    ex ? `${ex.cost} 點兌換` : "",
  ].filter(Boolean);

  return (
    <section className={`stage game-${s.catalog?.game ?? "custom"}`} aria-label="抽卡">
      <div className="banner">
        <div className="banner-head">
          <span className="banner-kind">{poolName}{s.presetId ? "" : "（已修改）"}</span>
          {status && <span className={`chip-${status.tone}`}>{status.label}</span>}
        </div>
        <div className="banner-main">
          {feat ? (
            <>
              <small>{epi ? "限定（可定軌）" : "限定"}</small>
              <h2 className="featured">{feat.items.map(name).join("・")}</h2>
            </>
          ) : <h2 className="featured">{top.name} 常駐</h2>}
          {feat4 && <p className="featured4">UP：{feat4.items.map(name).join("、")}</p>}
          <div className="rule-chips">{chips.map((c) => <span key={c}>{c}</span>)}</div>
          {epi && feat && feat.items.length > 1 && (
            <label className="epi">定軌：
              <select value={epi.item} onChange={(e) => onTarget(e.target.value)}>
                {feat.items.map((id) => <option key={id} value={id}>{name(id)}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="counters">
          <span>已抽 <b>{st.pulls}</b></span>
          {hard && <span>距保底 <b>{Math.max(0, hard.at - (st.vars[`since:${top.id}`] ?? 0))}</b> 抽</span>}
          {`guar:${top.id}` in st.vars && <span>大保底 <b>{st.vars[`guar:${top.id}`] ? "是" : "否"}</b></span>}
          {epi && <span>定軌點數 <b>{st.vars[`fate:${top.id}`] ?? 0}/{epi.points}</b></span>}
          {mile && <span>未出限定 <b>{st.vars[`miss:${top.id}`] ?? 0}</b> 抽</span>}
          {ex && <span>點數 <b>{st.vars.pts ?? 0}/{ex.cost}</b></span>}
          <span>花費 <b>{fmt(spent, 0)}</b> {m.pull.currency}{cat?.twd !== false && Number.isFinite(money) && money > 0 ? <>（約 {twd(money)}）</> : null}</span>
        </div>
        {ex && (st.vars.pts ?? 0) >= ex.cost && (
          <div className="exchange">點數已滿：{ex.items.map((id) => <button key={id} className="btn small" onClick={() => doExchange(id)}>兌換 {name(id)}</button>)}</div>
        )}
        <div className="pull-actions">
          <button className="pull-btn" disabled={!valid} onClick={() => doPull(1)}>抽 1 次<small>{fmt(m.pull.cost, 0)} {m.pull.currency}</small></button>
          <button className="pull-btn ten" disabled={!valid} onClick={() => doPull(m.pull.batchSize)}>抽 {m.pull.batchSize} 次<small>{fmt(m.pull.batchCost ?? m.pull.cost * m.pull.batchSize, 0)} {m.pull.currency}</small></button>
        </div>
        <div className="stage-links">
          <button className="link" onClick={onAnalyze}>📊 這個卡池平均要抽幾抽？</button>
          <span className="stage-opts">
            <label className="fast"><input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} /> 略過動畫</label>
            {run.log.length > 0 && <button className="link" onClick={reset}>重置進度</button>}
          </span>
        </div>
      </div>

      {hits.length > 0 && (
        <div className="history">
          <b>{top.name} 紀錄</b>
          <ol>
            {hits.slice(-12).reverse().map((e, i) => (
              <li key={i} className={e.featured ? "feat" : ""}>{name(e.itemId)}<span>{e.exchanged ? "兌換" : `第 ${e.pity} 抽`}</span></li>
            ))}
          </ol>
          <p className="hint">共 {hits.length} 次，限定 {hits.filter((e) => e.featured).length} 次；平均每 {fmt(st.pulls / Math.max(1, hits.filter((e) => !e.exchanged).length), 1)} 抽一次。</p>
        </div>
      )}

      {reveal && (
        <Reveal
          instant={fast || reveal.every((e) => e.exchanged)}
          onClose={() => setReveal(null)}
          cards={reveal.map((e, i): RevealCard => ({
            key: `${i}`,
            name: name(e.itemId),
            tierName: m.tiers[tierIdx(e.tierId)]?.name ?? "",
            rank: Math.min(tierIdx(e.tierId), 2) as 0 | 1 | 2,
            tag: e.exchanged ? "兌換" : e.featured ? "限定" : e.forced ? "保底" : "",
            featured: e.featured,
          }))}
        />
      )}
    </section>
  );
}
