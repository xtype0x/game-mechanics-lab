import type { UnitDef } from "@gml/core";
import { useState } from "react";
import "./equip.css";
import {
  DATA, MAX_SUB_ROLLS_EACH, MAX_SUB_ROLLS_TOTAL, PATH_NAME, PERCENT_KEYS, QUALITY_LABEL, SLOTS, SLOT_LABEL, SUMMARY_KEYS, TEMPLATE_LABEL,
  applyTemplate, defaultSel, findLightCone, findSet, hsrInfo, mainDef, slotKind, statLabel, subDef, subRollTotal, subValue,
  type CompiledUnit, type LoadoutSel, type RelicSlot, type SubSel, type TemplateId,
} from "@gml/data-hsr/equipment";
import { NumberField, elementLabel, fmt } from "@gml/ui";

const showValue = (key: string, op: "flat" | "pct", v: number) => (op === "pct" || PERCENT_KEYS.has(key) ? `${fmt(v * 100, 2)}%` : fmt(v, 1));
const showStat = (key: string, v: number) => (PERCENT_KEYS.has(key) ? `${fmt(v * 100, 2)}%` : fmt(v, 1));

interface Props { unit: UnitDef; sel: LoadoutSel; compiled: CompiledUnit; onChange: (s: LoadoutSel) => void }

