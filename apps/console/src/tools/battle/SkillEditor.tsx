import { printExpr, type BattleIssue, type DepRef, type Effect, type Num, type PassiveDef, type SkillDef, type SkillType, type StatusDef, type UnitDef } from "@gml/core";
import { useState } from "react";
import { GoLink } from "../../nav";
import { Badge, Field, NumberField, Section } from "../../ui";
import { ExprField } from "../common";
import { elementLabel } from "./common";
import { useElementOptions } from "./elements";
import { AI_VARS, DAMAGE_EFFECT_SCALES, EFFECT_GROUPS, EFFECT_KINDS, SKILL_TYPES, TARGETING, TARGET_MODES, TARGET_VARS, TRIGGERS, TRIGGER_SUBJECT, defaultEffect, nextId } from "./meta";

type Edit = (fn: (u: UnitDef) => void) => void;

export function SkillList({ unit, units, edit, statuses, issues, refs, open, setOpen }: {
  unit: UnitDef; units: UnitDef[]; edit: Edit; statuses: StatusDef[]; issues: BattleIssue[]; refs: DepRef[];
  open: string | null; setOpen: (id: string | null) => void;
}) {
  const editSkill = (id: string, fn: (s: SkillDef) => void) => edit((u) => { const s = u.skills.find((x) => x.id === id); if (s) fn(s); });
  const elements = useElementOptions(units);
  // Who points at this skill: own passives/AI, and other units' "next action" effects.
  const usedBy = (id: string) => refs.filter((r) => r.to.kind === "skill" && r.to.id === id && (r.to.unitId === unit.id || (r.to.unitId === undefined && r.from.unitId !== unit.id)));

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
          const users = usedBy(sk.id);
          return (
            <div key={sk.id} id={`skill-${sk.id}`} className={`skill-card ${isOpen ? "open" : ""} ${skIssues.some((x) => x.level === "error") ? "has-issue" : ""}`}>
              <button className="skill-head" onClick={() => setOpen(isOpen ? null : sk.id)}>
                <span className="caret">{isOpen ? "▾" : "▸"}</span>
                <strong>{sk.name}</strong>
                <Badge tone={sk.type === "ultimate" ? "warn" : sk.type === "followup" ? "info" : "muted"}>{SKILL_TYPES.find((t) => t.value === sk.type)?.label.replace("（由被動觸發）", "") ?? sk.type}</Badge>
                <span className="muted small">{summarize(sk, statuses, units)}</span>
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
                        {elements.map((el) => <option key={el} value={el}>{elementLabel(el)}</option>)}
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
                        unit={unit}
                        units={units}
                        statuses={statuses}
                        first={k === 0}
                        last={k === sk.effects.length - 1}
                        onChange={(ne) => editSkill(sk.id, (s) => { s.effects[k] = ne; })}
                        onMove={(d) => editSkill(sk.id, (s) => { const [x] = s.effects.splice(k, 1); s.effects.splice(k + d, 0, x!); })}
                        onRemove={() => editSkill(sk.id, (s) => { s.effects.splice(k, 1); })}
                      />
                    ))}
                  </div>
                  <div className="effect-add">
                    {EFFECT_GROUPS.map((g) => (
                      <div key={g.label} className="row-gap">
                        <span className="muted small add-label">{g.label}</span>
                        {g.kinds.map((k) => (
                          <button key={k} className="btn small" onClick={() => editSkill(sk.id, (s) => {
                            s.effects.push(defaultEffect(k, statuses[0]?.id ?? "", { unitId: units.find((x) => x.team === unit.team && x.id !== unit.id)?.id ?? unit.id, skillId: unit.skills.find((x) => x.id !== sk.id)?.id ?? sk.id }));
                          })}>＋ {EFFECT_KINDS.find((x) => x.value === k)?.label}</button>
                        ))}
                      </div>
                    ))}
                  </div>
                  <Field label="說明"><textarea rows={2} value={sk.description ?? ""} onChange={(e) => editSkill(sk.id, (s) => { s.description = e.target.value; })} /></Field>
                  {users.length > 0 && (
                    <p className="small used-by">被使用：{users.map((r, k) => (
                      <span key={k}>{k > 0 && "、"}<GoLink node={r.from}>{refLabel(r, units)}</GoLink></span>
                    ))}</p>
                  )}
                  <div className="row-gap">
                    <code className="muted small">ID：{sk.id}</code>
                    <span className="spacer" />
                    <button className="btn small ghost" disabled={i === 0} onClick={() => edit((u) => { const [x] = u.skills.splice(i, 1); u.skills.splice(i - 1, 0, x!); })}>上移</button>
                    <button className="btn small ghost" disabled={i === unit.skills.length - 1} onClick={() => edit((u) => { const [x] = u.skills.splice(i, 1); u.skills.splice(i + 1, 0, x!); })}>下移</button>
                    <button
                      className="btn small ghost"
                      disabled={users.length > 0}
                      title={users.length ? `使用中：${users.map((r) => refLabel(r, units)).join("、")}` : ""}
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

