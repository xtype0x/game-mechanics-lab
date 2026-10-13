import type { Effect, SkillDef, UnitDef } from "@gml/core";
import { useState } from "react";
import { QuickField } from "./QuickFields";
import { baselineOf } from "./quickSettings";

const TYPES = [{ id: "basic", name: "普通攻擊", icon: "⚔" }, { id: "skill", name: "戰技", icon: "✧" }, { id: "ultimate", name: "終結技", icon: "✦" }, { id: "followup", name: "天賦・追擊", icon: "◈" }] as const;

export function SkillsPanel({ unit, edit, onAdvanced }: { unit: UnitDef; edit: (fn: (u: UnitDef) => void) => void; onAdvanced: () => void }) {
  const [type, setType] = useState<SkillDef["type"]>("basic");
  const skills = unit.skills.filter((s) => s.type === type && (type !== "followup" || s.effects.some((e) => e.kind === "damage" || e.kind === "heal")));
  const original = baselineOf(unit);
  const change = (id: string, fn: (s: SkillDef, u: UnitDef) => void) => edit((u) => { const s = u.skills.find((x) => x.id === id); if (s) fn(s, u); });
  return <section className="rail-panel rail-skills-panel">
    <header className="rail-section-title"><div><span className="rail-kicker">SKILLS & TRACES</span><h2>{unit.name}・技能與天賦</h2></div><button type="button" className="rail-text-button" onClick={onAdvanced}>進階技能規則 ↗</button></header>
    <p className="rail-hint">點選招式，快速調整倍率、削韌與能量。條件公式與觸發規則可在進階研究中編輯。</p>
    <div className="rail-skill-tabs" role="tablist" aria-label="技能類型">{TYPES.map((t) => <button type="button" key={t.id} role="tab" aria-selected={type === t.id} onClick={() => setType(t.id)}><span>{t.icon}</span>{t.name}</button>)}</div>
    <div role="tabpanel" aria-label={TYPES.find((t) => t.id === type)?.name}>
      {skills.map((skill) => <article className="rail-skill-card" key={skill.id}>
        <header><div><span className="rail-kicker">{TYPES.find((t) => t.id === type)?.name}</span><h3>{skill.name}</h3></div>{original?.skills.some((s) => s.id === skill.id) && <button type="button" className="rail-text-button" onClick={() => change(skill.id, (s, u) => { if (s.type === "ultimate" && u.stats.maxEnergy === s.energyCost) u.stats.maxEnergy = original.stats.maxEnergy ?? u.stats.maxEnergy ?? 100; Object.assign(s, structuredClone(original.skills.find((x) => x.id === skill.id)!)); })}>恢復此技能</button>}</header>
        <p className="rail-skill-description">{skill.description ?? "此招式採用下方設定。"}</p>
        <div className="rail-stat-grid">
          <QuickField stat={{ key: `${skill.id}-energy`, label: "恢復能量", icon: "↻", values: [5, 20, 30], min: 0 }} value={skill.energyGain} onChange={(v) => change(skill.id, (s) => { s.energyGain = v; })} />
          {type === "ultimate" && <QuickField stat={{ key: `${skill.id}-cost`, label: "終結技能量", icon: "✦", values: [100, 120, 140], min: 1 }} value={skill.energyCost ?? unit.stats.maxEnergy ?? 100} onChange={(v) => change(skill.id, (s, u) => { s.energyCost = v; u.stats.maxEnergy = Math.max(u.stats.maxEnergy ?? 0, v); })} />}
          {type !== "ultimate" && <QuickField stat={{ key: `${skill.id}-sp`, label: "技能點變化", icon: "◇", values: [-1, 0, 1], min: -5, max: 5 }} value={skill.spDelta} onChange={(v) => change(skill.id, (s) => { s.spDelta = Math.round(v); })} />}
          {skill.effects.map((effect, i) => <EffectFields key={i} effect={effect} index={i} skillId={skill.id} set={(key, value) => change(skill.id, (s) => { const e = s.effects[i]!; if (key in e && typeof (e as unknown as Record<string, unknown>)[key] === "number") (e as unknown as Record<string, unknown>)[key] = value; })} onAdvanced={onAdvanced} />)}
        </div>
      </article>)}
      {type === "followup" && <div className="rail-talent-list">{unit.passives?.map((p) => <article key={p.id}><span aria-hidden="true">◈</span><div><h3>{p.name}</h3><p>{p.description ?? "此天賦依戰鬥條件自動觸發，可在進階研究檢視。"}</p></div></article>)}</div>}
      {!skills.length && type !== "followup" && <p className="rail-empty">這個角色沒有此類型技能。可在進階研究新增。</p>}
      {type === "followup" && !skills.length && !unit.passives?.length && <p className="rail-empty">這個角色目前沒有天賦或追加攻擊。</p>}
    </div>
    <p className="rail-hint">技能敘述是預設資料的說明；修改後以目前填入的數值進行模擬。</p>
  </section>;
}

function EffectFields({ effect, index, skillId, set, onAdvanced }: { effect: Effect; index: number; skillId: string; set: (key: string, v: number) => void; onAdvanced: () => void }) {
  if (effect.kind !== "damage" && effect.kind !== "heal") return null;
  const fields = effect.kind === "damage" ? [{ key: "multiplier", label: "傷害倍率", percent: true, values: [1, 2, 3] }, ...(effect.adjMultiplier !== undefined ? [{ key: "adjMultiplier", label: "相鄰傷害倍率", percent: true, values: [0.5, 0.8, 1] }] : []), { key: "toughness", label: "削韌量", values: [10, 20, 30], percent: false }] : [{ key: "multiplier", label: "治療倍率", percent: true, values: [0.1, 0.3, 0.6] }, { key: "flat", label: "固定治療量", values: [100, 300, 500], percent: false }];
  return <>{fields.map((f) => {
    const value = (effect as unknown as Record<string, unknown>)[f.key];
    return typeof value === "number" ? <QuickField key={f.key} stat={{ ...f, key: `${skillId}-${index}-${f.key}`, label: `${f.label}${index ? `（效果 ${index + 1}）` : ""}`, icon: "✧", min: 0 }} value={value} onChange={(v) => set(f.key, v)} /> : <div className="rail-formula-note" key={f.key}><span>{f.label}依條件計算</span><button type="button" className="rail-text-button" onClick={onAdvanced}>檢視公式 ↗</button></div>;
  })}</>;
}
