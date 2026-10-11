// Session = attack library + queued sequence + recorded presses; persisted in this browser only.
import { Timing } from "@gml/core";
import { parseTimingConfig } from "@gml/ui";
import { ATTACKS, buildSchedule, type SeqItem } from "./attacks";

export const CONFIG_KEY = "gml.timing-lab.config.v1";
export const SESSION_KEY = "gml.timing-lab.session.v1";

export interface PressRec {
  frame: number;
  interaction: string;
}

export interface Session {
  attacks: Timing.AttackDef[];
  sequence: SeqItem[];
  loop: boolean;
  presses: PressRec[];
}

export const defaultConfig = (): Timing.TimingConfig => structuredClone(Timing.TIMING_PRESETS.find((p) => p.id === "souls") ?? Timing.TIMING_PRESETS[0]!);

export const defaultSession = (): Session => ({
  attacks: structuredClone(ATTACKS),
  sequence: [
    { attack: "slash", gap: 30 },
    { attack: "thrust", gap: 30 },
    { attack: "combo", gap: 30 },
  ],
  loop: false,
  presses: [],
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
  return { attacks: lib, sequence, loop: o.loop === true, presses };
}

export function loadConfig(storage: Pick<Storage, "getItem"> | null = safeStorage()): Timing.TimingConfig {
  try {
    const t = storage?.getItem(CONFIG_KEY);
    if (t) return parseTimingConfig(t);
  } catch { /* corrupt or unavailable */ }
  return defaultConfig();
}

export function loadSession(storage: Pick<Storage, "getItem"> | null = safeStorage()): Session {
  try { return parseSession(storage?.getItem(SESSION_KEY) ?? null); } catch { return defaultSession(); }
}

export function safeStorage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function save(key: string, value: unknown): void {
  try { safeStorage()?.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
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

/** The script the rule engine runs for this session. */
export function buildScript(session: Session, config: Timing.TimingConfig): { script: Timing.TimingScript; items: ReturnType<typeof buildSchedule>["items"] } {
  const { items, frames } = buildSchedule(session.sequence, session.attacks);
  const last = session.presses.reduce((m, p) => Math.max(m, p.frame + 1), 0);
  return {
    items,
    script: { frames: Math.max(frames, last), presses: normalizePresses(session.presses, config), attacks: items.flatMap((i) => i.events) },
  };
}