const VIA_LABEL: Record<DepRef["via"], string> = {
  applies: "施加", detonates: "引爆", adjusts: "調整層數", summons: "召喚", dismisses: "移除", queues: "指定下次行動", casts: "被動施放", ai: "AI 規則", condition: "條件引用", roster: "出場",
};

export function refLabel(r: DepRef, units: UnitDef[]): string {
  const owner = units.find((u) => u.id === (r.from.unitId ?? r.from.id));
  const name = r.from.kind === "skill" ? `${owner?.name ?? "?"}・${owner?.skills.find((s) => s.id === r.from.id)?.name ?? r.from.id}`
    : r.from.kind === "passive" ? `${owner?.name ?? "?"}・被動 ${owner?.passives?.find((p) => p.id === r.from.id)?.name ?? r.from.id}`
    : r.from.kind === "unit" ? owner?.name ?? r.from.id
    : r.from.id ? `戰鬥 ${r.from.id}` : "目前戰鬥";
  return `${name}（${VIA_LABEL[r.via]}）`;
}

/** A number field that also shows formula values (rules 0.9 §16.1); formulas are edited in the project file. */
function NumOrExpr({ value, onChange, percent, fallback }: { value: Num; onChange: (v: number) => void; percent?: boolean; fallback: number }) {
  if (typeof value === "number") return <NumberField percent={percent} value={value} onChange={onChange} />;
  const text = printExpr(value);
  return (
    <span className="row">
      <Badge tone="info">表達式</Badge>
      <code className="mono small" title={text}>{text}</code>
      <button className="btn small" onClick={() => onChange(fallback)}>改為數字</button>
    </span>
  );
}

const numText = (n: Num, f: (x: number) => string) => (typeof n === "number" ? f(n) : "（公式）");

function summarize(sk: SkillDef, statuses: StatusDef[], units: UnitDef[]): string {
  return sk.effects.map((e) => {
    const t = "target" in e ? TARGET_MODES.find((m) => m.value === e.target)?.label ?? e.target : "";
    const uname = (id: string) => units.find((u) => u.id === id)?.name ?? id;
    switch (e.kind) {
      case "damage": return `${t} ${numText(e.multiplier, (x) => `${Math.round(x * 100)}%`)}${e.scale && e.scale !== "atk" ? `（${DAMAGE_EFFECT_SCALES.find((x) => x.value === e.scale)?.label}）` : ""}`;
      case "heal": return `治療${t}`;
      case "status": return `${statuses.find((s) => s.id === e.statusId)?.name ?? e.statusId}→${t}`;
      case "advance": return `${t}提前 ${numText(e.amount, (x) => `${Math.round(x * 100)}%`)}`;
      case "energy": return `${t}能量 +${numText(e.amount, String)}`;
      case "dispel": return `驅散${t}${e.statusKind === "buff" ? "增益" : "減益"}`;
      case "detonate": return `引爆${t}持續傷害 ×${numText(e.ratio, String)}`;
      case "summon": return `召喚 ${uname(e.unitId)}×${e.count}`;
      case "dismiss": return e.unitId ? `移除 ${uname(e.unitId)}` : "移除自己";
      case "queueSkill": return `${t}下次用 ${e.skillId}`;
      case "counter": return `${e.key} ${typeof e.value !== "number" ? (e.op === "add" ? "+= " : "= ") + "（公式）" : e.op === "add" ? (e.value >= 0 ? "+" : "") + e.value : "= " + e.value}`;
      case "sp": return `技能點 ${typeof e.amount !== "number" ? "（公式）" : (e.amount >= 0 ? "+" : "") + e.amount}`;
      case "hpCost": return `${t}${e.op === "lose" ? "消耗生命" : "設定生命"}`;
      case "statusAdjust": return `${t}調整「${statuses.find((s) => s.id === e.statusId)?.name ?? e.statusId}」`;
    }
  }).join("、");
}

