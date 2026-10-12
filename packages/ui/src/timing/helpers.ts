// Pure helpers for the timing components (no React): ids, config import/export, event descriptions.
// Text comes from timingText() (current locale); the functions are still plain calls, so they work outside React.
import { Timing } from "@gml/core";
import { timingText } from "./i18n";

type TimingConfig = Timing.TimingConfig;
type TimingEvent = Timing.TimingEvent;
type OutcomeKind = Timing.OutcomeKind;

export const TIMING_CONFIG_FORMAT = "gml-timing-config";

export function uniqueId(prefix: string, existing: Iterable<string>): string {
  const used = new Set(existing);
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

export function exportTimingConfig(config: TimingConfig): string {
  return JSON.stringify({ format: TIMING_CONFIG_FORMAT, version: 1, config }, null, 2);
}

/** Accepts the exported wrapper or a bare config; throws a localized message on any problem (validation messages come from the core). */
export function parseTimingConfig(text: string): TimingConfig {
  const t = timingText().describe.parse;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(t.notJson);
  }
  const obj = raw as { format?: unknown; version?: unknown; config?: unknown } | null;
  if (!obj || typeof obj !== "object") throw new Error(t.notObject);
  let cfg: unknown = obj;
  if (obj.format !== undefined || obj.config !== undefined) {
    if (obj.format !== TIMING_CONFIG_FORMAT) throw new Error(t.badFormat(TIMING_CONFIG_FORMAT));
    if (obj.version !== 1) throw new Error(t.badVersion(String(obj.version)));
    cfg = obj.config;
  }
  const c = cfg as Partial<TimingConfig> | null;
  if (!c || typeof c !== "object" || c.version !== 1) throw new Error(t.missingVersion);
  for (const k of ["tags", "resources", "statuses", "outcomes", "interactions"] as const) {
    if (!Array.isArray(c[k])) throw new Error(t.missingList(k));
  }
  if (typeof c.fps !== "number" || typeof c.hitOutcome !== "string" || typeof c.healthResource !== "string") {
    throw new Error(t.missingScalars);
  }
  let issues: Timing.ValidationIssue[];
  try {
    issues = Timing.validateTiming(c as TimingConfig);
  } catch {
    throw new Error(t.incomplete);
  }
  const first = issues.find((i) => i.level === "error");
  if (first) throw new Error(t.hasError(first.path, first.message));
  return c as TimingConfig;
}

/** Variables usable in formulas (spec §5), plus those derived from the config's own ids. */
export function formulaVariables(config: TimingConfig): { name: string; desc: string }[] {
  const d = timingText().describe.variables;
  return [
    { name: "frame", desc: d.frame },
    { name: "attack.damage", desc: d.attackDamage },
    ...config.resources.map((r) => ({ name: `res.${r.id}`, desc: d.resource(r.name) })),
    ...[{ id: "invulnerable", name: timingText().common.invulnerable }, ...config.statuses].map((s) => ({ name: `status.${s.id}`, desc: d.status(s.name) })),
    ...config.interactions.map((i) => ({ name: `charges.${i.id}`, desc: d.charges(i.name) })),
    { name: "catch.index", desc: d.catchIndex },
    { name: "action.shrink", desc: d.actionShrink },
    { name: "action.buffered", desc: d.actionBuffered },
  ];
}

export const dropReasonText = (r: Timing.DropReason): string => timingText().describe.dropReasons[r] ?? r;

const iName = (c: TimingConfig, id: string) => c.interactions.find((i) => i.id === id)?.name ?? id;
const oName = (c: TimingConfig, id: string | null | undefined) => (id ? (c.outcomes.find((o) => o.id === id)?.name ?? id) : timingText().common.none);
const rName = (c: TimingConfig, id: string) => c.resources.find((r) => r.id === id)?.name ?? id;
const sName = (c: TimingConfig, id: string) => (id === "invulnerable" ? timingText().common.invulnerable : (c.statuses.find((s) => s.id === id)?.name ?? id));
const wName = (c: TimingConfig, iid: string | undefined, wid: string | undefined) =>
  (iid && wid && c.interactions.find((i) => i.id === iid)?.windows.find((w) => w.id === wid)?.name) || wid || "";
const signed = (n: number) => (n >= 0 ? `+${num(n)}` : num(n));
const num = (n: number) => String(Math.round(n * 1000) / 1000);

export function outcomeKind(config: TimingConfig, id: string | null | undefined): OutcomeKind {
  return config.outcomes.find((o) => o.id === id)?.kind ?? "neutral";
}

