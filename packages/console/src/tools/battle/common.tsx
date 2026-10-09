import { ELEMENT_LABELS, battleSetupOf, validateBattle, type BattleEvent, type BattleIssue, type BattleState, type Project, type StatusDef, type UnitDef } from "@ggt/core";
import { useMemo } from "react";
import type { Updater } from "../../useProject";
import { fmt } from "../../ui";

export const elementLabel = (e: string) => ELEMENT_LABELS[e] ?? e;

/**
 * Setup + validation. When content has errors, setup is null and `error` explains why, so simulators never
 * run on half-edited data.
 */
export function useBattleSetup(project: Project) {
  return useMemo(() => {
    try {
      const setup = battleSetupOf(project);
      const issues = validateBattle(project.battle, setup.damage);
      const errors = issues.filter((i) => i.level === "error");
      if (errors.length) {
        const list = errors.slice(0, 4).map((e) => "・" + e.message).join("\n");
        return { setup: null, issues, error: `戰鬥資料有 ${errors.length} 個錯誤，請先修正：\n${list}` };
      }
      return { setup, issues, error: null as string | null };
    } catch (e) {
      return { setup: null, issues: [] as BattleIssue[], error: (e as Error).message };
    }
  }, [project]);
}

export function IssueList({ issues, empty }: { issues: BattleIssue[]; empty?: string }) {
  if (!issues.length) return empty ? <p className="muted small">{empty}</p> : null;
  return (
    <div className="issue-list">
      {issues.map((i, k) => <div key={k} className={`issue ${i.level === "error" ? "err" : "warn"}`}>{i.level === "error" ? "✕" : "!"} {i.message}</div>)}
    </div>
  );
}

