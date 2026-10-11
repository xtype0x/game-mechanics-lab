/**
 * Turn-based battle data model (docs/spec/battle.md).
 * Everything here is plain JSON so states can be snapshotted, replayed and ported.
 */
import type { Expr } from "../expr";
import type { ModOp, RoundingMode } from "../modifier";
import type { RngState } from "../rng";
import type { SkillType } from "../damage";

export type Team = "ally" | "enemy";

/** A number or a formula over the effect scope (spec §16.1). */
export type Num = number | Expr;

/** Who an effect lands on, relative to the actor and the chosen target. */
export type TargetMode =
  | "enemy" // the chosen enemy
  | "blast" // chosen enemy + its immediate neighbours (adjacent effects use adj* fields)
  | "allEnemies"
  | "self"
  | "ally" // the chosen ally
  | "allAllies"
  | "victim"; // inside a damage effect's onHit: the unit that took this hit (§16.5); empty elsewhere

/** Effect payloads. Every effect also accepts `when` / `chance` (see Effect). */
type EffectCore =
  | {
      kind: "damage";
      target: TargetMode;
      multiplier: Num;
      /** Multiplier for neighbours when target is "blast". */
      adjMultiplier?: Num;
      hits?: number[];
      toughness: Num;
      adjToughness?: Num;
      /** Stat the multiplier scales with (§13.4); targetMaxHp / targetHp use the victim (§15.3). Default "atk". */
      scale?: DamageEffectScale;
      /** Effects run after each hit's damage and toughness, even if it killed the victim (§16.5). No nesting. */
      onHit?: Effect[];
    }
  | { kind: "heal"; target: TargetMode; scale: "atk" | "maxHp"; multiplier: Num; flat: Num }
  | { kind: "status"; target: TargetMode; statusId: string; chance: Num }
  | { kind: "advance"; target: TargetMode; amount: Num }
  | { kind: "energy"; target: TargetMode; amount: Num }
  // --- Extension effects (docs/spec/battle.md §13) ---
  /** Removes the most recent `count` dispellable statuses of one kind (0 = all). */
  | { kind: "dispel"; target: TargetMode; statusKind: "buff" | "debuff"; count: number; tag?: string }
  /** Immediately deals the target's DoT ticks × ratio (optionally only one status). */
  | { kind: "detonate"; target: TargetMode; ratio: Num; statusId?: string; tag?: string }
  /** Sets the target's next enemy-AI action. Ignored for targets without that skill. */
  | { kind: "queueSkill"; target: TargetMode; skillId: string }
  /** Changes a named per-unit counter. */
  | { kind: "counter"; target: TargetMode; key: string; op: "add" | "set"; value: Num }
  /** Adds units of `unitId` to the actor's team. */
  | { kind: "summon"; unitId: string; count: number }
  /** Removes units without a kill: all alive units of `unitId` on the actor's team, or the actor itself. */
  | { kind: "dismiss"; unitId?: string }
  /** Changes the shared skill points (the ally pool) by amount. */
  | { kind: "sp"; amount: Num }
  // --- Rules 0.9 (docs/spec/battle.md §16) ---
  /** Loses or sets HP without damage rules; "lose" never drops below `floor` (default 1). */
  | { kind: "hpCost"; target: TargetMode; op: "lose" | "set"; basis: "maxHp" | "hp"; ratio: Num; floor?: number; storeAs?: string }
  /** Changes a status instance's stacks or remaining turns on the target (nothing happens without it). */
  | { kind: "statusAdjust"; target: TargetMode; statusId: string; op: "add" | "set" | "turns"; value: Num; storeAs?: string };

export type Effect = EffectCore & {
  /** Skips the target when false (§16.2). Scope: effect scope (§16.1). */
  when?: Expr;
  /** Probability gate for non-status effects (§16.3); status effects keep their own `chance`. */
  chance?: Num;
};

