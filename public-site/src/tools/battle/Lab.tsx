import type { Project, UnitDef } from "@ggt/core";
import { useState } from "react";
import { ActionOrder } from "./ActionOrder";
import { BatchSim } from "./BatchSim";
import { CharacterEditor } from "./CharacterEditor";
import { ErrorBox, Field, Section } from "./ui";
import { elementLabel, useBattleSetup, type Updater } from "./common";
import { PresetMenu } from "./PresetMenu";
import { MAX_ALLIES, applyPreset } from "./state";

interface Props {
  project: Project;
  update: Updater;
  onPlay: () => void;
  onReset: () => void;
  saved: boolean;
}

export function Lab({ project, update, onPlay, onReset, saved }: Props) {
  const { units, encounter, encounters } = project.battle;
  const unitOf = (id: string) => units.find((u) => u.id === id);
  const team = encounter.allies.map(unitOf).filter((u): u is UnitDef => !!u);
  const foes = [...new Set(encounter.enemies)].map(unitOf).filter((u): u is UnitDef => !!u);
  const [sel, setSel] = useState(encounter.allies[0] ?? "");
  const selected = [...team, ...foes].some((u) => u.id === sel) ? sel : team[0]?.id ?? "";
  const selUnit = unitOf(selected);
  const slotName = selUnit?.team === "ally" ? selUnit.name : undefined;
  const { error } = useBattleSetup(project);
  const preset = encounters.find((p) => p.enemies.join() === encounter.enemies.join())?.id ?? "custom";
  const benched = units.filter((u) => u.team === "ally" && !encounter.allies.includes(u.id));
  const nameOf = (id: string) => unitOf(id)?.name ?? id;

  return (
    <div className="lab-grid">
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
          <Field label="敵方">
            <select
              value={preset}
              onChange={(e) => {
                const p = encounters.find((x) => x.id === e.target.value);
                if (p) update((d) => { d.battle.encounter.enemies = [...p.enemies]; });
              }}
            >
              {encounters.map((p) => <option key={p.id} value={p.id}>{p.name}：{p.enemies.map(nameOf).join("、")}</option>)}
              {preset === "custom" && <option value="custom">自訂：{encounter.enemies.map(nameOf).join("、")}</option>}
            </select>
          </Field>
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
        <ActionOrder project={project} update={update} />
        <BatchSim project={project} update={update} />
      </div>
    </div>
  );
}
