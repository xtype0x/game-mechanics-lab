import { predictTimeline, type Project } from "@gml/core";
import { useMemo, useState } from "react";
import { Field, NumberField, Section, fmt } from "./ui";
import { elementLabel, type Updater } from "./common";

/** `rawProject` (optional): the project before loadouts; speed is then read-only for units whose loadout changes it. */
export function ActionOrder({ project, update, rawProject }: { project: Project; update: Updater; rawProject?: Project }) {
  const [cycles, setCycles] = useState(3);
  const { rules, units, encounter } = project.battle;
  const roster = useMemo(
    () => [
      ...encounter.allies.map((id, i) => ({ id, uid: `A${i + 1}`, team: "ally" as const, slot: i })),
      ...encounter.enemies.map((id, i) => ({ id, uid: `E${i + 1}`, team: "enemy" as const, slot: i })),
    ].map((r) => ({ ...r, def: units.find((u) => u.id === r.id)! })).filter((r) => r.def),
    [encounter, units],
  );
  const timeline = useMemo(
    () => predictTimeline(rules, roster.map((r) => ({ uid: r.uid, name: r.def.name, team: r.team, slot: r.slot, spd: r.def.stats.spd ?? 0 })), cycles),
    [rules, roster, cycles],
  );
  const limit = rules.firstCycleAv + (cycles - 1) * rules.cycleAv;
  const bounds = Array.from({ length: cycles }, (_, i) => (i === 0 ? rules.firstCycleAv : rules.firstCycleAv + i * rules.cycleAv)).filter((x) => x <= limit);
  const sharedDefs = new Set(roster.map((r) => r.id).filter((id, i, arr) => arr.indexOf(id) !== i));

  return (
    <>
      <div className="workspace">
        <Section title="速度">
          <table className="table">
            <thead><tr><th>單位</th><th>屬性</th><th className="r">速度</th><th className="r">完整行動值</th></tr></thead>
            <tbody>
              {roster.filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i).map((r) => (
                <tr key={r.id}>
                  <td>{r.def.name}{sharedDefs.has(r.id) && <span className="pill">×{roster.filter((x) => x.id === r.id).length}</span>}</td>
                  <td>{elementLabel(r.def.element)}</td>
                  <td className="r" style={{ width: 110 }}>
                    {rawProject && rawProject.battle.units.find((u) => u.id === r.id)?.stats.spd !== r.def.stats.spd ? (
                      <span className="mono" title="已套用配裝，請在「配裝」調整">{fmt(r.def.stats.spd ?? 0, 1)}</span>
                    ) : <NumberField ariaLabel={`${r.def.name} 速度`} value={r.def.stats.spd ?? 0} min={1} onChange={(v) => update((p) => { const u = p.battle.units.find((x) => x.id === r.id); if (u && v > 0) u.stats.spd = v; })} />}
                  </td>
                  <td className="r mono">{r.def.stats.spd ? fmt(rules.avBase / r.def.stats.spd, 2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">行動值 = {fmt(rules.avBase, 0)} ÷ 速度。數值越小越早行動；速度改動會直接寫回角色資料，戰鬥模擬也會使用。</p>
        </Section>
        <Section title="輪次">
          <div className="grid-fields">
            <Field label="預覽輪數"><NumberField value={cycles} min={1} max={10} onChange={(v) => setCycles(Math.max(1, Math.min(10, Math.round(v))))} /></Field>
            <Field label="第一輪長度"><NumberField value={rules.firstCycleAv} min={1} onChange={(v) => v > 0 && update((p) => { p.battle.rules.firstCycleAv = v; })} /></Field>
            <Field label="之後每輪長度"><NumberField value={rules.cycleAv} min={1} onChange={(v) => v > 0 && update((p) => { p.battle.rules.cycleAv = v; })} /></Field>
          </div>
        </Section>
      </div>

      <div className="results">
        <div className="results-head"><h3>行動時間軸（前 {cycles} 輪）</h3></div>
        <Section title="泳道圖">
          <div className="lanes">
            {roster.map((r) => {
              const marks = timeline.filter((t) => t.uid === r.uid);
              return (
                <div key={r.uid} className={`lane ${r.team}`}>
                  <span className="lane-name">{r.def.name}<small>{marks.length} 次</small></span>
                  <div className="lane-track">
                    {bounds.map((b) => <i key={b} className="lane-bound" style={{ left: `${(b / limit) * 100}%` }} />)}
                    {marks.map((m, k) => (
                      <span key={k} className="lane-mark" style={{ left: `${(m.time / limit) * 100}%` }} title={`${fmt(m.time, 2)}（第 ${m.cycle} 輪）`} />
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="lane axis-row">
              <span className="lane-name" />
              <div className="lane-track">
                {bounds.map((b, i) => <small key={b} style={{ left: `${(b / limit) * 100}%` }}>第{i + 1}輪止 {fmt(b, 0)}</small>)}
              </div>
            </div>
          </div>
        </Section>
        <Section title="行動順序">
          <ol className="order-list">
            {timeline.slice(0, 40).map((t, i) => (
              <li key={i} className={t.team}>
                <span className="mono muted">{fmt(t.time, 2)}</span> {t.name} <small className="muted">第 {t.cycle} 輪</small>
              </li>
            ))}
          </ol>
          {timeline.length > 40 && <p className="muted small">只顯示前 40 次行動。</p>}
        </Section>
      </div>
    </>
  );
}