/** Equipment editor for one ally: light cone, six relics, traces, set bonuses and the resulting stats. */
export function EquipPanel({ unit, sel, compiled, onChange }: Props) {
  const edit = (fn: (s: LoadoutSel) => void) => { const next = structuredClone(sel); fn(next); onChange(next); };
  const info = hsrInfo(unit);
  const counts = compiled.notes.counts;
  const usedSets = DATA.relicSets.filter((s) => (counts[s.id] ?? 0) > 0);

  return (
    <div className="equip">
      <p className="muted small">裝備資料為社群整理（未核實）。這裡只套用<strong>無條件的數值加成</strong>；帶觸發條件的效果會列出但尚未模擬。光錐固定 Lv80、遺器為 5★ +15。</p>
      <div className="equip-bar">
        <span className="small muted">一鍵配裝（通用範本，非特定角色推薦）：</span>
        {(Object.keys(TEMPLATE_LABEL) as TemplateId[]).map((t) => (
          <button key={t} type="button" className="btn small" onClick={() => onChange(applyTemplate(unit, sel, t))}>{TEMPLATE_LABEL[t]}</button>
        ))}
        <button type="button" className="btn small" onClick={() => onChange({ ...defaultSel(unit), traces: sel.traces })}>清除配裝</button>
      </div>

      <LightConeBlock unit={unit} sel={sel} edit={edit} path={info?.path ?? null} />

      <div className="equip-block">
        <h4>遺器</h4>
        {SLOTS.map((slot) => <RelicBlock key={slot} slot={slot} sel={sel} edit={edit} />)}
      </div>

      <div className="equip-block">
        <h4>套裝效果</h4>
        {usedSets.length === 0 && <p className="muted small">還沒選套裝。</p>}
        {usedSets.map((s) => {
          const n = counts[s.id] ?? 0;
          return (
            <div key={s.id}>
              <strong className="small">{s.name}（{n} 件）</strong>
              {s.tiers.map((t) => (
                <div key={t.pieces} className={`equip-set-tier ${n >= t.pieces ? "on" : "off"}`}>
                  {n >= t.pieces ? "✓ " : "・"}{t.pieces} 件：{t.desc}
                  {n >= t.pieces && t.conditional && <span className="pill warn">條件效果尚未模擬</span>}
                  {n >= t.pieces && !t.conditional && <span className="pill">已套用</span>}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="equip-block">
        <h4>行跡</h4>
        {info?.traces ? (
          <>
            <label className="check"><input type="checkbox" checked={sel.traces} onChange={(e) => edit((s) => { s.traces = e.target.checked; })} />套用行跡數值（滿行跡的屬性節點；預設開啟）</label>
            <div className="small muted">{info.traces.bonuses.map((b) => `${labelOf(b.key, b.op, b.element)} ${showValue(b.key, b.op, b.value)}`).join("、")}</div>
            <details>
              <summary>能力節點（{info.traces.abilityNodes.length}）：尚未模擬</summary>
              {info.traces.abilityNodes.map((n) => <p key={n.id} className="equip-desc"><strong>{n.name}</strong>：{n.desc}</p>)}
            </details>
          </>
        ) : (
          <p className="muted small">這個角色沒有行跡資料（只有「星穹鐵道」預設角色才有）。</p>
        )}
      </div>

      {compiled.notes.ignored.length > 0 && (
        <div className="equip-note">已略過（屬性與「{unit.element}」不符，不會折進增傷）：{compiled.notes.ignored.join("；")}</div>
      )}
      {compiled.errors.map((m, i) => <div key={i} className="issue err">✕ {m}</div>)}
      {compiled.warnings.map((m, i) => <div key={i} className="issue warn">! {m}</div>)}

      <div className="equip-block">
        <h4>數值總覽（基礎 → 最終）</h4>
        <table className="table equip-stats">
          <thead><tr><th>數值</th><th className="r">基礎</th><th className="r">最終</th></tr></thead>
          <tbody>
            {SUMMARY_KEYS.map(({ key, label }) => {
              const a = unit.stats[key] ?? 0;
              const b = compiled.unit.stats[key] ?? 0;
              return <tr key={key}><td>{label}</td><td className="r">{showStat(key, a)}</td><td className={`r ${b !== a ? "up" : ""}`}>{showStat(key, b)}</td></tr>;
            })}
          </tbody>
        </table>
        <p className="muted small">最終 = 基礎 ×（1 + 百分比加成）+ 固定加成，不取整（規格 loadout.md）。</p>
      </div>
    </div>
  );
}

function labelOf(key: string, op: "flat" | "pct", element?: string) {
  const m = SUMMARY_KEYS.find((x) => x.key === key)?.label ?? key;
  return element ? `${elementLabel(element)}屬性增傷` : op === "pct" ? `${m}%` : m;
}

function LightConeBlock({ unit, sel, edit, path }: { unit: UnitDef; sel: LoadoutSel; edit: (fn: (s: LoadoutSel) => void) => void; path: string | null }) {
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");
  const lc = findLightCone(sel.lc);
  const filtered = !all && path !== null;
  const list = DATA.lightCones
    .filter((x) => x.id === sel.lc || ((!filtered || x.path === path) && x.name.includes(q.trim())))
    .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name, "zh-Hant"));
  const rank = lc?.ranks.find((r) => r.rank === sel.rank) ?? lc?.ranks[0];
  return (
    <div className="equip-block">
      <h4>光錐（Lv80）</h4>
      <div className="equip-row">
        <input type="search" aria-label="搜尋光錐" placeholder="搜尋光錐名稱" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 120px" }} />
        {path !== null && <label className="check small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />全部命途</label>}
      </div>
      <div className="equip-row">
        <select aria-label="光錐" value={sel.lc ?? ""} onChange={(e) => edit((s) => { s.lc = e.target.value || null; })}>
          <option value="">（不裝備光錐）</option>
          {list.map((x) => <option key={x.id} value={x.id}>{x.rarity}★ {x.name}・{PATH_NAME[x.path] ?? x.path}</option>)}
        </select>
        <select aria-label="疊影" value={sel.rank} onChange={(e) => edit((s) => { s.rank = Number(e.target.value); })} disabled={!lc}>
          {[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>疊影 {r}</option>)}
        </select>
      </div>
      <p className="muted small">{filtered ? `目前只列出「${PATH_NAME[path!] ?? path}」命途（${unit.name}）。` : path === null ? "這個角色沒有命途資料，列出全部光錐。" : "列出全部命途。"}共 {list.length} 個。</p>
      {lc && rank && (
        <>
          <div className="small">基礎：生命 {fmt(lc.base.hp, 1)}・攻擊 {fmt(lc.base.atk, 1)}・防禦 {fmt(lc.base.def, 1)}
            {rank.bonuses.length > 0 && <>；無條件加成：{rank.bonuses.map((b) => `${labelOf(b.key, b.op, b.element)} ${showValue(b.key, b.op, b.value)}`).join("、")}</>}
          </div>
          <div className="equip-desc">{rank.desc}</div>
          {lc.conditional && <div className="equip-note">條件效果尚未模擬：被動只有上方「無條件加成」會套用（沒列出就是沒有）。</div>}
        </>
      )}
    </div>
  );
}

function RelicBlock({ slot, sel, edit }: { slot: RelicSlot; sel: LoadoutSel; edit: (fn: (s: LoadoutSel) => void) => void }) {
  const r = sel.relics[slot];
  const mains = DATA.mainStats[slot] ?? [];
  const sets = DATA.relicSets.filter((s) => s.kind === slotKind(slot));
  const main = mainDef(slot, r.main);
  const total = subRollTotal(r);
  const set = (fn: (r: LoadoutSel["relics"][RelicSlot]) => void) => edit((s) => fn(s.relics[slot]));
  const setSub = (i: number, fn: (s: SubSel) => void) => set((x) => { const t = x.subs[i]; if (t) fn(t); });
  return (
    <details open={!!(r.setId || r.main)}>
      <summary>
        {SLOT_LABEL[slot]}：{findSet(r.setId)?.name ?? "未選套裝"}・{main ? `${statLabel(main)} ${showValue(main.key, main.op, main.value)}` : "未選主詞條"}
        {r.subs.length > 0 && `・副詞條 ${total}/${MAX_SUB_ROLLS_TOTAL}`}
      </summary>
      <div className="equip-row" style={{ marginTop: 6 }}>
        <select aria-label={`${SLOT_LABEL[slot]}套裝`} value={r.setId ?? ""} onChange={(e) => set((x) => { x.setId = e.target.value || null; })}>
          <option value="">（無套裝）</option>
          {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          aria-label={`${SLOT_LABEL[slot]}主詞條`}
          value={r.main ?? ""}
          onChange={(e) => set((x) => { x.main = e.target.value || null; x.subs = x.subs.filter((s) => s.property !== x.main); })}
        >
          <option value="">（無主詞條）</option>
          {mains.map((m) => <option key={m.property} value={m.property}>{statLabel(m)} {showValue(m.key, m.op, m.value)}</option>)}
        </select>
      </div>
      <div className="equip-sub" style={{ marginTop: 6 }}>
        {[0, 1, 2, 3].map((i) => {
          const s = r.subs[i];
          const taken = new Set([r.main, ...r.subs.filter((_, j) => j !== i).map((x) => x.property)]);
          const options = DATA.subStats.filter((d) => !taken.has(d.property));
          const d = s ? subDef(s.property) : undefined;
          const maxRolls = s ? Math.max(1, Math.min(MAX_SUB_ROLLS_EACH, MAX_SUB_ROLLS_TOTAL - (total - s.rolls))) : 1;
          return (
            <SubRow
              key={i}
              slot={slot}
              index={i}
              sub={s}
              d={d}
              options={options}
              maxRolls={maxRolls}
              onProperty={(p) => set((x) => {
                if (!p) { x.subs.splice(i, 1); return; }
                const room = Math.max(1, MAX_SUB_ROLLS_TOTAL - subRollTotal(x));
                if (x.subs[i]) x.subs[i]!.property = p; else x.subs.push({ property: p, rolls: Math.min(1, room), quality: 1, manual: null });
              })}
              onSub={(fn) => setSub(i, fn)}
            />
          );
        })}
      </div>
      {total > MAX_SUB_ROLLS_TOTAL && r.subs.every((s) => s.manual === null) && <div className="equip-note">副詞條共 {total} 次，超過遊戲內 +15 的 {MAX_SUB_ROLLS_TOTAL} 次（4 次初始 + 5 次強化）。</div>}
    </details>
  );
}

function SubRow({ slot, index, sub, d, options, maxRolls, onProperty, onSub }: {
  slot: RelicSlot; index: number; sub: SubSel | undefined; d: ReturnType<typeof subDef>; options: typeof DATA.subStats;
  maxRolls: number; onProperty: (p: string) => void; onSub: (fn: (s: SubSel) => void) => void;
}) {
  const name = `${SLOT_LABEL[slot]}副詞條 ${index + 1}`;
  return (
    <>
      <select aria-label={name} value={sub?.property ?? ""} onChange={(e) => onProperty(e.target.value)}>
        <option value="">（空）</option>
        {options.concat(d && !options.includes(d) ? [d] : []).map((o) => <option key={o.property} value={o.property}>{statLabel(o)}</option>)}
      </select>
      {sub && d ? (
        <>
          <select aria-label={`${name}強化次數`} value={Math.min(sub.rolls, Math.max(maxRolls, sub.rolls))} disabled={sub.manual !== null} onChange={(e) => onSub((s) => { s.rolls = Number(e.target.value); })}>
            {Array.from({ length: Math.max(maxRolls, sub.rolls) }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n} 次</option>)}
          </select>
          <select
            aria-label={`${name}品質`}
            value={sub.manual !== null ? "m" : String(sub.quality)}
            onChange={(e) => onSub((s) => { if (e.target.value === "m") s.manual = subValue({ ...s, manual: null }); else { s.manual = null; s.quality = Number(e.target.value); } })}
          >
            {QUALITY_LABEL.map((l, q) => <option key={q} value={q}>{l}</option>)}
            <option value="m">手動</option>
          </select>
          {sub.manual !== null ? (
            <NumberField ariaLabel={`${name}數值`} percent={d.op === "pct" || PERCENT_KEYS.has(d.key)} value={sub.manual} onChange={(v) => onSub((s) => { s.manual = v; })} />
          ) : (
            <span className="val">{showValue(d.key, d.op, subValue(sub))}</span>
          )}
        </>
      ) : (
        <><span /><span /><span /></>
      )}
    </>
  );
}
