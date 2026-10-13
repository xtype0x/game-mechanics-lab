/**
 * Timing rules 1.1 — data-driven reactive interactions (parry, dodge, and anything users define).
 * Authoritative spec: docs/spec/timing.md. All times are integer frames; `fps` is only for display/ms conversion.
 */
import type { Expr } from "../expr";

/** Attack tag, e.g. bullet / unblockable / thrust. Interactions decide outcomes per tag. */
export interface TagDef {
  id: string;
  name: string;
  color?: string;
}

/** A numeric pool (hp, skill gauge, posture…). Values are clamped to [0, max]. */
export interface ResourceDef {
  id: string;
  name: string;
  max: number;
  initial: number;
}

/** A named timer set by the `status` effect; readable in Expr as `status.<id>` (remaining frames, 0 = inactive). */
export interface StatusDef {
  id: string;
  name: string;
}

/** spec §3 — the effect vocabulary. Every numeric field is an Expr evaluated in the §5 scope. */
export type EffectDef = (
  | { type: "damage"; amount: Expr }
  | { type: "addResource"; resource: string; amount: Expr }
  | { type: "invulnerable"; frames: Expr }
  | { type: "stun"; frames: Expr }
  | { type: "status"; status: string; frames: Expr }
  | { type: "restoreCharge"; interaction: string; amount: Expr }
  | { type: "cancelRecovery" }
  | { type: "hitstop"; frames: Expr }
  | { type: "timeScale"; scale: Expr; frames: Expr }
  | { type: "cue"; cue: string; value?: Expr }
) & {
  /** Effect is skipped when this evaluates falsy. */
  when?: Expr;
};

export type OutcomeKind = "perfect" | "success" | "fail" | "neutral";

export interface OutcomeDef {
  id: string;
  name: string;
  kind: OutcomeKind;
  color?: string;
  effects: EffectDef[];
}

export interface WindowDef {
  id: string;
  name: string;
  frames: number;
  /** Strict windows shrink under spam penalty and are skipped by buffered presses (spec §4.3). */
  strict?: boolean;
}

/** One row of an interaction's result table; rows are checked top-down (spec §4.5). */
export interface ResultRow {
  /** Attack tag this row matches; null = matches every attack (default row). */
  tag: string | null;
  /** Window id → outcome id. Missing or null = this interaction does not catch the attack (it falls through). */
  cells: Record<string, string | null>;
}

export interface ChargeDef {
  max: number;
  /** Frames to regain one charge. */
  recharge: number;
  /** sequential: one charge at a time; parallel: each spent charge has its own timer. */
  mode: "sequential" | "parallel";
}

export interface SpamDef {
  /** Look-back range for counting earlier raw presses. */
  withinFrames: number;
  /** "self": only presses of this interaction count; "all": presses of any interaction count. */
  scope: "self" | "all";
  /** Strict windows shrink by count × shrinkPerPress frames, capped at maxShrink. */
  shrinkPerPress: number;
  maxShrink: number;
  /** When count ≥ lockoutAfter (> 0), the press is dropped and the player is stunned for lockoutFrames. 0 = off. */
  lockoutAfter: number;
  lockoutFrames: number;
  /** When an action of this interaction catches an attack, the press that started it is removed from the press history (spec §4.4). Missing = false. */
  forgiveCaught?: boolean;
}

export interface InteractionDef {
  id: string;
  name: string;
  /** UI hint only (e.g. "KeyJ"); hosts own the real binding. */
  key?: string;
  color?: string;
  /** Lower number wins when several presses are accepted-able in the same frame; ties by list order. */
  priority: number;
  startup: number;
  windows: WindowDef[];
  successRecovery: number;
  whiffRecovery: number;
  /** Max attacks one press can catch; 0 = unlimited. Reaching it ends the active phase. */
  maxCatches: number;
  table: ResultRow[];
  /** Applied when the active phase ends with no catch (only if total window frames > 0). */
  whiffOutcome?: string;
  /** Applied at acceptance (e.g. a skill granting invulnerability). */
  onAccept?: string;
  /** Frames after acceptance before this interaction may be accepted again. */
  cooldown: number;
  charges?: ChargeDef;
  cost?: { resource: string; amount: number };
  /** Frames a busy press is remembered; 0 = busy presses are dropped. */
  buffer: number;
  spam?: SpamDef;
}

export interface TimingConfig {
  version: 1;
  id: string;
  name: string;
  description?: string;
  fps: number;
  /** Attacks are resolved this many frames after their impact frame (latency compensation, spec §4.6). */
  inputOffset: number;
  tags: TagDef[];
  resources: ResourceDef[];
  statuses: StatusDef[];
  outcomes: OutcomeDef[];
  interactions: InteractionDef[];
  /** Outcome applied when an attack is neither caught nor blocked by invulnerability. */
  hitOutcome: string;
  /** Resource reduced by the `damage` effect; reaching 0 emits `defeated`. */
  healthResource: string;
}

