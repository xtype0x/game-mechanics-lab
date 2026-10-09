import {
  createBattle,
  legalActions,
  policyAction,
  submitAction,
  unitStat,
  type Action,
  type BattleSetup,
  type BattleState,
  type Project,
  type UnitState,
} from "@ggt/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Updater } from "../../useProject";
import { ErrorBox, Section, fmt } from "../../ui";
import { EncounterBar, SeedField, describeEvent, elementLabel, useBattleSetup } from "./common";
import { openReplay } from "../../demo/link";

export function BattleStepper({ project, update }: { project: Project; update: Updater }) {
  const { setup, error } = useBattleSetup(project);
  return (
    <div className="tool-layout battle-layout">
      <div className="workspace">
        <Section title="戰鬥設定">
          <EncounterBar project={project} update={update} />
          <SeedField project={project} update={update} />
        </Section>
        {error && <ErrorBox error={`無法建立戰鬥：${error}`} />}
      </div>
      <div className="results wide">
        {setup && <Stepper key={JSON.stringify([setup.encounter, project.seed])} setup={setup} seed={project.seed} project={project} />}
      </div>
    </div>
  );
}

function Stepper({ setup, seed, project }: { setup: BattleSetup; seed: number | string; project: Project }) {
  const [history, setHistory] = useState<BattleState[]>(() => { try { return [createBattle(setup, seed)]; } catch { return []; } });
  const [err, setErr] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [target, setTarget] = useState<string | undefined>(undefined);
  const setupRef = useRef(setup);

  // Rules or roster edited elsewhere: restart so the battle never mixes two setups.
  useEffect(() => {
    if (setupRef.current === setup) return;
    setupRef.current = setup;
    try { setHistory([createBattle(setup, seed)]); setErr(null); } catch (e) { setErr((e as Error).message); }
  }, [setup, seed]);

  const state = history.at(-1);
  const prev = history.at(-2);
  const legal = useMemo(() => (state ? legalActions(setup, state) : []), [setup, state]);
  if (!state) return <ErrorBox error={err ?? "無法建立戰鬥"} />;

  const push = (fn: (s: BattleState) => BattleState) => {
    try { setHistory((h) => [...h, fn(h.at(-1)!)]); setErr(null); setTarget(undefined); } catch (e) { setErr((e as Error).message); }
  };
  const doAction = (a: Action) => push((s) => submitAction(setup, s, a));
  const autoStep = () => push((s) => submitAction(setup, s, policyAction(setup, s, project.battle.policy)));
  const autoToEnd = () => {
    try {
      const out: BattleState[] = [];
      let s = state;
      for (let i = 0; i < 2000 && s.phase === "await"; i++) { s = submitAction(setup, s, policyAction(setup, s, project.battle.policy)); out.push(s); }
      setHistory((h) => [...h, ...out]);
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
  };

  const actor = state.decision ? state.units.find((u) => u.uid === state.decision!.actorUid) : undefined;
  const normal = legal.filter((l) => l.action.kind === "skill");
  const ults = legal.filter((l) => l.action.kind === "ult");
  const enemyTargets = state.units.filter((u) => u.alive && u.team === "enemy").sort((a, b) => a.slot - b.slot);
  const chosenTarget = target && state.units.find((u) => u.uid === target && u.alive) ? target : undefined;
  const newEvents = state.events.slice(prev ? prev.events.length : 0);
  const upcoming = state.units.filter((u) => u.alive).sort((a, b) => a.av - b.av || (a.team === b.team ? a.slot - b.slot : a.team === "ally" ? -1 : 1));

  const withTarget = (a: Action, targets: string[]): Action => {
    if (!targets.length) return a;
    const t = chosenTarget && targets.includes(chosenTarget) ? chosenTarget : policyAction(setup, state, { ...project.battle.policy, ult: a.kind === "ult" ? "asap" : "never" }).targetUid;
    return { ...a, targetUid: targets.includes(t ?? "") ? t : targets[0] };
  };

  return (
    <>
      <div className="battle-hud">
        <div className="hud-stats">
          <span>第 <b>{state.cycle}</b> 輪</span>
          <span>行動值 <b className="mono">{fmt(state.time, 1)}</b></span>
          <span>回合 <b>{state.turns}</b></span>
          <span className="sp">技能點 {Array.from({ length: setup.rules.spMax }, (_, i) => <i key={i} className={i < state.sp ? "on" : ""} />)}</span>
          {state.phase === "ended" && <span className={`result ${state.result}`}>{{ win: "勝利", lose: "失敗", timeout: "超時" }[state.result!]}</span>}
        </div>
        <div className="hud-controls">
          <button className="btn small" disabled={history.length < 2} onClick={() => setHistory((h) => h.slice(0, -1))}>↶ 上一步</button>
          <button className="btn small" disabled={state.phase !== "await"} onClick={autoStep}>自動一步</button>
          <button className="btn small" disabled={state.phase !== "await"} onClick={autoToEnd}>自動到結束</button>
          <button className="btn small" onClick={() => { setHistory([createBattle(setup, seed)]); setErr(null); }}>重新開始</button>
          <button className="btn small play-btn" title="用 DEMO 的戰鬥畫面，從頭播放到目前這一步" onClick={() => openReplay({ setup, final: state })}>▶ 在 DEMO 中重播</button>
        </div>
      </div>
      {err && <ErrorBox error={err} />}

      <div className="field-board">
        <UnitRow units={state.units.filter((u) => u.team === "enemy")} setup={setup} target={chosenTarget} onPick={(uid) => setTarget(uid)} />
        <UnitRow units={state.units.filter((u) => u.team === "ally")} setup={setup} actorUid={actor?.uid} />
      </div>

      {state.phase === "await" && actor && (
        <Section title={`輪到 ${actor.name} 行動`} className="action-panel">
          <div className="action-row">
            {normal.map((l) => (
              <button key={l.skill.id} className="btn primary" onClick={() => doAction(withTarget(l.action, l.targets))} title={l.skill.description}>
                {l.skill.name}<small>{l.skill.type === "basic" ? "普攻" : "戰技"}・技能點 {l.skill.spDelta > 0 ? "+" : ""}{l.skill.spDelta}</small>
              </button>
            ))}
            {ults.map((l) => (
              <button key={`${l.action.actorUid}-${l.skill.id}`} className="btn ult" onClick={() => doAction(withTarget(l.action, l.targets))}>
                ★ {state.units.find((u) => u.uid === l.action.actorUid)!.name}・{l.skill.name}<small>大招（不消耗回合）</small>
              </button>
            ))}
          </div>
          {enemyTargets.length > 1 && (
            <p className="muted small">目標：{chosenTarget ? state.units.find((u) => u.uid === chosenTarget)!.name : "自動（依策略）"}。點上方敵人卡片可指定。</p>
          )}
        </Section>
      )}

      <div className="battle-bottom">
        <Section title="接下來的行動">
          <ol className="order-list compact">
            {upcoming.map((u) => <li key={u.uid} className={u.team}>{u.name} <span className="mono muted">{fmt(u.av, 1)}</span></li>)}
          </ol>
        </Section>
        <Section title={`戰鬥紀錄（${state.events.length}）`} actions={<label className="check small"><input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} />顯示細節</label>}>
          <EventLog state={state} setup={setup} newFrom={prev ? prev.events.length : 0} details={details} />
          {newEvents.length === 0 && <p className="muted small">尚無新事件。</p>}
        </Section>
      </div>
    </>
  );
}

