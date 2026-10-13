// Session = attack library + queued sequence + recorded presses; persisted in this browser only.
import { Timing } from "@gml/core";
import type { Locale } from "@gml/ui/i18n";
import { getLocale } from "@gml/ui/i18n";
import { safeStorage } from "../shell/config";
import { parseReplay, replayText, type ReplayData } from "../shell/replay";
import { attackLibrary, buildSchedule, relocalizeAttacks, type ScheduledAttack, type SeqItem } from "./attacks";

export const SESSION_KEY = "gml.timing-lab.session.v1";

export interface PressRec {
  frame: number;
  interaction: string;
}

export type Source = "sequence" | "replay";

export interface Session {
  attacks: Timing.AttackDef[];
  sequence: SeqItem[];
  loop: boolean;
  /** Every hit of a move gets its own tell (off: only the first hit, the way the old combo worked). Missing in old saves = on. */
  hitTells: boolean;
  presses: PressRec[];
  /** Which scenario the lab runs: the queued attack sequence, or a window recorded from the game. */
  source: Source;
  /** The last window handed over from the game (kept while the sequence is shown, so the visitor can go back). */
  replay?: ReplayData;
}

export const defaultSession = (): Session => ({
  attacks: attackLibrary(getLocale()),
  sequence: [
    { attack: "slash", gap: 30 },
    { attack: "thrust", gap: 30 },
    { attack: "combo", gap: 30 },
  ],
  loop: false,
  hitTells: true,
  presses: [],
  source: "sequence",
});

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Parses stored session text; anything malformed falls back to the default (per field where possible). */
export function parseSession(text: string | null): Session {
  const base = defaultSession();
  if (!text) return base;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return base; }
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<Record<keyof Session, unknown>>;
  const attacks = Array.isArray(o.attacks)
    ? (o.attacks as Timing.AttackDef[]).filter((a) => a && typeof a.id === "string" && typeof a.name === "string" && isNum(a.windup) && isNum(a.telegraph) && isNum(a.recovery) && Array.isArray(a.hits) && a.hits.every((h) => h && isNum(h.offset) && Array.isArray(h.tags)))
    : [];
  const lib = attacks.length ? attacks : base.attacks;
  const sequence = Array.isArray(o.sequence)
    ? (o.sequence as SeqItem[]).filter((s) => s && typeof s.attack === "string" && isNum(s.gap) && lib.some((a) => a.id === s.attack))
    : base.sequence;
  const presses = Array.isArray(o.presses)
    ? (o.presses as PressRec[]).filter((p) => p && isNum(p.frame) && p.frame >= 0 && typeof p.interaction === "string")
    : [];
  const replay = parseReplay(o.replay);
  return relocalizeSession({
    attacks: lib, sequence, loop: o.loop === true, hitTells: o.hitTells !== false, presses,
    source: o.source === "replay" && replay ? "replay" : "sequence",
    ...(replay ? { replay } : {}),
  }, getLocale());
}

/**
 * Built-in attacks the visitor has not edited follow the language (the library is the only part of a session that holds
 * text; the sequence and presses refer to ids). Returns the same object when nothing changes.
 */
export function relocalizeSession(session: Session, to: Locale): Session {
  const attacks = relocalizeAttacks(session.attacks, to);
  return attacks.some((a, i) => a !== session.attacks[i]) ? { ...session, attacks } : session;
}

export function loadSession(storage: Pick<Storage, "getItem"> | null = safeStorage()): Session {
  try { return parseSession(storage?.getItem(SESSION_KEY) ?? null); } catch { return defaultSession(); }
}

/** Press list kept sorted by frame and free of exact duplicates; presses of removed interactions are dropped. */
export function normalizePresses(presses: PressRec[], config: Timing.TimingConfig): PressRec[] {
  const ids = new Set(config.interactions.map((i) => i.id));
  const seen = new Set<string>();
  return presses
    .filter((p) => ids.has(p.interaction))
    .map((p) => ({ frame: Math.max(0, Math.round(p.frame)), interaction: p.interaction }))
    .filter((p) => { const k = `${p.frame}|${p.interaction}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.frame - b.frame);
}

/** The presses of the active scenario (the replay carries its own). */
export const activePresses = (session: Session): PressRec[] => (session.source === "replay" && session.replay ? session.replay.presses : session.presses);

/** One synthetic attack per recorded bullet, so the scene and the frame bar can draw it (overlap is expected). */
export function replayItems(replay: ReplayData, locale: Locale = getLocale()): ScheduledAttack[] {
  return replay.bullets.map((b, index) => {
    const events = replay.attacks.filter((a) => a.id === b.id);
    const first = events[0];
    const start = Math.max(0, b.fire);
    const windup = Math.max(0, b.impact - start);
    const def: Timing.AttackDef = {
      id: b.id, name: replayText(b.names, b.name, locale), windup, telegraph: Math.min(12, windup), recovery: 0,
      hits: [{ offset: 0, tags: first ? first.tags : [], ...(first?.damage !== undefined ? { damage: first.damage } : {}) }],
    };
    return { index, def, start, end: b.impact + 1, events };
  });
}

/** The replay's starting state refers to ids the shared rules no longer have (`ids` are shown in the notice). */
export class ReplayMismatch extends Error {
  constructor(readonly ids: string[]) {
    super(`replay state mismatch: ${ids.join(", ")}`);
  }
}

/**
 * Throws ReplayMismatch when the replay's starting state refers to resources or interactions the (possibly edited) shared rules
 * no longer have; the engine would otherwise run it with undefined values.
 */
export function assertReplayFits(replay: ReplayData, config: Timing.TimingConfig): void {
  const res = new Set(config.resources.map((r) => r.id));
  const ints = new Set(config.interactions.map((i) => i.id));
  const bad = [
    ...Object.keys(replay.initial.resources).filter((k) => !res.has(k)),
    ...Object.keys(replay.initial.charges).filter((k) => !ints.has(k)),
    ...Object.keys(replay.initial.readyAt).filter((k) => !ints.has(k)),
    ...(replay.initial.action && !ints.has(replay.initial.action.interaction) ? [replay.initial.action.interaction] : []),
  ];
  if (bad.length) throw new ReplayMismatch([...new Set(bad)]);
}

/** The script the rule engine runs for this session (plus the starting state when it is a replay). */
export function buildScript(session: Session, config: Timing.TimingConfig): { script: Timing.TimingScript; items: ScheduledAttack[]; initial?: Timing.TimingState } {
  if (session.source === "replay" && session.replay) {
    const r = session.replay;
    const last = r.presses.reduce((m, p) => Math.max(m, p.frame + 1), 0);
    return {
      items: replayItems(r), initial: r.initial,
      script: { frames: Math.max(r.frames, last), presses: normalizePresses(r.presses, config), attacks: r.attacks },
    };
  }
  const { items, frames } = buildSchedule(session.sequence, session.attacks);
  const last = session.presses.reduce((m, p) => Math.max(m, p.frame + 1), 0);
  return {
    items,
    script: { frames: Math.max(frames, last), presses: normalizePresses(session.presses, config), attacks: items.flatMap((i) => i.events) },
  };
}
