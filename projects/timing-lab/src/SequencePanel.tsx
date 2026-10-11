import { useState } from "react";
import { Timing } from "@gml/core";
import { NumberField } from "@gml/ui";
import { ATTACKS, PHASE_LABEL, attackLength, type AttackPhase } from "./attacks";
import type { Session } from "./session";

const int = (v: number) => Math.max(0, Math.round(v));

export function SequencePanel({ session, onChange, config, phase }: {
  session: Session;
  onChange: (fn: (draft: Session) => void) => void;
  config: Timing.TimingConfig;
  phase: { phase: AttackPhase; name?: string };
}) {
  const [sel, setSel] = useState(session.attacks[0]?.id ?? "");
  const def = session.attacks.find((a) => a.id === sel) ?? session.attacks[0];
  const edit = (fn: (a: Timing.AttackDef) => void) => onChange((d) => { const a = d.attacks.find((x) => x.id === def?.id); if (a) fn(a); });
  const nameOf = (id: string) => session.attacks.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="tl-seq">
      <h3>攻擊序列</h3>
      <ol className="tl-queue">
        {session.sequence.map((s, i) => (
          <li key={i}>
            <b>{nameOf(s.attack)}</b>
            <label className="tl-inline">間隔<NumberField value={s.gap} min={0} step={1} width={64} onChange={(v) => onChange((d) => { d.sequence[i]!.gap = int(v); })} ariaLabel="間隔幀數" />幀</label>
            <span className="tl-tools">
              <button type="button" className="tm-btn tm-mini" disabled={i === 0} aria-label="上移" onClick={() => onChange((d) => { const [x] = d.sequence.splice(i, 1); d.sequence.splice(i - 1, 0, x!); })}>↑</button>
              <button type="button" className="tm-btn tm-mini" disabled={i === session.sequence.length - 1} aria-label="下移" onClick={() => onChange((d) => { const [x] = d.sequence.splice(i, 1); d.sequence.splice(i + 1, 0, x!); })}>↓</button>
              <button type="button" className="tm-btn tm-mini" aria-label="刪除" onClick={() => onChange((d) => { d.sequence.splice(i, 1); })}>✕</button>
            </span>
          </li>
        ))}
        {session.sequence.length === 0 && <li className="tm-muted">序列是空的，從下方加入招式。</li>}
      </ol>
      <div className="tl-row">
        <select value="" aria-label="加入招式" onChange={(e) => { const v = e.target.value; if (v) onChange((d) => { d.sequence.push({ attack: v, gap: 30 }); }); }}>
          <option value="">＋ 加入招式…</option>
          {session.attacks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="tm-chip"><input type="checkbox" checked={session.loop} onChange={(e) => onChange((d) => { d.loop = e.target.checked; })} />循環播放</label>
      </div>

      <h3>動畫銜接（招式幀數）</h3>
      <p className="tm-muted tm-note">這些幀範圍直接驅動場景裡攻擊者的動作：前搖 → 預兆閃光 → 出招 → 收招。目前階段：<b>{PHASE_LABEL[phase.phase]}</b>{phase.name ? `（${phase.name}）` : ""}</p>
      {def && (
        <div className="tl-attack">
          <div className="tl-row">
            <select value={def.id} aria-label="選擇招式" onChange={(e) => setSel(e.target.value)}>
              {session.attacks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button type="button" className="tm-btn" disabled={!ATTACKS.some((a) => a.id === def.id)} onClick={() => {
              const orig = ATTACKS.find((a) => a.id === def.id);
              if (orig) onChange((d) => { const k = d.attacks.findIndex((a) => a.id === def.id); if (k >= 0) d.attacks[k] = structuredClone(orig); });
            }}>還原此招</button>
            <button type="button" className="tm-btn" onClick={() => {
              const id = `custom${Date.now().toString(36)}`;
              onChange((d) => { d.attacks.push({ ...structuredClone(def), id, name: `${def.name} 副本` }); });
              setSel(id);
            }}>複製為新招</button>
          </div>
          <div className="tl-grid">
            <label>名稱<input value={def.name} onChange={(e) => edit((a) => { a.name = e.target.value; })} /></label>
            <label>前搖（幀）<NumberField value={def.windup} min={0} step={1} width={72} onChange={(v) => edit((a) => { a.windup = int(v); })} ariaLabel="前搖" /></label>
            <label>預兆（幀）<NumberField value={def.telegraph} min={0} step={1} width={72} onChange={(v) => edit((a) => { a.telegraph = int(v); })} ariaLabel="預兆" /></label>
            <label>收招（幀）<NumberField value={def.recovery} min={0} step={1} width={72} onChange={(v) => edit((a) => { a.recovery = int(v); })} ariaLabel="收招" /></label>
          </div>
          <p className="tm-muted tm-note">全長 {attackLength(def)} 幀（{Math.round(Timing.framesToMs(attackLength(def), config.fps))}ms）；預兆是第一段命中前閃光的幀數。</p>
          {def.hits.map((h, i) => (
            <div key={i} className="tl-hit">
              <span>命中 {i + 1}</span>
              <label className="tl-inline">偏移<NumberField value={h.offset} min={0} step={1} width={64} onChange={(v) => edit((a) => { a.hits[i]!.offset = int(v); })} ariaLabel="偏移" /></label>
              <label className="tl-inline">傷害<NumberField value={h.damage ?? 1} min={0} width={56} onChange={(v) => edit((a) => { a.hits[i]!.damage = Math.max(0, v); })} ariaLabel="傷害" /></label>
              <span className="tl-tags">
                {config.tags.map((t) => (
                  <label key={t.id} className="tm-chip" style={{ borderColor: h.tags.includes(t.id) ? t.color : undefined }}>
                    <input type="checkbox" checked={h.tags.includes(t.id)} onChange={(e) => edit((a) => {
                      const tags = a.hits[i]!.tags;
                      if (e.target.checked) tags.push(t.id); else a.hits[i]!.tags = tags.filter((x) => x !== t.id);
                    })} />{t.name}
                  </label>
                ))}
              </span>
              <button type="button" className="tm-btn tm-mini" disabled={def.hits.length <= 1} aria-label="刪除命中" onClick={() => edit((a) => { a.hits.splice(i, 1); })}>✕</button>
            </div>
          ))}
          <button type="button" className="tm-btn" onClick={() => edit((a) => { const last = a.hits.length ? Math.max(...a.hits.map((h) => h.offset)) : 0; a.hits.push({ offset: last + 10, tags: [] }); })}>＋ 命中段</button>
        </div>
      )}
    </div>
  );
}