function UnitRow({ units, setup, actorUid, target, onPick }: { units: UnitState[]; setup: BattleSetup; actorUid?: string; target?: string; onPick?: (uid: string) => void }) {
  return (
    <div className="unit-row">
      {units.map((u) => (
        <button
          key={u.uid}
          className={`unit-card ${u.team} ${u.alive ? "" : "dead"} ${u.uid === actorUid ? "acting" : ""} ${u.uid === target ? "targeted" : ""} ${u.broken ? "broken" : ""}`}
          disabled={!onPick || !u.alive}
          onClick={() => onPick?.(u.uid)}
        >
          <div className="uc-head">
            <strong>{u.name}</strong>
            <span className={`el el-${u.element}`}>{elementLabel(u.element)}</span>
          </div>
          <Bar value={u.hp} max={u.maxHp} kind="hp" label={`${fmt(u.hp, 0)} / ${fmt(u.maxHp, 0)}`} />
          {u.maxToughness > 0 && <Bar value={u.toughness} max={u.maxToughness} kind="tough" label={u.broken ? "擊破中" : `韌性 ${fmt(u.toughness, 0)}`} />}
          {u.maxEnergy > 0 && <Bar value={u.energy} max={u.maxEnergy} kind="energy" label={`能量 ${fmt(u.energy, 0)}`} />}
          {(() => {
            const shield = u.statuses.reduce((a, s) => a + (s.shield ?? 0), 0);
            return shield > 0 ? <Bar value={shield} max={u.maxHp} kind="shield" label={`護盾 ${fmt(shield, 0)}`} /> : null;
          })()}
          {u.weaknesses.length > 0 && <div className="weak">弱點：{u.weaknesses.map(elementLabel).join(" ")}</div>}
          {(u.phase > 1 || Object.keys(u.counters).length > 0 || u.nextSkill || u.summonedBy) && (
            <div className="uc-extra small">
              {u.phase > 1 && <span className="tag">第 {u.phase} 階段</span>}
              {u.summonedBy && <span className="tag">召喚物</span>}
              {Object.entries(u.counters).map(([k, v]) => <span key={k} className="tag mono">{k} {fmt(v, 0)}</span>)}
              {u.nextSkill && <span className="tag warn">下次：{setup.units.find((d) => d.id === u.defId)?.skills.find((s) => s.id === u.nextSkill)?.name ?? u.nextSkill}</span>}
            </div>
          )}
          <div className="uc-status">
            {u.statuses.map((s) => {
              const def = setup.statuses.find((d) => d.id === s.statusId);
              return <span key={s.statusId} className={`st ${def?.kind}`} title={def?.description}>{def?.name ?? s.statusId}{s.stacks > 1 ? `×${s.stacks}` : ""}<small>{s.turnsLeft}</small></span>;
            })}
          </div>
          <div className="uc-foot muted small">速度 {fmt(unitStat(setup, u, "spd"), 1)}・行動值 {u.alive ? fmt(u.av, 1) : "—"}</div>
        </button>
      ))}
    </div>
  );
}

function Bar({ value, max, kind, label }: { value: number; max: number; kind: string; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  return (
    <div className={`bar-row ${kind}`} aria-label={label}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
      <span>{label}</span>
    </div>
  );
}

function EventLog({ state, setup, newFrom, details }: { state: BattleState; setup: BattleSetup; newFrom: number; details: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector(".new")?.scrollIntoView({ block: "nearest" }); }, [newFrom]);
  return (
    <div className="event-log" ref={ref}>
      {state.events.map((e, i) => {
        const d = describeEvent(e, state, setup.statuses, details, setup.units);
        if (!d) return null;
        return <div key={i} className={`ev ${d.tone ?? ""} ${i >= newFrom ? "new" : ""}`}>{d.text}</div>;
      })}
    </div>
  );
}
