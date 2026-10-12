// Attack library and sequence scheduling. Attack moves are authoring helpers (spec §6); the rules only see AttackEvents.
import { Timing } from "@gml/core";
import { stableStringify } from "@gml/ui";
import { LOCALES, type Locale } from "@gml/ui/i18n";
import { textFor } from "./i18n";

type AttackDef = Timing.AttackDef;

const hit = (offset: number, tags: string[], damage?: number) => ({ offset, tags, ...(damage !== undefined ? { damage } : {}) });

/** Built-in attacks without names; names come from the dictionary (attackNames, by id). */
const ATTACK_BASE: Omit<AttackDef, "name">[] = [
  { id: "slash", windup: 30, telegraph: 8, recovery: 24, hits: [hit(0, [])] },
  { id: "thrust", windup: 24, telegraph: 6, recovery: 20, hits: [hit(0, ["thrust"])] },
  { id: "sweep", windup: 28, telegraph: 8, recovery: 24, hits: [hit(0, ["sweep"])] },
  { id: "heavy", windup: 40, telegraph: 14, recovery: 36, hits: [hit(0, ["unblockable"])] },
  { id: "combo", windup: 24, telegraph: 6, recovery: 30, hits: [hit(0, []), hit(14, []), hit(28, [])] },
  { id: "delayed", windup: 72, telegraph: 30, recovery: 28, hits: [hit(0, [])] },
  { id: "orb", windup: 36, telegraph: 10, recovery: 20, hits: [hit(0, ["energy"])] },
  { id: "volley", windup: 20, telegraph: 6, recovery: 20, hits: [0, 10, 20, 30, 40].map((o) => hit(o, ["bullet"])) },
];

/** The built-in attack library with names in the given language (fresh objects each call). */
export function attackLibrary(locale: Locale): AttackDef[] {
  const names = textFor(locale).attackNames;
  return ATTACK_BASE.map((a) => structuredClone({ ...a, name: names[a.id] ?? a.id }));
}

/**
 * An untouched built-in attack follows the language: returns a fresh `to`-language copy when `def` equals the built-in
 * attack with the same id in ANY language, else null (edited or custom, i.e. the visitor's data).
 */
export function relocalizeAttack(def: AttackDef, to: Locale, library: (locale: Locale) => AttackDef[] = attackLibrary): AttackDef | null {
  const key = stableStringify(def);
  if (!LOCALES.some((l) => library(l).some((a) => a.id === def.id && stableStringify(a) === key))) return null;
  return library(to).find((a) => a.id === def.id) ?? null;
}

/** relocalizeAttack over a list; edited attacks keep their identity (same object). */
export function relocalizeAttacks(list: AttackDef[], to: Locale, library: (locale: Locale) => AttackDef[] = attackLibrary): AttackDef[] {
  return list.map((a) => relocalizeAttack(a, to, library) ?? a);
}

export interface SeqItem {
  attack: string;
  /** Frames of rest after this attack's recovery before the next one starts. */
  gap: number;
}

export interface ScheduledAttack {
  index: number;
  def: AttackDef;
  start: number;
  /** Frame after which the whole move (recovery included) is over. */
  end: number;
  events: Timing.AttackEvent[];
}

export const LEAD_FRAMES = 30;
export const TAIL_FRAMES = 60;

export const attackLength = (d: AttackDef): number => {
  const last = d.hits.length ? Math.max(...d.hits.map((h) => h.offset)) : 0;
  return d.windup + last + 1 + d.recovery;
};

/** Lays the queued attacks end to end and expands them to impact events with readable unique ids. */
export function buildSchedule(seq: SeqItem[], library: AttackDef[]): { items: ScheduledAttack[]; frames: number } {
  const items: ScheduledAttack[] = [];
  let at = LEAD_FRAMES;
  seq.forEach((s, k) => {
    const def = library.find((a) => a.id === s.attack);
    if (!def) return;
    const events = Timing.expandAttack(def, at).map((e, i) => ({ ...e, id: `${def.name}${seq.length > 1 ? `[${k + 1}]` : ""}#${i + 1}` }));
    const end = at + attackLength(def);
    items.push({ index: k, def, start: at, end, events });
    at = end + Math.max(0, s.gap);
  });
  const frames = Math.max(items.length ? items[items.length - 1]!.end : LEAD_FRAMES, at) + TAIL_FRAMES;
  return { items, frames };
}

export type AttackPhase = "idle" | "windup" | "telegraph" | "strike" | "recovery";

/** Animation phase of the attacker at a frame; `progress` runs 0..1 inside the phase. */
export function attackPhaseAt(items: ScheduledAttack[], frame: number): { phase: AttackPhase; item?: ScheduledAttack; progress: number } {
  for (const it of items) {
    if (frame < it.start || frame >= it.end) continue;
    const hits = it.events.map((e) => e.frame);
    const first = Math.min(...hits, it.start + it.def.windup);
    const last = Math.max(...hits, first);
    const span = (a: number, b: number) => (b > a ? (frame - a) / (b - a) : 1);
    const tellFrom = Math.max(it.start, first - it.def.telegraph);
    if (frame < tellFrom) return { phase: "windup", item: it, progress: span(it.start, tellFrom) };
    if (frame < first) return { phase: "telegraph", item: it, progress: span(tellFrom, first) };
    if (frame <= last + 3) return { phase: "strike", item: it, progress: span(first, last + 3) };
    return { phase: "recovery", item: it, progress: span(last + 3, it.end) };
  }
  return { phase: "idle", progress: 0 };
}