export function EncounterBar({ project, update }: { project: Project; update: Updater }) {
  const enc = project.battle.encounter;
  const allies = project.battle.units.filter((u) => u.team === "ally");
  const presets = project.battle.encounters;
  const nameOf = (id: string) => project.battle.units.find((u) => u.id === id)?.name ?? id;
  const preset = presets.find((p) => p.enemies.join() === enc.enemies.join())?.id ?? "custom";
  return (
    <div className="encounter-bar">
      <label className="field">
        <span className="field-label">敵方</span>
        <select
          value={preset}
          onChange={(e) => {
            const p = presets.find((x) => x.id === e.target.value);
            if (p) update((d) => { d.battle.encounter.enemies = [...p.enemies]; });
          }}
        >
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}：{p.enemies.map(nameOf).join("、")}</option>)}
          {preset === "custom" && <option value="custom">自訂：{enc.enemies.map(nameOf).join("、")}</option>}
        </select>
      </label>
      <div className="field">
        <span className="field-label">我方隊伍（最多 4 人，依點選順序站位）</span>
        <div className="chips">
          {allies.map((u) => {
            const idx = enc.allies.indexOf(u.id);
            const on = idx >= 0;
            return (
              <button
                key={u.id}
                className={`chip-btn ${on ? "on" : ""}`}
                title={`${u.role ?? ""}・${elementLabel(u.element)}`}
                onClick={() => update((d) => {
                  const list = d.battle.encounter.allies;
                  if (on) { if (list.length > 1) list.splice(list.indexOf(u.id), 1); }
                  else if (list.length < 4) list.push(u.id);
                })}
              >
                {on && <b>{idx + 1}</b>} {u.name}<small>・{elementLabel(u.element)}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SeedField({ project, update }: { project: Project; update: Updater }) {
  return (
    <label className="field seed-field">
      <span className="field-label">種子</span>
      <input className="mono" value={String(project.seed)} onChange={(e) => update((p) => { p.seed = /^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value; })} />
    </label>
  );
}

const KIND_LABEL = { hit: "", break: "擊破傷害", dot: "持續傷害" } as const;

/** Human-readable line for an event, or null for events hidden unless "details" is on. */
export function describeEvent(e: BattleEvent, state: BattleState, statuses: StatusDef[], details: boolean, units: UnitDef[] = []): { text: string; tone?: string } | null {
  const name = (uid: string) => state.units.find((u) => u.uid === uid)?.name ?? uid;
  const sname = (id: string) => statuses.find((s) => s.id === id)?.name ?? id;
  switch (e.t) {
    case "cycle": return { text: `──── 第 ${e.cycle} 輪（行動值 ${fmt(e.time, 1)}）────`, tone: "cycle" };
    case "turn": return details ? { text: `▶ ${name(e.uid)} 的回合（${fmt(e.time, 1)}）`, tone: "muted" } : null;
    case "action": return { text: `${name(e.uid)} 使用「${e.skillName}」${e.targetUid ? ` → ${name(e.targetUid)}` : ""}`, tone: e.skillType === "ultimate" ? "ult" : e.skillType === "followup" ? "followup" : "action" };
    case "trigger": return { text: `⚡ ${name(e.uid)} 的被動「${e.passiveName}」觸發`, tone: "trigger" };
    case "damage": return { text: `　${name(e.src)} 對 ${name(e.dst)} 造成 ${fmt(e.amount, 0)}${KIND_LABEL[e.kind] ? ` ${KIND_LABEL[e.kind]}` : " 傷害"}${e.crit ? "（暴擊）" : ""}${e.absorbed ? `（護盾吸收 ${fmt(e.absorbed, 0)}）` : ""}，剩 ${fmt(e.hpAfter, 0)}`, tone: e.kind === "break" ? "break" : e.crit ? "crit" : undefined };
    case "toughness": return details ? { text: `　${name(e.dst)} 韌性 ${fmt(e.before, 1)} → ${fmt(e.after, 1)}`, tone: "muted" } : null;
    case "break": return { text: `　💥 ${name(e.dst)} 被擊破！`, tone: "break" };
    case "recover": return { text: `　${name(e.uid)} 韌性恢復`, tone: "muted" };
    case "heal": return { text: `　${name(e.src)} 為 ${name(e.dst)} 回復 ${fmt(e.amount, 0)}`, tone: "heal" };
    case "status": {
      const label = { applied: "獲得", refreshed: "刷新", resisted: "抵抗了", expired: "結束", dispelled: "被驅散", released: "解除了" }[e.result];
      if (e.result === "expired" && !details) return null;
      return { text: `　${name(e.dst)} ${label}「${sname(e.statusId)}」`, tone: e.result === "resisted" ? "muted" : "status" };
    }
    case "energy": return details ? { text: `　${name(e.uid)} 能量 ${fmt(e.before, 0)} → ${fmt(e.after, 0)}`, tone: "muted" } : null;
    case "sp": return details ? { text: `　技能點 ${e.before} → ${e.after}`, tone: "muted" } : null;
    case "advance": return details ? { text: `　${name(e.uid)} 行動值 ${fmt(e.before, 1)} → ${fmt(e.after, 1)}`, tone: "muted" } : null;
    case "skip": return { text: `${name(e.uid)} 因「${e.reason}」無法行動`, tone: "status" };
    case "charm": return { text: `${name(e.uid)} 被「${e.reason}」支配，自動行動並攻擊自己的隊友`, tone: "status" };
    case "death": return { text: `　✝ ${name(e.uid)} 倒下`, tone: "death" };
    case "revive": return { text: `　✚ ${name(e.uid)} 因「${sname(e.statusId)}」復活（生命 ${fmt(e.hp, 0)}）`, tone: "heal" };
    case "phase": return { text: `　◆ ${name(e.uid)} 進入第 ${e.phase} 階段「${e.name}」`, tone: "break" };
    case "summon": return { text: `　＋ ${name(e.by)} 召喚了 ${name(e.uid)}`, tone: "trigger" };
    case "dismiss": return { text: `　－ ${name(e.uid)} 離場${e.by !== e.uid ? `（${name(e.by)}）` : ""}`, tone: "death" };
    case "counter": return details ? { text: `　${name(e.uid)} 的 ${e.key}：${fmt(e.before, 0)} → ${fmt(e.after, 0)}`, tone: "muted" } : null;
    case "queue": return { text: `　${name(e.uid)} 下一次行動將使用「${units.find((d) => d.id === state.units.find((u) => u.uid === e.uid)?.defId)?.skills.find((s) => s.id === e.skillId)?.name ?? e.skillId}」`, tone: "status" };
    case "end": return { text: `══ 戰鬥結束：${{ win: "勝利", lose: "失敗", timeout: "超時" }[e.result]}${e.reason === "disabled" ? (e.result === "win" ? "（敵方全員受控）" : "（我方全員受控）") : ""} ══`, tone: "end" };
  }
}

export interface Series {
  name: string;
  points: { x: number; y: number }[];
  /** Marker x positions drawn on this series (e.g. ult casts, breaks). */
  markers?: number[];
}

/** Step-line chart: values hold until the next point. */
export function StepChart({ series, yMax, xMax, xLabel, yLabel, height = 200, bands }: {
  series: Series[];
  yMax: number;
  xMax: number;
  xLabel: string;
  yLabel: string;
  height?: number;
  /** Vertical guide lines (e.g. cycle boundaries). */
  bands?: { x: number; label: string }[];
}) {
  const W = 600;
  const H = 200;
  const pad = { l: 36, r: 8, t: 8, b: 20 };
  const sx = (x: number) => pad.l + (x / Math.max(xMax, 1e-9)) * (W - pad.l - pad.r);
  const sy = (y: number) => H - pad.b - (y / Math.max(yMax, 1e-9)) * (H - pad.t - pad.b);
  return (
    <div className="stepchart">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} role="img" aria-label={`${yLabel} 對 ${xLabel}`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(yMax * f)} y2={sy(yMax * f)} className="grid" />
            <text x={pad.l - 4} y={sy(yMax * f) + 3} className="axis" textAnchor="end">{fmt(yMax * f, 0)}</text>
          </g>
        ))}
        {bands?.map((b) => (
          <g key={b.x}>
            <line x1={sx(b.x)} x2={sx(b.x)} y1={pad.t} y2={H - pad.b} className="band" />
            <text x={sx(b.x) + 2} y={H - 6} className="axis">{b.label}</text>
          </g>
        ))}
        {series.map((s, i) => {
          if (!s.points.length) return null;
          let d = `M${sx(s.points[0]!.x)},${sy(s.points[0]!.y)}`;
          for (let k = 1; k < s.points.length; k++) d += ` H${sx(s.points[k]!.x)} V${sy(s.points[k]!.y)}`;
          d += ` H${sx(xMax)}`;
          return (
            <g key={s.name} className={`series s${i % 6}`}>
              <path d={d} fill="none" />
              {s.markers?.map((m, k) => <circle key={k} cx={sx(m)} cy={pad.t + 4 + i * 7} r={3.5} />)}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {series.map((s, i) => <span key={s.name} className={`lg s${i % 6}`}><i />{s.name}</span>)}
      </div>
    </div>
  );
}

/** Walks events tracking the AV clock. */
export function eventsWithTime(events: BattleEvent[]): { e: BattleEvent; time: number }[] {
  let time = 0;
  return events.map((e) => {
    if ("time" in e) time = e.time;
    return { e, time };
  });
}
