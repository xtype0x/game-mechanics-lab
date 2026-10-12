import type { Project, UnitDef } from "@gml/core";
import { ActionOrder, BatchSim, CharacterEditor, ErrorBox, Section, elementLabel, useBattleSetup, type Updater } from "@gml/ui";
import { useState } from "react";
import { EnemyPicker } from "./EnemyPicker";
import { PresetMenu } from "./PresetMenu";
import { MAX_ALLIES, applyPreset } from "./state";
import { EquipPanel } from "./EquipPanel";
import { sanitize } from "@gml/data-hsr/equipment";
import type { EquipApi } from "./useEquip";

interface Props {
  project: Project;
  update: Updater;
  onPlay: () => void;
  onReset: () => void;
  saved: boolean;
  /** Loadouts and the project with them compiled in (used by the timeline, batch sim and play). */
  equip: EquipApi;
}

export function Lab({ project, update, onPlay, onReset, saved, equip }: Props) {
  const { units, encounter } = project.battle;
  const unitOf = (id: string) => units.find((u) => u.id === id);
  const team = encounter.allies.map(unitOf).filter((u): u is UnitDef => !!u);
  const foes = [...new Set(encounter.enemies)].map(unitOf).filter((u): u is UnitDef => !!u);
  const [sel, setSel] = useState(encounter.allies[0] ?? "");
  const selected = [...team, ...foes].some((u) => u.id === sel) ? sel : team[0]?.id ?? "";
  const selUnit = unitOf(selected);
  const slotName = selUnit?.team === "ally" ? selUnit.name : undefined;
  const compiledError = useBattleSetup(equip.compiled.project).error;
  const error = compiledError ?? (equip.compiled.problems.length ? "配裝有錯誤，請先修正：\n" + equip.compiled.problems.slice(0, 4).map((m) => "・" + m).join("\n") : null);
  const benched = units.filter((u) => u.team === "ally" && !encounter.allies.includes(u.id));

  return (
    <div className="lab-grid">
      {/* Single-column layouts put the 開打 section far below the editors; this bar starts a battle without scrolling. */}
      <div className="play-quick">
        <span><b>{team.map((u) => u.name).join("・")}</b> vs {foes.map((u) => u.name).join("・")}</span>
        <button type="button" className="btn primary" disabled={!!error} onClick={onPlay}>⚔ 開打</button>
        {error && <small className="play-quick-error">目前無法開打，原因見下方「開打」區塊。</small>}
        <small className="muted">手機建議橫向遊玩。</small>
      </div>
      <div className="col">
        <Section title="隊伍與敵人">
          <div className="field">
            <span className="field-label">我方隊伍（最多 {MAX_ALLIES} 人，點選即可編輯）</span>
            <div className="slots">
              {team.map((u, i) => (
                <div key={u.id} className={`slot ${u.id === selected ? "on" : ""}`}>
                  <button type="button" className="slot-main" aria-pressed={u.id === selected} onClick={() => setSel(u.id)}>
                    <b>{i + 1}</b>
                    <strong>{u.name}</strong>
                    <small><span className={`el el-${u.element}`}>{elementLabel(u.element)}</span> {u.role}</small>
                  </button>
                  {team.length > 1 && (
                    <button type="button" className="btn icon" aria-label={`移出 ${u.name}`} onClick={() => update((d) => { d.battle.encounter.allies = d.battle.encounter.allies.filter((id) => id !== u.id); })}>✕</button>
                  )}
                </div>
              ))}
              {team.length < MAX_ALLIES && benched.length > 0 && (
                <div className="slot add">
                  <select
                    value=""
                    aria-label="加入隊員"
                    onChange={(e) => { const id = e.target.value; if (id) { update((d) => { d.battle.encounter.allies.push(id); }); setSel(id); } }}
                  >
                    <option value="">＋ 加入隊員</option>
                    {benched.map((u) => <option key={u.id} value={u.id}>{u.name}（{elementLabel(u.element)}）</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
          <EnemyPicker project={project} update={update} />
          <div className="field">
            <span className="field-label">要調整敵人的話，點這裡</span>
            <div className="chips">
              {foes.map((u) => (
                <button key={u.id} type="button" className={`chip-btn ${u.id === selected ? "on" : ""}`} aria-pressed={u.id === selected} onClick={() => setSel(u.id)}>
                  {u.name}<small>・{elementLabel(u.element)}</small>
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="角色預設">
          <PresetMenu
            targetName={slotName}
            onPick={(p) => update((d) => { const id = applyPreset(d, selected, p); if (id) setSel(id); })}
          />
        </Section>

        <Section title="角色編輯">
          <CharacterEditor project={project} update={update} unitId={selected} />
        </Section>

        {selUnit?.team === "ally" && equip.compiled.units[selUnit.id] && (
          <Section title={`配裝：${selUnit.name}`}>
            <EquipPanel unit={selUnit} sel={sanitize(equip.store[selUnit.id], selUnit)} compiled={equip.compiled.units[selUnit.id]!} onChange={(s) => equip.setSel(selUnit.id, s)} />
          </Section>
        )}
      </div>

      <div className="col col-results">
        <Section title="開打">
          <p className="muted small">用動畫戰鬥畫面實際打一場：點敵人選目標、選技能；也可以開自動戰鬥。</p>
          {error && <ErrorBox error={error} />}
          <div className="row-gap">
            <button type="button" className="btn primary play-btn" disabled={!!error} onClick={onPlay}>⚔ 開打</button>
            <button type="button" className="btn" onClick={() => { if (confirm("把隊伍、角色與敵人全部重設回範本？你做的修改會消失。")) onReset(); }}>重設</button>
          </div>
          <p className="muted small">{saved ? "修改會自動存在這個瀏覽器（localStorage）。" : "這個瀏覽器無法儲存，重新整理後修改會消失。"}</p>
        </Section>
        <ActionOrder project={equip.compiled.project} rawProject={project} update={update} />
        <BatchSim project={equip.compiled.project} update={update} />
      </div>
    </div>
  );
}
