/**
 * Turn-based battle data model (docs/spec/battle.md).
 * Everything here is plain JSON so states can be snapshotted, replayed and ported.
 */
import type { Expr } from "../expr";
import type { ModOp, RoundingMode } from "../modifier";
import type { RngState } from "../rng";
import type { SkillType } from "../damage";

export type Team = "ally" | "enemy";

/** Who an effect lands on, relative to the actor and the chosen target. */
export type TargetMode =
  | "enemy" // the chosen enemy
  | "blast" // chosen enemy + its immediate neighbours (adjacent effects use adj* fields)
  | "allEnemies"
  | "self"
  | "ally" // the chosen ally
  | "allAllies";

export type Effect =
  | {
      kind: "damage";
      target: TargetMode;
      multiplier: number;
      /** Multiplier for neighbours when target is "blast". */
      adjMultiplier?: number;
      hits?: number[];
      toughness: number;
      adjToughness?: number;
    }
  | { kind: "heal"; target: TargetMode; scale: "atk" | "maxHp"; multiplier: number; flat: number }
  | { kind: "status"; target: TargetMode; statusId: string; chance: number }
  | { kind: "advance"; target: TargetMode; amount: number }
  | { kind: "energy"; target: TargetMode; amount: number };

export interface SkillDef {
  id: string;
  name: string;
  type: SkillType;
  /** Defaults to the user's element. */
  element?: string;
  /** Team resource change when used: basic +1, skill −1 in the default rules. */
  spDelta: number;
  energyGain: number;
  /** Ultimates require and consume this much energy. */
  energyCost?: number;
  /** What the player picks: an enemy, an ally, or nothing. */
  targeting: "enemy" | "ally" | "none";
  effects: Effect[];
  description?: string;
}

export interface StatusModifier {
  /** "stat:<key>" on the holder, or "step:<id>" for damage steps. */
  target: string;
  op: ModOp;
  /** Value per stack. */
  value: number;
  /** For step targets: apply when the holder deals damage ("outgoing") or takes it ("incoming"). */
  role?: "outgoing" | "incoming";
}

export interface StatusDef {
  id: string;
  name: string;
  kind: "buff" | "debuff";
  /** Holder turns. Decremented at the end of each of the holder's turns. */
  duration: number;
  maxStacks: number;
  modifiers: StatusModifier[];
  /** Damage over time, ticking at the start of the holder's turn. Uses the source's stats snapshot. */
  dot?: { multiplier: number; element: string };
  /** Holder skips its action while affected. */
  skipTurn?: boolean;
  description?: string;
}

export interface AiRule {
  skillId: string;
  /** Condition over the AI scope (self.*, battle.*). Missing = always. */
  when?: Expr;
  weight: number;
}

/** What makes a passive fire (docs/spec/battle.md §12). */
export type TriggerEvent =
  | "allyUltimate" // a unit on the holder's team (including the holder) used an ultimate
  | "allyBreak" // a unit on the holder's team broke an opponent's toughness
  | "selfHit" // the holder took hit damage from an opponent's action
  | "enemyKilled"; // a unit on the holder's team killed an opponent

export interface PassiveDef {
  id: string;
  name: string;
  on: TriggerEvent;
  /** Skill of this unit to cast as a follow-up. */
  skillId: string;
  /** Extra condition over the AI scope (self.*, battle.*). */
  when?: Expr;
  /** Max activations between two of the holder's own turns; 0 = unlimited. */
  limitPerTurn: number;
  description?: string;
}

export interface EncounterPreset {
  id: string;
  name: string;
  enemies: string[];
  description?: string;
}

export interface UnitDef {
  id: string;
  name: string;
  team: Team;
  element: string;
  /** Damage-rule stats (atk, def, critRate, …) plus battle stats: hp, spd, maxEnergy, effectHit, effectRes, breakEffect, toughness. */
  stats: Record<string, number>;
  weaknesses: string[];
  skills: SkillDef[];
  /** Enemy behaviour. Allies controlled by the simulator use the ally policy instead. */
  ai?: AiRule[];
  passives?: PassiveDef[];
  role?: string;
  description?: string;
}

export interface BattleRules {
  /** Action gauge length; AV = avBase / spd. */
  avBase: number;
  firstCycleAv: number;
  cycleAv: number;
  spStart: number;
  spMax: number;
  energyOnHitTaken: number;
  energyOnKill: number;
  /** Fraction of the target's full AV it is pushed back when broken. */
  breakDelay: number;
  /** Break damage formula; scope: attacker.*, defender.* (final stats). */
  breakDamage: Expr;
  /** Battle ends as a timeout after this many cycles. */
  maxCycles: number;
  rounding: RoundingMode;
}

export interface EncounterDef {
  allies: string[];
  enemies: string[];
}

export interface AllyPolicy {
  /** "asap": cast every ultimate as soon as energy is full. "never": never cast. */
  ult: "asap" | "never";
  /** Use the skill when SP allows, otherwise the basic attack. */
  skill: "whenSp" | "never" | "always";
  /** How the simulator picks an enemy target. */
  target: "lowestHp" | "highestHp" | "first" | "weaknessFirst";
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export interface StatusInstance {
  statusId: string;
  sourceUid: string;
  stacks: number;
  turnsLeft: number;
  /** Source's resolved attacker stats at application time (for DoT). */
  snapshot?: Record<string, number>;
}

export interface UnitState {
  uid: string;
  defId: string;
  name: string;
  team: Team;
  slot: number;
  element: string;
  base: Record<string, number>;
  weaknesses: string[];
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  toughness: number;
  maxToughness: number;
  broken: boolean;
  alive: boolean;
  /** Remaining action value until this unit's next turn. */
  av: number;
  statuses: StatusInstance[];
  /** Passive activations since the holder's last turn start. */
  passiveUses: Record<string, number>;
}

export type BattleEvent =
  | { t: "cycle"; cycle: number; time: number }
  | { t: "turn"; uid: string; time: number }
  | { t: "recover"; uid: string }
  | { t: "skip"; uid: string; reason: string }
  | { t: "action"; uid: string; skillId: string; skillName: string; skillType: SkillType; targetUid?: string; time: number }
  | { t: "trigger"; uid: string; passiveId: string; passiveName: string; targetUid?: string }
  | { t: "damage"; src: string; dst: string; amount: number; crit: boolean; kind: "hit" | "break" | "dot"; hpAfter: number; skillId?: string }
  | { t: "toughness"; dst: string; before: number; after: number }
  | { t: "break"; src: string; dst: string }
  | { t: "heal"; src: string; dst: string; amount: number }
  | { t: "status"; src: string; dst: string; statusId: string; result: "applied" | "resisted" | "refreshed" | "expired" }
  | { t: "energy"; uid: string; before: number; after: number }
  | { t: "sp"; before: number; after: number }
  | { t: "advance"; uid: string; before: number; after: number }
  | { t: "death"; uid: string; by: string }
  | { t: "end"; result: BattleResult; time: number };

export type BattleResult = "win" | "lose" | "timeout";

export interface Decision {
  /** Ally whose normal turn it is. */
  actorUid: string;
}

export interface BattleState {
  units: UnitState[];
  sp: number;
  /** Total AV elapsed since battle start. */
  time: number;
  cycle: number;
  turns: number;
  rng: { crit: RngState; status: RngState; ai: RngState };
  phase: "await" | "ended";
  decision?: Decision;
  result?: BattleResult;
  events: BattleEvent[];
}

export type Action =
  | { kind: "skill"; actorUid: string; skillId: string; targetUid?: string }
  | { kind: "ult"; actorUid: string; skillId: string; targetUid?: string };
