import { contentReferences, externalReferencesToUnit, type DepRef, type Project, type UnitDef } from "@gml/core";
import { Badge, CharacterEditor as UnitEditor, CharacterPreview, Section, Segmented, elementLabel, nextId, refLabel, useBattleSetup, type CharacterFocus, type CharacterTab } from "@gml/ui";
import { useMemo, useState } from "react";
import { GoLink, useFocus } from "../../nav";
import type { Updater } from "../../useProject";

export function CharacterStats(props: { project: Project; update: Updater }) {
  return <CharacterEditor {...props} initialTab="stats" />;
}

export function CharacterSkills(props: { project: Project; update: Updater }) {
  return <CharacterEditor {...props} initialTab="skills" />;
}

/** Console wrapper around the shared unit editor: unit list, add / copy / delete, dependency panel, link focus. */
function CharacterEditor({ project, update, initialTab }: { project: Project; update: Updater; initialTab: CharacterTab }) {
  const units = project.battle.units;
  const [team, setTeam] = useState<"ally" | "enemy">("ally");
  const [selected, setSelected] = useState(units.find((u) => u.team === "ally")?.id ?? "");
  const [focus, setFocus] = useState<CharacterFocus | null>(null);
  const { issues } = useBattleSetup(project);
  const refs = useMemo(() => contentReferences(project.battle), [project.battle]);
  const unit = units.find((u) => u.id === selected);

  // Links from the dependency map / other editors select a unit, tab, skill or passive.
  useFocus(["character.stats", "character.skills"], (f) => {
    const u = units.find((x) => x.id === f.unitId);
    if (!u) return;
    setTeam(u.team);
    setSelected(u.id);
    setFocus({ seq: f.seq, ...(f.tab ? { tab: f.tab } : {}), ...(f.skillId ? { skillId: f.skillId } : {}), ...(f.passiveId ? { passiveId: f.passiveId } : {}) });
  });

  const external = unit ? externalReferencesToUnit(refs, unit.id) : [];

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
                  {u.source && <Badge tone="info">匯入</Badge>}
                  {u.phases?.length ? <Badge tone="muted">{u.phases.length + 1} 階段</Badge> : null}
                  {errs > 0 && <Badge tone="err">{errs} 錯誤</Badge>}
                </button>
              );
            })}
          </div>
        </Section>

        {unit && (
          <UnitEditor
            project={project}
            update={update}
            unitId={unit.id}
            refs={refs}
            focus={focus}
            showPreview={false}
            defaultTab={initialTab}
            actions={
              <>
                <button className="btn small" onClick={() => addUnit(unit)}>複製</button>
                <button
                  className="btn small ghost"
                  disabled={external.length > 0}
                  title={external.length ? `使用中：${external.map((r) => refLabel(r, units)).join("、")}` : ""}
                  onClick={() => {
                    if (!confirm(`刪除「${unit.name}」？`)) return;
                    update((p) => { p.battle.units = p.battle.units.filter((x) => x.id !== unit.id); });
                    setSelected(units.find((u) => u.team === team && u.id !== unit.id)?.id ?? "");
                  }}
                >
                  刪除
                </button>
              </>
            }
          />
        )}
      </div>

      <div className="results">
        <div className="results-head"><h2>戰力速覽</h2></div>
        {unit && <CharacterPreview project={project} unit={unit} />}
        {unit && <UnitDeps unit={unit} units={units} refs={refs} statusName={(id) => project.battle.statuses.find((s) => s.id === id)?.name ?? id} />}
      </div>
    </div>
  );
}

/** What this unit points at, and what points at it. */
function UnitDeps({ unit, units, refs, statusName }: { unit: UnitDef; units: UnitDef[]; refs: DepRef[]; statusName: (id: string) => string }) {
  const outgoing = refs.filter((r) => (r.from.unitId ?? (r.from.kind === "unit" ? r.from.id : undefined)) === unit.id && r.via !== "casts" && r.via !== "ai");
  const incoming = externalReferencesToUnit(refs, unit.id);
  const target = (r: DepRef) => {
    if (r.to.kind === "unit") return units.find((u) => u.id === r.to.id)?.name ?? r.to.id;
    if (r.to.kind === "status") return statusName(r.to.id);
    return r.to.id;
  };
  if (!outgoing.length && !incoming.length) return null;
  return (
    <Section title="相依關係">
      {outgoing.length > 0 && (
        <>
          <h4 className="subhead">使用到</h4>
          <ul className="dep-list">
            {outgoing.map((r, k) => (
              <li key={k} className={r.broken ? "broken" : ""}>
                <span className="muted small">{refLabel(r, units)}</span> → {r.to.kind === "skill" && !r.to.unitId ? <code>{r.to.id}</code> : <GoLink node={r.to}>{target(r)}</GoLink>}
                {r.broken && <Badge tone="err">不存在</Badge>}
              </li>
            ))}
          </ul>
        </>
      )}
      {incoming.length > 0 && (
        <>
          <h4 className="subhead">被使用（刪除前需先移除這些引用）</h4>
          <ul className="dep-list">
            {incoming.map((r, k) => <li key={k}><GoLink node={r.from}>{refLabel(r, units)}</GoLink></li>)}
          </ul>
        </>
      )}
    </Section>
  );
}
