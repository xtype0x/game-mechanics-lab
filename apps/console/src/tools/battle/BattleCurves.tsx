import { autoPlay, batchSeed, createBattle, type BattleSetup, type BattleState, type Project } from "@gml/core";
import { useMemo, useState } from "react";
import type { Updater } from "../../useProject";
import { ErrorBox, Section, fmt } from "../../ui";
import { EncounterBar, SeedField, StepChart, eventsWithTime, useBattleSetup, type Series } from "./common";

type Mode = "energy" | "toughness";

const SAMPLE_RUNS = 30;

export function EnergyCurves(props: { project: Project; update: Updater }) {
  return <BattleCurves {...props} mode="energy" />;
}

export function BreakCurves(props: { project: Project; update: Updater }) {
  return <BattleCurves {...props} mode="toughness" />;
}

function BattleCurves({ project, update, mode }: { project: Project; update: Updater; mode: Mode }) {
  const { setup, error } = useBattleSetup(project);
  const run = useMemo(() => {
    if (!setup) return null;
    try { return { state: autoPlay(setup, createBattle(setup, project.seed), project.battle.policy) }; }
    catch (e) { return { error: (e as Error).message }; }
  }, [setup, project.seed, project.battle.policy]);
  const [sample, setSample] = useState<{ key: unknown; rows: SampleRow[] } | null>(null);
  const sampleFresh = sample && sample.key === setup ? sample.rows : null;

  return (
    <div className="tool-layout">
      <div className="workspace">
        <Section title="戰鬥設定">
          <EncounterBar project={project} update={update} />
          <div className="row-gap">
            <SeedField project={project} update={update} />
            <button className="btn small" onClick={() => update((p) => { p.seed = typeof p.seed === "number" ? p.seed + 1 : `${p.seed}+`; })}>換一個種子</button>
          </div>
          <p className="muted small">以「{policyLabel(project)}」自動打完一場，觀察{mode === "energy" ? "我方能量累積與大招時機" : "敵人韌性被削減與擊破的節奏"}。</p>
        </Section>
        {error && <ErrorBox error={error} />}
        {run && "state" in run && <Summary state={run.state!} setup={setup!} mode={mode} />}
        <Section title={`多場統計（${SAMPLE_RUNS} 場）`} actions={<button className="btn small" disabled={!setup} onClick={() => setup && setSample({ key: setup, rows: sampleRuns(setup, project, mode) })}>計算</button>}>
          {sampleFresh ? <SampleTable rows={sampleFresh} mode={mode} /> : <p className="muted small">單場結果受暴擊、控制命中等隨機影響。按「計算」以不同種子跑 {SAMPLE_RUNS} 場取平均。</p>}
        </Section>
      </div>
      <div className="results">
        <div className="results-head"><h2>{mode === "energy" ? "能量曲線" : "韌性與擊破"}</h2></div>
        {run && "error" in run && <ErrorBox error={run.error} />}
        {run && "state" in run && <Chart state={run.state!} setup={setup!} mode={mode} />}
      </div>
    </div>
  );
}

function policyLabel(p: Project) {
  const pol = p.battle.policy;
  return `大招${pol.ult === "asap" ? "充滿就放" : "不放"}、戰技${pol.skill === "whenSp" ? "有技能點就用" : pol.skill === "always" ? "總是使用" : "不用"}`;
}

function seriesFor(state: BattleState, setup: BattleSetup, mode: Mode): Series[] {
  const team = mode === "energy" ? "ally" : "enemy";
  const timed = eventsWithTime(state.events);
  return state.units.filter((u) => u.team === team && (mode === "energy" ? u.maxEnergy > 0 : u.maxToughness > 0)).map((u) => {
    const def = setup.units.find((d) => d.id === u.defId)!;
    const start = mode === "energy" ? (def.stats.startEnergy ?? 0) : u.maxToughness;
    const points = [{ x: 0, y: start }];
    const markers: number[] = [];
    for (const { e, time } of timed) {
      if (mode === "energy") {
        if (e.t === "energy" && e.uid === u.uid) points.push({ x: time, y: e.after });
        if (e.t === "action" && e.uid === u.uid && e.skillType === "ultimate") markers.push(time);
      } else {
        if (e.t === "toughness" && e.dst === u.uid) points.push({ x: time, y: e.after });
        if (e.t === "recover" && e.uid === u.uid) points.push({ x: time, y: u.maxToughness });
        if (e.t === "break" && e.dst === u.uid) markers.push(time);
        if (e.t === "death" && e.uid === u.uid) points.push({ x: time, y: 0 });
      }
    }
    return { name: u.name + (team === "enemy" ? `（${u.uid}）` : ""), points, markers };
  });
}

