import { useState } from "react";
import { Timing } from "@gml/core";
import { NumberField } from "@gml/ui";
import { useLocale } from "@gml/ui/i18n";
import { attackLibrary, attackLength, type AttackPhase } from "./attacks";
import { useText } from "./i18n";
import type { Session } from "./session";

const int = (v: number) => Math.max(0, Math.round(v));

export function SequencePanel({ session, onChange, config, phase }: {
  session: Session;
  onChange: (fn: (draft: Session) => void) => void;
  config: Timing.TimingConfig;
  phase: { phase: AttackPhase; name?: string };
}) {
  const T = useText();
  const t = T.sequence;
  const [locale] = useLocale();
  const [sel, setSel] = useState(session.attacks[0]?.id ?? "");
  const def = session.attacks.find((a) => a.id === sel) ?? session.attacks[0];
  const edit = (fn: (a: Timing.AttackDef) => void) => onChange((d) => { const a = d.attacks.find((x) => x.id === def?.id); if (a) fn(a); });
  const nameOf = (id: string) => session.attacks.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="tl-seq">
      <h3>{t.title}</h3>
      <ol className="tl-queue">
        {session.sequence.map((s, i) => (
          <li key={i}>
            <b>{nameOf(s.attack)}</b>
            <label className="tl-inline">{t.gap}<NumberField value={s.gap} min={0} step={1} width={64} onChange={(v) => onChange((d) => { d.sequence[i]!.gap = int(v); })} ariaLabel={t.gapLabel} />{t.gapUnit}</label>
            <span className="tl-tools">
              <button type="button" className="tm-btn tm-mini" disabled={i === 0} aria-label={t.moveUp} onClick={() => onChange((d) => { const [x] = d.sequence.splice(i, 1); d.sequence.splice(i - 1, 0, x!); })}>↑</button>
              <button type="button" className="tm-btn tm-mini" disabled={i === session.sequence.length - 1} aria-label={t.moveDown} onClick={() => onChange((d) => { const [x] = d.sequence.splice(i, 1); d.sequence.splice(i + 1, 0, x!); })}>↓</button>
              <button type="button" className="tm-btn tm-mini" aria-label={t.delete} onClick={() => onChange((d) => { d.sequence.splice(i, 1); })}>✕</button>
            </span>
          </li>
        ))}
        {session.sequence.length === 0 && <li className="tm-muted">{t.empty}</li>}
      </ol>
      <div className="tl-row">
        <select value="" aria-label={t.addMoveLabel} onChange={(e) => { const v = e.target.value; if (v) onChange((d) => { d.sequence.push({ attack: v, gap: 30 }); }); }}>
          <option value="">{t.addMoveOption}</option>
          {session.attacks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="tm-chip"><input type="checkbox" checked={session.loop} onChange={(e) => onChange((d) => { d.loop = e.target.checked; })} />{t.loopPlay}</label>
      </div>

      <h3>{t.animTitle}</h3>
      <p className="tm-muted tm-note">{t.animNote(T.phase[phase.phase], phase.name || null)}</p>
      {def && (
        <div className="tl-attack">
          <div className="tl-row">
            <select value={def.id} aria-label={t.selectMove} onChange={(e) => setSel(e.target.value)}>
              {session.attacks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button type="button" className="tm-btn" disabled={!attackLibrary(locale).some((a) => a.id === def.id)} onClick={() => {
              const orig = attackLibrary(locale).find((a) => a.id === def.id);
              if (orig) onChange((d) => { const k = d.attacks.findIndex((a) => a.id === def.id); if (k >= 0) d.attacks[k] = structuredClone(orig); });
            }}>{t.restoreMove}</button>
            <button type="button" className="tm-btn" onClick={() => {
              const id = `custom${Date.now().toString(36)}`;
              onChange((d) => { d.attacks.push({ ...structuredClone(def), id, name: `${def.name}${t.copySuffix}` }); });
              setSel(id);
            }}>{t.cloneMove}</button>
          </div>
          <div className="tl-grid">
            <label>{t.name}<input value={def.name} onChange={(e) => edit((a) => { a.name = e.target.value; })} /></label>
            <label>{t.windup}<NumberField value={def.windup} min={0} step={1} width={72} onChange={(v) => edit((a) => { a.windup = int(v); })} ariaLabel={t.windupLabel} /></label>
            <label>{t.telegraph}<NumberField value={def.telegraph} min={0} step={1} width={72} onChange={(v) => edit((a) => { a.telegraph = int(v); })} ariaLabel={t.telegraphLabel} /></label>
            <label>{t.recovery}<NumberField value={def.recovery} min={0} step={1} width={72} onChange={(v) => edit((a) => { a.recovery = int(v); })} ariaLabel={t.recoveryLabel} /></label>
          </div>
          <p className="tm-muted tm-note">{t.lengthNote(attackLength(def), Math.round(Timing.framesToMs(attackLength(def), config.fps)))}</p>
          {def.hits.map((h, i) => (
            <div key={i} className="tl-hit">
              <span>{t.hit(i + 1)}</span>
              <label className="tl-inline">{t.offset}<NumberField value={h.offset} min={0} step={1} width={64} onChange={(v) => edit((a) => { a.hits[i]!.offset = int(v); })} ariaLabel={t.offset} /></label>
              <label className="tl-inline">{t.damage}<NumberField value={h.damage ?? 1} min={0} width={56} onChange={(v) => edit((a) => { a.hits[i]!.damage = Math.max(0, v); })} ariaLabel={t.damage} /></label>
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
              <button type="button" className="tm-btn tm-mini" disabled={def.hits.length <= 1} aria-label={t.deleteHit} onClick={() => edit((a) => { a.hits.splice(i, 1); })}>✕</button>
            </div>
          ))}
          <button type="button" className="tm-btn" onClick={() => edit((a) => { const last = a.hits.length ? Math.max(...a.hits.map((h) => h.offset)) : 0; a.hits.push({ offset: last + 10, tags: [] }); })}>{t.addHit}</button>
        </div>
      )}
    </div>
  );
}
