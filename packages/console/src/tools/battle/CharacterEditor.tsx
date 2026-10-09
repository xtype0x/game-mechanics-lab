import { analyzeDamage, type Project, type Scenario, type UnitDef } from "@ggt/core";
import { useMemo, useState } from "react";
import type { Updater } from "../../useProject";
import { Badge, Field, NumberField, Section, Segmented, fmt } from "../../ui";
import { IssueList, elementLabel, useBattleSetup } from "./common";
import { ELEMENT_OPTIONS } from "./elements";
import { KNOWN_STATS, STAT_GROUPS, nextId } from "./meta";
import { PassiveList, SkillList } from "./SkillEditor";

type Tab = "stats" | "skills" | "passives";

export function CharacterStats(props: { project: Project; update: Updater }) {
  return <CharacterEditor {...props} initialTab="stats" />;
}

export function CharacterSkills(props: { project: Project; update: Updater }) {
  return <CharacterEditor {...props} initialTab="skills" />;
}

function CharacterEditor({ project, update, initialTab }: { project: Project; update: Updater; initialTab: Tab }) {
  const units = project.battle.units;
  const [team, setTeam] = useState<"ally" | "enemy">("ally");
  const [selected, setSelected] = useState(units.find((u) => u.team === "ally")?.id ?? "");
  const [tab, setTab] = useState<Tab>(initialTab);
  const unit = units.find((u) => u.id === selected);
  const { issues, setup } = useBattleSetup(project);
  const unitIssues = issues.filter((i) => i.where.unitId === selected);

  const usedIn = (id: string) => {
    const where: string[] = [];
    if (project.battle.encounter.allies.includes(id) || project.battle.encounter.enemies.includes(id)) where.push("目前戰鬥");
    for (const e of project.battle.encounters) if (e.enemies.includes(id)) where.push(`戰鬥「${e.name}」`);
    return where;
  };

  const editUnit = (fn: (u: UnitDef) => void) => update((p) => { const u = p.battle.units.find((x) => x.id === selected); if (u) fn(u); });

  const addUnit = (copyOf?: UnitDef) => {
    const id = nextId(team === "ally" ? "hero" : "foe", units.map((u) => u.id));
    const fresh: UnitDef = copyOf
      ? { ...JSON.parse(JSON.stringify(copyOf)), id, name: `${copyOf.name}（複製）` }
      : {
          id, name: team === "ally" ? "新角色" : "新敵人", team, element: "fire", weaknesses: [], role: team === "ally" ? "" : "普通",
          stats: team === "ally"
            ? { hp: 3000, atk: 1500, def: 700, spd: 100, level: 80, critRate: 0.05, critDmg: 0.5, maxEnergy: 100 }
            : { hp: 15000, atk: 1200, def: 1000, spd: 90, level: 80, res: 0.2, toughness: 30 },
          skills: [{ id: "basic", name: "普攻", type: "basic", spDelta: team === "ally" ? 1 : 0, energyGain: team === "ally" ? 20 : 0, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 1, toughness: 10 }] }],
        };
    update((p) => { p.battle.units.push(fresh); });
    setSelected(id);
  };

  const list = units.filter((u) => u.team === team);

  return (
    <div className="tool-layout editor-layout">
      <div className="workspace">
        <Section
          title="角色"
          actions={
            <>
              <Segmented value={team} onChange={(t) => { setTeam(t); setSelected(units.find((u) => u.team === t)?.id ?? ""); }} options={[{ value: "ally", label: "我方" }, { value: "enemy", label: "敵方" }]} />
              <button className="btn small" onClick={() => addUnit()}>＋ 新增</button>
            </>
          }
        >
          <div className="unit-list">
            {list.map((u) => {
              const errs = issues.filter((i) => i.where.unitId === u.id && i.level === "error").length;
              return (
                <button key={u.id} className={`unit-item ${u.id === selected ? "on" : ""}`} onClick={() => setSelected(u.id)}>
                  <strong>{u.name}</strong>
                  <span className={`el el-${u.element}`}>{elementLabel(u.element)}</span>
                  <span className="muted small">{u.role}</span>
                  {errs > 0 && <Badge tone="err">{errs} 錯誤</Badge>}
                </button>
              );
            })}
          </div>
        </Section>

        {unit && (
          <>
            <div className="editor-head">
              <h2>{unit.name}</h2>
              <code className="muted">{unit.id}</code>
              <span className="spacer" />
              <button className="btn small" onClick={() => addUnit(unit)}>複製</button>
              <button
                className="btn small ghost"
                disabled={usedIn(unit.id).length > 0}
                title={usedIn(unit.id).length ? `使用中：${usedIn(unit.id).join("、")}` : ""}
                onClick={() => {
                  if (!confirm(`刪除「${unit.name}」？`)) return;
                  update((p) => { p.battle.units = p.battle.units.filter((x) => x.id !== unit.id); });
                  setSelected(units.find((u) => u.team === team && u.id !== unit.id)?.id ?? "");
                }}
              >
                刪除
              </button>
            </div>
            <IssueList issues={unitIssues} />
            <Segmented value={tab} onChange={setTab} options={[{ value: "stats", label: "基本與數值" }, { value: "skills", label: `技能（${unit.skills.length}）` }, { value: "passives", label: `被動（${unit.passives?.length ?? 0}）` }]} />
            {tab === "stats" && <BasicAndStats unit={unit} edit={editUnit} damageStatKeys={setup?.damage.stats.map((s) => s.key) ?? []} />}
            {tab === "skills" && <SkillList unit={unit} edit={editUnit} statuses={project.battle.statuses} issues={unitIssues} />}
            {tab === "passives" && <PassiveList unit={unit} edit={editUnit} issues={unitIssues} />}
          </>
        )}
      </div>

      <div className="results">
        <div className="results-head"><h2>戰力速覽</h2></div>
        {unit && <Preview project={project} unit={unit} />}
      </div>
    </div>
  );
}