/** The numeric (Num) fields of an effect, including the generic `chance` gate (§16.1). */
export function effectNums(e: Effect): [string, Num][] {
  const out: [string, Num | undefined][] = [];
  switch (e.kind) {
    case "damage": out.push(["multiplier", e.multiplier], ["adjMultiplier", e.adjMultiplier], ["toughness", e.toughness], ["adjToughness", e.adjToughness]); break;
    case "heal": out.push(["multiplier", e.multiplier], ["flat", e.flat]); break;
    case "advance": case "energy": case "sp": out.push(["amount", e.amount]); break;
    case "counter": case "statusAdjust": out.push(["value", e.value]); break;
    case "detonate": case "hpCost": out.push(["ratio", e.ratio]); break;
    default: break;
  }
  out.push(["chance", e.chance]);
  return out.filter((x): x is [string, Num] => x[1] !== undefined);
}

/** Effects including nested onHit riders, in execution order; `rider` marks the nested ones. */
export function flatEffects(effects: Effect[], rider = false): { effect: Effect; rider: boolean }[] {
  return effects.flatMap((effect) => [{ effect, rider }, ...(effect.kind === "damage" && effect.onHit ? flatEffects(effect.onHit, true) : [])]);
}

export type DamageScale = "atk" | "def" | "hp";
/** Damage effects may also scale with the victim's HP (§15.3). */
export type DamageEffectScale = DamageScale | "targetMaxHp" | "targetHp";

/** Effects that resolve once per action instead of per target. */
export type UntargetedEffect = Extract<Effect, { kind: "summon" | "dismiss" | "sp" }>;
export const UNTARGETED_EFFECTS: readonly Effect["kind"][] = ["summon", "dismiss", "sp"];

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
  /** Only in damage calculations: applies when this holds (holder = self.*, opposing unit = target.*; §15.1). */
  when?: Expr;
  /** Only in damage calculations, add/pct only: per-stack value × this number (§15.1). */
  scaleBy?: Expr;
}

export interface StatusDef {
  id: string;
  name: string;
  kind: "buff" | "debuff";
  /** Holder turns. Decremented at the end of each of the holder's turns. 0 = permanent (§13.2). */
  duration: number;
  maxStacks: number;
  modifiers: StatusModifier[];
  /** Damage over time, ticking at the start of the holder's turn. Uses the source's stats snapshot. */
  dot?: { multiplier: number; element: string };
  /** Holder skips its action while affected. */
  skipTurn?: boolean;
  // --- Extension fields (docs/spec/battle.md §13) ---
  /** Resistance group for UnitDef.statusRes (e.g. "freeze", "control"). */
  category?: string;
  /** Labels for tag queries and dispel/detonate filters (§16.7). */
  tags?: string[];
  /** Absorbs damage. Amount = caster's scale stat × multiplier + flat, rounded. */
  shield?: { scale: DamageScale; multiplier: number; flat: number };
  /** Consumed instead of dying: HP becomes max(1, rounding(maxHp × hpPct)). */
  revive?: { hpPct: number };
  /** Holder's toughness cannot be reduced. */
  toughnessLock?: boolean;
  /** Removed when the unit that applied it dies ("sourceDeath") or is broken or dies ("sourceBreak"). */
  release?: "sourceDeath" | "sourceBreak";
  /** false = immune to dispel effects. Default true. */
  dispellable?: boolean;
  /** Holder acts automatically with sides swapped: attacks its own team, supports the other (§14.3). */
  charm?: boolean;
  /** A team whose living fighters all carry a defeatIfAll status is defeated (§15.2). */
  defeatIfAll?: boolean;
  description?: string;
}

/** An extra HP bar: entered instead of dying (§13.6). */
export interface PhaseDef {
  name: string;
  /** Stats replaced on entering (hp sets the new max HP; spd, toughness, atk, …). */
  stats?: Record<string, number>;
  /** Replaces the weakness list when given. */
  weaknesses?: string[];
  /** Remove all debuffs on entering. */
  clearDebuffs?: boolean;
}

