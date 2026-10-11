import { analyzeDamage, type PhaseDef, type Project, type Scenario, type UnitDef } from "@gml/core";
import { useEffect, useMemo, useState } from "react";
import { Field, NumberField, Section, Segmented, fmt } from "./ui";
import { IssueList, elementLabel, useBattleSetup, type Updater } from "./common";
import { useElementOptions } from "./elements";
import { KNOWN_STATS, STAT_GROUPS } from "./meta";
import { PassiveList, SkillList } from "./SkillEditor";

type Tab = "stats" | "skills" | "passives" | "phases";

/** Edits one unit of the project: base stats, skills, passives and (enemies) phases. The unit list is owned by the lab. */
export function CharacterEditor({ project, update, unitId }: { project: Project; update: Updater; unitId: string }) {
  const units = project.battle.units;
  const unit = units.find((u) => u.id === unitId);
  const [tab, setTab] = useState<Tab>("stats");
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  const { issues, setup } = useBattleSetup(project);
  const unitIssues = issues.filter((i) => i.where.unitId === unitId);

  // A different unit starts on the stats tab with its first skill open.
  useEffect(() => { setTab("stats"); setOpenSkill(units.find((u) => u.id === unitId)?.skills[0]?.id ?? null); }, [unitId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!unit) return <p className="muted">請先選一個角色。</p>;
  const editUnit = (fn: (u: UnitDef) => void) => update((p) => { const u = p.battle.units.find((x) => x.id === unitId); if (u) fn(u); });

  return (
    <div className="character-editor">
      <div className="editor-head">
        <h3>{unit.name}</h3>
        <span className={`el el-${unit.element}`}>{elementLabel(unit.element)}</span>
        <code className="muted">{unit.id}</code>
      </div>
      <IssueList issues={unitIssues} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "stats", label: "基本與數值" },
          { value: "skills", label: `技能（${unit.skills.length}）` },
          { value: "passives", label: `被動（${unit.passives?.length ?? 0}）` },
          ...(unit.team === "enemy" ? [{ value: "phases" as Tab, label: `階段（${(unit.phases?.length ?? 0) + 1}）` }] : []),
        ]}
      />
      {tab === "stats" && <BasicAndStats unit={unit} units={units} statusCategories={[...new Set(project.battle.statuses.map((s) => s.category).filter((c): c is string => !!c))]} edit={editUnit} damageStatKeys={setup?.damage.stats.map((s) => s.key) ?? []} />}
      {tab === "skills" && <SkillList unit={unit} units={units} edit={editUnit} statuses={project.battle.statuses} issues={unitIssues} open={openSkill} setOpen={setOpenSkill} />}
      {tab === "passives" && <PassiveList unit={unit} edit={editUnit} issues={unitIssues} />}
      {tab === "phases" && <PhaseList unit={unit} units={units} edit={editUnit} />}
      <Preview project={project} unit={unit} />
    </div>
  );
}