function EffectRow({ effect: e, unit, units, statuses, first, last, onChange, onMove, onRemove }: {
  effect: Effect; unit: UnitDef; units: UnitDef[]; statuses: StatusDef[]; first: boolean; last: boolean;
  onChange: (e: Effect) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const set = <K extends string>(k: K, v: unknown) => onChange({ ...e, [k]: v } as Effect);
  const unset = (k: string) => { const copy = { ...e } as Record<string, unknown>; delete copy[k]; onChange(copy as Effect); };
  const sameTeam = units.filter((u) => u.team === unit.team);
  const statusSelect = (value: string, onPick: (v: string) => void, allowAny = false) => (
    <select value={value} onChange={(ev) => onPick(ev.target.value)}>
      {allowAny && <option value="">全部持續傷害</option>}
      {value && !statuses.some((s) => s.id === value) && <option value={value}>（不存在）{value}</option>}
      {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
  // Skills that a "next action" effect can name: the possible targets' skills.
  const queueTargets = "target" in e && (e.target === "enemy" || e.target === "blast" || e.target === "allEnemies") ? units.filter((u) => u.team !== unit.team) : sameTeam;
  const queueSkills = [...new Map(queueTargets.flatMap((u) => u.skills.map((s) => [s.id, `${s.name}（${u.name}）`] as const))).entries()];

  return (
    <div className="effect-row">
      <div className="effect-top">
        <Badge tone="info">{EFFECT_KINDS.find((k) => k.value === e.kind)?.label}</Badge>
        {"target" in e ? (
          <select aria-label="作用對象" value={e.target} onChange={(ev) => set("target", ev.target.value)}>
            {TARGET_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        ) : <span className="muted small">{e.kind === "sp" ? "作用於我方共用技能點" : "作用於施放者的隊伍"}</span>}
        <span className="spacer" />
        <button className="btn icon" aria-label="上移" disabled={first} onClick={() => onMove(-1)}>↑</button>
        <button className="btn icon" aria-label="下移" disabled={last} onClick={() => onMove(1)}>↓</button>
        <button className="btn icon" aria-label="刪除效果" onClick={onRemove}>✕</button>
      </div>
      <div className="grid-fields">
        {e.kind === "damage" && (
          <>
            <Field label="倍率"><NumOrExpr percent fallback={1} value={e.multiplier} onChange={(v) => set("multiplier", v)} /></Field>
            <Field label="倍率依據" hint="非攻擊力時，攻擊力的增減益不會套用；目標生命於每段命中時讀取">
              <select value={e.scale ?? "atk"} onChange={(ev) => (ev.target.value === "atk" ? unset("scale") : set("scale", ev.target.value))}>
                {DAMAGE_EFFECT_SCALES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="削韌"><NumOrExpr fallback={10} value={e.toughness} onChange={(v) => set("toughness", v)} /></Field>
            {e.target === "blast" && <Field label="相鄰倍率"><NumOrExpr percent fallback={0} value={e.adjMultiplier ?? 0} onChange={(v) => set("adjMultiplier", v)} /></Field>}
            {e.target === "blast" && <Field label="相鄰削韌"><NumOrExpr fallback={0} value={e.adjToughness ?? 0} onChange={(v) => set("adjToughness", v)} /></Field>}
            <Field label="分段比例" hint="例如 0.3, 0.3, 0.4；留空為單段">
              <input
                className="mono"
                defaultValue={(e.hits ?? []).join(", ")}
                key={(e.hits ?? []).join(",")}
                placeholder="單段"
                onBlur={(ev) => {
                  const parts = ev.target.value.split(/[,，\s]+/).filter(Boolean).map(Number);
                  if (!parts.length) unset("hits");
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
            <Field label="比例"><NumOrExpr percent fallback={1} value={e.multiplier} onChange={(v) => set("multiplier", v)} /></Field>
            <Field label="固定值"><NumOrExpr fallback={0} value={e.flat} onChange={(v) => set("flat", v)} /></Field>
          </>
        )}
        {e.kind === "status" && (
          <>
            <Field label="狀態">{statusSelect(e.statusId, (v) => set("statusId", v))}</Field>
            <Field label="基礎機率"><NumOrExpr percent fallback={1} value={e.chance} onChange={(v) => set("chance", v)} /></Field>
          </>
        )}
        {e.kind === "advance" && <Field label="提前比例" hint="完整行動值的百分比；100% 為立即行動"><NumOrExpr percent fallback={0.25} value={e.amount} onChange={(v) => set("amount", v)} /></Field>}
        {e.kind === "energy" && <Field label="能量"><NumOrExpr fallback={10} value={e.amount} onChange={(v) => set("amount", v)} /></Field>}
        {e.kind === "dispel" && (
          <>
            <Field label="驅散種類">
              <select value={e.statusKind} onChange={(ev) => set("statusKind", ev.target.value)}>
                <option value="buff">增益</option>
                <option value="debuff">減益</option>
              </select>
            </Field>
            <Field label="數量" hint="從最新的開始；0 為全部"><NumberField value={e.count} min={0} onChange={(v) => set("count", Math.max(0, Math.round(v)))} /></Field>
          </>
        )}
        {e.kind === "detonate" && (
          <>
            <Field label="狀態">{statusSelect(e.statusId ?? "", (v) => (v ? set("statusId", v) : unset("statusId")), true)}</Field>
            <Field label="結算比例" hint="一跳傷害的倍數"><NumOrExpr percent fallback={1} value={e.ratio} onChange={(v) => set("ratio", v)} /></Field>
          </>
        )}
        {e.kind === "summon" && (
          <>
            <Field label="召喚單位">
              <select value={e.unitId} onChange={(ev) => set("unitId", ev.target.value)}>
                {!sameTeam.some((u) => u.id === e.unitId) && <option value={e.unitId}>（不存在或不同陣營）{e.unitId}</option>}
                {sameTeam.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="數量" hint="場上人數達上限時停止"><NumberField value={e.count} min={1} onChange={(v) => set("count", Math.max(1, Math.round(v)))} /></Field>
            {sameTeam.some((u) => u.id === e.unitId) && <p className="small"><GoLink node={{ kind: "unit", id: e.unitId }}>編輯 {units.find((u) => u.id === e.unitId)!.name} →</GoLink></p>}
          </>
        )}
        {e.kind === "dismiss" && (
          <Field label="移除對象">
            <select value={e.unitId ?? ""} onChange={(ev) => (ev.target.value ? set("unitId", ev.target.value) : unset("unitId"))}>
              <option value="">施放者自己（例如自爆）</option>
              {sameTeam.map((u) => <option key={u.id} value={u.id}>同隊所有「{u.name}」</option>)}
            </select>
          </Field>
        )}
        {e.kind === "queueSkill" && (
          <Field label="下一次行動使用" hint="只對敵人 AI 有效；搭配「行動提前 100%」即為插隊">
            <select value={e.skillId} onChange={(ev) => set("skillId", ev.target.value)}>
              {!queueSkills.some(([id]) => id === e.skillId) && <option value={e.skillId}>（目標沒有）{e.skillId}</option>}
              {queueSkills.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
        )}
        {e.kind === "counter" && (
          <>
            <Field label="計數器名稱" hint="條件中寫 self.counter.名稱"><input className="mono" value={e.key} onChange={(ev) => set("key", ev.target.value.replace(/[^A-Za-z0-9_]/g, ""))} /></Field>
            <Field label="運算">
              <select value={e.op} onChange={(ev) => set("op", ev.target.value)}>
                <option value="add">增加</option>
                <option value="set">設為</option>
              </select>
            </Field>
            <Field label="數值"><NumOrExpr fallback={1} value={e.value} onChange={(v) => set("value", v)} /></Field>
          </>
        )}
        {e.kind === "sp" && <Field label="技能點變化" hint="負值為消耗我方技能點"><NumOrExpr fallback={-1} value={e.amount} onChange={(v) => set("amount", Math.round(v))} /></Field>}
        {(e.kind === "hpCost" || e.kind === "statusAdjust") && <p className="muted small">此效果的欄位請在專案檔（JSON）中編輯。</p>}
        {(e.when || (e.kind !== "status" && e.chance !== undefined) || (e.kind === "damage" && e.onHit?.length)) && <p className="muted small">此效果帶有條件、機率或命中附帶效果（規則 0.9），請在專案檔（JSON）中編輯。</p>}
      </div>
    </div>
  );
}

const FOE_SKILL_TYPES: { value: SkillType; label: string }[] = [
  { value: "basic", label: "普攻" }, { value: "skill", label: "戰技" }, { value: "ultimate", label: "大招" }, { value: "followup", label: "追加攻擊" },
];

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
          <div key={p.id} id={`passive-${p.id}`} className="passive-card">
            <div className="grid-fields">
              <Field label="名稱"><input value={p.name} onChange={(e) => editP(i, (x) => { x.name = e.target.value; })} /></Field>
              <Field label="觸發時機">
                <select value={p.on} onChange={(e) => editP(i, (x) => { x.on = e.target.value as PassiveDef["on"]; if (x.on !== "foeAction") delete x.skillTypes; })}>
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
            {p.on === "foeAction" && (
              <Field label="計入的對手技能類型（都不選為全部）">
                <div className="chips">
                  {FOE_SKILL_TYPES.map((t) => {
                    const on = p.skillTypes?.includes(t.value) ?? false;
                    return <button key={t.value} className={`chip-btn ${on ? "on" : ""}`} onClick={() => editP(i, (x) => {
                      const next = on ? (x.skillTypes ?? []).filter((v) => v !== t.value) : [...(x.skillTypes ?? []), t.value];
                      if (next.length) x.skillTypes = next; else delete x.skillTypes;
                    })}>{t.label}</button>;
                  })}
                </div>
              </Field>
            )}
            <Field label={`額外條件（選填）。可用：${AI_VARS}；觸發對象（${TRIGGER_SUBJECT[p.on]}）：${TARGET_VARS}`}>
              <ExprField allowEmpty value={p.when} placeholder="例如 self.counter.charge >= 3、target.status.mark > 0" onChange={(e) => editP(i, (x) => { if (e) x.when = e; else delete x.when; })} />
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
