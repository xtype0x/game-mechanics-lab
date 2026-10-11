import { computeHit, contentReferences, printExpr, referencesTo, resolveStats, type DamageScale, type DepRef, type ModOp, type Project, type Scenario, type StatusDef } from "@gml/core";
import { GoLink, useFocus } from "../../nav";
import { useMemo, useState } from "react";
import { AI_VARS, Badge, DAMAGE_SCALES, elementLabel, ErrorBox, ExprField, Field, fmt, NumberField, refLabel, Section, TARGET_VARS, useBattleSetup, useElementOptions } from "@gml/ui";
import type { Updater } from "../../useProject";

const OPS: { value: ModOp; label: string }[] = [
  { value: "add", label: "加算" },
  { value: "pct", label: "百分比（乘基礎）" },
  { value: "mul", label: "獨立乘算" },
  { value: "override", label: "覆寫" },
];

const STAT_LABELS: Record<string, string> = {
  atk: "攻擊力", def: "防禦力", spd: "速度", critRate: "暴擊率", critDmg: "暴擊傷害", dmgBonus: "增傷", res: "抗性", resPen: "抗性穿透",
  vulnerability: "易傷", dmgReduction: "減傷", defIgnore: "無視防禦", effectHit: "效果命中", effectRes: "效果抵抗", breakEffect: "擊破特攻",
};