function BasicAndStats({ unit, units, statusCategories, edit, damageStatKeys }: { unit: UnitDef; units: UnitDef[]; statusCategories: string[]; edit: (fn: (u: UnitDef) => void) => void; damageStatKeys: string[] }) {
  const elements = useElementOptions(units);
  // Custom stats from the damage composer (e.g. eliteBonus) are editable too.
  const extra = [...new Set([...damageStatKeys, ...Object.keys(unit.stats)])].filter((k) => !KNOWN_STATS.has(k) && k !== "vulnerability");
  return (
    <>
      <Section title="基本">
        <div className="grid-fields">
          <Field label="名稱"><input value={unit.name} onChange={(e) => edit((u) => { u.name = e.target.value; })} /></Field>
          <Field label="屬性">
            <select value={unit.element} onChange={(e) => edit((u) => { u.element = e.target.value; })}>
              {elements.map((el) => <option key={el} value={el}>{elementLabel(el)}</option>)}
            </select>
          </Field>
          <Field label={unit.team === "ally" ? "職能" : "定位"}><input value={unit.role ?? ""} placeholder={unit.team === "ally" ? "主輸出、輔助…" : "普通、精英、首領、召喚物"} onChange={(e) => edit((u) => { u.role = e.target.value; })} /></Field>
        </div>
        {unit.team === "enemy" && (
          <Field label="弱點屬性（被這些屬性攻擊時會削減韌性）">
            <div className="chips">
              {elements.map((el) => {
                const on = unit.weaknesses.includes(el);
                return <button key={el} className={`chip-btn ${on ? "on" : ""}`} onClick={() => edit((u) => { u.weaknesses = on ? u.weaknesses.filter((x) => x !== el) : [...u.weaknesses, el]; })}>{elementLabel(el)}</button>;
              })}
            </div>
          </Field>
        )}
        {unit.team === "enemy" && (
          <label className="check"><input type="checkbox" checked={!!unit.boundToSummoner} onChange={(e) => edit((u) => { if (e.target.checked) u.boundToSummoner = true; else delete u.boundToSummoner; })} />被召喚時，召喚者倒下或被移除就一起消失</label>
        )}
        <label className="check" title="例如倒數計時、場地效果：照速度在行動條上行動、一律用 AI 規則，不能被選為目標，不計入勝負與場上人數上限">
          <input type="checkbox" checked={!!unit.timelineEvent} onChange={(e) => edit((u) => { if (e.target.checked) u.timelineEvent = true; else delete u.timelineEvent; })} />行動條事件：會行動，但不能被攻擊、不計入勝負
        </label>
        <Field label="說明"><textarea rows={unit.description && unit.description.length > 80 ? 4 : 2} value={unit.description ?? ""} onChange={(e) => edit((u) => { u.description = e.target.value; })} /></Field>
      </Section>
      {STAT_GROUPS.map((g) => {
        const stats = g.stats.filter((s) => !(s.enemyOnly && unit.team === "ally") && !(s.allyOnly && unit.team === "enemy"));
        return (
          <Section key={g.title} title={g.title}>
            <div className="grid-fields">
              {stats.map((s) => (
                <Field key={s.key} label={s.label} hint={s.hint}>
                  <NumberField percent={s.percent} value={unit.stats[s.key] ?? 0} onChange={(v) => edit((u) => { u.stats[s.key] = v; })} />
                </Field>
              ))}
            </div>
          </Section>
        );
      })}
      <ResistanceTable
        title="屬性抗性（覆寫「抗性」）"
        hint="有填的屬性在受到該屬性傷害時改用這裡的值；沒填的沿用上方「抗性」。"
        keys={elements}
        label={elementLabel}
        values={unit.elementRes}
        onChange={(next) => edit((u) => { if (next) u.elementRes = next; else delete u.elementRes; })}
      />
      <ResistanceTable
        title="狀態抵抗（依狀態分類）"
        hint="只影響敵方施加、且設定了分類的減益；與效果抵抗相乘。分類在「狀態效果」編輯器設定。"
        keys={[...new Set([...statusCategories, ...Object.keys(unit.statusRes ?? {})])]}
        label={(k) => k}
        values={unit.statusRes}
        onChange={(next) => edit((u) => { if (next) u.statusRes = next; else delete u.statusRes; })}
      />
      {extra.length > 0 && (
        <Section title="其他（來自乘區組合器的自訂數值）">
          <div className="grid-fields">
            {extra.map((k) => (
              <Field key={k} label={k}><NumberField value={unit.stats[k] ?? 0} onChange={(v) => edit((u) => { u.stats[k] = v; })} /></Field>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function ResistanceTable({ title, hint, keys, label, values, onChange }: {
  title: string; hint: string; keys: string[]; label: (k: string) => string;
  values: Record<string, number> | undefined; onChange: (v: Record<string, number> | undefined) => void;
}) {
  const v = values ?? {};
  const set = (k: string, x: number | undefined) => {
    const next = { ...v };
    if (x === undefined) delete next[k]; else next[k] = x;
    onChange(Object.keys(next).length ? next : undefined);
  };
  if (!keys.length) return null;
  return (
    <Section title={title}>
      <p className="muted small">{hint}</p>
      <div className="res-grid">
        {keys.map((k) => (
          <div key={k} className={`res-cell ${k in v ? "on" : ""}`}>
            <label className="check small"><input type="checkbox" checked={k in v} onChange={(e) => set(k, e.target.checked ? 0 : undefined)} />{label(k)}</label>
            {k in v && <NumberField ariaLabel={`${label(k)} 抗性`} percent value={v[k]!} onChange={(x) => set(k, x)} />}
          </div>
        ))}
      </div>
    </Section>
  );
}

function PhaseList({ unit, units, edit }: { unit: UnitDef; units: UnitDef[]; edit: (fn: (u: UnitDef) => void) => void }) {
  const phases = unit.phases ?? [];
  const elements = useElementOptions(units);
  const editPh = (i: number, fn: (p: PhaseDef) => void) => edit((u) => { fn(u.phases![i]!); });
  const STAT_KEYS: [string, string][] = [["hp", "生命值"], ["atk", "攻擊力"], ["def", "防禦力"], ["spd", "速度"], ["toughness", "韌性"]];
  return (
    <Section
      title="階段（多條血量）"
      actions={<button className="btn small" onClick={() => edit((u) => { (u.phases ??= []).push({ name: `第 ${(u.phases?.length ?? 0) + 2} 階段`, stats: { hp: u.stats.hp ?? 10000 } }); })}>＋ 新增階段</button>}
    >
      <p className="muted small">生命值歸零時，若還有下一階段就進入它，而不是倒下：套用下面的數值、補滿生命與韌性、解除擊破。可用被動「自己進入新階段時」做召喚或換招，AI 條件可用 self.phase。</p>
      <div className="phase-card base">
        <strong>第 1 階段</strong>
        <span className="muted small">使用「基本與數值」的設定：生命 {fmt(unit.stats.hp ?? 0, 0)}・速度 {fmt(unit.stats.spd ?? 0, 0)}・弱點 {unit.weaknesses.map(elementLabel).join(" ") || "無"}</span>
      </div>
      {phases.map((ph, i) => (
        <div key={i} className="phase-card">
          <div className="row-gap">
            <strong>第 {i + 2} 階段</strong>
            <input aria-label="階段名稱" value={ph.name} onChange={(e) => editPh(i, (p) => { p.name = e.target.value; })} />
            <span className="spacer" />
            <button className="btn small ghost" onClick={() => edit((u) => { u.phases!.splice(i, 1); if (!u.phases!.length) delete u.phases; })}>刪除</button>
          </div>
          <div className="grid-fields">
            {STAT_KEYS.map(([k, lbl]) => {
              const has = ph.stats?.[k] !== undefined;
              return (
                <Field key={k} label={`${lbl}${has ? "" : "（沿用）"}`}>
                  <div className="row-gap">
                    <input type="checkbox" aria-label={`改變${lbl}`} checked={has} onChange={(e) => editPh(i, (p) => {
                      p.stats ??= {};
                      if (e.target.checked) p.stats[k] = unit.stats[k] ?? 0; else delete p.stats[k];
                    })} />
                    {has && <NumberField ariaLabel={lbl} value={ph.stats![k]!} onChange={(v) => editPh(i, (p) => { p.stats![k] = v; })} />}
                  </div>
                </Field>
              );
            })}
          </div>
          <Field label="弱點">
            <div className="chips">
              <button className={`chip-btn ${ph.weaknesses ? "" : "on"}`} onClick={() => editPh(i, (p) => { delete p.weaknesses; })}>沿用</button>
              {elements.map((el) => {
                const on = ph.weaknesses?.includes(el) ?? false;
                return <button key={el} className={`chip-btn ${on ? "on" : ""}`} onClick={() => editPh(i, (p) => {
                  const cur = p.weaknesses ?? [];
                  p.weaknesses = on ? cur.filter((x) => x !== el) : [...cur, el];
                })}>{elementLabel(el)}</button>;
              })}
            </div>
          </Field>
          <label className="check"><input type="checkbox" checked={!!ph.clearDebuffs} onChange={(e) => editPh(i, (p) => { if (e.target.checked) p.clearDebuffs = true; else delete p.clearDebuffs; })} />進入時清除所有減益</label>
        </div>
      ))}
    </Section>
  );
}

function Preview({ project, unit }: { project: Project; unit: UnitDef }) {
  const { setup } = useBattleSetup(project);
  const foes = project.battle.units.filter((u) => u.team !== unit.team);
  const [targetId, setTargetId] = useState(foes[0]?.id ?? "");
  const [broken, setBroken] = useState(false);
  const target = foes.find((u) => u.id === targetId) ?? foes[0];
  const rules = project.battle.rules;
  const spd = unit.stats.spd ?? 0;
  useEffect(() => { if (!foes.some((u) => u.id === targetId)) setTargetId(foes[0]?.id ?? ""); }, [foes, targetId]);

  const rows = useMemo(() => {
    if (!setup || !target) return [];
    return unit.skills.flatMap((sk) =>
      sk.effects.flatMap((e, i) => {
        if (e.kind !== "damage" || typeof e.multiplier !== "number" || typeof e.toughness !== "number") return []; // formula values are not previewed
        const element = sk.element ?? unit.element;
        const scaleStat = e.scale === "def" ? unit.stats.def ?? 0 : e.scale === "hp" ? unit.stats.hp ?? 0 : undefined;
        const res = target.elementRes?.[element];
        const sc: Scenario = {
          name: sk.name,
          attacker: scaleStat === undefined ? unit.stats : { ...unit.stats, atk: scaleStat },
          defender: res === undefined ? target.stats : { ...target.stats, res },
          skill: { name: sk.name, type: sk.type, element, multiplier: e.multiplier, hits: e.hits ?? [1] },
          flags: { broken, weakness: target.weaknesses.includes(element) }, modifiers: [],
        };
        try {
          const a = analyzeDamage(setup.damage, sc);
          return [{ key: `${sk.id}-${i}`, skill: sk.name, type: sk.type, mode: e.target, expected: a.expected, nonCrit: a.nonCrit.total, crit: a.crit.total, tough: target.weaknesses.includes(element) ? e.toughness : 0 }];
        } catch {
          return [];
        }
      }),
    );
  }, [setup, unit, target, broken]);

  const turnsIn3 = spd > 0 ? Math.floor((rules.firstCycleAv + 2 * rules.cycleAv) / (rules.avBase / spd)) : 0;
  const ult = unit.skills.find((s) => s.type === "ultimate");
  const ultCost = ult ? (ult.energyCost ?? unit.stats.maxEnergy ?? 0) : 0;
  const totalHp = (unit.stats.hp ?? 0) + (unit.phases ?? []).reduce((a, p) => a + (p.stats?.hp ?? unit.stats.hp ?? 0), 0);

  return (
    <>
      <div className="cards">
        <div className="card"><span>行動值</span><strong>{spd > 0 ? fmt(rules.avBase / spd, 1) : "—"}</strong></div>
        <div className="card"><span>前 3 輪行動次數</span><strong>{turnsIn3}</strong></div>
        {unit.team === "ally" && <div className="card"><span>大招能量</span><strong>{ult ? ultCost : "—"}</strong></div>}
        <div className="card"><span>{unit.phases?.length ? "各階段總生命" : "生命值"}</span><strong>{fmt(totalHp, 0)}</strong></div>
      </div>
      <Section title="技能傷害試算">
        <div className="grid-fields">
          <Field label="對象">
            <select value={target?.id} onChange={(e) => setTargetId(e.target.value)}>
              {foes.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {unit.team === "ally" && <label className="check"><input type="checkbox" checked={broken} onChange={(e) => setBroken(e.target.checked)} />對象已擊破</label>}
        </div>
        {rows.length === 0 ? <p className="muted small">沒有傷害技能，或目前的戰鬥資料有錯誤。</p> : (
          <table className="table">
            <thead><tr><th>技能</th><th className="r">期望</th><th className="r">未暴擊</th><th className="r">暴擊</th><th className="r">削韌</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}><td>{r.skill}<small className="muted">{r.mode === "blast" ? "（主目標）" : r.mode === "allEnemies" ? "（每名）" : ""}</small></td>
                  <td className="r mono strong">{fmt(r.expected, 0)}</td><td className="r mono">{fmt(r.nonCrit, 0)}</td><td className="r mono">{fmt(r.crit, 0)}</td><td className="r mono">{r.tough || "—"}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">使用目前的傷害公式與雙方基礎數值（含屬性抗性、倍率依據），不含戰鬥中的增減益。</p>
      </Section>
    </>
  );
}
