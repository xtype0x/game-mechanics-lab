// A recorded window of a bullet-parry run, handed from the game to the frame lab. Shared by both modes: types and
// shape validation only (no game or lab imports).
import type { Timing } from "@gml/core";
import type { Locale, LocalizedText } from "@gml/ui/i18n";

export interface ReplayPress {
  frame: number;
  interaction: string;
}

export interface ReplayBullet {
  id: string;
  /** Display name in the language the replay was built in. */
  name: string;
  /** The same name in every language (absent in replays saved before it existed). */
  names?: LocalizedText;
  kind: string;
  color: string;
  /** Rebased fire frame (may be negative: fired before the window). */
  fire: number;
  /** Rebased impact frame. */
  impact: number;
}

export interface ReplayData {
  format: "gml-timing-replay";
  version: 1;
  createdAt: string;
  /** Practice runs refill health on the host side, which a replay does not reproduce. */
  practice: boolean;
  difficulty: number;
  configName: string;
  /** The rules name in every language, when the run used an untouched built-in preset. */
  configNames?: LocalizedText;
  /** Timing state at frame 0 of the window (rebased). */
  initial: Timing.TimingState;
  frames: number;
  presses: ReplayPress[];
  originalPresses: ReplayPress[];
  attacks: Timing.AttackEvent[];
  bullets: ReplayBullet[];
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === "string";
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isNumRecord = (x: unknown): boolean => isObj(x) && Object.values(x).every(isNum);
const isText = (x: unknown): boolean => x === undefined || (isObj(x) && Object.values(x).every(isStr));
const isPress = (p: unknown): p is ReplayPress => isObj(p) && isNum(p.frame) && isStr(p.interaction);
const isAttack = (a: unknown): boolean =>
  isObj(a) && isStr(a.id) && isNum(a.frame) && Array.isArray(a.tags) && a.tags.every(isStr) && (a.damage === undefined || isNum(a.damage));
const isBullet = (b: unknown): boolean =>
  isObj(b) && isStr(b.id) && isStr(b.name) && isStr(b.kind) && isStr(b.color) && isNum(b.fire) && isNum(b.impact) && isText(b.names);

function isTimingState(s: unknown): s is Timing.TimingState {
  if (!isObj(s)) return false;
  if (s.frame !== 0 || !isNum(s.stunUntil) || typeof s.defeated !== "boolean") return false;
  if (!isNumRecord(s.resources) || !isNumRecord(s.statuses) || !isNumRecord(s.readyAt)) return false;
  if (!isObj(s.charges) || !Object.values(s.charges).every((c) => isObj(c) && isNum(c.count) && Array.isArray(c.pending) && c.pending.every(isNum))) return false;
  if (s.action !== null && !(isObj(s.action) && isStr(s.action.interaction) && isNum(s.action.start) && isNum(s.action.activeEnd) && Array.isArray(s.action.windows))) return false;
  if (s.buffered !== null && !(isObj(s.buffered) && isStr(s.buffered.interaction) && isNum(s.buffered.frame) && isNum(s.buffered.shrink))) return false;
  if (!Array.isArray(s.presses) || !s.presses.every((p) => Array.isArray(p) && isNum(p[0]) && isStr(p[1]))) return false;
  return Array.isArray(s.pending) && s.pending.every(isAttack);
}

/** Shape check for a stored replay; returns a normalized copy, or null when anything is off. */
export function parseReplay(raw: unknown): ReplayData | null {
  if (!isObj(raw) || raw.format !== "gml-timing-replay" || raw.version !== 1) return null;
  if (!isStr(raw.createdAt) || typeof raw.practice !== "boolean" || !isNum(raw.difficulty) || !isStr(raw.configName) || !isText(raw.configNames)) return null;
  if (!isNum(raw.frames) || raw.frames < 1 || raw.frames > 100000) return null;
  if (!isTimingState(raw.initial)) return null;
  if (!Array.isArray(raw.presses) || !raw.presses.every(isPress)) return null;
  if (!Array.isArray(raw.originalPresses) || !raw.originalPresses.every(isPress)) return null;
  if (!Array.isArray(raw.attacks) || !raw.attacks.every(isAttack)) return null;
  if (!Array.isArray(raw.bullets) || !raw.bullets.every(isBullet)) return null;
  return raw as unknown as ReplayData;
}

/** A recorded name in `locale`, falling back to the text stored at record time. */
export const replayText = (names: LocalizedText | undefined, fallback: string, locale: Locale): string => names?.[locale] ?? fallback;
