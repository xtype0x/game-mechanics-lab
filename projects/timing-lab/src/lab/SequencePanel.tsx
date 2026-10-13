import { useState } from "react";
import { Timing } from "@gml/core";
import { NumberField } from "@gml/ui";
import { useLocale } from "@gml/ui/i18n";
import { attackLibrary, attackLength, hitGap, setHitGap, setUniformGap, uniformGap, type AttackPhase } from "./attacks";
import { useText } from "./i18n";
import { THEORETICAL_MIN_MS, analyzeCached, type GradeId } from "./reaction";
import type { Session } from "./session";

const int = (v: number) => Math.max(0, Math.round(v));
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;

/** Colored chip for a reaction grade (class per grade is in styles.css). */
function GradeChip({ grade, title }: { grade: GradeId; title?: string }) {
  const T = useText();
  return <span className={`tl-grade g-${grade}`} title={title}>{T.moves.grade[grade]}</span>;
}

/** Card "Attack sequence": the queue, adding moves, loop. Each queued move shows the grade of its hardest hit. */
export function SequencePanel({ session, onChange, config }: {
  session: Session;
  onChange: (fn: (draft: Session) => void) => void;
  config: Timing.TimingConfig;
}) {
  const T = useText();
  const t = T.sequence;
  const nameOf = (id: string) => session.attacks.find((a) => a.id === id)?.name ?? id;
  const worstOf = (id: string) => {
    const def = session.attacks.find((a) => a.id === id);
    if (!def) return null;
    const a = analyzeCached(def, config, session.hitTells);
    return a.impossible ? ({ grade: "impossible" as GradeId, ms: 0 }) : a.worst?.grade ? { grade: a.worst.grade, ms: Math.round(a.worst.reactionMs) } : null;
  };

  return (
    <div className="tl-seq">
      <h3>{t.title}</h3>
      <ol className="tl-queue">
        {session.sequence.map((s, i) => {
          const w = worstOf(s.attack);
          return (
            <li key={i}>
              <b>{nameOf(s.attack)}</b>
              {w && <GradeChip grade={w.grade} title={w.grade === "impossible" ? T.moves.grade.impossible : t.worstTip(w.ms, T.moves.grade[w.grade])} />}
              <label className="tl-inline">{t.gap}<NumberField value={s.gap} min={0} step={1} width={64} onChange={(v) => onChange((d) => { d.sequence[i]!.gap = int(v); })} ariaLabel={t.gapLabel} />{t.gapUnit}</label>
              <span className="tl-tools">
                <button type="button" className="tm-btn tm-mini" disabled={i === 0} aria-label={t.moveUp} onClick={() => onChange((d) => { const [x] = d.sequence.splice(i, 1); d.sequence.splice(i - 1, 0, x!); })}>↑</button>
                <button type="button" className="tm-btn tm-mini" disabled={i === session.sequence.length - 1} aria-label={t.moveDown} onClick={() => onChange((d) => { const [x] = d.sequence.splice(i, 1); d.sequence.splice(i + 1, 0, x!); })}>↓</button>
                <button type="button" className="tm-btn tm-mini" aria-label={t.delete} onClick={() => onChange((d) => { d.sequence.splice(i, 1); })}>✕</button>
              </span>
            </li>
          );
        })}
        {session.sequence.length === 0 && <li className="tm-muted">{t.empty}</li>}
      </ol>
      <div className="tl-row">
        <select value="" aria-label={t.addMoveLabel} onChange={(e) => { const v = e.target.value; if (v) onChange((d) => { d.sequence.push({ attack: v, gap: 30 }); }); }}>
          <option value="">{t.addMoveOption}</option>
          {session.attacks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="tm-chip"><input type="checkbox" checked={session.loop} onChange={(e) => onChange((d) => { d.loop = e.target.checked; })} />{t.loopPlay}</label>
      </div>
    </div>
  );
}

/** Card "Enemy moves": edit one move (windup, tells, hits, damage) and see how reactable each hit is. */
export function MovesPanel({ session, onChange, config, phase, replaying }: {
  session: Session;
  onChange: (fn: (draft: Session) => void) => void;
  config: Timing.TimingConfig;
  phase: { phase: AttackPhase; name?: string };
  /** A game replay is showing instead of the sequence: the card stays usable, with a note. */
  replaying: boolean;
}) {
  const T = useText();
  const t = T.moves;
  const [locale] = useLocale();
  const [sel, setSel] = useState(session.attacks[0]?.id ?? "");
  const def = session.attacks.find((a) => a.id === sel) ?? session.attacks[0];
  const edit = (fn: (a: Timing.AttackDef) => void) => onChange((d) => { const a = d.attacks.find((x) => x.id === def?.id); if (a) fn(a); });
  const analysis = def ? analyzeCached(def, config, session.hitTells) : null;
  const nameOfInteraction = (id: string) => config.interactions.find((i) => i.id === id)?.name ?? id;

  return (
    <div className="tl-seq tl-moves">
      <h3>{t.title}</h3>
      <p className="tm-muted tm-note">{t.intro}</p>
      {replaying && <p className="tm-muted tm-note">{t.sequenceNote}</p>}
      <p className="tm-muted tm-note">{t.animNote(T.phase[phase.phase], phase.name || null)}</p>
      <label className="tm-chip"><input type="checkbox" checked={session.hitTells} onChange={(e) => onChange((d) => { d.hitTells = e.target.checked; })} />{t.hitTells}</label>
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
          {def.hits.length >= 2 && (
            <div className="tl-row">
              <label className="tl-inline">{t.uniformGap}<NumberField value={uniformGap(def) ?? hitGap(def, 1)!} min={0} step={1} width={64} onChange={(v) => edit((a) => setUniformGap(a, v))} ariaLabel={t.uniformGapLabel} /></label>
              {uniformGap(def) === null && <span className="tm-muted tm-note">{t.gapsDiffer}</span>}
            </div>
          )}
          {def.hits.map((h, i) => {
            const tell = Timing.hitTelegraph(def, i);
            const tellOff = !session.hitTells && i > 0;
            const results = analysis?.hits[i]?.results ?? [];
            return (
              <div key={i} className="tl-hitbox">
                <div className="tl-hit">
                  <span>{t.hit(i + 1)}</span>
                  <label className="tl-inline">{t.offset}<NumberField value={h.offset} min={0} step={1} width={64} onChange={(v) => edit((a) => { a.hits[i]!.offset = int(v); })} ariaLabel={t.offset} /></label>
                  {i > 0 && <label className="tl-inline">{t.hitGap}<NumberField value={hitGap(def, i)!} min={0} step={1} width={64} onChange={(v) => edit((a) => setHitGap(a, i, v))} ariaLabel={t.hitGapLabel} /></label>}
                  <label className="tl-inline">{t.hitTell}
                    {tellOff
                      ? <span className="tm-muted" title={t.hitTells}>—</span>
                      : <NumberField value={tell} min={0} step={1} width={64} onChange={(v) => edit((a) => { a.hits[i]!.telegraph = int(v); })} ariaLabel={t.hitTellLabel} />}
                  </label>
                  <label className="tl-inline">{t.damage}<NumberField value={h.damage ?? 1} min={0} width={56} onChange={(v) => edit((a) => { a.hits[i]!.damage = Math.max(0, v); })} ariaLabel={t.damage} /></label>
                  <span className="tl-tags">
                    {config.tags.map((tag) => (
                      <label key={tag.id} className="tm-chip" style={{ borderColor: h.tags.includes(tag.id) ? tag.color : undefined }}>
                        <input type="checkbox" checked={h.tags.includes(tag.id)} onChange={(e) => edit((a) => {
                          const tags = a.hits[i]!.tags;
                          if (e.target.checked) tags.push(tag.id); else a.hits[i]!.tags = tags.filter((x) => x !== tag.id);
                        })} />{tag.name}
                      </label>
                    ))}
                  </span>
                  <button type="button" className="tm-btn tm-mini" disabled={def.hits.length <= 1} aria-label={t.deleteHit} onClick={() => edit((a) => { a.hits.splice(i, 1); })}>✕</button>
                </div>
                {results.map((r) => (
                  <div key={r.interaction} className="tl-react">
                    {r.covered ? (
                      <span>{nameOfInteraction(r.interaction)}{t.colon}<span className="tm-muted">{t.covered}</span>{r.needsEarlier && <span className="tm-muted">・{t.needsEarlier}</span>}</span>
                    ) : r.grade === "impossible" ? (
                      <span>{nameOfInteraction(r.interaction)}{t.colon}<GradeChip grade="impossible" /></span>
                    ) : (
                      <span>
                        {t.reactionLine(nameOfInteraction(r.interaction), r.validFrames, r.perfectFrames, Math.round(r.reactionMs), THEORETICAL_MIN_MS, signed(Math.round(r.reactionMs - THEORETICAL_MIN_MS)))}
                        {r.grade && <GradeChip grade={r.grade} />}
                        {r.needsEarlier && <span className="tm-muted">・{t.needsEarlier}</span>}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
          <button type="button" className="tm-btn" onClick={() => edit((a) => { const last = a.hits.length ? Math.max(...a.hits.map((h) => h.offset)) : 0; a.hits.push({ offset: last + (uniformGap(a) ?? 10), tags: [] }); })}>{t.addHit}</button>
          <p className="tm-muted tm-note">{t.reactionNote}</p>
        </div>
      )}
    </div>
  );
}