export function StatusEditor({ project, update }: { project: Project; update: Updater }) {
  const statuses = project.battle.statuses;
  const [selected, setSelected] = useState(statuses[0]?.id ?? "");
  const idx = statuses.findIndex((s) => s.id === selected);
  const st = statuses[idx];
  const { setup } = useBattleSetup(project);

  const refs = useMemo(() => contentReferences(project.battle), [project.battle]);
  const usage = useMemo(() => {
    const m = new Map<string, DepRef[]>();
    for (const st of statuses) m.set(st.id, referencesTo(refs, { kind: "status", id: st.id }));
    return m;
  }, [refs, statuses]);
  const elements = useElementOptions(project.battle.units);
  const categories = [...new Set(statuses.map((x) => x.category).filter((c): c is string => !!c))];
  useFocus(["status.effects"], (f) => { if (f.statusId && statuses.some((x) => x.id === f.statusId)) setSelected(f.statusId); });

  const statKeys = useMemo(() => {
    const keys = new Set<string>(Object.keys(STAT_LABELS));
    for (const u of project.battle.units) for (const k of Object.keys(u.stats)) keys.add(k);
    for (const s of setup?.damage.stats ?? []) keys.add(s.key);
    ["hp", "maxEnergy", "toughness", "startEnergy", "level"].forEach((k) => keys.delete(k));
    return [...keys];
  }, [project.battle.units, setup]);
  const stepIds = setup?.damage.steps.map((s) => ({ id: s.id, label: s.label })) ?? [];

  const edit = (fn: (s: StatusDef) => void) => update((p) => { const s = p.battle.statuses.find((x) => x.id === selected); if (s) fn(s); });

  return (
    <div className="tool-layout">
      <div className="workspace">
        <Section
          title={`狀態效果（${statuses.length}）`}
          actions={
            <button className="btn small" onClick={() => {
              let n = 1;
              while (statuses.some((s) => s.id === `status${n}`)) n++;
              const id = `status${n}`;
              update((p) => { p.battle.statuses.push({ id, name: `新狀態 ${n}`, kind: "buff", duration: 2, maxStacks: 1, modifiers: [] }); });
              setSelected(id);
            }}>＋ 新增狀態</button>
          }
        >
          <div className="status-list">
            {statuses.map((s) => (
              <button key={s.id} className={`status-item ${s.id === selected ? "on" : ""}`} onClick={() => setSelected(s.id)}>
                <strong>{s.name}</strong>
                <Badge tone={s.kind === "buff" ? "ok" : "warn"}>{s.kind === "buff" ? "增益" : "減益"}</Badge>
                <span className="muted small">{s.duration === 0 ? "永久" : `${s.duration} 回合`}{s.maxStacks > 1 ? `・最多 ${s.maxStacks} 層` : ""}{s.dot ? "・持續傷害" : ""}{s.skipTurn ? "・無法行動" : ""}{s.charm ? "・支配" : ""}{s.shield ? "・護盾" : ""}{s.revive ? "・復活" : ""}{s.toughnessLock ? "・鎖韌性" : ""}{s.category ? `・${s.category}` : ""}</span>
              </button>
            ))}
          </div>
        </Section>

        {st && (
          <Section
            title={`編輯：${st.name}`}
            actions={
              <button className="btn small ghost" disabled={(usage.get(st.id)?.length ?? 0) > 0} title={usage.get(st.id)?.length ? "有技能或條件正在使用，無法刪除" : ""}
                onClick={() => { if (confirm(`刪除「${st.name}」？`)) { update((p) => { p.battle.statuses.splice(idx, 1); }); setSelected(statuses.find((x) => x.id !== st.id)?.id ?? ""); } }}>
                刪除
              </button>
            }
          >
            <div className="grid-fields">
              <Field label="名稱"><input value={st.name} onChange={(e) => edit((s) => { s.name = e.target.value; })} /></Field>
              <Field label="類型">
                <select value={st.kind} onChange={(e) => edit((s) => { s.kind = e.target.value as StatusDef["kind"]; })}>
                  <option value="buff">增益（必定命中）</option>
                  <option value="debuff">減益（受效果命中／抵抗影響）</option>
                </select>
              </Field>
              <Field label="持續回合" hint="持有者每次回合結束時減 1；0 為永久"><NumberField value={st.duration} min={0} onChange={(v) => v >= 0 && edit((s) => { s.duration = Math.round(v); })} /></Field>
              <Field label="最大層數"><NumberField value={st.maxStacks} min={1} onChange={(v) => v >= 1 && edit((s) => { s.maxStacks = Math.round(v); })} /></Field>
            </div>
            <div className="grid-fields" style={{ marginTop: 10 }}>
              <label className="check"><input type="checkbox" checked={!!st.skipTurn} onChange={(e) => edit((s) => { if (e.target.checked) s.skipTurn = true; else delete s.skipTurn; })} />持有者無法行動（控制）</label>
              <label className="check"><input type="checkbox" checked={!!st.charm} onChange={(e) => edit((s) => { if (e.target.checked) s.charm = true; else delete s.charm; })} />支配：自動行動並攻擊自己的隊友</label>
              <label className="check" title="我方全員都有 → 失敗；敵方全員都有 → 勝利（事件單位不計）"><input type="checkbox" checked={!!st.defeatIfAll} onChange={(e) => edit((s) => { if (e.target.checked) s.defeatIfAll = true; else delete s.defeatIfAll; })} />全隊都帶此狀態時該隊落敗</label>
              <label className="check"><input type="checkbox" checked={!!st.dot} onChange={(e) => edit((s) => { if (e.target.checked) s.dot = { multiplier: 0.5, element: "fire" }; else delete s.dot; })} />持續傷害</label>
              <label className="check"><input type="checkbox" checked={!!st.shield} onChange={(e) => edit((s) => { if (e.target.checked) s.shield = { scale: "def", multiplier: 0.5, flat: 0 }; else delete s.shield; })} />護盾</label>
              <label className="check"><input type="checkbox" checked={!!st.revive} onChange={(e) => edit((s) => { if (e.target.checked) s.revive = { hpPct: 0.3 }; else delete s.revive; })} />致命傷時復活（消耗此狀態）</label>
              <label className="check"><input type="checkbox" checked={!!st.toughnessLock} onChange={(e) => edit((s) => { if (e.target.checked) s.toughnessLock = true; else delete s.toughnessLock; })} />韌性無法被削減</label>
              <label className="check"><input type="checkbox" checked={st.dispellable !== false} onChange={(e) => edit((s) => { if (e.target.checked) delete s.dispellable; else s.dispellable = false; })} />可被驅散</label>
            </div>
            <div className="grid-fields" style={{ marginTop: 10 }}>
              <Field label="分類" hint="對應角色的「狀態抵抗」；留空則不受分類抵抗影響">
                <input list="status-categories" className="mono" value={st.category ?? ""} placeholder="例如 freeze、control" onChange={(e) => edit((s) => { const v = e.target.value.trim(); if (v) s.category = v; else delete s.category; })} />
                <datalist id="status-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="自動解除" hint="施加者倒下或被擊破時解除（束縛、捕獲類）">
                <select value={st.release ?? ""} onChange={(e) => edit((s) => { if (e.target.value) s.release = e.target.value as NonNullable<StatusDef["release"]>; else delete s.release; })}>
                  <option value="">不自動解除</option>
                  <option value="sourceDeath">施加者倒下或被移除時</option>
                  <option value="sourceBreak">施加者被擊破、倒下或被移除時</option>
                </select>
              </Field>
            </div>
            {st.shield && (
              <div className="grid-fields" style={{ marginTop: 10 }}>
                <Field label="護盾依據（施加者）">
                  <select value={st.shield.scale} onChange={(e) => edit((s) => { s.shield!.scale = e.target.value as DamageScale; })}>
                    {DAMAGE_SCALES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select>
                </Field>
                <Field label="比例"><NumberField percent value={st.shield.multiplier} onChange={(v) => edit((s) => { s.shield!.multiplier = v; })} /></Field>
                <Field label="固定值"><NumberField value={st.shield.flat} onChange={(v) => edit((s) => { s.shield!.flat = v; })} /></Field>
              </div>
            )}
            {st.revive && (
              <div className="grid-fields" style={{ marginTop: 10 }}>
                <Field label="復活後生命比例"><NumberField percent value={st.revive.hpPct} min={0.01} max={1} onChange={(v) => edit((s) => { s.revive!.hpPct = Math.min(1, Math.max(0.01, v)); })} /></Field>
              </div>
            )}
            {st.dot && (
              <div className="grid-fields" style={{ marginTop: 10 }}>
                <Field label="每層傷害倍率" hint="以施加者施加當下的攻擊數值計算"><NumberField percent value={st.dot.multiplier} onChange={(v) => edit((s) => { s.dot!.multiplier = v; })} /></Field>
                <Field label="屬性">
                  <select value={st.dot.element} onChange={(e) => edit((s) => { s.dot!.element = e.target.value; })}>
                    {elements.map((el) => <option key={el} value={el}>{elementLabel(el)}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <h4 className="subhead">數值修正（每層）</h4>
            <div className="mod-list">
              {st.modifiers.map((m, i) => {
                const isStep = m.target.startsWith("step:");
                const isPct = !isStep && (m.op === "pct" || ["critRate", "critDmg", "dmgBonus", "res", "resPen", "vulnerability", "dmgReduction", "defIgnore", "effectHit", "effectRes", "breakEffect"].includes(m.target.slice(5)));
                return (
                  <div key={i} className="smod">
                  <div className="smod-row">
                    <select aria-label="對象" value={m.target} onChange={(e) => edit((s) => { s.modifiers[i]!.target = e.target.value; })}>
                      <optgroup label="持有者數值">
                        {statKeys.map((k) => <option key={k} value={`stat:${k}`}>{STAT_LABELS[k] ?? k}</option>)}
                      </optgroup>
                      <optgroup label="傷害乘區">
                        {stepIds.map((s) => <option key={s.id} value={`step:${s.id}`}>{s.label}</option>)}
                      </optgroup>
                    </select>
                    <select aria-label="運算" value={m.op} onChange={(e) => edit((s) => { s.modifiers[i]!.op = e.target.value as ModOp; })}>
                      {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <NumberField ariaLabel="數值" percent={isPct} value={m.value} onChange={(v) => edit((s) => { s.modifiers[i]!.value = v; })} />
                    {isStep ? (
                      <select aria-label="時機" value={m.role ?? "outgoing"} onChange={(e) => edit((s) => { s.modifiers[i]!.role = e.target.value as "outgoing" | "incoming"; })}>
                        <option value="outgoing">持有者造成傷害時</option>
                        <option value="incoming">持有者受到傷害時</option>
                      </select>
                    ) : <span />}
                    <button className="btn icon" aria-label="刪除修正" onClick={() => edit((s) => { s.modifiers.splice(i, 1); })}>✕</button>
                  </div>
                  <details className="smod-cond" open={!!(m.when || m.scaleBy)}>
                    <summary>條件與倍數{m.when || m.scaleBy ? "（已設定）" : ""}</summary>
                    <p className="muted small">只在傷害計算中生效（命中、持續傷害、擊破）。self 是持有者，target 是這次傷害的另一方（攻擊時為被攻擊者，受擊時為攻擊者）。可用：{AI_VARS}；{TARGET_VARS}</p>
                    <div className="grid-fields">
                      <Field label="條件（成立才套用）"><ExprField ariaLabel="修正條件" allowEmpty value={m.when} placeholder="例如 target.status.mark > 0" onChange={(e) => edit((s) => { if (e) s.modifiers[i]!.when = e; else delete s.modifiers[i]!.when; })} /></Field>
                      <Field label="倍數（數值 × 層數 × 倍數，限加算／百分比）"><ExprField ariaLabel="修正倍數" allowEmpty value={m.scaleBy} placeholder="例如 battle.count.summonId" onChange={(e) => edit((s) => { if (e) s.modifiers[i]!.scaleBy = e; else delete s.modifiers[i]!.scaleBy; })} /></Field>
                    </div>
                  </details>
                  </div>
                );
              })}
            </div>
            <button className="btn small" style={{ marginTop: 8 }} onClick={() => edit((s) => { s.modifiers.push({ target: "stat:atk", op: "pct", value: 0.1 }); })}>＋ 修正</button>
            <Field label="說明"><input value={st.description ?? ""} onChange={(e) => edit((s) => { s.description = e.target.value; })} /></Field>
          </Section>
        )}
      </div>

      <div className="results">
        <div className="results-head"><h2>預覽</h2></div>
        {st ? <Preview project={project} st={st} usage={usage.get(st.id) ?? []} /> : <p className="muted">選擇一個狀態。</p>}
      </div>
    </div>
  );
}

function Preview({ project, st, usage }: { project: Project; st: StatusDef; usage: DepRef[] }) {
  const { setup, error } = useBattleSetup(project);
  const allies = project.battle.units.filter((u) => u.team === "ally");
  const enemies = project.battle.units.filter((u) => u.team === "enemy");
  const [src, setSrc] = useState(allies[0]?.id ?? "");
  const [dst, setDst] = useState(enemies[0]?.id ?? "");
  const srcU = allies.find((u) => u.id === src);
  const dstU = enemies.find((u) => u.id === dst);

  const ticks = useMemo(() => {
    if (!setup || !st.dot || !srcU || !dstU) return null;
    try {
      return Array.from({ length: st.maxStacks }, (_, k) => {
        const sc: Scenario = { name: st.name, attacker: srcU.stats, defender: dstU.stats, skill: { name: st.name, type: "dot", element: st.dot!.element, multiplier: st.dot!.multiplier * (k + 1), hits: [1] }, flags: { broken: false }, modifiers: [] };
        return computeHit(setup.damage, sc, resolveStats(setup.damage, sc), 0, false).damage;
      });
    } catch (e) {
      return (e as Error).message;
    }
  }, [setup, st, srcU, dstU]);

  return (
    <>
      <Section title="效果摘要">
        <ul className="summary-list">
          <li>{st.kind === "buff" ? "增益：施加必定成功。" : "減益：成功率 = 基礎機率 ×（1 + 施加者效果命中）×（1 − 目標效果抵抗）。"}</li>
          <li>{st.duration === 0 ? "永久持續（不會到期，可被驅散、自動解除或隨持有者倒下清除）" : `持續 ${st.duration} 個持有者回合（每次持有者回合結束 −1）`}；重複施加會刷新{st.maxStacks > 1 ? `並疊加，最多 ${st.maxStacks} 層` : ""}。</li>
          {st.category && <li>分類「{st.category}」：目標的同名狀態抵抗會再降低成功率。</li>}
          {st.shield && <li>護盾：施加者{DAMAGE_SCALES.find((x) => x.value === st.shield!.scale)?.label} × {fmt(st.shield.multiplier * 100, 1)}% + {fmt(st.shield.flat, 0)}，先於生命值吸收傷害；重複施加取較大值。</li>}
          {st.revive && <li>受到致命傷害時改為回復 {fmt(st.revive.hpPct * 100, 0)}% 生命，並移除此狀態。</li>}
          {st.toughnessLock && <li>持有者的韌性無法被削減。</li>}
          {st.release && <li>{st.release === "sourceDeath" ? "施加者倒下或被移除時解除。" : "施加者被擊破、倒下或被移除時解除。"}</li>}
          {st.dispellable === false && <li>不會被驅散效果移除。</li>}
          {st.skipTurn && <li>持有者在回合開始時跳過行動。</li>}
          {st.charm && <li>支配：持有者的回合改由 AI 自動行動，敵我互換（攻擊自己的隊友、支援對方），不消耗或產生技能點；我方被支配時不能施放大招。{st.skipTurn ? "（同時無法行動時，無法行動優先。）" : ""}</li>}
          {st.dot && <li>持有者回合開始時受到持續傷害：施加者攻擊數值 × {fmt(st.dot.multiplier * 100, 0)}% × 層數，{elementLabel(st.dot.element)}屬性、不會暴擊。</li>}
          {st.modifiers.map((m, i) => <li key={i}>{m.target.startsWith("step:") ? `乘區「${m.target.slice(5)}」` : `數值「${STAT_LABELS[m.target.slice(5)] ?? m.target.slice(5)}」`} {OPS.find((o) => o.value === m.op)?.label} {fmt(m.value, 4)}（每層）{m.role === "incoming" ? "，於受到傷害時" : ""}{m.scaleBy ? `，再乘以 ${printExpr(m.scaleBy)}` : ""}{m.when ? `，僅在 ${printExpr(m.when)} 時` : ""}{m.when || m.scaleBy ? "（只在傷害計算中）" : ""}</li>)}
          {st.defeatIfAll && <li>存活的戰鬥單位全員都帶有此類狀態時，該隊立即落敗（我方失敗、敵方則我方勝利）。</li>}
          {st.modifiers.length === 0 && !st.dot && !st.skipTurn && !st.charm && !st.defeatIfAll && !st.shield && !st.revive && !st.toughnessLock && <li className="muted">目前沒有任何效果。</li>}
        </ul>
      </Section>
      <Section title={`使用此狀態的地方（${usage.length}）`}>
        {usage.length ? <ul className="summary-list">{usage.map((r, k) => <li key={k}><GoLink node={r.from}>{refLabel(r, project.battle.units)}</GoLink></li>)}</ul> : <p className="muted small">沒有技能或條件使用。可在「技能與目標規則編輯器」加入「施加狀態」效果。</p>}
      </Section>
      {st.dot && (
        <Section title="持續傷害試算（每次跳傷）">
          {error && <ErrorBox error={error} />}
          <div className="grid-fields">
            <Field label="施加者"><select value={src} onChange={(e) => setSrc(e.target.value)}>{allies.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            <Field label="目標"><select value={dst} onChange={(e) => setDst(e.target.value)}>{enemies.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          </div>
          {typeof ticks === "string" ? <ErrorBox error={ticks} /> : ticks && (
            <table className="table">
              <thead><tr><th>層數</th><th className="r">每跳傷害</th><th className="r">{st.duration} 回合合計</th></tr></thead>
              <tbody>{ticks.map((t, k) => <tr key={k}><td>{k + 1}</td><td className="r mono">{fmt(t, 0)}</td><td className="r mono">{fmt(t * st.duration, 0)}</td></tr>)}</tbody>
            </table>
          )}
          <p className="muted small">使用目前的傷害公式（乘區組合器）計算，不含施加後的增減益變化。目標以未擊破狀態計算。</p>
        </Section>
      )}
    </>
  );
}
