import { DEFAULT_BATTLE_RULES, type Project, type UnitDef } from "@gml/core";
import { ActionOrder, BatchSim, CharacterEditor, ErrorBox, ExprField, Sprite, elementLabel, useBattleSetup, type Updater } from "@gml/ui";
import { useState } from "react";
import { sanitize } from "@gml/data-hsr/equipment";
import { EnemyPicker } from "./EnemyPicker";
import { PresetMenu } from "./PresetMenu";
import { MAX_ALLIES, applyPreset, applyTrialSetup } from "./state";
import { EquipPanel } from "./EquipPanel";
import { CharacterPanel } from "./CharacterPanel";
import { SkillsPanel } from "./SkillsPanel";
import { ResearchDialog } from "./ResearchDialog";
import { QuickField } from "./QuickFields";
import { BASIC_STATS, EXTRA_STATS, baselineOf } from "./quickSettings";
import type { EquipApi } from "./useEquip";

interface Props { project: Project; update: Updater; onPlay: () => void; onReset: () => void; saved: boolean; equip: EquipApi }
type Page = "stats" | "cone" | "relics" | "skills" | "team";
type ResearchPage = "character" | "skills" | "order" | "sim" | "rules";
const PAGES: { id: Page; icon: string; label: string; hint: string }[] = [
  { id: "stats", icon: "◇", label: "角色詳情", hint: "面板與快速數值" },
  { id: "cone", icon: "▱", label: "光錐", hint: "裝備與疊影" },
  { id: "relics", icon: "◈", label: "遺器", hint: "套裝與詞條" },
  { id: "skills", icon: "✦", label: "技能・行跡", hint: "招式與天賦" },
  { id: "team", icon: "♧", label: "隊伍・敵人", hint: "更換角色與選擇關卡" },
];
const RESEARCH_PAGES: { id: ResearchPage; name: string }[] = [
  { id: "character", name: "數值與機制" }, { id: "skills", name: "技能・被動" }, { id: "order", name: "行動順序" }, { id: "sim", name: "批量模擬" }, { id: "rules", name: "戰鬥規則" },
];

