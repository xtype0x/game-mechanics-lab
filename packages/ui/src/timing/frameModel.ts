// Pure model behind <FrameBar>: turns timing events and trace into drawable spans.
import type { Timing } from "@gml/core";

export interface ActionSpans {
  interaction: string;
  start: number;
  buffered: boolean;
  startup: { from: number; to: number } | null;
  windows: { id: string; name: string; strict: boolean; from: number; to: number }[];
  recovery: { from: number; to: number } | null;
}

export interface PressMark {
  frame: number;
  interaction: string;
  status: "accepted" | "dropped" | "buffered";
  /** Drop reason (for dropped) or note. */
  reason?: Timing.DropReason;
}

/** One action per `accept` event, with segments clipped to where the action really ended. */
export function actionSpans(config: Timing.TimingConfig, events: Timing.TimingEvent[], horizon: number): ActionSpans[] {
  const out: (ActionSpans & { end: number })[] = [];
  const open = new Map<string, ActionSpans & { end: number; recoveryFrom: number | null }>();
  const close = (id: string, at: number) => {
    const a = open.get(id);
    if (!a) return;
    open.delete(id);
    a.end = at;
  };
  const all: (ActionSpans & { end: number; recoveryFrom: number | null })[] = [];
  for (const ev of events) {
    if (ev.type === "accept") {
      close(ev.interaction, ev.frame);
      const def = config.interactions.find((i) => i.id === ev.interaction);
      const a = {
        interaction: ev.interaction, start: ev.frame, buffered: ev.buffered, startup: null as ActionSpans["startup"],
        windows: ev.windows.map((w) => {
          const wd = def?.windows.find((x) => x.id === w.id);
          return { id: w.id, name: wd?.name ?? w.id, strict: !!wd?.strict, from: w.from, to: w.to };
        }),
        recovery: null as ActionSpans["recovery"], end: Infinity, recoveryFrom: null as number | null,
      };
      open.set(ev.interaction, a);
      all.push(a);
    } else if (ev.type === "phase") {
      const a = open.get(ev.interaction);
      if (!a) continue;
      if (ev.phase === "recovery") a.recoveryFrom = ev.frame;
      else close(ev.interaction, ev.frame);
    }
  }
  for (const a of all) {
    const def = config.interactions.find((i) => i.id === a.interaction);
    const end = Math.min(a.end, horizon);
    const firstWin = a.windows.find((w) => w.to > w.from);
    const activeEnd = a.recoveryFrom ?? Math.min(end, a.windows.length ? Math.max(...a.windows.map((w) => w.to)) : a.start + (def?.startup ?? 0));
    const startupTo = Math.min(firstWin ? firstWin.from : activeEnd, end);
    a.startup = startupTo > a.start ? { from: a.start, to: startupTo } : null;
    a.windows = a.windows
      .map((w) => ({ ...w, to: Math.min(w.to, activeEnd, end) }))
      .filter((w) => w.to > w.from);
    if (a.recoveryFrom !== null && end > a.recoveryFrom) a.recovery = { from: a.recoveryFrom, to: end };
    out.push(a);
  }
  return out;
}

/** Every raw press with what became of it. */
export function pressMarks(events: Timing.TimingEvent[]): PressMark[] {
  const marks: PressMark[] = [];
  for (const ev of events) {
    if (ev.type !== "press") continue;
    const same = (e: Timing.TimingEvent) => "pressFrame" in e && e.pressFrame === ev.frame && "interaction" in e && e.interaction === ev.interaction;
    const drop = events.find((e): e is Extract<Timing.TimingEvent, { type: "drop" }> => e.type === "drop" && same(e));
    if (drop) marks.push({ frame: ev.frame, interaction: ev.interaction, status: "dropped", reason: drop.reason });
    else if (events.some((e) => e.type === "buffer" && same(e))) marks.push({ frame: ev.frame, interaction: ev.interaction, status: "buffered" });
    else marks.push({ frame: ev.frame, interaction: ev.interaction, status: "accepted" });
  }
  return marks;
}

/** Contiguous frame ranges where `pick(trace)` holds. */
export function traceRanges(trace: Timing.FrameTrace[], pick: (t: Timing.FrameTrace) => boolean): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let cur: { from: number; to: number } | null = null;
  for (const t of trace) {
    if (pick(t)) {
      if (cur && cur.to === t.frame) cur.to = t.frame + 1;
      else { cur = { from: t.frame, to: t.frame + 1 }; out.push(cur); }
    }
  }
  return out;
}

export interface AttackSpans {
  id: string;
  name: string;
  color: string | undefined;
  windup: { from: number; to: number };
  telegraph: { from: number; to: number };
  hits: number[];
  recovery: { from: number; to: number };
}

export function attackSpans(config: Timing.TimingConfig, def: Timing.AttackDef, start: number): AttackSpans {
  const hits = def.hits.map((h) => start + def.windup + h.offset);
  const first = hits.length ? Math.min(...hits) : start + def.windup;
  const last = hits.length ? Math.max(...hits) : first;
  const tag = def.hits[0]?.tags[0];
  return {
    id: def.id, name: def.name, color: config.tags.find((t) => t.id === tag)?.color,
    windup: { from: start, to: first },
    telegraph: { from: Math.max(start, first - def.telegraph), to: first },
    hits, recovery: { from: last + 1, to: last + 1 + def.recovery },
  };
}