export function describeEffect(config: TimingConfig, e: Extract<TimingEvent, { type: "effect" }>): string {
  const d = timingText().describe.effect;
  const v = e.value ?? 0;
  switch (e.effect) {
    case "damage": return `${rName(config, config.healthResource)} -${num(v)}`;
    case "addResource": return `${rName(config, e.target ?? "")} ${signed(v)}`;
    case "invulnerable": return d.invulnerable(e.frames ?? 0);
    case "status": return d.status(sName(config, e.target ?? ""), e.frames ?? 0);
    case "stun": return d.stun(e.frames ?? 0);
    case "restoreCharge": return d.restoreCharge(iName(config, e.target ?? ""), num(v));
    case "cancelRecovery": return d.cancelRecovery;
    case "hitstop": return d.hitstop(e.frames ?? 0);
    case "timeScale": return d.timeScale(num(v), e.frames ?? 0);
    case "cue": return d.cue(e.target ?? "", e.value !== undefined ? num(v) : null);
  }
}

/** Window length changes caused by spam shrink, e.g. ["完美 3→1", "普通 6→8"] (names come from the config). */
export function windowChanges(config: TimingConfig, ev: Extract<TimingEvent, { type: "accept" }>): string[] {
  const def = config.interactions.find((i) => i.id === ev.interaction);
  const out: string[] = [];
  def?.windows.forEach((w) => {
    const span = ev.windows.find((s) => s.id === w.id);
    if (span && span.to - span.from !== w.frames) out.push(`${w.name} ${w.frames}→${span.to - span.from}`);
  });
  return out;
}

/** The event line without its "frame N" prefix (the log groups lines by frame). */
export function describeEventBody(config: TimingConfig, ev: TimingEvent): string {
  const d = timingText().describe.event;
  switch (ev.type) {
    case "press": return d.press(iName(config, ev.interaction));
    case "buffer": return d.buffer(iName(config, ev.interaction), ev.pressFrame);
    case "accept": {
      const notes: string[] = [];
      if (ev.buffered) notes.push(d.fromBuffer);
      const ch = windowChanges(config, ev).join(d.listSep);
      if (ch) notes.push(ev.shrink >= 0 ? d.shrink(ev.shrink, ch) : d.strictRemoved(ch));
      return d.accept(iName(config, ev.interaction), notes.length ? notes.join(d.noteSep) : null);
    }
    case "drop": return d.drop(iName(config, ev.interaction), dropReasonText(ev.reason));
    case "phase": return ev.phase === "recovery" ? d.phaseRecovery(iName(config, ev.interaction)) : d.phaseIdle(iName(config, ev.interaction));
    case "resolve": {
      const late = ev.impactFrame !== ev.frame ? d.late(ev.impactFrame) : "";
      if (ev.via === "interaction") {
        return d.resolveInteraction(ev.attack, late, iName(config, ev.interaction ?? ""), wName(config, ev.interaction, ev.window), oName(config, ev.outcome));
      }
      if (ev.via === "invulnerable") return d.resolveInvulnerable(ev.attack, late);
      return d.resolveMiss(ev.attack, late, oName(config, ev.outcome));
    }
    case "whiff": return d.whiff(iName(config, ev.interaction), ev.outcome ? oName(config, ev.outcome) : null);
    case "effect": return d.effect(describeEffect(config, ev), oName(config, ev.outcome));
    case "recharge": return d.recharge(iName(config, ev.interaction), ev.count);
    case "defeated": return d.defeated;
  }
}

/** One readable line per event in the current language, using names from the config. */
export function describeEvent(config: TimingConfig, ev: TimingEvent): string {
  return timingText().describe.event.head(ev.frame) + describeEventBody(config, ev);
}

export type LogCategory = "key" | "judge" | "effect" | "other";
/** Category ids in display order; labels are `timingText().log.categories[id]`. */
export const LOG_CATEGORIES: readonly LogCategory[] = ["key", "judge", "effect", "other"];

export function eventCategory(ev: TimingEvent): LogCategory {
  switch (ev.type) {
    case "press": case "buffer": case "accept": case "drop": return "key";
    case "resolve": case "whiff": return "judge";
    case "effect": return "effect";
    default: return "other";
  }
}

/** Colour class for a log line / marker: outcome kind, or "warn" for dropped keys. */
export function eventTone(config: TimingConfig, ev: TimingEvent): OutcomeKind | "warn" {
  switch (ev.type) {
    case "resolve": return ev.outcome ? outcomeKind(config, ev.outcome) : "neutral";
    case "whiff": case "effect": return ev.outcome ? outcomeKind(config, ev.outcome) : "neutral";
    case "drop": return "warn";
    case "defeated": return "fail";
    default: return "neutral";
  }
}