/** An attack reaching the player. `frame` is the impact frame. */
export interface AttackEvent {
  id: string;
  frame: number;
  tags: string[];
  /** Default 1. */
  damage?: number;
}

/** Authoring helper for timelines (spec §6): a move with telegraph and one or more hits. */
export interface AttackDef {
  id: string;
  name: string;
  /** Frames from move start to the first hit. */
  windup: number;
  /** Frames before the first hit at which the tell (flash / glint) appears; visual only. */
  telegraph: number;
  recovery: number;
  hits: { offset: number; damage?: number; tags: string[]; /** Overrides `telegraph` for this hit; 0 = no tell. Visual only. */ telegraph?: number }[];
}

export interface WindowSpan {
  id: string;
  /** Absolute frames, `to` exclusive. */
  from: number;
  to: number;
}

export interface ActionState {
  interaction: string;
  start: number;
  /** Frame of the raw press that started this action (the buffered press frame for a buffered action, else the accept frame). */
  pressFrame: number;
  buffered: boolean;
  shrink: number;
  windows: WindowSpan[];
  /** Exclusive end of the active phase (may move earlier when maxCatches is reached). */
  activeEnd: number;
  /** Set when the action enters recovery. */
  recoveryEnd: number | null;
  catches: number;
}

export interface ChargeState {
  count: number;
  /** sequential: frame the next charge arrives (null when full). parallel: arrival frame per spent charge, ascending. */
  pending: number[];
}

/**
 * NOTE: every field holding an ABSOLUTE frame number must be shifted by `rebaseTimingState` (engine.ts, spec §7.3).
 * When adding a field to TimingState (or to ActionState / WindowSpan / AttackEvent) that stores a frame, update it.
 */
export interface TimingState {
  frame: number;
  resources: Record<string, number>;
  /** Status id → exclusive end frame. "invulnerable" is built in. */
  statuses: Record<string, number>;
  stunUntil: number;
  action: ActionState | null;
  charges: Record<string, ChargeState>;
  readyAt: Record<string, number>;
  buffered: { interaction: string; frame: number; shrink: number } | null;
  /** Raw press history kept for spam counting: [frame, interaction]. */
  presses: [number, string][];
  /** Attacks waiting for their resolve frame (impact + inputOffset). */
  pending: AttackEvent[];
  defeated: boolean;
}

export type DropReason = "busy" | "cooldown" | "noCharge" | "noResource" | "conflict" | "spamLockout" | "bufferExpired" | "bufferReplaced" | "defeated";

export type TimingEvent =
  | { frame: number; type: "press"; interaction: string }
  | { frame: number; type: "buffer"; interaction: string; pressFrame: number }
  | { frame: number; type: "accept"; interaction: string; pressFrame: number; buffered: boolean; shrink: number; windows: WindowSpan[] }
  | { frame: number; type: "drop"; interaction: string; pressFrame: number; reason: DropReason }
  | { frame: number; type: "phase"; interaction: string; phase: "recovery" | "idle" }
  | { frame: number; type: "resolve"; attack: string; impactFrame: number; via: "interaction" | "invulnerable" | "hit"; interaction?: string; window?: string; outcome: string | null }
  | { frame: number; type: "whiff"; interaction: string; outcome: string | null }
  | { frame: number; type: "effect"; outcome: string; effect: EffectDef["type"]; target?: string; value?: number; frames?: number }
  | { frame: number; type: "recharge"; interaction: string; count: number }
  | { frame: number; type: "defeated" };

/** Input for one frame. `attacks` are impacts whose frame equals the current frame. */
export interface FrameInput {
  presses: string[];
  attacks: AttackEvent[];
}

export interface TimingScript {
  frames: number;
  presses: { frame: number; interaction: string }[];
  attacks: AttackEvent[];
}

export interface ValidationIssue {
  level: "error" | "warning";
  path: string;
  message: string;
}

/** Per-frame snapshot taken AFTER a frame is processed; for UI frame bars (not part of the vectors). */
export interface FrameTrace {
  frame: number;
  phase: "idle" | "startup" | "active" | "recovery" | "stun";
  interaction?: string;
  window?: string;
  invulnerable: boolean;
  stunned: boolean;
  charges: Record<string, number>;
  resources: Record<string, number>;
}

export interface TimingRun {
  events: TimingEvent[];
  final: TimingState;
  trace?: FrameTrace[];
}
