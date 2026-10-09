import type { BattleIssue, Effect, PassiveDef, SkillDef, StatusDef, UnitDef } from "@ggt/core";
import { useState } from "react";
import { Badge, Field, NumberField, Section } from "../../ui";
import { ExprField } from "../common";
import { elementLabel } from "./common";
import { ELEMENT_OPTIONS } from "./elements";
import { AI_VARS, EFFECT_KINDS, SKILL_TYPES, TARGETING, TARGET_MODES, TRIGGERS, defaultEffect, nextId } from "./meta";

type Edit = (fn: (u: UnitDef) => void) => void;

export function SkillList({ unit, edit, statuses, issues }: { unit: UnitDef; edit: Edit; statuses: StatusDef[]; issues: BattleIssue[] }) {
  const [open, setOpen] = useState<string | null>(unit.skills[0]?.id ?? null);
  const editSkill = (id: string, fn: (s: SkillDef) => void) => edit((u) => { const s = u.skills.find((x) => x.id === id); if (s) fn(s); });
  const usedByPassive = (id: string) => (unit.passives ?? []).some((p) => p.skillId === id);
  const usedByAi = (id: string) => (unit.ai ?? []).some((r) => r.skillId === id);

  return (
    <Section
      title="技能"
      actions={
        <button className="btn small" onClick={() => {
          const id = nextId("skill", unit.skills.map((s) => s.id));
          edit((u) => { u.skills.push({ id, name: "新技能", type: "skill", spDelta: u.team === "ally" ? -1 : 0, energyGain: u.team === "ally" ? 30 : 0, targeting: "enemy", effects: [defaultEffect("damage", statuses[0]?.id ?? "")] }); });
          setOpen(id);
        }}>＋ 新增技能</button>
      }
    >
      <div className="skill-list">
        {unit.skills.map((sk, i) => {
          const isOpen = open === sk.id;
          const skIssues = issues.filter((x) => x.where.skillId === sk.id);
          return (
            <div key={sk.id} className={`skill-card ${isOpen ? "open" : ""} ${skIssues.some((x) => x.level === "error") ? "has-issue" : ""}`}>
              <button className="skill-head" onClick={() => setOpen(isOpen ? null : sk.id)}>
                <span className="caret">{isOpen ? "▾" : "▸"}</span>
                <strong>{sk.name}</strong>
                <Badge tone={sk.type === "ultimate" ? "warn" : sk.type === "followup" ? "info" : "muted"}>{SKILL_TYPES.find((t) => t.value === sk.type)?.label.replace("（由被動觸發）", "") ?? sk.type}</Badge>
                <span className="muted small">{summarize(sk, statuses)}</span>
              </button>
              {isOpen && (
                <div className="skill-body">
                  <div className="grid-fields">
                    <Field label="名稱"><input value={sk.name} onChange={(e) => editSkill(sk.id, (s) => { s.name = e.target.value; })} /></Field>
                    <Field label="類型">
                      <select value={sk.type} onChange={(e) => editSkill(sk.id, (s) => { s.type = e.target.value as SkillDef["type"]; if (s.type === "ultimate" && s.energyCost === undefined) s.energyCost = unit.stats.maxEnergy ?? 100; })}>
                        {SKILL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </Field>
                    <Field label="選擇目標">
                      <select value={sk.targeting} onChange={(e) => editSkill(sk.id, (s) => { s.targeting = e.target.value as SkillDef["targeting"]; })}>
                        {TARGETING.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </Field>
                    <Field label="屬性">
                      <select value={sk.element ?? ""} onChange={(e) => editSkill(sk.id, (s) => { if (e.target.value) s.element = e.target.value; else delete s.element; })}>
                        <option value="">同角色（{elementLabel(unit.element)}）</option>
                        {ELEMENT_OPTIONS.map((el) => <option key={el} value={el}>{elementLabel(el)}</option>)}
                      </select>
                    </Field>
                    {unit.team === "ally" && (
                      <Field label="技能點變化" hint="普攻通常 +1，戰技 −1"><NumberField value={sk.spDelta} onChange={(v) => editSkill(sk.id, (s) => { s.spDelta = Math.round(v); })} /></Field>
                    )}
                    {unit.team === "ally" && <Field label="獲得能量"><NumberField value={sk.energyGain} onChange={(v) => editSkill(sk.id, (s) => { s.energyGain = v; })} /></Field>}
                    {sk.type === "ultimate" && (
                      <Field label="大招所需能量"><NumberField value={sk.energyCost ?? unit.stats.maxEnergy ?? 0} onChange={(v) => editSkill(sk.id, (s) => { s.energyCost = v; })} /></Field>
                    )}
                  </div>
                  <h4 className="subhead">效果（依序結算）</h4>
                  <div className="effect-list">
                    {sk.effects.map((e, k) => (
                      <EffectRow
                        key={k}
                        effect={e}
                        statuses={statuses}
                        first={k === 0}
                        last={k === sk.effects.length - 1}
                        onChange={(ne) => editSkill(sk.id, (s) => { s.effects[k] = ne; })}
                        onMove={(d) => editSkill(sk.id, (s) => { const [x] = s.effects.splice(k, 1); s.effects.splice(k + d, 0, x!); })}
                        onRemove={() => editSkill(sk.id, (s) => { s.effects.splice(k, 1); })}
                      />
                    ))}
                  </div>
                  <div className="row-gap">
                    {EFFECT_KINDS.map((k) => (
                      <button key={k.value} className="btn small" onClick={() => editSkill(sk.id, (s) => { s.effects.push(defaultEffect(k.value, statuses[0]?.id ?? "")); })}>＋ {k.label}</button>
                    ))}
                  </div>
                  <Field label="說明"><input value={sk.description ?? ""} onChange={(e) => editSkill(sk.id, (s) => { s.description = e.target.value; })} /></Field>
                  <div className="row-gap">
                    <code className="muted small">ID：{sk.id}</code>
                    <span className="spacer" />
                    <button className="btn small ghost" disabled={i === 0} onClick={() => edit((u) => { const [x] = u.skills.splice(i, 1); u.skills.splice(i - 1, 0, x!); })}>上移</button>
                    <button className="btn small ghost" disabled={i === unit.skills.length - 1} onClick={() => edit((u) => { const [x] = u.skills.splice(i, 1); u.skills.splice(i + 1, 0, x!); })}>下移</button>
                    <button
                      className="btn small ghost"
                      disabled={usedByPassive(sk.id) || usedByAi(sk.id)}
                      title={usedByPassive(sk.id) ? "被動正在使用" : usedByAi(sk.id) ? "AI 規則正在使用" : ""}
                      onClick={() => { if (confirm(`刪除「${sk.name}」？`)) edit((u) => { u.skills = u.skills.filter((x) => x.id !== sk.id); }); }}
                    >刪除</button>
                  </div>
                  {skIssues.map((x, k) => <div key={k} className={`issue ${x.level === "error" ? "err" : "warn"}`}>{x.message}</div>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted small">技能在列表中的順序就是行動選單的順序；我方自動策略會選第一個「戰技」與「普攻」。</p>
    </Section>
  );
}

function summarize(sk: SkillDef, statuses: StatusDef[]): string {
  return sk.effects.map((e) => {
    const t = TARGET_MODES.find((m) => m.value === e.target)?.label ?? e.target;
    switch (e.kind) {
      case "damage": return `${t} ${Math.round(e.multiplier * 100)}%`;
      case "heal": return `治療${t}`;
      case "status": return `${statuses.find((s) => s.id === e.statusId)?.name ?? e.statusId}→${t}`;
      case "advance": return `${t}提前 ${Math.round(e.amount * 100)}%`;
      case "energy": return `${t}能量 +${e.amount}`;
    }
  }).join("、");
}

function EffectRow({ effect: e, statuses, first, last, onChange, onMove, onRemove }: {
  effect: Effect; statuses: StatusDef[]; first: boolean; last: boolean;
  onChange: (e: Effect) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const set = <K extends string>(k: K, v: unknown) => onChange({ ...e, [k]: v } as Effect);
  return (
    <div className="effect-row">
      <div className="effect-top">
        <Badge tone="info">{EFFECT_KINDS.find((k) => k.value === e.kind)?.label}</Badge>
        <select aria-label="作用對象" value={e.target} onChange={(ev) => set("target", ev.target.value)}>
          {TARGET_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn icon" aria-label="上移" disabled={first} onClick={() => onMove(-1)}>↑</button>
        <button className="btn icon" aria-label="下移" disabled={last} onClick={() => onMove(1)}>↓</button>
        <button className="btn icon" aria-label="刪除效果" onClick={onRemove}>✕</button>
      </div>
      <div className="grid-fields">
        {e.kind === "damage" && (
          <>
            <Field label="倍率"><NumberField percent value={e.multiplier} onChange={(v) => set("multiplier", v)} /></Field>
            <Field label="削韌"><NumberField value={e.toughness} onChange={(v) => set("toughness", v)} /></Field>
            {e.target === "blast" && <Field label="相鄰倍率"><NumberField percent value={e.adjMultiplier ?? 0} onChange={(v) => set("adjMultiplier", v)} /></Field>}
            {e.target === "blast" && <Field label="相鄰削韌"><NumberField value={e.adjToughness ?? 0} onChange={(v) => set("adjToughness", v)} /></Field>}
            <Field label="分段比例" hint="例如 0.3, 0.3, 0.4；留空為單段">
              <input
                className="mono"
                defaultValue={(e.hits ?? []).join(", ")}
                key={(e.hits ?? []).join(",")}
                placeholder="單段"
                onBlur={(ev) => {
                  const parts = ev.target.value.split(/[,，\s]+/).filter(Boolean).map(Number);
                  if (!parts.length) { const { hits: _h, ...rest } = e; onChange(rest as Effect); }
                  else if (parts.every((x) => Number.isFinite(x) && x >= 0) && parts.length <= 12) set("hits", parts);
                  else ev.target.value = (e.hits ?? []).join(", ");
                }}
              />
            </Field>
          </>
        )}
        {e.kind === "heal" && (
          <>
            <Field label="依據">
              <select value={e.scale} onChange={(ev) => set("scale", ev.target.value)}>
                <option value="atk">施放者攻擊力</option>
                <option value="maxHp">目標生命上限</option>
              </select>
            </Field>
            <Field label="比例"><NumberField percent value={e.multiplier} onChange={(v) => set("multiplier", v)} /></Field>
            <Field label="固定值"><NumberField value={e.flat} onChange={(v) => set("flat", v)} /></Field>
          </>
        )}
        {e.kind === "status" && (
          <>
            <Field label="狀態">
              <select value={e.statusId} onChange={(ev) => set("statusId", ev.target.value)}>
                {!statuses.some((s) => s.id === e.statusId) && <option value={e.statusId}>（不存在）{e.statusId}</option>}
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="基礎機率"><NumberField percent value={e.chance} onChange={(v) => set("chance", v)} /></Field>
          </>
        )}
        {e.kind === "advance" && <Field label="提前比例" hint="完整行動值的百分比"><NumberField percent value={e.amount} onChange={(v) => set("amount", v)} /></Field>}
        {e.kind === "energy" && <Field label="能量"><NumberField value={e.amount} onChange={(v) => set("amount", v)} /></Field>}
      </div>
    </div>
  );
}

export function PassiveList({ unit, edit, issues }: { unit: UnitDef; edit: Edit; issues: BattleIssue[] }) {
  const passives = unit.passives ?? [];
  const followups = unit.skills.filter((s) => s.type === "followup");
  const editP = (i: number, fn: (p: PassiveDef) => void) => edit((u) => { fn(u.passives![i]!); });
  return (
    <Section
      title="被動（觸發追加攻擊）"
      actions={
        <button className="btn small" onClick={() => edit((u) => {
          (u.passives ??= []).push({ id: nextId("passive", (u.passives ?? []).map((p) => p.id)), name: "新被動", on: "allyUltimate", skillId: followups[0]?.id ?? u.skills[0]?.id ?? "", limitPerTurn: 1 });
        })}>＋ 新增被動</button>
      }
    >
      {followups.length === 0 && <p className="muted small">被動會施放一個「追加攻擊」類型的技能。請先到「技能」分頁新增一個追加攻擊。</p>}
      <div className="passive-list">
        {passives.map((p, i) => (
          <div key={p.id} className="passive-card">
            <div className="grid-fields">
              <Field label="名稱"><input value={p.name} onChange={(e) => editP(i, (x) => { x.name = e.target.value; })} /></Field>
              <Field label="觸發時機">
                <select value={p.on} onChange={(e) => editP(i, (x) => { x.on = e.target.value as PassiveDef["on"]; })}>
                  {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="施放技能">
                <select value={p.skillId} onChange={(e) => editP(i, (x) => { x.skillId = e.target.value; })}>
                  {!unit.skills.some((s) => s.id === p.skillId) && <option value={p.skillId}>（不存在）{p.skillId}</option>}
                  {unit.skills.map((s) => <option key={s.id} value={s.id}>{s.name}{s.type !== "followup" ? "（非追加攻擊）" : ""}</option>)}
                </select>
              </Field>
              <Field label="每回合次數上限" hint="在自己兩次行動之間；0 為不限"><NumberField value={p.limitPerTurn} min={0} onChange={(v) => editP(i, (x) => { x.limitPerTurn = Math.max(0, Math.round(v)); })} /></Field>
            </div>
            <Field label={`額外條件（選填）。可用：${AI_VARS}`}>
              <ExprField allowEmpty value={p.when} placeholder="例如 self.hpPct < 0.5" onChange={(e) => editP(i, (x) => { if (e) x.when = e; else delete x.when; })} />
            </Field>
            <div className="row-gap">
              <input className="grow" placeholder="說明" value={p.description ?? ""} onChange={(e) => editP(i, (x) => { x.description = e.target.value; })} />
              <button className="btn small ghost" onClick={() => edit((u) => { u.passives!.splice(i, 1); })}>刪除</button>
            </div>
            {issues.filter((x) => x.where.passiveId === p.id).map((x, k) => <div key={k} className={`issue ${x.level === "error" ? "err" : "warn"}`}>{x.message}</div>)}
          </div>
        ))}
      </div>
    </Section>
  );
}
