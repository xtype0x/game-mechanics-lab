import { contentReferences, referencesTo, type DepNode, type DepRef, type Project, type UnitDef } from "@ggt/core";
import { useMemo, useState } from "react";
import { GoLink } from "../nav";
import type { Updater } from "../useProject";
import { Badge, Section, Segmented } from "../ui";
import { elementLabel, useBattleSetup } from "./battle/common";
import { refLabel } from "./battle/SkillEditor";

type View = "units" | "statuses" | "links";

/**
 * Overview of how content pieces depend on each other: which skills apply which statuses, who summons whom,
 * which conditions read which status, and where each unit is fielded. Every name links to its editor.
 */
export function DependencyMap({ project }: { project: Project; update: Updater }) {
  const cfg = project.battle;
  const refs = useMemo(() => contentReferences(cfg), [cfg]);
  const { issues } = useBattleSetup(project);
  const [view, setView] = useState<View>("units");
  const [q, setQ] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const broken = refs.filter((r) => r.broken);
  const summoned = new Set(refs.filter((r) => r.via === "summons").map((r) => r.to.id));
  const fielded = new Set(refs.filter((r) => r.via === "roster").map((r) => r.to.id));
  const unusedStatuses = cfg.statuses.filter((s) => referencesTo(refs, { kind: "status", id: s.id }).length === 0);
  const unusedUnits = cfg.units.filter((u) => !fielded.has(u.id) && !summoned.has(u.id));
  const errorUnits = new Set(issues.filter((i) => i.level === "error").map((i) => i.where.unitId).filter(Boolean));
  const needle = q.trim().toLowerCase();
  const match = (...texts: (string | undefined)[]) => !needle || texts.some((t) => t?.toLowerCase().includes(needle));

  return (
    <div className="tool-layout single">
      <div className="workspace">
        <div className="cards">
          <div className="card"><span>角色／敵人</span><strong>{cfg.units.length}</strong></div>
          <div className="card"><span>狀態</span><strong>{cfg.statuses.length}</strong></div>
          <div className="card"><span>引用</span><strong>{refs.length}</strong></div>
          <div className={`card ${broken.length ? "bad" : ""}`}><span>失效引用</span><strong>{broken.length}</strong></div>
          <div className="card"><span>未使用</span><strong>{unusedStatuses.length + unusedUnits.length}</strong></div>
        </div>
        {broken.length > 0 && (
          <Section title="失效的引用（指向不存在的內容）">
            <ul className="dep-list">
              {broken.map((r, k) => <li key={k} className="broken"><GoLink node={r.from}>{refLabel(r, cfg.units)}</GoLink> → <code>{r.to.id}</code></li>)}
            </ul>
          </Section>
        )}
        <div className="row-gap dep-toolbar">
          <Segmented value={view} onChange={setView} options={[{ value: "units", label: "依角色" }, { value: "statuses", label: "依狀態" }, { value: "links", label: "全部連結" }]} />
          <input type="search" placeholder="搜尋名稱或 ID…" aria-label="搜尋" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="check small"><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />只看有問題或未使用</label>
        </div>

        {view === "units" && (
          <div className="dep-grid">
            {cfg.units
              .filter((u) => match(u.name, u.id, u.role))
              .filter((u) => !onlyProblems || errorUnits.has(u.id) || unusedUnits.includes(u) || refs.some((r) => r.broken && (r.from.unitId ?? r.from.id) === u.id))
              .map((u) => <UnitCard key={u.id} unit={u} project={project} refs={refs} hasError={errorUnits.has(u.id)} unused={unusedUnits.includes(u)} summoned={summoned.has(u.id)} />)}
          </div>
        )}

        {view === "statuses" && (
          <table className="table dep-table">
            <thead><tr><th>狀態</th><th>類型</th><th>使用者</th></tr></thead>
            <tbody>
              {cfg.statuses
                .filter((s) => match(s.name, s.id, s.category))
                .filter((s) => !onlyProblems || unusedStatuses.includes(s))
                .map((s) => {
                  const users = referencesTo(refs, { kind: "status", id: s.id });
                  return (
                    <tr key={s.id}>
                      <td><GoLink node={{ kind: "status", id: s.id }}>{s.name}</GoLink> <code className="muted small">{s.id}</code></td>
                      <td><Badge tone={s.kind === "buff" ? "ok" : "warn"}>{s.kind === "buff" ? "增益" : "減益"}</Badge> {s.category && <span className="muted small">{s.category}</span>}</td>
                      <td>{users.length ? users.map((r, k) => <span key={k}>{k > 0 && "、"}<GoLink node={r.from}>{refLabel(r, cfg.units)}</GoLink></span>) : <span className="muted small">未使用</span>}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}

        {view === "links" && (
          <table className="table dep-table">
            <thead><tr><th>來源</th><th>關係</th><th>目標</th></tr></thead>
            <tbody>
              {refs
                .filter((r) => match(nodeName(r.from, cfg.units), nodeName(r.to, cfg.units, project), r.to.id))
                .filter((r) => !onlyProblems || r.broken)
                .map((r, k) => (
                  <tr key={k} className={r.broken ? "broken" : ""}>
                    <td><GoLink node={r.from}>{nodeName(r.from, cfg.units)}</GoLink></td>
                    <td className="muted small">{refLabel(r, cfg.units).replace(/^.*（(.*)）$/, "$1")}</td>
                    <td>{r.broken ? <><code>{r.to.id}</code> <Badge tone="err">不存在</Badge></> : <Target r={r} units={cfg.units} project={project} />}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {(unusedStatuses.length > 0 || unusedUnits.length > 0) && !onlyProblems && (
          <Section title="未使用的內容">
            <p className="muted small">不在任何戰鬥、不被召喚的角色，以及沒有技能或條件使用的狀態。可以保留作為備用，或刪除以保持整潔。</p>
            <div className="chips">
              {unusedUnits.map((u) => <GoLink key={u.id} node={{ kind: "unit", id: u.id }}>{u.name}</GoLink>)}
              {unusedStatuses.map((s) => <GoLink key={s.id} node={{ kind: "status", id: s.id }}>狀態：{s.name}</GoLink>)}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Target({ r, units, project }: { r: DepRef; units: UnitDef[]; project: Project }) {
  if (r.to.kind === "skill" && !r.to.unitId) {
    // "Next action" names a skill id; show every unit that has it.
    const owners = units.filter((u) => u.skills.some((s) => s.id === r.to.id));
    return <>{owners.map((u, k) => <span key={u.id}>{k > 0 && "、"}<GoLink node={{ kind: "skill", id: r.to.id, unitId: u.id }}>{nodeName({ kind: "skill", id: r.to.id, unitId: u.id }, units)}</GoLink></span>)}</>;
  }
  return <GoLink node={r.to}>{nodeName(r.to, units, project)}</GoLink>;
}

function nodeName(n: DepNode, units: UnitDef[], project?: Project): string {
  const u = units.find((x) => x.id === (n.unitId ?? n.id));
  switch (n.kind) {
    case "unit": return u?.name ?? n.id;
    case "skill": return `${u?.name ?? "?"}・${u?.skills.find((s) => s.id === n.id)?.name ?? n.id}`;
    case "passive": return `${u?.name ?? "?"}・${u?.passives?.find((p) => p.id === n.id)?.name ?? n.id}`;
    case "status": return project?.battle.statuses.find((s) => s.id === n.id)?.name ?? n.id;
    case "encounter": return n.id ? `戰鬥「${project?.battle.encounters.find((e) => e.id === n.id)?.name ?? n.id}」` : "目前戰鬥";
  }
}

function UnitCard({ unit, project, refs, hasError, unused, summoned }: { unit: UnitDef; project: Project; refs: DepRef[]; hasError: boolean; unused: boolean; summoned: boolean }) {
  const units = project.battle.units;
  const own = (r: DepRef) => (r.from.unitId ?? (r.from.kind === "unit" ? r.from.id : undefined)) === unit.id;
  // One entry per (target, relation), even when several skills share it.
  const out = [...new Map(refs.filter((r) => own(r) && r.via !== "casts" && r.via !== "ai").map((r) => [`${r.to.kind}:${r.to.id}:${r.via}`, r])).values()];
  const incoming = refs.filter((r) => r.to.kind === "unit" && r.to.id === unit.id);
  return (
    <div className={`dep-card ${unit.team} ${hasError ? "has-issue" : ""}`}>
      <div className="row-gap">
        <GoLink node={{ kind: "unit", id: unit.id }}><strong>{unit.name}</strong></GoLink>
        <span className={`el el-${unit.element}`}>{elementLabel(unit.element)}</span>
        <span className="muted small">{unit.team === "ally" ? "我方" : "敵方"}{unit.role ? `・${unit.role}` : ""}</span>
        {unit.source && <Badge tone="info">匯入</Badge>}
        {summoned && <Badge tone="muted">召喚物</Badge>}
        {unused && <Badge tone="warn">未使用</Badge>}
        {hasError && <Badge tone="err">有錯誤</Badge>}
      </div>
      <div className="dep-body small">
        <div>
          <span className="muted">技能 {unit.skills.length}・被動 {unit.passives?.length ?? 0}{unit.phases?.length ? `・${unit.phases.length + 1} 階段` : ""}</span>
        </div>
        {out.length > 0 && (
          <div>使用：{out.map((r, k) => (
            <span key={k} className={r.broken ? "broken" : ""}>{k > 0 && "、"}{r.to.kind === "skill" && !r.to.unitId ? <code>{r.to.id}</code> : <GoLink node={r.to}>{nodeName(r.to, units, project)}</GoLink>}<small className="muted">（{refLabel(r, units).replace(/^.*（(.*)）$/, "$1")}）</small></span>
          ))}</div>
        )}
        {incoming.length > 0 && <div>出現在：{incoming.map((r, k) => <span key={k}>{k > 0 && "、"}<GoLink node={r.from}>{r.via === "roster" ? nodeName(r.from, units, project) : refLabel(r, units)}</GoLink></span>)}</div>}
      </div>
    </div>
  );
}
