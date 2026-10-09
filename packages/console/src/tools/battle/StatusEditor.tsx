import { computeHit, resolveStats, type ModOp, type Project, type Scenario, type StatusDef } from "@ggt/core";
import { useMemo, useState } from "react";
import type { Updater } from "../../useProject";
import { Badge, ErrorBox, Field, NumberField, Section, fmt } from "../../ui";
import { ELEMENT_OPTIONS } from "./elements";
import { elementLabel, useBattleSetup } from "./common";

const OPS: { value: ModOp; label: string }[] = [
  { value: "add", label: "加算" },
  { value: "pct", label: "百分比（乘基礎）" },
  { value: "mul", label: "獨立乘算" },
  { value: "override", label: "覆寫" },
];

const STAT_LABELS: Record<string, string> = {
  atk: "攻擊力", def: "防禦力", spd: "速度", critRate: "暴擊率", critDmg: "暴擊傷害", dmgBonus: "增傷", res: "抗性", resPen: "抗性穿透",
  vulnerability: "易傷", dmgReduction: "減傷", defIgnore: "無視防禦", effectHit: "效果命中", effectRes: "效果抵抗", breakEffect: "擊破特攻",
};

export function StatusEditor({ project, update }: { project: Project; update: Updater }) {
  const statuses = project.battle.statuses;
  const [selected, setSelected] = useState(statuses[0]?.id ?? "");
  const idx = statuses.findIndex((s) => s.id === selected);
  const st = statuses[idx];
  const { setup } = useBattleSetup(project);

  const usage = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const u of project.battle.units) for (const sk of u.skills) for (const e of sk.effects) {
      if (e.kind === "status") m.set(e.statusId, [...(m.get(e.statusId) ?? []), `${u.name}・${sk.name}`]);
    }
    return m;
  }, [project.battle.units]);

  const statKeys = useMemo(() => {
    const keys = new Set<string>(Object.keys(STAT_LABELS));
    for (const u of project.battle.units) for (const k of Object.keys(u.stats)) keys.add(k);
    for (const s of setup?.damage.stats ?? []) keys.add(s.key);
    ["hp", "maxEnergy", "toughness", "startEnergy", "level"].forEach((k) => keys.delete(k));
    return [...keys];
  }, [project.battle.units, setup]);
  const stepIds = setup?.damage.steps.map((s) => ({ id: s.id, label: s.label })) ?? [];

  const edit = (fn: (s: StatusDef) => void) => update((p) => { const s = p.battle.statuses.find((x) => x.id === selected); if (s) fn(s); });

  return (
    <div className="tool-layout">
      <div className="workspace">
        <Section
          title={`狀態效果（${statuses.length}）`}
          actions={
            <button className="btn small" onClick={() => {
              let n = 1;
              while (statuses.some((s) => s.id === `status${n}`)) n++;
              const id = `status${n}`;
              update((p) => { p.battle.statuses.push({ id, name: `新狀態 ${n}`, kind: "buff", duration: 2, maxStacks: 1, modifiers: [] }); });
              setSelected(id);
            }}>＋ 新增狀態</button>
          }
        >
          <div className="status-list">
            {statuses.map((s) => (
              <button key={s.id} className={`status-item ${s.id === selected ? "on" : ""}`} onClick={() => setSelected(s.id)}>
                <strong>{s.name}</strong>
                <Badge tone={s.kind === "buff" ? "ok" : "warn"}>{s.kind === "buff" ? "增益" : "減益"}</Badge>
                <span className="muted small">{s.duration} 回合{s.maxStacks > 1 ? `・最多 ${s.maxStacks} 層` : ""}{s.dot ? "・持續傷害" : ""}{s.skipTurn ? "・無法行動" : ""}</span>
              </button>
            ))}
          </div>
        </Section>

        {st && (
          <Section
            title={`編輯：${st.name}`}
            actions={
              <button className="btn small ghost" disabled={usage.has(st.id)} title={usage.has(st.id) ? "有技能正在使用，無法刪除" : ""}
                onClick={() => { if (confirm(`刪除「${st.name}」？`)) { update((p) => { p.battle.statuses.splice(idx, 1); }); setSelected(statuses.find((x) => x.id !== st.id)?.id ?? ""); } }}>
                刪除
              </button>
            }
          >
            <div className="grid-fields">
              <Field label="名稱"><input value={st.name} onChange={(e) => edit((s) => { s.name = e.target.value; })} /></Field>
              <Field label="類型">
                <select value={st.kind} onChange={(e) => edit((s) => { s.kind = e.target.value as StatusDef["kind"]; })}>
                  <option value="buff">增益（必定命中）</option>
                  <option value="debuff">減益（受效果命中／抵抗影響）</option>
                </select>
              </Field>
              <Field label="持續回合" hint="在持有者每次回合結束時減 1"><NumberField value={st.duration} min={1} onChange={(v) => v >= 1 && edit((s) => { s.duration = Math.round(v); })} /></Field>
              <Field label="最大層數"><NumberField value={st.maxStacks} min={1} onChange={(v) => v >= 1 && edit((s) => { s.maxStacks = Math.round(v); })} /></Field>
            </div>
            <div className="grid-fields" style={{ marginTop: 10 }}>
              <label className="check"><input type="checkbox" checked={!!st.skipTurn} onChange={(e) => edit((s) => { if (e.target.checked) s.skipTurn = true; else delete s.skipTurn; })} />持有者無法行動（控制）</label>
              <label className="check"><input type="checkbox" checked={!!st.dot} onChange={(e) => edit((s) => { if (e.target.checked) s.dot = { multiplier: 0.5, element: "fire" }; else delete s.dot; })} />持續傷害</label>
            </div>
            {st.dot && (
              <div className="grid-fields" style={{ marginTop: 10 }}>
                <Field label="每層傷害倍率" hint="以施加者施加當下的攻擊數值計算"><NumberField percent value={st.dot.multiplier} onChange={(v) => edit((s) => { s.dot!.multiplier = v; })} /></Field>
                <Field label="屬性">
                  <select value={st.dot.element} onChange={(e) => edit((s) => { s.dot!.element = e.target.value; })}>
                    {ELEMENT_OPTIONS.map((el) => <option key={el} value={el}>{elementLabel(el)}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <h4 className="subhead">數值修正（每層）</h4>
            <div className="mod-list">
              {st.modifiers.map((m, i) => {
                const isStep = m.target.startsWith("step:");
                const isPct = !isStep && (m.op === "pct" || ["critRate", "critDmg", "dmgBonus", "res", "resPen", "vulnerability", "dmgReduction", "defIgnore", "effectHit", "effectRes", "breakEffect"].includes(m.target.slice(5)));
                return (
                  <div key={i} className="smod-row">
                    <select aria-label="對象" value={m.target} onChange={(e) => edit((s) => { s.modifiers[i]!.target = e.target.value; })}>
                      <optgroup label="持有者數值">
                        {statKeys.map((k) => <option key={k} value={`stat:${k}`}>{STAT_LABELS[k] ?? k}</option>)}
                      </optgroup>
                      <optgroup label="傷害乘區">
                        {stepIds.map((s) => <option key={s.id} value={`step:${s.id}`}>{s.label}</option>)}
                      </optgroup>
                    </select>
                    <select aria-label="運算" value={m.op} onChange={(e) => edit((s) => { s.modifiers[i]!.op = e.target.value as ModOp; })}>
                      {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <NumberField ariaLabel="數值" percent={isPct} value={m.value} onChange={(v) => edit((s) => { s.modifiers[i]!.value = v; })} />
                    {isStep ? (
                      <select aria-label="時機" value={m.role ?? "outgoing"} onChange={(e) => edit((s) => { s.modifiers[i]!.role = e.target.value as "outgoing" | "incoming"; })}>
                        <option value="outgoing">持有者造成傷害時</option>
                        <option value="incoming">持有者受到傷害時</option>
                      </select>
                    ) : <span />}
                    <button className="btn icon" aria-label="刪除修正" onClick={() => edit((s) => { s.modifiers.splice(i, 1); })}>✕</button>
                  </div>
                );
              })}
            </div>
            <button className="btn small" style={{ marginTop: 8 }} onClick={() => edit((s) => { s.modifiers.push({ target: "stat:atk", op: "pct", value: 0.1 }); })}>＋ 修正</button>
            <Field label="說明"><input value={st.description ?? ""} onChange={(e) => edit((s) => { s.description = e.target.value; })} /></Field>
          </Section>
        )}
      </div>

      <div className="results">
        <div className="results-head"><h2>預覽</h2></div>
        {st ? <Preview project={project} st={st} usage={usage.get(st.id) ?? []} /> : <p className="muted">選擇一個狀態。</p>}
      </div>
    </div>
  );
}

function Preview({ project, st, usage }: { project: Project; st: StatusDef; usage: string[] }) {
  const { setup, error } = useBattleSetup(project);
  const allies = project.battle.units.filter((u) => u.team === "ally");
  const enemies = project.battle.units.filter((u) => u.team === "enemy");
  const [src, setSrc] = useState(allies[0]?.id ?? "");
  const [dst, setDst] = useState(enemies[0]?.id ?? "");
  const srcU = allies.find((u) => u.id === src);
  const dstU = enemies.find((u) => u.id === dst);

  const ticks = useMemo(() => {
    if (!setup || !st.dot || !srcU || !dstU) return null;
    try {
      return Array.from({ length: st.maxStacks }, (_, k) => {
        const sc: Scenario = { name: st.name, attacker: srcU.stats, defender: dstU.stats, skill: { name: st.name, type: "dot", element: st.dot!.element, multiplier: st.dot!.multiplier * (k + 1), hits: [1] }, flags: { broken: false }, modifiers: [] };
        return computeHit(setup.damage, sc, resolveStats(setup.damage, sc), 0, false).damage;
      });
    } catch (e) {
      return (e as Error).message;
    }
  }, [setup, st, srcU, dstU]);

  return (
    <>
      <Section title="效果摘要">
        <ul className="summary-list">
          <li>{st.kind === "buff" ? "增益：施加必定成功。" : "減益：成功率 = 基礎機率 ×（1 + 施加者效果命中）×（1 − 目標效果抵抗）。"}</li>
          <li>持續 {st.duration} 個持有者回合（每次持有者回合結束 −1）；重複施加會刷新回合{st.maxStacks > 1 ? `並疊加，最多 ${st.maxStacks} 層` : ""}。</li>
          {st.skipTurn && <li>持有者在回合開始時跳過行動。</li>}
          {st.dot && <li>持有者回合開始時受到持續傷害：施加者攻擊數值 × {fmt(st.dot.multiplier * 100, 0)}% × 層數，{elementLabel(st.dot.element)}屬性、不會暴擊。</li>}
          {st.modifiers.map((m, i) => <li key={i}>{m.target.startsWith("step:") ? `乘區「${m.target.slice(5)}」` : `數值「${STAT_LABELS[m.target.slice(5)] ?? m.target.slice(5)}」`} {OPS.find((o) => o.value === m.op)?.label} {fmt(m.value, 4)}（每層）{m.role === "incoming" ? "，於受到傷害時" : ""}</li>)}
          {st.modifiers.length === 0 && !st.dot && !st.skipTurn && <li className="muted">目前沒有任何效果。</li>}
        </ul>
      </Section>
      <Section title={`使用此狀態的技能（${usage.length}）`}>
        {usage.length ? <ul className="summary-list">{usage.map((u) => <li key={u}>{u}</li>)}</ul> : <p className="muted small">沒有技能使用。到 M4 的技能編輯器即可指定。</p>}
      </Section>
      {st.dot && (
        <Section title="持續傷害試算（每次跳傷）">
          {error && <ErrorBox error={error} />}
          <div className="grid-fields">
            <Field label="施加者"><select value={src} onChange={(e) => setSrc(e.target.value)}>{allies.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            <Field label="目標"><select value={dst} onChange={(e) => setDst(e.target.value)}>{enemies.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          </div>
          {typeof ticks === "string" ? <ErrorBox error={ticks} /> : ticks && (
            <table className="table">
              <thead><tr><th>層數</th><th className="r">每跳傷害</th><th className="r">{st.duration} 回合合計</th></tr></thead>
              <tbody>{ticks.map((t, k) => <tr key={k}><td>{k + 1}</td><td className="r mono">{fmt(t, 0)}</td><td className="r mono">{fmt(t * st.duration, 0)}</td></tr>)}</tbody>
            </table>
          )}
          <p className="muted small">使用目前的傷害公式（乘區組合器）計算，不含施加後的增減益變化。目標以未擊破狀態計算。</p>
        </Section>
      )}
    </>
  );
}
