import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Timing, c, op, parseExpr, printExpr, r, type Expr } from "@gml/core";
import { Badge, NumberField } from "../base";
import { formulaVariables, uniqueId } from "./helpers";
import { timingText, useTimingText, type TimingText } from "./i18n";
import { timingPresets } from "./presets";
import { useLocale } from "../i18n";

type Config = Timing.TimingConfig;
type Interaction = Timing.InteractionDef;
type Effect = Timing.EffectDef;
type Update = (fn: (draft: Config) => void) => void;

export type TimingEditorSection = "basic" | "interactions" | "outcomes" | "lists" | "validation";

const int = (v: number) => Math.max(0, Math.round(v));
const move = <T,>(arr: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  const [x] = arr.splice(i, 1);
  arr.splice(j, 0, x!);
};

/** Full editor of a TimingConfig. Controlled: every edit calls onChange with a fresh copy. */
export function TimingEditor({ config, onChange, sections }: { config: Config; onChange: (c: Config) => void; sections?: TimingEditorSection[] }) {
  const T = useTimingText();
  const t = T.editor;
  const show = (s: TimingEditorSection) => !sections || sections.includes(s);
  const upd: Update = (fn) => {
    const d = structuredClone(config);
    fn(d);
    onChange(d);
  };
  const issues = useMemo(() => {
    try { return Timing.validateTiming(config); } catch { return [{ level: "error" as const, path: "config", message: t.validation.incomplete }]; }
    // t: the language is part of the message, so re-run when it changes.
  }, [config, t]);
  const errors = issues.filter((i) => i.level === "error").length;

  return (
    <div className="tm-editor">
      {show("basic") && <BasicSection config={config} upd={upd} />}
      {show("interactions") && <InteractionsSection config={config} upd={upd} />}
      {show("outcomes") && <OutcomesSection config={config} upd={upd} />}
      {show("lists") && <ListsSection config={config} upd={upd} />}
      {show("validation") && (
        <Collapsible title={t.validation.title} badge={errors ? <Badge tone="err">{t.validation.errors(errors)}</Badge> : issues.length ? <Badge tone="warn">{t.validation.warnings(issues.length)}</Badge> : <Badge tone="ok">{t.validation.ok}</Badge>} open={errors > 0}>
          {issues.length === 0 ? <p className="tm-muted">{t.validation.allPassed}</p> : (
            <ul className="tm-issues">
              {issues.map((i, k) => (
                <li key={k}><Badge tone={i.level === "error" ? "err" : "warn"}>{i.level === "error" ? t.validation.error : t.validation.warning}</Badge> <code>{i.path}</code> {i.message}</li>
              ))}
            </ul>
          )}
        </Collapsible>
      )}
    </div>
  );
}

function Collapsible({ title, badge, actions, open, children }: { title: string; badge?: ReactNode; actions?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details className="tm-sec" open={open}>
      <summary><span className="tm-sec-title">{title}</span>{badge}<span className="tm-sec-actions" onClick={(e) => e.preventDefault()}>{actions}</span></summary>
      <div className="tm-sec-body">{children}</div>
    </details>
  );
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="tm-field" title={hint}><span>{label}</span>{children}</label>;
}

function FrameField({ label, value, onChange, fps, hint }: { label: string; value: number; onChange: (v: number) => void; fps: number; hint?: string }) {
  return (
    <Row label={label} {...(hint ? { hint } : {})}>
      <span className="tm-frames">
        <NumberField value={value} min={0} step={1} width={72} onChange={(v) => onChange(int(v))} ariaLabel={label} />
        <small>{Math.round(Timing.framesToMs(value, fps))}ms</small>
      </span>
    </Row>
  );
}