export function Lab({ project, update, onPlay, onReset, saved, equip }: Props) {
  const { units, encounter } = project.battle;
  const unitOf = (id: string) => units.find((u) => u.id === id);
  const team = encounter.allies.map(unitOf).filter((u): u is UnitDef => !!u);
  const foes = [...new Set(encounter.enemies)].map(unitOf).filter((u): u is UnitDef => !!u);
  const [sel, setSel] = useState(encounter.allies[0] ?? "");
  const selected = [...team, ...foes].some((u) => u.id === sel) ? sel : team[0]?.id ?? "";
  const unit = unitOf(selected);
  const [page, setPage] = useState<Page>("stats");
  const [chooser, setChooser] = useState(false);
  const [research, setResearch] = useState<ResearchPage | null>(null);
  const [researchSel, setResearchSel] = useState(selected);
  const advancedUnit = unitOf(researchSel) ?? unit;
  const compiledError = useBattleSetup(equip.compiled.project).error;
  const error = compiledError ?? (equip.compiled.problems.length ? "配裝有錯誤，請先修正：\n" + equip.compiled.problems.slice(0, 4).map((m) => "・" + m).join("\n") : null);
  const compiled = unit ? equip.compiled.units[unit.id] : undefined;
  const edit = (fn: (u: UnitDef) => void) => update((d) => { const u = d.battle.units.find((u) => u.id === selected); if (u) fn(u); });
  const openResearch = (target: ResearchPage) => { setResearchSel(selected); setResearch(target); };
  const pickUnit = (id: string) => { setSel(id); if (unitOf(id)?.team === "enemy" && (page === "cone" || page === "relics")) setPage("stats"); };
  const quickTeam = () => {
    const draft = structuredClone(project);
    const ids = applyTrialSetup(draft);
    if (!ids.length) return;
    update((d) => { d.battle = draft.battle; });
    equip.resetUnits(ids); setSel(ids[0]!); setPage("stats");
  };
  const restorePanel = () => {
    if (!unit) return;
    const baseline = baselineOf(unit);
    if (!baseline) return;
    edit((u) => { for (const stat of [...BASIC_STATS, ...EXTRA_STATS]) u.stats[stat.key] = baseline.stats[stat.key] ?? 0; });
    equip.resetUnits([unit.id]);
  };
  const benched = units.filter((u) => u.team === "ally" && !encounter.allies.includes(u.id));

  return <div className="rail-workspace">
    <aside className="rail-sidebar" aria-label="研究室側邊欄">
      <div className="rail-sidebar-title"><span className="rail-brand-mark" aria-hidden="true">✦</span><div><b>戰鬥研究室</b><small>STELLAR BATTLE LAB</small></div></div>
      <div className="rail-side-roster" aria-label="快速切換角色">{team.map((u) => <button type="button" key={u.id} title={u.name} aria-label={`切換至${u.name}`} aria-pressed={selected === u.id} onClick={() => pickUnit(u.id)}><Sprite unit={u} portrait /><span>{u.name.slice(0, 3)}</span></button>)}</div>
      <nav aria-label="角色設定">{PAGES.map((p) => <button type="button" key={p.id} className={page === p.id ? "active" : ""} aria-current={page === p.id ? "page" : undefined} disabled={unit?.team === "enemy" && (p.id === "cone" || p.id === "relics")} onClick={() => setPage(p.id)}><span className="rail-nav-icon" aria-hidden="true">{p.icon}</span><span><b>{p.label}</b><small>{p.hint}</small></span><i aria-hidden="true">›</i></button>)}</nav>
      <div className="rail-sidebar-bottom"><button type="button" className="rail-research-button" onClick={() => openResearch("character")}><span aria-hidden="true">⌘</span><div><b>進階研究</b><small>公式・機制・模擬</small></div><span aria-hidden="true">↗</span></button><p><span className={`rail-save-dot ${saved ? "" : "error"}`} />{saved ? "變更自動儲存" : "目前無法儲存"}</p></div>
    </aside>

    <div className="rail-main">
      <header className="rail-toolbar"><div><span className="rail-kicker">隊伍配置 / {unit?.name} / {PAGES.find((p) => p.id === page)?.label}</span><div className="rail-team-strip" aria-label="目前隊伍">{team.map((u) => <button type="button" key={u.id} aria-pressed={selected === u.id} onClick={() => pickUnit(u.id)}><span className={`el el-${u.element}`}>●</span>{u.name}</button>)}</div><div className="rail-team-actions">{unit?.team === "ally" && <><span>第 {encounter.allies.indexOf(selected) + 1} 位：<strong>{unit.name}</strong></span><button type="button" className="rail-replace-button" onClick={() => setChooser(true)}>更換角色 <span aria-hidden="true">↔</span></button></>}<button type="button" className="rail-text-button" onClick={() => setPage("team")}>編輯隊伍 ↗</button></div></div><button type="button" className="rail-start" disabled={!!error} onClick={onPlay}><span aria-hidden="true">⚔</span> 開始試玩 <span aria-hidden="true">→</span></button></header>
      {error && <div className="rail-error"><ErrorBox error={error} /><button type="button" className="rail-text-button" onClick={() => openResearch("character")}>前往進階研究修正 ↗</button></div>}
      {unit && page === "stats" && <CharacterPanel key={selected} unit={unit} compiled={compiled} avBase={project.battle.rules.avBase} edit={edit} onRestore={restorePanel} onAdvanced={() => openResearch("character")} onReplace={() => setChooser(true)} />}
      {unit?.team === "ally" && compiled && (page === "cone" || page === "relics") && <section className="rail-panel rail-equipment-panel"><header className="rail-section-title"><div><span className="rail-kicker">{page === "cone" ? "LIGHT CONE" : "RELICS"}</span><h2>{unit.name}・{page === "cone" ? "光錐" : "遺器"}</h2></div><button type="button" className="rail-text-button" onClick={() => setPage("stats")}>查看面板 ↗</button></header><EquipPanel key={`${selected}-${page}`} mode={page} unit={unit} sel={sanitize(equip.store[unit.id], unit)} compiled={compiled} onChange={(s) => equip.setSel(unit.id, s)} /></section>}
      {unit && page === "skills" && <><SkillsPanel key={selected} unit={unit} edit={edit} onAdvanced={() => openResearch("skills")} />{unit.team === "ally" && compiled && <section className="rail-panel"><EquipPanel mode="traces" unit={unit} sel={sanitize(equip.store[unit.id], unit)} compiled={compiled} onChange={(s) => equip.setSel(unit.id, s)} /></section>}</>}
      {page === "team" && <section className="rail-panel rail-team-page">
        <header className="rail-section-title"><div><span className="rail-kicker">TEAM & ENCOUNTER</span><h2>隊伍與敵人</h2></div><span className="rail-kicker">{team.length} / {MAX_ALLIES}</span></header>
        <p className="rail-hint">點選各位置的「更換角色」選擇隊員；點頭像可調整這位隊員的數值。</p>
        <div className="rail-team-cards">{team.map((u, i) => <article key={u.id} className={selected === u.id ? "active" : ""}><button type="button" className="rail-team-card-main" aria-label={`編輯隊員${u.name}`} onClick={() => { pickUnit(u.id); setPage("stats"); }}><span className="rail-card-number">0{i + 1}</span><Sprite unit={u} portrait /><h3>{u.name}</h3><p>{elementLabel(u.element)}・{u.role}</p></button><button type="button" className="rail-replace-button" aria-label={`更換第${i + 1}位${u.name}`} onClick={() => { setSel(u.id); setChooser(true); }}>更換角色 <span aria-hidden="true">↔</span></button>{team.length > 1 && <button type="button" className="rail-text-button" aria-label={`移出${u.name}`} onClick={() => update((d) => { d.battle.encounter.allies = d.battle.encounter.allies.filter((id) => id !== u.id); })}>移出</button>}</article>)}</div>
        {team.length < MAX_ALLIES && <label className="field"><span className="field-label">加入隊員</span><select aria-label="加入隊員" value="" onChange={(e) => { const id = e.target.value; if (id) { update((d) => { d.battle.encounter.allies.push(id); }); setSel(id); } }}><option value="">＋ 選擇一位隊員</option>{benched.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
        <div className="rail-trial-callout"><div><strong>先打一場，再慢慢研究。</strong><p>姬子・丹恆・希露瓦・傑帕德＋普通戰。替換目前隊伍與敵人，清除四人的配裝。</p></div><button type="button" className="rail-gold-button" onClick={quickTeam}>一鍵鐵道試玩</button></div>
        <div className="rail-encounter-picker"><h3>選擇敵方</h3><EnemyPicker project={project} update={update} /></div>
        <div className="rail-enemy-strip">{foes.map((u) => <button type="button" key={u.id} onClick={() => { setSel(u.id); setPage("stats"); }}><span className={`el el-${u.element}`}>◆</span><span>{u.name}<small>點選調整敵人</small></span><span>↗</span></button>)}</div>
      </section>}
      <footer className="rail-workspace-foot"><span><i aria-hidden="true">◇</i> 敵方：{foes.map((u) => u.name).join("・")}</span><div>{unit?.team === "ally" && <button type="button" className="rail-text-button" onClick={() => setChooser(true)}>更換目前角色</button>}<button type="button" className="rail-text-button" onClick={() => openResearch("order")}>查看行動順序 ↗</button></div></footer>
    </div>

    {chooser && <ResearchDialog title={`更換第 ${encounter.allies.indexOf(selected) + 1} 位角色`} subtitle={`目前為「${unit?.name ?? ""}」。點選下方角色，即可換入這個位置。`} onClose={() => setChooser(false)}><PresetMenu targetName={unit?.team === "ally" ? unit.name : undefined} onPick={(preset) => {
      const draft = structuredClone(project);
      const id = applyPreset(draft, selected, preset);
      if (!id) return;
      update((d) => { d.battle = draft.battle; });
      setSel(id); setChooser(false);
    }} /></ResearchDialog>}
    {research && <ResearchDialog wide title="進階研究" subtitle="完整參數、公式與機制；所有變更會同步到試玩。" onClose={() => setResearch(null)}>
      <div className="rail-research-tabs" role="tablist" aria-label="進階研究分類">{RESEARCH_PAGES.map((p) => <button type="button" key={p.id} role="tab" aria-selected={research === p.id} onClick={() => setResearch(p.id)}>{p.name}</button>)}</div>
      {(research === "character" || research === "skills") && <><label className="field rail-research-unit"><span className="field-label">研究對象（包含候補與召喚物）</span><select aria-label="研究對象" value={advancedUnit?.id} onChange={(e) => setResearchSel(e.target.value)}>{units.map((u) => <option key={u.id} value={u.id}>{u.team === "ally" ? "我方" : "敵方"}・{u.name}</option>)}</select></label><CharacterEditor key={`${advancedUnit?.id}-${research}`} project={project} update={update} unitId={advancedUnit?.id ?? selected} defaultTab={research === "skills" ? "skills" : "stats"} showPreview={false} /></>}
      {research === "order" && <ActionOrder project={equip.compiled.project} rawProject={project} update={update} />}
      {research === "sim" && <BatchSim project={equip.compiled.project} update={update} />}
      {research === "rules" && <BattleRulesPanel project={project} update={update} />}
      <div className="rail-research-footer"><details><summary>資料來源與模擬限制</summary><p>鐵道角色、裝備與敵人使用未核實的社群資料，部分技能與敵人倍率為近似模型；裝備條件效果尚未完整模擬。原創範本為本工具的試玩內容。資料並非正式服的完整重現。</p></details><button type="button" className="rail-text-button" onClick={() => { if (confirm("將隊伍、數值與配裝全部恢復預設？目前修改會被清除。")) { onReset(); setResearch(null); setPage("stats"); } }}>重設整個研究室</button></div>
    </ResearchDialog>}
  </div>;
}

function BattleRulesPanel({ project, update }: { project: Project; update: Updater }) {
  const fields = [
    { key: "avBase", label: "行動值基準", values: [10000, 5000, 20000] }, { key: "firstCycleAv", label: "首輪長度", values: [100, 150, 200] }, { key: "cycleAv", label: "後續輪次長度", values: [100, 150, 200] },
    { key: "spStart", label: "初始技能點", values: [0, 3, 5] }, { key: "spMax", label: "技能點上限", values: [5, 7, 10] }, { key: "energyOnHitTaken", label: "受擊恢復能量", values: [5, 10, 15] },
    { key: "energyOnKill", label: "擊殺恢復能量", values: [5, 10, 20] }, { key: "breakDelay", label: "擊破延後比例", values: [0.25, 0.5, 1], percent: true }, { key: "maxCycles", label: "模擬輪數上限", values: [10, 20, 30] },
  ] as const;
  return <section className="rail-rules"><h3>戰鬥規則</h3><p className="rail-hint">這些設定會改變整場戰鬥的節奏與計算。</p><div className="rail-stat-grid">{fields.map((f) => <QuickField key={f.key} stat={{ ...f, values: [...f.values], icon: "◇", min: ["spStart", "energyOnHitTaken", "energyOnKill", "breakDelay"].includes(f.key) ? 0 : 1 }} value={project.battle.rules[f.key]} onChange={(v) => update((d) => { d.battle.rules[f.key] = v; if (f.key === "spMax") d.battle.rules.spStart = Math.min(d.battle.rules.spStart, v); if (f.key === "spStart") d.battle.rules.spMax = Math.max(d.battle.rules.spMax, v); })} />)}</div><label className="field"><span className="field-label">擊破傷害公式</span><ExprField value={project.battle.rules.breakDamage} onChange={(expr) => { if (expr) update((d) => { d.battle.rules.breakDamage = expr; }); }} ariaLabel="擊破傷害公式" /></label><button type="button" className="rail-gold-button" onClick={() => update((d) => { d.battle.rules = structuredClone(DEFAULT_BATTLE_RULES); })}>恢復預設戰鬥規則</button></section>;
}
