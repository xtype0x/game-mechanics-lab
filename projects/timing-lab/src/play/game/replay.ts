/**
 * Rolling recording of the last ~7 s of a run, so the frame lab can replay the window with the exact same inputs
 * (spec timing §7.1/§7.3: a rebased state snapshot + the inputs fed to `stepTiming` reproduce the original events).
 * Pure data, bounded size, no DOM.
 */
import { Timing } from "@gml/core";
import { LOCALES, type Locale, type LocalizedText } from "@gml/ui/i18n";
import { relocalizeGameConfig } from "../../shell/presets";
import type { ReplayBullet, ReplayData, ReplayPress } from "../../shell/replay";
import { textFor } from "../i18n";
import { BULLET_KINDS, bulletKindName, type BulletKindId } from "./config";
import { Ring } from "./judge";
import type { StepResult, World } from "./world";

/** Take a state snapshot every this many world frames. */
export const SNAPSHOT_EVERY = 30;
/** Window the replay covers (the snapshot picked is the oldest one inside it). */
export const REPLAY_WINDOW = 360;
/** Extra frames after "now" so resolves that land just after the pause still show. */
export const REPLAY_TAIL = 40;

interface Snapshot { frame: number; state: Timing.TimingState }
interface StepRec { frame: number; presses: string[]; attacks: Timing.AttackEvent[] }
interface BulletRec { id: string; kind: BulletKindId; fireFrame: number; impactFrame?: number }

export class ReplayRecorder {
  readonly snapshots = new Ring<Snapshot>(14);
  readonly steps = new Ring<StepRec>(420);
  readonly bullets = new Ring<BulletRec>(64);
  private idBefore = 1;

  /** Call right before `stepWorld`. */
  begin(w: World): void {
    if (w.frame % SNAPSHOT_EVERY === 0) this.snapshots.push({ frame: w.frame, state: structuredClone(w.timing) });
    this.idBefore = w.nextId;
  }

  /** Call right after `stepWorld`; `frame` is the world frame that was stepped. */
  end(frame: number, r: StepResult): void {
    this.steps.push({ frame, presses: r.presses.slice(), attacks: r.attacks.map((a) => ({ ...a, tags: a.tags.slice() })) });
    let id = this.idBefore;
    for (const e of r.events) if (e.type === "fire") this.bullets.push({ id: "b" + id++, kind: e.kind, fireFrame: frame });
    for (const a of r.attacks) this.bullets.forEach((b) => { if (b.id === a.id) b.impactFrame = a.frame; });
  }
}

/**
 * The window ending at `nowFrame`, or null when nothing was recorded. Picks the oldest snapshot no older than
 * `REPLAY_WINDOW` frames, so the window is 330 to 360 frames (or the whole run when it is shorter).
 */
export function buildReplay(session: { world: World; replay: ReplayRecorder }, nowFrame: number = session.world.frame): ReplayData | null {
  const { world, replay: rec } = session;
  const snap = rec.snapshots.toArray().find((s) => s.frame >= nowFrame - REPLAY_WINDOW && s.frame < nowFrame);
  if (!snap) return null;
  const origin = snap.frame;
  const presses: ReplayPress[] = [];
  const attacks: Timing.AttackEvent[] = [];
  rec.steps.forEach((s) => {
    if (s.frame < origin || s.frame >= nowFrame) return;
    for (const p of s.presses) presses.push({ frame: s.frame - origin, interaction: p });
    for (const a of s.attacks) attacks.push({ ...a, frame: a.frame - origin, tags: a.tags.slice() });
  });
  const bullets: ReplayBullet[] = [];
  rec.bullets.forEach((b) => {
    if (b.impactFrame === undefined || b.impactFrame < origin || b.impactFrame >= nowFrame) return;
    bullets.push({
      id: b.id, name: bulletKindName(b.kind), names: inEveryLocale((l) => textFor(l).bulletKinds[b.kind] ?? b.kind), kind: b.kind, color: BULLET_KINDS[b.kind].color,
      fire: b.fireFrame - origin, impact: b.impactFrame - origin,
    });
  });
  // The rules name follows the language later only for an untouched built-in preset (edited rules keep their text).
  const builtIn = LOCALES.every((l) => relocalizeGameConfig(world.config, l) !== null);
  return {
    format: "gml-timing-replay", version: 1,
    createdAt: new Date().toISOString(),
    practice: world.practice, difficulty: world.difficulty, configName: world.config.name,
    ...(builtIn ? { configNames: inEveryLocale((l) => relocalizeGameConfig(world.config, l)!.name) } : {}),
    initial: Timing.rebaseTimingState(snap.state, origin),
    frames: nowFrame - origin + REPLAY_TAIL,
    presses, originalPresses: presses.map((p) => ({ ...p })), attacks, bullets,
  };
}

function inEveryLocale(fn: (l: Locale) => string): LocalizedText {
  return Object.fromEntries(LOCALES.map((l) => [l, fn(l)])) as LocalizedText;
}