/** Where imported content came from (informational; never read by the engine). */
export interface ContentSource {
  kind: string;
  key: string;
  note?: string;
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
  | "enemyKilled" // a unit on the holder's team killed an opponent
  | "foeAction" // an opponent acted (filtered by skillTypes)
  | "phaseChange" // the holder entered a new phase
  | "counterChange" // one of the holder's counters changed
  | "allyHit" // a unit on the holder's team (including the holder) hit an opponent
  // --- Rules 0.9 (§16.8) ---
  | "battleStart" // once, before the first turn
  | "action" // any unit acted (filtered by actor / skillTypes / skillIds / actorDefId)
  | "allyDamaged" // a unit on the holder's team (including the holder) took hit damage (once per victim per scan)
  | "unitEnter" // a unit was summoned
  | "unitLeave" // a unit died or was dismissed
  | "revived"; // a unit was revived

export interface PassiveDef {
  id: string;
  name: string;
  on: TriggerEvent;
  /** foeAction / action only: skill types that count. Missing = all. */
  skillTypes?: SkillType[];
  /** action only: who acted, relative to the holder (default "any"; §16.8). */
  actor?: "self" | "ally" | "otherAlly" | "foe" | "any";
  /** action only: skill ids that count. */
  skillIds?: string[];
  /** action only: the actor's unit definition id. */
  actorDefId?: string;
  /** Probability gate evaluated after `when` (§16.3). */
  chance?: Num;
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
  /** Statuses the unit starts the battle with (battle.md §17.2); no events, no RNG. */
  innateStatuses?: string[];
  // --- Extension fields (docs/spec/battle.md §13) ---
  /** Per-element damage resistance; replaces stat `res` when hit by that element. */
  elementRes?: Record<string, number>;
  /** Per-category debuff resistance (StatusDef.category). */
  statusRes?: Record<string, number>;
  /** Extra HP bars, entered in order. */
  phases?: PhaseDef[];
  /** Summons only: dismissed when the unit that summoned it dies or is dismissed. */
  boundToSummoner?: boolean;
  /** Timeline event (§14.4): acts on the action bar via AI, but is never a target and never counts as a fighter. */
  timelineEvent?: boolean;
  source?: ContentSource;
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
  /** Summons fail while the team already has this many living units. Default 5. */
  maxFieldUnits?: number;
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
  /** Remaining shield (StatusDef.shield). */
  shield?: number;
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
  /** 1-based HP phase (§13.6). */
  phase: number;
  /** Named counters (§13.9); missing keys read as 0. */
  counters: Record<string, number>;
  /** Skill forced for this unit's next enemy-AI action (§13.8). */
  nextSkill?: string;
  /** uid of the unit that summoned this one. */
  summonedBy?: string;
  /** Copied from UnitDef.timelineEvent (only present when true). */
  timelineEvent?: true;
}

export type BattleEvent =
  | { t: "cycle"; cycle: number; time: number }
  | { t: "turn"; uid: string; time: number }
  | { t: "recover"; uid: string }
  | { t: "skip"; uid: string; reason: string }
  | { t: "charm"; uid: string; reason: string }
  | { t: "action"; uid: string; skillId: string; skillName: string; skillType: SkillType; targetUid?: string; time: number }
  | { t: "trigger"; uid: string; passiveId: string; passiveName: string; targetUid?: string }
  | { t: "damage"; src: string; dst: string; amount: number; crit: boolean; kind: "hit" | "break" | "dot"; hpAfter: number; skillId?: string; absorbed?: number }
  | { t: "toughness"; dst: string; before: number; after: number }
  | { t: "break"; src: string; dst: string }
  | { t: "heal"; src: string; dst: string; amount: number }
  | { t: "status"; src: string; dst: string; statusId: string; result: "applied" | "resisted" | "refreshed" | "expired" | "dispelled" | "released" | "consumed" }
  | { t: "hp"; uid: string; before: number; after: number }
  | { t: "energy"; uid: string; before: number; after: number }
  | { t: "sp"; before: number; after: number }
  | { t: "advance"; uid: string; before: number; after: number }
  | { t: "death"; uid: string; by: string }
  | { t: "revive"; uid: string; statusId: string; hp: number }
  | { t: "phase"; uid: string; phase: number; name: string }
  | { t: "summon"; uid: string; defId: string; by: string }
  | { t: "dismiss"; uid: string; by: string }
  | { t: "counter"; uid: string; key: string; before: number; after: number }
  | { t: "queue"; uid: string; skillId: string }
  | { t: "end"; result: BattleResult; time: number; reason?: "disabled" };

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
  rng: { crit: RngState; status: RngState; ai: RngState; proc: RngState };
  phase: "await" | "ended";
  decision?: Decision;
  result?: BattleResult;
  events: BattleEvent[];
}

export type Action =
  | { kind: "skill"; actorUid: string; skillId: string; targetUid?: string }
  | { kind: "ult"; actorUid: string; skillId: string; targetUid?: string };
