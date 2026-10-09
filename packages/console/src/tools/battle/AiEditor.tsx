import { evalBool, objectScope, type AiRule, type Project, type UnitDef } from "@ggt/core";
import { useMemo, useState } from "react";
import type { Updater } from "../../useProject";
import { Field, NumberField, Section, pct } from "../../ui";
import { ExprField } from "../common";
import { IssueList, useBattleSetup } from "./common";
import { AI_VARS } from "./meta";

export function AiEditor({ project, update }: { project: Project; update: Updater }) {
  // Allies use AI rules only while charmed or as timeline events (rules §14.3, §14.4); list them after enemies.
  const enemies = [...project.battle.units.filter((u) => u.team === "enemy"), ...project.battle.units.filter((u) => u.team === "ally")];
  const [selected, setSelected] = useState(enemies[0]?.id ?? "");
  const unit = enemies.find((u) => u.id === selected);
  const { issues } = useBattleSetup(project);
  const edit = (fn: (u: UnitDef) => void) => update((p) => { const u = p.battle.units.find((x) => x.id === selected); if (u) fn(u); });
  const rules = unit?.ai ?? [];
  const usable = unit?.skills.filter((s) => s.type !== "followup" && s.type !== "ultimate") ?? [];

  return (
    <div className="tool-layout">
      <div className="workspace">
        <Section title="角色">
          <div className="chips">
            {enemies.map((u) => <button key={u.id} className={`chip-btn ${u.id === selected ? "on" : ""}`} onClick={() => setSelected(u.id)}>{u.team === "ally" ? `${u.name}（我方）` : u.name}</button>)}
          </div>
        </Section>
        {unit && (
          <Section
            title={`${unit.name} 的行動規則`}
            actions={<button className="btn small" disabled={!usable.length} onClick={() => edit((u) => { (u.ai ??= []).push({ skillId: usable[0]!.id, weight: 1 }); })}>＋ 新增規則</button>}
          >
            <p className="muted small">每次行動時，從「條件成立」的規則中依權重隨機選一個技能；沒有規則成立時使用第一個技能，目標從存活的對手中隨機選擇。</p>
            {unit.team === "ally" && <p className="muted small">我方角色平常由玩家或自動策略控制；只有被「支配」或設定為行動條事件時才使用這些規則。</p>}
            {rules.length === 0 && <p className="muted">沒有規則：永遠使用「{unit.skills[0]?.name}」。</p>}
            <div className="ai-list">
              {rules.map((r, i) => (
                <div key={i} className="ai-row">
                  <select aria-label="技能" value={r.skillId} onChange={(e) => edit((u) => { u.ai![i]!.skillId = e.target.value; })}>
                    {!usable.some((s) => s.id === r.skillId) && <option value={r.skillId}>（不可用）{r.skillId}</option>}
                    {usable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <label className="inline-field">權重<NumberField ariaLabel="權重" value={r.weight} min={0} onChange={(v) => edit((u) => { u.ai![i]!.weight = Math.max(0, v); })} /></label>
                  <ExprField ariaLabel="條件" allowEmpty value={r.when} placeholder="條件（選填），例如 self.hpPct < 0.5" onChange={(e) => edit((u) => { if (e) u.ai![i]!.when = e; else delete u.ai![i]!.when; })} />
                  <button className="btn icon" aria-label="刪除規則" onClick={() => edit((u) => { u.ai!.splice(i, 1); })}>✕</button>
                </div>
              ))}
            </div>
            <p className="muted small">可用變數：{AI_VARS}</p>
            <IssueList issues={issues.filter((x) => x.where.unitId === unit.id && x.where.field === "ai")} />
          </Section>
        )}
      </div>
      <div className="results">
        <div className="results-head"><h2>行為預覽</h2></div>
        {unit && <Preview unit={unit} rules={rules} />}
      </div>
    </div>
  );
}

function Preview({ unit, rules }: { unit: UnitDef; rules: AiRule[] }) {
  const [hpPct, setHpPct] = useState(1);
  const [turn, setTurn] = useState(1);
  const [broken, setBroken] = useState(false);
  const [foes, setFoes] = useState(4);

  const evalAt = (h: number, t: number) => {
    const known = objectScope({
      self: { hpPct: h, broken, energy: 0, toughnessPct: broken ? 0 : 1, phase: 1, shield: 0, av: 0, rank: 0 },
      battle: { turn: t, cycle: Math.max(1, Math.ceil(t / 4)), allies: 1, foes },
    });
    // Counters, statuses and unit counts are not part of this preview: they read as 0, like an unset counter in battle.
    const scope = (path: string) => known(path) ?? (/^(self\.(counter|status)|battle\.count)\./.test(path) ? 0 : undefined);
    const active = rules.filter((r) => {
      if (r.weight <= 0 || !unit.skills.some((s) => s.id === r.skillId)) return false;
      try { return !r.when || evalBool(r.when, scope); } catch { return false; }
    });
    const total = active.reduce((a, r) => a + r.weight, 0);
    const probs = new Map<string, number>();
    if (!active.length) probs.set(unit.skills[0]?.id ?? "", 1);
    for (const r of active) probs.set(r.skillId, (probs.get(r.skillId) ?? 0) + r.weight / total);
    return probs;
  };

  const now = evalAt(hpPct, turn);
  const skills = unit.skills.filter((s) => s.type !== "followup");
  // Probability curve over HP for each skill, at the current turn.
  const curve = useMemo(() => [1, 0.8, 0.6, 0.4, 0.2].map((h) => ({ h, probs: evalAt(h, turn) })), [rules, turn, broken, foes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Section title="情境">
        <div className="grid-fields">
          <Field label={`血量 ${Math.round(hpPct * 100)}%`}><input type="range" min={0.01} max={1} step={0.01} value={hpPct} onChange={(e) => setHpPct(Number(e.target.value))} /></Field>
          <Field label="總回合數（battle.turn）"><NumberField value={turn} min={1} onChange={(v) => setTurn(Math.max(1, Math.round(v)))} /></Field>
          <Field label="對手存活數"><NumberField value={foes} min={1} max={4} onChange={(v) => setFoes(Math.max(1, Math.min(4, Math.round(v))))} /></Field>
          <label className="check"><input type="checkbox" checked={broken} onChange={(e) => setBroken(e.target.checked)} />已被擊破</label>
        </div>
      </Section>
      <Section title="此情境下的技能機率">
        <div className="share-list">
          {skills.map((s) => {
            const p = now.get(s.id) ?? 0;
            return (
              <div key={s.id} className="share-row">
                <span className="share-name">{s.name}</span>
                <div className="share-bar"><i className="hit" style={{ width: `${p * 100}%` }} /></div>
                <span className="mono share-val">{pct(p, 0)}</span>
              </div>
            );
          })}
        </div>
      </Section>
      <Section title={`血量變化時（第 ${turn} 回合）`}>
        <table className="table">
          <thead><tr><th>血量</th>{skills.map((s) => <th key={s.id} className="r">{s.name}</th>)}</tr></thead>
          <tbody>
            {curve.map((row) => (
              <tr key={row.h}><td>{Math.round(row.h * 100)}%</td>{skills.map((s) => <td key={s.id} className="r mono">{pct(row.probs.get(s.id) ?? 0, 0)}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">battle.cycle 在此預覽中以「回合數 ÷ 4」估算；實際戰鬥依行動值計算。</p>
      </Section>
    </>
  );
}