function Chart({ state, setup, mode }: { state: BattleState; setup: BattleSetup; mode: Mode }) {
  const series = seriesFor(state, setup, mode);
  const yMax = Math.max(1, ...state.units.filter((u) => u.team === (mode === "energy" ? "ally" : "enemy")).map((u) => (mode === "energy" ? u.maxEnergy : u.maxToughness)));
  const bands: { x: number; label: string }[] = [];
  for (let c = 1, x = setup.rules.firstCycleAv; x < state.time; c++, x += setup.rules.cycleAv) bands.push({ x, label: `${c}` });
  return (
    <>
      <Section title={mode === "energy" ? "能量（圓點＝施放大招）" : "韌性（圓點＝擊破）"}>
        <StepChart series={series} yMax={yMax} xMax={Math.max(state.time, 1)} xLabel="行動值" yLabel={mode === "energy" ? "能量" : "韌性"} height={240} bands={bands} />
        <p className="muted small">橫軸為經過的行動值，虛線為各輪結束點。戰鬥結果：{{ win: "勝利", lose: "失敗", timeout: "超時" }[state.result!]}，共 {state.cycle} 輪。</p>
      </Section>
    </>
  );
}

function Summary({ state, setup, mode }: { state: BattleState; setup: BattleSetup; mode: Mode }) {
  const timed = eventsWithTime(state.events);
  if (mode === "energy") {
    const rows = state.units.filter((u) => u.team === "ally").map((u) => {
      const ults = timed.filter(({ e }) => e.t === "action" && e.uid === u.uid && e.skillType === "ultimate");
      const ultSkill = setup.units.find((d) => d.id === u.defId)?.skills.find((s) => s.type === "ultimate");
      return { u, count: ults.length, first: ults[0]?.time, cost: ultSkill?.energyCost ?? u.maxEnergy };
    });
    return (
      <Section title="本場大招">
        <table className="table">
          <thead><tr><th>角色</th><th className="r">大招消耗</th><th className="r">施放次數</th><th className="r">首次施放（行動值）</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.u.uid}><td>{r.u.name}</td><td className="r mono">{r.cost}</td><td className="r mono">{r.count}</td><td className="r mono">{r.first !== undefined ? fmt(r.first, 1) : "—"}</td></tr>)}</tbody>
        </table>
      </Section>
    );
  }
  const rows = state.units.filter((u) => u.team === "enemy").map((u) => {
    const breaks = timed.filter(({ e }) => e.t === "break" && e.dst === u.uid);
    const brkDmg = state.events.reduce((a, e) => a + (e.t === "damage" && e.dst === u.uid && e.kind === "break" ? e.amount : 0), 0);
    return { u, count: breaks.length, first: breaks[0]?.time, brkDmg };
  });
  return (
    <Section title="本場擊破">
      <table className="table">
        <thead><tr><th>敵人</th><th className="r">韌性</th><th className="r">擊破次數</th><th className="r">首次擊破</th><th className="r">擊破傷害</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.u.uid}><td>{r.u.name}（{r.u.uid}）</td><td className="r mono">{r.u.maxToughness}</td><td className="r mono">{r.count}</td><td className="r mono">{r.first !== undefined ? fmt(r.first, 1) : "—"}</td><td className="r mono">{fmt(r.brkDmg, 0)}</td></tr>)}</tbody>
      </table>
    </Section>
  );
}

interface SampleRow { name: string; a: number; b: number | null; c: number }

function sampleRuns(setup: BattleSetup, project: Project, mode: Mode): SampleRow[] {
  const acc = new Map<string, { name: string; a: number; firsts: number[]; c: number }>();
  for (let i = 0; i < SAMPLE_RUNS; i++) {
    const s = autoPlay(setup, createBattle(setup, batchSeed(project.seed, i)), project.battle.policy);
    const timed = eventsWithTime(s.events);
    for (const u of s.units.filter((x) => x.team === (mode === "energy" ? "ally" : "enemy"))) {
      const key = u.uid;
      const row = acc.get(key) ?? { name: `${u.name}${mode === "toughness" ? `（${u.uid}）` : ""}`, a: 0, firsts: [], c: 0 };
      const hits = timed.filter(({ e }) => (mode === "energy" ? e.t === "action" && e.uid === u.uid && e.skillType === "ultimate" : e.t === "break" && e.dst === u.uid));
      row.a += hits.length;
      if (hits[0]) row.firsts.push(hits[0].time);
      row.c += mode === "energy" ? (s.result === "win" ? 1 : 0) : s.events.reduce((x, e) => x + (e.t === "damage" && e.dst === u.uid && e.kind === "break" ? e.amount : 0), 0);
      acc.set(key, row);
    }
  }
  return [...acc.values()].map((r) => ({ name: r.name, a: r.a / SAMPLE_RUNS, b: r.firsts.length ? r.firsts.reduce((x, y) => x + y, 0) / r.firsts.length : null, c: r.c / SAMPLE_RUNS }));
}

function SampleTable({ rows, mode }: { rows: SampleRow[]; mode: Mode }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>{mode === "energy" ? "角色" : "敵人"}</th>
          <th className="r">{mode === "energy" ? "平均大招次數" : "平均擊破次數"}</th>
          <th className="r">{mode === "energy" ? "平均首次大招" : "平均首次擊破"}</th>
          {mode === "toughness" && <th className="r">平均擊破傷害</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td>{r.name}</td>
            <td className="r mono">{fmt(r.a, 2)}</td>
            <td className="r mono">{r.b !== null ? fmt(r.b, 1) : "—"}</td>
            {mode === "toughness" && <td className="r mono">{fmt(r.c, 0)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
