/** Pure view model of the judgement strip and log, derived from the session's rolling JudgeLog. */
import type { Timing } from "@gml/core";
import { actionSpans, describeEvent, eventCategory, eventTone, pressMarks, traceRanges, type ActionSpans, type PressMark } from "@gml/ui";
import { BULLET_KINDS, type BulletKindId, type ImpactMark, type JudgeLog } from "../game";

export const STRIP_PAST = 120;
export const STRIP_AHEAD = 40;

export interface StripRow {
  id: string;
  name: string;
  color: string;
  actions: ActionSpans[];
  presses: PressMark[];
}

export interface StripModel {
  from: number;
  to: number;
  bullets: { frame: number; kind: BulletKindId; color: string; future: boolean }[];
  rows: StripRow[];
  resolves: { frame: number; tone: string; text: string }[];
  stun: { from: number; to: number }[];
  invul: { from: number; to: number }[];
}

export const TONE_COLORS: Record<string, string> = { perfect: "#ffd45c", success: "#6fd08a", fail: "#f0707a", neutral: "#8a9aa5", warn: "#ffb35c" };
const FALLBACK = ["#7c95ff", "#f59e0b", "#2dd4bf", "#c084fc", "#fb7185"];

/** `end` = world frame at the playhead; `upcoming` are predicted impacts after it. */
export function buildStripModel(
  config: Timing.TimingConfig, log: JudgeLog, end: number, upcoming: ImpactMark[] = [], past = STRIP_PAST, ahead = STRIP_AHEAD,
): StripModel {
  const from = end - past;
  const to = end + ahead;
  const events = log.events.toArray().filter((e) => e.frame <= end && e.frame >= from - 90);
  const bullets: StripModel["bullets"] = [];
  log.impacts.forEach((m) => {
    if (m.frame >= from && m.frame <= end) bullets.push({ ...m, color: BULLET_KINDS[m.kind].color, future: false });
  });
  for (const m of upcoming) if (m.frame > end && m.frame <= to) bullets.push({ ...m, color: BULLET_KINDS[m.kind].color, future: true });
  const all = actionSpans(config, events, end + 1);
  const presses = pressMarks(events).filter((p) => p.frame >= from);
  const rows: StripRow[] = config.interactions.map((it, i) => ({
    id: it.id,
    name: it.name,
    color: it.color ?? FALLBACK[i % FALLBACK.length]!,
    actions: all.filter((a) => a.interaction === it.id && (a.recovery?.to ?? a.windows[a.windows.length - 1]?.to ?? a.start + 1) >= from),
    presses: presses.filter((p) => p.interaction === it.id),
  }));
  const traces = log.traces.toArray().filter((t) => t.frame >= from && t.frame <= end);
  const resolves = events
    .filter((e): e is Extract<Timing.TimingEvent, { type: "resolve" }> => e.type === "resolve" && e.frame >= from)
    .map((e) => ({ frame: e.frame, tone: eventTone(config, e), text: describeEvent(config, e) }));
  return { from, to, bullets, rows, resolves, stun: traceRanges(traces, (t) => t.stunned), invul: traceRanges(traces, (t) => t.invulnerable) };
}

export interface LogLine { key: string; frame: number; text: string; tone: string }

/** Last `n` key / judgement lines up to frame `end`, newest first. */
export function buildLogLines(config: Timing.TimingConfig, log: JudgeLog, end: number, n = 8): LogLine[] {
  const out: LogLine[] = [];
  for (let i = log.events.size - 1; i >= 0 && out.length < n; i--) {
    const e = log.events.at(i)!;
    if (e.frame > end) continue;
    const cat = eventCategory(e);
    if (cat !== "key" && cat !== "judge") continue;
    out.push({ key: `${i}:${e.frame}:${e.type}`, frame: e.frame, text: describeEvent(config, e).replace(/^第 \d+ 幀｜/, ""), tone: eventTone(config, e) });
  }
  return out;
}
