import { applyLoadout, type UnitDef } from "@gml/core";
import { Sprite, elementLabel, fmt } from "@gml/ui";
import type { CompiledUnit } from "@gml/data-hsr/equipment";
import { BASIC_STATS, EXTRA_STATS, PANEL_PROFILES, baseForPanel, baselineOf } from "./quickSettings";
import { QuickField } from "./QuickFields";

export function CharacterPanel({ unit, compiled, avBase, edit, onRestore, onAdvanced, onReplace }: {
  unit: UnitDef; compiled?: CompiledUnit; avBase: number; edit: (fn: (u: UnitDef) => void) => void; onRestore: () => void; onAdvanced: () => void; onReplace: () => void;
}) {
  const loadout = compiled && !compiled.errors.length ? compiled.loadout : { pieces: [] };
  const shown = compiled?.unit ?? unit;
  const baseline = baselineOf(unit);
  const stats = unit.team === "ally" ? [...BASIC_STATS, ...EXTRA_STATS] : [...BASIC_STATS, { key: "toughness", label: "韌性", icon: "▱", values: [30, 60, 120], min: 0 }];
  const setPanel = (key: string, value: number) => edit((u) => { u.stats[key] = baseForPanel(u, loadout, key, value, key === "hp" || key === "spd" ? 1 : 0); });
  return <div className="rail-character-layout">
    <section className={`rail-portrait rail-element-${unit.element}`} aria-label={`${unit.name}角色資訊`}>
      <div className="rail-portrait-meta"><span>{unit.team === "ally" ? "角色" : "敵方"} / {elementLabel(unit.element)} · Lv. {unit.stats.level ?? 80}</span>{unit.team === "ally" && <button type="button" className="rail-replace-button" aria-label={`更換${unit.name}`} onClick={onReplace}>更換角色 <span aria-hidden="true">↔</span></button>}</div>
      <div className="rail-orbit" aria-hidden="true"><i /><i /><i /></div>
      <div className="rail-character-art" aria-hidden="true"><Sprite unit={unit} /></div>
      <div className="rail-portrait-name"><span className="rail-kicker">{unit.role ?? "自訂角色"}</span><h2>{unit.name}</h2><p>{unit.team === "ally" ? "調整面板，搭配光錐與遺器，開始你的試玩。" : unit.description?.split("。")[0]}</p></div>
      <div className="rail-portrait-foot"><span>行動值 <b>{fmt(avBase / (shown.stats.spd ?? 100), 1)}</b></span><span>{unit.team === "ally" ? "能量上限" : "韌性"} <b>{shown.stats[unit.team === "ally" ? "maxEnergy" : "toughness"] ?? 0}</b></span></div>
    </section>
    <section className="rail-panel rail-stats-panel">
      <header className="rail-section-title"><div><span className="rail-kicker">CHARACTER DETAILS</span><h2>角色詳情</h2></div><button type="button" className="rail-text-button" onClick={onAdvanced}>詳細參數 ↗</button></header>
      <p className="rail-hint">直接填入想測試的面板數值，或點選下方快捷值。{unit.team === "ally" && "已包含光錐、遺器與行跡加成。面板配置只覆寫按鈕列出的項目與生命、攻擊、防禦、速度，其餘數值保留。"}</p>
      {unit.team === "ally" && <div className="rail-profile-row" aria-label="快速面板配置">
        {PANEL_PROFILES.map((p) => <button type="button" key={p.id} title={p.description} onClick={() => edit((u) => { for (const [key, value] of Object.entries(p.stats)) u.stats[key] = baseForPanel(u, loadout, key, value, key === "hp" || key === "spd" ? 1 : 0); })}><strong>{p.name}</strong><small>{p.description}</small></button>)}
      </div>}
      <div className="rail-stat-grid">
        {stats.map((stat, i) => {
          const minBase = stat.min ?? 0;
          const floor = applyLoadout({ ...unit, stats: { ...unit.stats, [stat.key]: minBase } }, loadout).unit.stats[stat.key] ?? minBase;
          const offset = stat.key === "energyRegen" ? 1 : 0;
          const displayStat = offset ? { ...stat, values: stat.values.map((v) => v + offset) } : stat;
          return <div key={stat.key} className={i < 4 ? "rail-basic-stat" : ""}><QuickField stat={displayStat} value={(shown.stats[stat.key] ?? 0) + offset} min={floor + offset} onChange={(v) => setPanel(stat.key, v - offset)} baseline={baseline ? () => edit((u) => { u.stats[stat.key] = baseline.stats[stat.key] ?? 0; }) : undefined} /></div>;
        })}
      </div>
      <footer className="rail-panel-foot"><span>快捷配置供試算使用，可再自由調整。配裝最低值以下的快捷值會停用。</span>{baseline && <button type="button" className="rail-text-button" onClick={onRestore}>恢復角色裸裝預設</button>}</footer>
    </section>
  </div>;
}