function BasicAndStats({ unit, edit, damageStatKeys }: { unit: UnitDef; edit: (fn: (u: UnitDef) => void) => void; damageStatKeys: string[] }) {
  // Custom stats from the damage composer (e.g. eliteBonus) are editable too.
  const extra = [...new Set([...damageStatKeys, ...Object.keys(unit.stats)])].filter((k) => !KNOWN_STATS.has(k) && k !== "vulnerability");
  return (
    <>
      <Section title="基本">
        <div className="grid-fields">
          <Field label="名稱"><input value={unit.name} onChange={(e) => edit((u) => { u.name = e.target.value; })} /></Field>
          <Field label="屬性">
            <select value={unit.element} onChange={(e) => edit((u) => { u.element = e.target.value; })}>
              {ELEMENT_OPTIONS.map((el) => <option key={el} value={el}>{elementLabel(el)}</option>)}
            </select>
          </Field>
          <Field label={unit.team === "ally" ? "職能" : "定位"}><input value={unit.role ?? ""} placeholder={unit.team === "ally" ? "主輸出、輔助…" : "普通、精英、首領"} onChange={(e) => edit((u) => { u.role = e.target.value; })} /></Field>
        </div>
        {unit.team === "enemy" && (
          <Field label="弱點屬性（被這些屬性攻擊時會削減韌性）">
            <div className="chips">
              {ELEMENT_OPTIONS.map((el) => {
                const on = unit.weaknesses.includes(el);
                return <button key={el} className={`chip-btn ${on ? "on" : ""}`} onClick={() => edit((u) => { u.weaknesses = on ? u.weaknesses.filter((x) => x !== el) : [...u.weaknesses, el]; })}>{elementLabel(el)}</button>;
              })}
            </div>
          </Field>
        )}
        <Field label="說明"><input value={unit.description ?? ""} onChange={(e) => edit((u) => { u.description = e.target.value; })} /></Field>
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

function Preview({ project, unit }: { project: Project; unit: UnitDef }) {
  const { setup } = useBattleSetup(project);
  const foes = project.battle.units.filter((u) => u.team !== unit.team);
  const [targetId, setTargetId] = useState(foes[0]?.id ?? "");
  const [broken, setBroken] = useState(false);
  const target = foes.find((u) => u.id === targetId) ?? foes[0];
  const rules = project.battle.rules;
  const spd = unit.stats.spd ?? 0;

  const rows = useMemo(() => {
    if (!setup || !target) return [];
    return unit.skills.flatMap((sk) =>
      sk.effects.flatMap((e, i) => {
        if (e.kind !== "damage") return [];
        const element = sk.element ?? unit.element;
        const sc: Scenario = {
          name: sk.name, attacker: unit.stats, defender: target.stats,
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

  return (
    <>
      <div className="cards">
        <div className="card"><span>行動值</span><strong>{spd > 0 ? fmt(rules.avBase / spd, 1) : "—"}</strong></div>
        <div className="card"><span>前 3 輪行動次數</span><strong>{turnsIn3}</strong></div>
        {unit.team === "ally" && <div className="card"><span>大招能量</span><strong>{ult ? ultCost : "—"}</strong></div>}
        <div className="card"><span>生命值</span><strong>{fmt(unit.stats.hp ?? 0, 0)}</strong></div>
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
        <p className="muted small">使用目前的傷害公式與雙方基礎數值，不含戰鬥中的增減益。</p>
      </Section>
    </>
  );
}
