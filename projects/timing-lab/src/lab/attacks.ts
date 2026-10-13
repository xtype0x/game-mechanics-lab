// Attack library and sequence scheduling. Attack moves are authoring helpers (spec §6); the rules only see AttackEvents.
import { Timing } from "@gml/core";
import { stableStringify } from "@gml/ui";
import { LOCALES, type Locale } from "@gml/ui/i18n";
import { textFor } from "./i18n";

type AttackDef = Timing.AttackDef;

const hit = (offset: number, tags: string[], damage?: number, telegraph?: number) => ({
  offset, tags, ...(damage !== undefined ? { damage } : {}), ...(telegraph !== undefined ? { telegraph } : {}),
});

/** Built-in attacks without names; names come from the dictionary (attackNames, by id). */
const ATTACK_BASE: Omit<AttackDef, "name">[] = [
  { id: "slash", windup: 30, telegraph: 20, recovery: 24, hits: [hit(0, [])] },
  { id: "thrust", windup: 24, telegraph: 16, recovery: 20, hits: [hit(0, ["thrust"])] },
  { id: "sweep", windup: 28, telegraph: 18, recovery: 24, hits: [hit(0, ["sweep"])] },
  { id: "heavy", windup: 40, telegraph: 28, recovery: 36, hits: [hit(0, ["unblockable"])] },
  // Readable combo: 22 frames between hits and a tell before each follow-up.
  { id: "combo", windup: 24, telegraph: 18, recovery: 30, hits: [hit(0, []), hit(22, [], undefined, 14), hit(44, [], undefined, 14)] },
  // The hard combo: hits 16 frames apart with short tells, still reactable (harsh, not anticipation-only).
  { id: "fastCombo", windup: 24, telegraph: 10, recovery: 30, hits: [hit(0, []), hit(16, [], undefined, 9), hit(32, [], undefined, 9)] },
  { id: "delayed", windup: 72, telegraph: 30, recovery: 28, hits: [hit(0, [])] },
  { id: "orb", windup: 36, telegraph: 18, recovery: 20, hits: [hit(0, ["energy"])] },
  { id: "volley", windup: 20, telegraph: 12, recovery: 20, hits: [0, 10, 20, 30, 40].map((o) => hit(o, ["bullet"])) },
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

/** Frames between hit i and the hit before it (hits in list order); null for the first hit. */
export const hitGap = (d: AttackDef, i: number): number | null => (i > 0 && d.hits[i] && d.hits[i - 1] ? d.hits[i]!.offset - d.hits[i - 1]!.offset : null);

/** The common gap when every hit follows the previous one by the same number of frames; null otherwise (or < 2 hits). */
export function uniformGap(d: AttackDef): number | null {
  if (d.hits.length < 2) return null;
  const g = hitGap(d, 1)!;
  return d.hits.every((_, i) => i === 0 || hitGap(d, i) === g) ? g : null;
}

/** Sets the gap before hit i (i ≥ 1) and shifts the later hits by the same amount, so their own gaps stay. Mutates `d`. */
export function setHitGap(d: AttackDef, i: number, gap: number): void {
  const cur = hitGap(d, i);
  if (cur === null) return;
  const delta = Math.max(0, Math.round(gap)) - cur;
  for (let k = i; k < d.hits.length; k++) d.hits[k]!.offset = Math.max(0, d.hits[k]!.offset + delta);
}

/** Spaces every hit `gap` frames after the previous one, keeping the first hit where it is. Mutates `d`. */
export function setUniformGap(d: AttackDef, gap: number): void {
  const g = Math.max(0, Math.round(gap));
  const first = d.hits[0]?.offset ?? 0;
  d.hits.forEach((h, k) => { h.offset = first + k * g; });
}

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

/**
 * The tell showing at `frame`: hit i of a scheduled move has its tell window [max(start, hitFrame - tel), hitFrame).
 * With `hitTells` off only hit 0 has one. When several overlap, the one whose hit is nearest wins.
 */
export function tellAt(items: ScheduledAttack[], frame: number, hitTells: boolean): { item: ScheduledAttack; hit: number; progress: number } | null {
  let best: { item: ScheduledAttack; hit: number; progress: number } | null = null;
  let bestAt = Infinity;
  for (const it of items) {
    for (let i = 0; i < it.def.hits.length; i++) {
      const tel = hitTells || i === 0 ? Timing.hitTelegraph(it.def, i) : 0;
      const at = it.start + it.def.windup + it.def.hits[i]!.offset;
      const from = Math.max(it.start, at - tel);
      if (tel <= 0 || frame < from || frame >= at || at >= bestAt) continue;
      bestAt = at;
      best = { item: it, hit: i, progress: at > from ? (frame - from) / (at - from) : 1 };
    }
  }
  return best;
}