function Select({ value, onChange, options, ariaLabel }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; ariaLabel?: string }) {
  return (
    <select value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ColorInput({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const t = useTimingText().editor;
  return (
    <span className="tm-color">
      <input type="color" value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#888888"} onChange={(e) => onChange(e.target.value)} aria-label={t.field.color} />
      {value && <button type="button" className="tm-btn tm-mini" onClick={() => onChange(undefined)} title={t.action.clearColor}>×</button>}
    </span>
  );
}

function RowTools({ i, n, onMove, onDup, onDel }: { i: number; n: number; onMove: (d: number) => void; onDup?: () => void; onDel: () => void }) {
  const t = useTimingText().editor.action;
  return (
    <span className="tm-rowtools" onClick={(e) => e.preventDefault()}>
      <button type="button" className="tm-btn tm-mini" disabled={i === 0} onClick={() => onMove(-1)} title={t.moveUp} aria-label={t.moveUp}>↑</button>
      <button type="button" className="tm-btn tm-mini" disabled={i === n - 1} onClick={() => onMove(1)} title={t.moveDown} aria-label={t.moveDown}>↓</button>
      {onDup && <button type="button" className="tm-btn tm-mini" onClick={onDup} title={t.duplicate} aria-label={t.duplicate}>⧉</button>}
      <button type="button" className="tm-btn tm-mini danger" onClick={onDel} title={t.delete} aria-label={t.delete}>✕</button>
    </span>
  );
}

/** Expr edited as infix text: parsed on blur / Enter, the last valid value is kept while the text is invalid. */
export function ExprInput({ value, onChange, placeholder, ariaLabel }: { value: Expr; onChange: (e: Expr) => void; placeholder?: string; ariaLabel?: string }) {
  const t = useTimingText().editor;
  const printed = useMemo(() => printExpr(value), [value]);
  const [text, setText] = useState(printed);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setText(printed); setErr(null); }, [printed]);
  const commit = () => {
    try {
      const e = parseExpr(text);
      setErr(null);
      if (printExpr(e) !== printed) onChange(e);
      else setText(printed);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    }
  };
  return (
    <span className="tm-expr">
      <input
        className={err ? "invalid mono" : "mono"} value={text} placeholder={placeholder} aria-label={ariaLabel} spellCheck={false}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      />
      {err && <small className="tm-err">{err}{t.expr.kept(printed)}</small>}
    </span>
  );
}

/* ---------------------------------- 基本 ---------------------------------- */

function BasicSection({ config, upd }: { config: Config; upd: Update }) {
  const t = useTimingText().editor;
  return (
    <Collapsible title={t.basic.title} open>
      <Row label={t.field.name}><input value={config.name} onChange={(e) => upd((d) => { d.name = e.target.value; })} /></Row>
      <Row label={t.field.description}><input value={config.description ?? ""} onChange={(e) => upd((d) => { if (e.target.value) d.description = e.target.value; else delete d.description; })} /></Row>
      <Row label={t.basic.fps} hint={t.basic.fpsHint}><NumberField value={config.fps} min={1} step={1} width={72} onChange={(v) => upd((d) => { d.fps = Math.max(1, Math.round(v)); })} ariaLabel="fps" /></Row>
      <FrameField label={t.basic.inputOffset} value={config.inputOffset} fps={config.fps} hint={t.basic.inputOffsetHint} onChange={(v) => upd((d) => { d.inputOffset = v; })} />
      <Row label={t.basic.hitOutcome} hint={t.basic.hitOutcomeHint}>
        <Select value={config.hitOutcome} onChange={(v) => upd((d) => { d.hitOutcome = v; })} options={config.outcomes.map((o) => ({ value: o.id, label: o.name }))} />
      </Row>
      <Row label={t.basic.healthResource} hint={t.basic.healthResourceHint}>
        <Select value={config.healthResource} onChange={(v) => upd((d) => { d.healthResource = v; })} options={config.resources.map((o) => ({ value: o.id, label: o.name }))} />
      </Row>
    </Collapsible>
  );
}

/* ---------------------------------- 互動 ---------------------------------- */

function newInteraction(config: Config): Interaction {
  const ok = config.outcomes.find((o) => o.kind === "success")?.id ?? null;
  const t = timingText().editor.interactions;
  return {
    id: uniqueId("action", config.interactions.map((i) => i.id)), name: t.newName, key: "", priority: 5, startup: 0,
    windows: [{ id: "w1", name: t.newWindowName, frames: 8 }], successRecovery: 8, whiffRecovery: 20, maxCatches: 1,
    table: [{ tag: null, cells: { w1: ok } }], cooldown: 0, buffer: 0,
  };
}

function InteractionsSection({ config, upd }: { config: Config; upd: Update }) {
  const T = useTimingText();
  const t = T.editor.interactions;
  return (
    <Collapsible title={t.title} badge={<Badge tone="muted">{config.interactions.length}</Badge>} open
      actions={<button type="button" className="tm-btn" onClick={() => upd((d) => { d.interactions.push(newInteraction(d)); })}>{t.add}</button>}>
      <p className="tm-muted tm-note">{t.note}</p>
      {config.interactions.map((it, idx) => (
        <details key={it.id} className="tm-item">
          <summary>
            <i className="tm-dot" style={{ background: it.color ?? "#888" }} />
            <b>{it.name}</b> <code>{it.id}</code>
            <RowTools i={idx} n={config.interactions.length}
              onMove={(dir) => upd((d) => move(d.interactions, idx, dir))}
              onDup={() => upd((d) => {
                const copy = structuredClone(d.interactions[idx]!);
                copy.id = uniqueId(`${copy.id}_`, d.interactions.map((x) => x.id));
                copy.name += T.common.copySuffix;
                d.interactions.splice(idx + 1, 0, copy);
              })}
              onDel={() => upd((d) => { d.interactions.splice(idx, 1); })} />
          </summary>
          <InteractionBody config={config} idx={idx} upd={upd} />
        </details>
      ))}
    </Collapsible>
  );
}

function InteractionBody({ config, idx, upd }: { config: Config; idx: number; upd: Update }) {
  const T = useTimingText();
  const t = T.editor.interactions;
  const f = T.editor.field;
  const it = config.interactions[idx]!;
  const fps = config.fps;
  const ed = (fn: (i: Interaction) => void) => upd((d) => fn(d.interactions[idx]!));
  const outcomeOpts = [{ value: "", label: T.common.noneParen }, ...config.outcomes.map((o) => ({ value: o.id, label: o.name }))];
  return (
    <div className="tm-item-body">
      <div className="tm-grid">
        <Row label={f.name}><input value={it.name} onChange={(e) => ed((i) => { i.name = e.target.value; })} /></Row>
        <Row label={t.keyHint} hint={t.keyHintTip}><input value={it.key ?? ""} placeholder="KeyJ" onChange={(e) => ed((i) => { if (e.target.value) i.key = e.target.value; else delete i.key; })} /></Row>
        <Row label={f.color}><ColorInput value={it.color} onChange={(v) => ed((i) => { if (v) i.color = v; else delete i.color; })} /></Row>
        <Row label={f.priority} hint={t.priorityTip}><NumberField value={it.priority} step={1} width={72} onChange={(v) => ed((i) => { i.priority = Math.round(v); })} ariaLabel={f.priority} /></Row>
        <FrameField label={t.startup} value={it.startup} fps={fps} hint={t.startupTip} onChange={(v) => ed((i) => { i.startup = v; })} />
        <FrameField label={t.successRecovery} value={it.successRecovery} fps={fps} onChange={(v) => ed((i) => { i.successRecovery = v; })} />
        <FrameField label={t.whiffRecovery} value={it.whiffRecovery} fps={fps} onChange={(v) => ed((i) => { i.whiffRecovery = v; })} />
        <Row label={t.maxCatches} hint={t.maxCatchesTip}><NumberField value={it.maxCatches} min={0} step={1} width={72} onChange={(v) => ed((i) => { i.maxCatches = int(v); })} ariaLabel={t.maxCatches} /></Row>
        <FrameField label={t.cooldown} value={it.cooldown} fps={fps} onChange={(v) => ed((i) => { i.cooldown = v; })} />
        <FrameField label={t.buffer} value={it.buffer} fps={fps} hint={t.bufferTip} onChange={(v) => ed((i) => { i.buffer = v; })} />
        <Row label={t.whiffOutcome}><Select value={it.whiffOutcome ?? ""} options={outcomeOpts} onChange={(v) => ed((i) => { if (v) i.whiffOutcome = v; else delete i.whiffOutcome; })} /></Row>
        <Row label={t.acceptOutcome}><Select value={it.onAccept ?? ""} options={outcomeOpts} onChange={(v) => ed((i) => { if (v) i.onAccept = v; else delete i.onAccept; })} /></Row>
      </div>

      <h4>{t.windows} <small className="tm-muted">{t.windowsTotal(it.windows.reduce((s, w) => s + w.frames, 0))}</small></h4>
      <div className="tm-list">
        {it.windows.map((w, wi) => (
          <div key={w.id} className="tm-list-row">
            <code title={t.windowIdTip}>{w.id}</code>
            <input value={w.name} aria-label={t.windowNameLabel} onChange={(e) => ed((i) => { i.windows[wi]!.name = e.target.value; })} />
            <FrameField label={T.common.frame} value={w.frames} fps={fps} onChange={(v) => ed((i) => { i.windows[wi]!.frames = v; })} />
            <label className="tm-chip" title={t.strictTip}><input type="checkbox" checked={!!w.strict} onChange={(e) => ed((i) => { if (e.target.checked) i.windows[wi]!.strict = true; else delete i.windows[wi]!.strict; })} />{t.strict}</label>
            <RowTools i={wi} n={it.windows.length} onMove={(dir) => ed((i) => move(i.windows, wi, dir))}
              onDel={() => ed((i) => { const [gone] = i.windows.splice(wi, 1); for (const row of i.table) delete row.cells[gone!.id]; })} />
          </div>
        ))}
        <button type="button" className="tm-btn" onClick={() => ed((i) => {
          const id = uniqueId("w", i.windows.map((x) => x.id));
          i.windows.push({ id, name: t.newWindow(i.windows.length + 1), frames: 6 });
        })}>{t.addWindow}</button>
      </div>

      <h4>{t.resultTable}</h4>
      <p className="tm-muted tm-note">{t.resultTableNote}</p>
      <ResultMatrix config={config} it={it} ed={ed} />

      <h4>{t.advanced}</h4>
      <div className="tm-grid">
        <ToggleGroup label={t.charges} on={!!it.charges} onToggle={(on) => ed((i) => { if (on) i.charges = { max: 2, recharge: 120, mode: "sequential" }; else delete i.charges; })}>
          {it.charges && <>
            <Row label={f.limit}><NumberField value={it.charges.max} min={1} step={1} width={72} onChange={(v) => ed((i) => { i.charges!.max = Math.max(1, Math.round(v)); })} ariaLabel={t.chargesMax} /></Row>
            <FrameField label={t.recharge} value={it.charges.recharge} fps={fps} onChange={(v) => ed((i) => { i.charges!.recharge = Math.max(1, v); })} />
            <Row label={f.mode}><Select value={it.charges.mode} options={[{ value: "sequential", label: t.chargeSequential }, { value: "parallel", label: t.chargeParallel }]} onChange={(v) => ed((i) => { i.charges!.mode = v as "sequential" | "parallel"; })} /></Row>
          </>}
        </ToggleGroup>
        <ToggleGroup label={t.cost} on={!!it.cost} onToggle={(on) => ed((i) => { if (on) i.cost = { resource: config.resources[0]?.id ?? "", amount: 1 }; else delete i.cost; })}>
          {it.cost && <>
            <Row label={t.costResource}><Select value={it.cost.resource} options={config.resources.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => ed((i) => { i.cost!.resource = v; })} /></Row>
            <Row label={f.amount}><NumberField value={it.cost.amount} min={0} width={72} onChange={(v) => ed((i) => { i.cost!.amount = Math.max(0, v); })} ariaLabel={t.costAmount} /></Row>
          </>}
        </ToggleGroup>
        <ToggleGroup label={t.spam} on={!!it.spam} onToggle={(on) => ed((i) => { if (on) i.spam = { withinFrames: 20, scope: "self", shrinkPerPress: 2, maxShrink: 4, lockoutAfter: 0, lockoutFrames: 30 }; else delete i.spam; })}>
          {it.spam && <>
            <FrameField label={t.spamWithin} value={it.spam.withinFrames} fps={fps} onChange={(v) => ed((i) => { i.spam!.withinFrames = v; })} />
            <Row label={t.spamScope}><Select value={it.spam.scope} options={[{ value: "self", label: t.spamSelf }, { value: "all", label: t.spamAll }]} onChange={(v) => ed((i) => { i.spam!.scope = v as "self" | "all"; })} /></Row>
            <Row label={t.spamShrink}><NumberField value={it.spam.shrinkPerPress} min={0} step={1} width={72} onChange={(v) => ed((i) => { i.spam!.shrinkPerPress = int(v); })} ariaLabel={t.spamShrinkLabel} /></Row>
            <Row label={t.spamMax}><NumberField value={it.spam.maxShrink} min={0} step={1} width={72} onChange={(v) => ed((i) => { i.spam!.maxShrink = int(v); })} ariaLabel={t.spamMaxLabel} /></Row>
            <Row label={t.lockAfter} hint={t.lockAfterTip}><NumberField value={it.spam.lockoutAfter} min={0} step={1} width={72} onChange={(v) => ed((i) => { i.spam!.lockoutAfter = int(v); })} ariaLabel={t.lockAfter} /></Row>
            <FrameField label={t.lockFrames} value={it.spam.lockoutFrames} fps={fps} onChange={(v) => ed((i) => { i.spam!.lockoutFrames = v; })} />
          </>}
        </ToggleGroup>
      </div>
    </div>
  );
}

function ToggleGroup({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  return (
    <fieldset className="tm-toggle">
      <legend><label><input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} /> {label}</label></legend>
      {children}
    </fieldset>
  );
}

function ResultMatrix({ config, it, ed }: { config: Config; it: Interaction; ed: (fn: (i: Interaction) => void) => void }) {
  const t = useTimingText().editor.matrix;
  const outcomeOpts = [{ value: "", label: t.noCatch }, ...config.outcomes.map((o) => ({ value: o.id, label: o.name }))];
  const tagOpts = [{ value: "", label: t.defaultTag }, ...config.tags.map((t) => ({ value: t.id, label: t.name }))];
  return (
    <div className="tm-matrix-wrap">
      <table className="tm-matrix">
        <thead>
          <tr>
            <th>{t.headerTag}</th>
            {it.windows.map((w) => <th key={w.id}>{w.name}{w.strict ? "*" : ""}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {it.table.map((row, ri) => (
            <tr key={ri}>
              <td><span className="tm-rownum">{ri + 1}</span><Select ariaLabel={t.rowTag} value={row.tag ?? ""} options={tagOpts} onChange={(v) => ed((i) => { i.table[ri]!.tag = v || null; })} /></td>
              {it.windows.map((w) => (
                <td key={w.id}>
                  <Select ariaLabel={t.windowResult(w.name)} value={row.cells[w.id] ?? ""} options={outcomeOpts} onChange={(v) => ed((i) => { i.table[ri]!.cells[w.id] = v || null; })} />
                </td>
              ))}
              <td><RowTools i={ri} n={it.table.length} onMove={(dir) => ed((i) => move(i.table, ri, dir))} onDel={() => ed((i) => { i.table.splice(ri, 1); })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="tm-btn" onClick={() => ed((i) => {
        const used = new Set(i.table.map((x) => x.tag));
        const tag = config.tags.find((t) => !used.has(t.id))?.id ?? null;
        i.table.push({ tag, cells: Object.fromEntries(i.windows.map((w) => [w.id, null])) });
      })}>{t.addRow}</button>
    </div>
  );
}

/* ---------------------------------- 結果 ---------------------------------- */

/** Order of the effect types in the pickers; labels are in the dictionary (editor.effectTypes). */
const EFFECT_ORDER: Effect["type"][] = ["damage", "addResource", "invulnerable", "stun", "status", "restoreCharge", "cancelRecovery", "hitstop", "timeScale", "cue"];

type FieldKind = "expr" | "resource" | "status" | "interaction" | "text";
type FieldLabel = keyof TimingText["editor"]["effectFields"];
const EFFECT_FIELDS: Record<Effect["type"], { key: string; label: FieldLabel; kind: FieldKind; optional?: boolean }[]> = {
  damage: [{ key: "amount", label: "damageAmount", kind: "expr" }],
  addResource: [{ key: "resource", label: "resource", kind: "resource" }, { key: "amount", label: "amount", kind: "expr" }],
  invulnerable: [{ key: "frames", label: "frames", kind: "expr" }],
  stun: [{ key: "frames", label: "frames", kind: "expr" }],
  status: [{ key: "status", label: "status", kind: "status" }, { key: "frames", label: "frames", kind: "expr" }],
  restoreCharge: [{ key: "interaction", label: "interaction", kind: "interaction" }, { key: "amount", label: "amount", kind: "expr" }],
  cancelRecovery: [],
  hitstop: [{ key: "frames", label: "frames", kind: "expr" }],
  timeScale: [{ key: "scale", label: "scale", kind: "expr" }, { key: "frames", label: "frames", kind: "expr" }],
  cue: [{ key: "cue", label: "cueName", kind: "text" }, { key: "value", label: "cueValue", kind: "expr", optional: true }],
};

function defaultEffect(config: Config, type: Effect["type"]): Effect {
  switch (type) {
    case "damage": return { type, amount: r("attack.damage") };
    case "addResource": return { type, resource: config.resources[0]?.id ?? "", amount: c(10) };
    case "invulnerable": return { type, frames: c(30) };
    case "stun": return { type, frames: c(20) };
    case "status": return { type, status: config.statuses[0]?.id ?? "", frames: c(60) };
    case "restoreCharge": return { type, interaction: (config.interactions.find((i) => i.charges) ?? config.interactions[0])?.id ?? "", amount: c(1) };
    case "cancelRecovery": return { type };
    case "hitstop": return { type, frames: c(4) };
    case "timeScale": return { type, scale: c(0.5), frames: c(20) };
    case "cue": return { type, cue: "vfx:new" };
  }
}

function OutcomesSection({ config, upd }: { config: Config; upd: Update }) {
  const T = useTimingText();
  const t = T.editor.outcomes;
  const vars = useMemo(() => formulaVariables(config), [config, T]);
  return (
    <Collapsible title={t.title} badge={<Badge tone="muted">{config.outcomes.length}</Badge>}
      actions={<button type="button" className="tm-btn" onClick={() => upd((d) => { d.outcomes.push({ id: uniqueId("outcome", d.outcomes.map((o) => o.id)), name: t.newName, kind: "neutral", effects: [] }); })}>{t.add}</button>}>
      <details className="tm-vars">
        <summary>{t.variables}</summary>
        <ul>{vars.map((v) => <li key={v.name}><code>{v.name}</code> {v.desc}</li>)}</ul>
        <p className="tm-muted">{t.operators}</p>
      </details>
      {config.outcomes.map((o, oi) => (
        <details key={o.id} className="tm-item">
          <summary>
            <i className="tm-dot" style={{ background: o.color ?? "#888" }} />
            <b>{o.name}</b> <Badge tone={o.kind === "perfect" ? "warn" : o.kind === "success" ? "ok" : o.kind === "fail" ? "err" : "muted"}>{T.kind[o.kind]}</Badge> <code>{o.id}</code>
            <RowTools i={oi} n={config.outcomes.length}
              onMove={(dir) => upd((d) => move(d.outcomes, oi, dir))}
              onDup={() => upd((d) => {
                const copy = structuredClone(d.outcomes[oi]!);
                copy.id = uniqueId(`${copy.id}_`, d.outcomes.map((x) => x.id));
                copy.name += T.common.copySuffix;
                d.outcomes.splice(oi + 1, 0, copy);
              })}
              onDel={() => upd((d) => { d.outcomes.splice(oi, 1); })} />
          </summary>
          <div className="tm-item-body">
            <div className="tm-grid">
              <Row label={T.editor.field.name}><input value={o.name} onChange={(e) => upd((d) => { d.outcomes[oi]!.name = e.target.value; })} /></Row>
              <Row label={t.kind} hint={t.kindTip}>
                <Select value={o.kind} options={(Object.keys(T.kind) as Timing.OutcomeKind[]).map((k) => ({ value: k, label: T.kind[k] }))} onChange={(v) => upd((d) => { d.outcomes[oi]!.kind = v as Timing.OutcomeKind; })} />
              </Row>
              <Row label={T.editor.field.color}><ColorInput value={o.color} onChange={(v) => upd((d) => { if (v) d.outcomes[oi]!.color = v; else delete d.outcomes[oi]!.color; })} /></Row>
            </div>
            <h4>{t.effectsHeading}</h4>
            {o.effects.map((e, ei) => (
              <EffectRow key={ei} config={config} effect={e} n={o.effects.length} i={ei}
                patch={(fn) => upd((d) => fn(d.outcomes[oi]!.effects, ei))} />
            ))}
            <div className="tm-addrow">
              <Select value="" ariaLabel={t.addEffect} options={[{ value: "", label: t.addEffectOption }, ...EFFECT_ORDER.map((type) => ({ value: type, label: T.editor.effectTypes[type] }))]}
                onChange={(v) => { if (v) upd((d) => { d.outcomes[oi]!.effects.push(defaultEffect(d, v as Effect["type"])); }); }} />
            </div>
          </div>
        </details>
      ))}
    </Collapsible>
  );
}

function EffectRow({ config, effect, i, n, patch }: { config: Config; effect: Effect; i: number; n: number; patch: (fn: (list: Effect[], i: number) => void) => void }) {
  const T = useTimingText().editor;
  const rec = effect as unknown as Record<string, unknown>;
  const set = (key: string, v: unknown) => patch((list, k) => {
    const e = list[k] as unknown as Record<string, unknown>;
    if (v === undefined) delete e[key]; else e[key] = v;
  });
  return (
    <div className="tm-effect">
      <div className="tm-effect-head">
        <Select ariaLabel={T.outcomes.effectType} value={effect.type} options={EFFECT_ORDER.map((type) => ({ value: type, label: T.effectTypes[type] }))}
          onChange={(v) => patch((list, k) => { const when = list[k]!.when; const fresh = defaultEffect(config, v as Effect["type"]); if (when) fresh.when = when; list[k] = fresh; })} />
        <RowTools i={i} n={n} onMove={(dir) => patch((list, k) => move(list, k, dir))} onDel={() => patch((list, k) => { list.splice(k, 1); })} />
      </div>
      <div className="tm-effect-fields">
        {EFFECT_FIELDS[effect.type].map((f) => {
          const val = rec[f.key];
          if (f.kind === "expr") {
            if (f.optional && val === undefined) {
              return <button key={f.key} type="button" className="tm-btn tm-mini" onClick={() => set(f.key, c(1))}>＋ {T.effectFields[f.label]}</button>; // i18n-ignore: glyph
            }
            return (
              <Row key={f.key} label={T.effectFields[f.label]}>
                <span className="tm-expr-row">
                  <ExprInput value={val as Expr} ariaLabel={T.effectFields[f.label]} onChange={(e) => set(f.key, e)} />
                  {f.optional && <button type="button" className="tm-btn tm-mini" onClick={() => set(f.key, undefined)} title={T.action.remove}>✕</button>}
                </span>
              </Row>
            );
          }
          if (f.kind === "text") return <Row key={f.key} label={T.effectFields[f.label]}><input value={String(val ?? "")} onChange={(e) => set(f.key, e.target.value)} /></Row>;
          const opts = f.kind === "resource" ? config.resources : f.kind === "status" ? config.statuses : config.interactions;
          return <Row key={f.key} label={T.effectFields[f.label]}><Select value={String(val ?? "")} options={opts.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => set(f.key, v)} /></Row>;
        })}
        {effect.when ? (
          <Row label={T.outcomes.when}>
            <span className="tm-expr-row">
              <ExprInput value={effect.when} ariaLabel={T.outcomes.whenLabel} onChange={(e) => set("when", e)} />
              <button type="button" className="tm-btn tm-mini" onClick={() => set("when", undefined)} title={T.action.removeCondition}>✕</button>
            </span>
          </Row>
        ) : (
          <button type="button" className="tm-btn tm-mini" onClick={() => set("when", op("eq", r("catch.index"), c(0)))}>{T.outcomes.addWhen}</button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ 標籤 / 資源 / 狀態 ------------------------------ */

function ListsSection({ config, upd }: { config: Config; upd: Update }) {
  const t = useTimingText().editor;
  return (
    <Collapsible title={t.lists.title}>
      <h4>{t.lists.tags} <button type="button" className="tm-btn tm-mini" onClick={() => upd((d) => { d.tags.push({ id: uniqueId("tag", d.tags.map((x) => x.id)), name: t.lists.newTag, color: "#888888" }); })}>＋</button>{/* i18n-ignore: glyph */}</h4>
      <div className="tm-list">
        {config.tags.map((x, i) => (
          <div key={x.id} className="tm-list-row">
            <code>{x.id}</code>
            <input value={x.name} aria-label={t.lists.tagName} onChange={(e) => upd((d) => { d.tags[i]!.name = e.target.value; })} />
            <ColorInput value={x.color} onChange={(v) => upd((d) => { if (v) d.tags[i]!.color = v; else delete d.tags[i]!.color; })} />
            <RowTools i={i} n={config.tags.length} onMove={(dir) => upd((d) => move(d.tags, i, dir))} onDel={() => upd((d) => { d.tags.splice(i, 1); })} />
          </div>
        ))}
      </div>
      <h4>{t.lists.resources} <button type="button" className="tm-btn tm-mini" onClick={() => upd((d) => { d.resources.push({ id: uniqueId("res", d.resources.map((x) => x.id)), name: t.lists.newResource, max: 100, initial: 0 }); })}>＋</button>{/* i18n-ignore: glyph */}</h4>
      <div className="tm-list">
        {config.resources.map((x, i) => (
          <div key={x.id} className="tm-list-row">
            <code>{x.id}</code>
            <input value={x.name} aria-label={t.lists.resourceName} onChange={(e) => upd((d) => { d.resources[i]!.name = e.target.value; })} />
            <Row label={t.field.limit}><NumberField value={x.max} min={0} width={72} onChange={(v) => upd((d) => { d.resources[i]!.max = Math.max(0, v); })} ariaLabel={t.field.limit} /></Row>
            <Row label={t.field.initial}><NumberField value={x.initial} min={0} width={72} onChange={(v) => upd((d) => { d.resources[i]!.initial = Math.max(0, v); })} ariaLabel={t.field.initial} /></Row>
            <RowTools i={i} n={config.resources.length} onMove={(dir) => upd((d) => move(d.resources, i, dir))} onDel={() => upd((d) => { d.resources.splice(i, 1); })} />
          </div>
        ))}
      </div>
      <h4>{t.lists.statuses} <button type="button" className="tm-btn tm-mini" onClick={() => upd((d) => { d.statuses.push({ id: uniqueId("status", d.statuses.map((x) => x.id)), name: t.lists.newStatus }); })}>＋</button>{/* i18n-ignore: glyph */}</h4>
      <p className="tm-muted tm-note">{t.lists.statusNote}</p>
      <div className="tm-list">
        {config.statuses.map((x, i) => (
          <div key={x.id} className="tm-list-row">
            <code>{x.id}</code>
            <input value={x.name} aria-label={t.lists.statusName} onChange={(e) => upd((d) => { d.statuses[i]!.name = e.target.value; })} />
            <RowTools i={i} n={config.statuses.length} onMove={(dir) => upd((d) => move(d.statuses, i, dir))} onDel={() => upd((d) => { d.statuses.splice(i, 1); })} />
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

/* --------------------------------- 預設 / 匯出 --------------------------------- */

/** Dropdown that loads one of the built-in presets (a fresh copy). */
export function TimingPresetMenu({ onPick }: { onPick: (config: Config) => void }) {
  const t = useTimingText().editor.presetMenu;
  const [locale] = useLocale();
  const presets = useMemo(() => timingPresets(locale), [locale]);
  return (
    <select className="tm-preset" value="" aria-label={t.label} onChange={(e) => {
      const p = presets.find((x) => x.id === e.target.value);
      if (p) onPick(structuredClone(p));
    }}>
      <option value="">{t.placeholder}</option>
      {presets.map((p) => <option key={p.id} value={p.id}>{p.name}{p.description ? ` — ${p.description}` : ""}</option>)}
    </select>
  );
}
