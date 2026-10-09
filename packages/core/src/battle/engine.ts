/**
 * Turn-based battle engine (docs/spec/battle.md).
 *
 * Pure and deterministic: every public function takes a state and returns a new one. Randomness comes only
 * from the three RNG streams stored in the state, so (setup, seed, actions) fully determines a battle.
 */
import { computeHit, critChanceOf, resolveStats, type DamageRules, type Scenario } from "../damage";
import { evalBool, evalNumber, objectScope, type Scope } from "../expr";
import { applyRounding, resolveValue, type Modifier } from "../modifier";
import { Rng } from "../rng";
import type {
  Action,
  BattleEvent,
  BattleRules,
  BattleState,
  DamageEffectScale,
  DamageScale,
  EncounterDef,
  Effect,
  PhaseDef,
  SkillDef,
  StatusDef,
  StatusInstance,
  TargetMode,
  UnitDef,
  UnitState,
  UntargetedEffect,
} from "./types";

export interface BattleSetup {
  damage: DamageRules;
  rules: BattleRules;
  statuses: StatusDef[];
  units: UnitDef[];
  encounter: EncounterDef;
}

export class BattleError extends Error {}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function makeUnit(setup: BattleSetup, defId: string, team: "ally" | "enemy", slot: number, uid: string): UnitState {
  const def = setup.units.find((u) => u.id === defId);
  if (!def) throw new BattleError(`找不到角色「${defId}」`);
  if (def.team !== team) throw new BattleError(`「${def.name}」不是${team === "ally" ? "我方" : "敵方"}單位`);
  const hp = def.stats.hp ?? 1;
  const u: UnitState = {
    uid,
    defId,
    name: def.name,
    team,
    slot,
    element: def.element,
    base: { ...def.stats },
    weaknesses: [...def.weaknesses],
    hp,
    maxHp: hp,
    energy: def.stats.startEnergy ?? 0,
    maxEnergy: def.stats.maxEnergy ?? 0,
    toughness: def.stats.toughness ?? 0,
    maxToughness: def.stats.toughness ?? 0,
    broken: false,
    alive: true,
    av: 0,
    statuses: [],
    passiveUses: {},
    phase: 1,
    counters: {},
  };
  if (def.timelineEvent) u.timelineEvent = true;
  return u;
}

const uidPrefix = (team: "ally" | "enemy") => (team === "ally" ? "A" : "E");

export function createBattle(setup: BattleSetup, seed: number | string): BattleState {
  const units: UnitState[] = [];
  const add = (defId: string, team: "ally" | "enemy", slot: number) => units.push(makeUnit(setup, defId, team, slot, `${uidPrefix(team)}${slot + 1}`));
  setup.encounter.allies.forEach((id, i) => add(id, "ally", i));
  setup.encounter.enemies.forEach((id, i) => add(id, "enemy", i));
  if (!units.some((u) => u.team === "ally") || !units.some((u) => u.team === "enemy")) throw new BattleError("雙方都至少需要一名單位");

  const state: BattleState = {
    units,
    sp: setup.rules.spStart,
    time: 0,
    cycle: 1,
    turns: 0,
    rng: {
      crit: new Rng(seed, "battle.crit").snapshot(),
      status: new Rng(seed, "battle.status").snapshot(),
      ai: new Rng(seed, "battle.ai").snapshot(),
    },
    phase: "await",
    events: [{ t: "cycle", cycle: 1, time: 0 }],
  };
  for (const u of state.units) u.av = fullAv(setup, u);
  return run(setup, state);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function statusDef(setup: BattleSetup, id: string): StatusDef {
  const d = setup.statuses.find((s) => s.id === id);
  if (!d) throw new BattleError(`找不到狀態「${id}」`);
  return d;
}

function statDefault(setup: BattleSetup, key: string): number {
  return setup.damage.stats.find((s) => s.key === key)?.default ?? 0;
}

/** Damage-calculation context for conditional modifiers (spec §15.1): the battle and the opposing unit. */
interface ModCtx {
  state: BattleState;
  /** The other side of the hit; undefined when it no longer exists (e.g. a DoT whose source is gone). */
  other?: UnitState;
}

/**
 * Holder stat modifiers from statuses, as plain modifiers on `targetPrefix + key`. Modifiers with
 * `when`/`scaleBy` only exist in damage calculations (ctx given) and are skipped otherwise (§15.1).
 */
function statusMods(setup: BattleSetup, u: UnitState, side: "attacker" | "defender" | null, ctx?: ModCtx): Modifier[] {
  const out: Modifier[] = [];
  let scope: Scope | undefined;
  for (const inst of u.statuses) {
    const def = statusDef(setup, inst.statusId);
    def.modifiers.forEach((m, i) => {
      let k = 1;
      if (m.when || m.scaleBy) {
        if (!ctx) return;
        scope ??= unitScope(ctx.state, u, ctx.other);
        if (m.when && !evalBool(m.when, scope)) return;
        if (m.scaleBy && (m.op === "add" || m.op === "pct")) k = evalNumber(m.scaleBy, scope);
      }
      const value = m.op === "mul" ? Math.pow(m.value, inst.stacks) : m.op === "override" ? m.value : m.value * inst.stacks * k;
      const base = { id: `${def.id}#${i}`, label: def.name, op: m.op, value, source: inst.sourceUid };
      if (m.target.startsWith("stat:")) {
        const key = m.target.slice(5);
        out.push({ ...base, target: side ? `stat:${side}.${key}` : `stat:${key}` });
      } else if (side && m.target.startsWith("step:")) {
        const wanted = side === "attacker" ? "outgoing" : "incoming";
        if ((m.role ?? "outgoing") === wanted) out.push({ ...base, target: m.target });
      }
    });
  }
  return out;
}

/** Effective value of a battle stat (spd, effectHit, …) including status modifiers. */
export function unitStat(setup: BattleSetup, u: UnitState, key: string): number {
  const base = u.base[key] ?? statDefault(setup, key);
  const mods = statusMods(setup, u, null).filter((m) => m.target === `stat:${key}`);
  return resolveValue(base, mods, () => undefined).value;
}

function fullAv(setup: BattleSetup, u: UnitState): number {
  const spd = unitStat(setup, u, "spd");
  if (!(spd > 0)) throw new BattleError(`「${u.name}」的速度必須大於 0`);
  return setup.rules.avBase / spd;
}

/** Runs fn and rescales u.av if it changed u's speed (remaining distance is preserved). */
function preservingDistance(setup: BattleSetup, u: UnitState, fn: () => void) {
  const before = unitStat(setup, u, "spd");
  fn();
  const after = unitStat(setup, u, "spd");
  if (after !== before && after > 0) u.av = (u.av * before) / after;
}

interface AttackerSide {
  /** Attacking unit, if it still exists (conditional defender modifiers see it as target.*). */
  unit?: UnitState;
  base: Record<string, number>;
  mods: Modifier[];
}

function scenarioFor(
  setup: BattleSetup,
  state: BattleState,
  attacker: AttackerSide,
  defender: UnitState,
  skill: { name: string; type: Scenario["skill"]["type"]; element: string; multiplier: number; hits: number[] },
): Scenario {
  // Per-element resistance replaces the defender's base "res" (spec §13.1).
  const elementRes = defOf(setup, defender).elementRes?.[skill.element];
  return {
    name: "",
    attacker: attacker.base,
    defender: elementRes === undefined ? defender.base : { ...defender.base, res: elementRes },
    skill: { ...skill },
    flags: { broken: defender.broken, weakness: defender.weaknesses.includes(skill.element) },
    modifiers: [...attacker.mods, ...statusMods(setup, defender, "defender", { state, other: attacker.unit })],
  };
}

function attackerOf(setup: BattleSetup, state: BattleState, u: UnitState, target: UnitState): AttackerSide {
  return { unit: u, base: u.base, mods: statusMods(setup, u, "attacker", { state, other: target }) };
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

function alive(state: BattleState, team?: "ally" | "enemy") {
  return state.units.filter((u) => u.alive && (!team || u.team === team));
}

/** Living fighters: alive units that are not timeline events (spec §14.4). Only these can be targeted or win/lose. */
function fielded(state: BattleState, team?: "ally" | "enemy") {
  return alive(state, team).filter((u) => !u.timelineEvent);
}

/** §4 step 2 order: smallest AV first; ties → allies first, then slot. */
const byTurnOrder = (a: UnitState, b: UnitState) => a.av - b.av || (a.team === b.team ? a.slot - b.slot : a.team === "ally" ? -1 : 1);

function charmOf(setup: BattleSetup, u: UnitState): StatusInstance | undefined {
  return u.statuses.find((s) => statusDef(setup, s.statusId).charm);
}

/**
 * Who u fights and who it supports (both sorted by slot). A charmed unit swaps sides: its "foes" are its
 * own team except itself, its "friends" the other team (spec §14.3).
 */
function sidesOf(setup: BattleSetup, state: BattleState, u: UnitState): { foes: UnitState[]; friends: UnitState[] } {
  const other = u.team === "ally" ? "enemy" : "ally";
  const bySlot = (a: UnitState, b: UnitState) => a.slot - b.slot;
  if (charmOf(setup, u)) return { foes: fielded(state, u.team).filter((x) => x !== u).sort(bySlot), friends: fielded(state, other).sort(bySlot) };
  return { foes: fielded(state, other).sort(bySlot), friends: fielded(state, u.team).sort(bySlot) };
}

function unit(state: BattleState, uid: string): UnitState {
  const u = state.units.find((x) => x.uid === uid);
  if (!u) throw new BattleError(`找不到單位 ${uid}`);
  return u;
}

function cycleAt(rules: BattleRules, time: number): number {
  return time < rules.firstCycleAv ? 1 : 2 + Math.floor((time - rules.firstCycleAv) / rules.cycleAv);
}

/** "wiped": no living fighters; "disabled": every living fighter carries a defeatIfAll status (§15.2). */
function defeatOf(setup: BattleSetup, state: BattleState, team: "ally" | "enemy"): "wiped" | "disabled" | null {
  const units = fielded(state, team);
  if (units.length === 0) return "wiped";
  return units.every((u) => u.statuses.some((s) => statusDef(setup, s.statusId).defeatIfAll)) ? "disabled" : null;
}

function checkEnd(setup: BattleSetup, state: BattleState): boolean {
  if (state.phase === "ended") return true;
  const enemy = defeatOf(setup, state, "enemy");
  const ally = enemy ? null : defeatOf(setup, state, "ally");
  if (!enemy && !ally) return false;
  finish(state, enemy ? "win" : "lose", (enemy ?? ally) === "disabled" ? "disabled" : undefined);
  return true;
}

function finish(state: BattleState, result: NonNullable<BattleState["result"]>, reason?: "disabled") {
  state.phase = "ended";
  state.result = result;
  state.decision = undefined;
  const ev: BattleEvent = { t: "end", result, time: state.time };
  if (reason) ev.reason = reason;
  state.events.push(ev);
}

/** Advances the battle until an ally needs a decision or the battle ends. Mutates and returns state. */
function run(setup: BattleSetup, state: BattleState): BattleState {
  for (let guard = 0; guard < 100000; guard++) {
    if (state.phase === "ended" || checkEnd(setup, state)) return state;

    // Next actor: smallest AV; ties → allies first, then slot.
    const next = alive(state).sort(byTurnOrder)[0]!;
    const elapsed = next.av;
    const newTime = state.time + elapsed;
    const newCycle = cycleAt(setup.rules, newTime);
    if (newCycle > setup.rules.maxCycles) {
      finish(state, "timeout");
      return state;
    }
    for (const u of alive(state)) u.av -= elapsed;
    next.av = 0;
    state.time = newTime;
    while (state.cycle < newCycle) {
      state.cycle++;
      state.events.push({ t: "cycle", cycle: state.cycle, time: state.time });
    }

    state.turns++;
    state.events.push({ t: "turn", uid: next.uid, time: state.time });
    next.passiveUses = {};
    if (next.broken) {
      next.broken = false;
      next.toughness = next.maxToughness;
      state.events.push({ t: "recover", uid: next.uid });
    }
    tickDots(setup, state, next);
    if (!next.alive) continue;
    if (checkEnd(setup, state)) return state;

    const control = next.statuses.find((s) => statusDef(setup, s.statusId).skipTurn);
    if (control) {
      state.events.push({ t: "skip", uid: next.uid, reason: statusDef(setup, control.statusId).name });
      endTurn(setup, state, next);
      continue;
    }

    // Charmed units and timeline events act on their own, through the AI (spec §14.3, §14.4).
    const charm = charmOf(setup, next);
    if (charm) state.events.push({ t: "charm", uid: next.uid, reason: statusDef(setup, charm.statusId).name });
    if (next.team === "ally" && !charm && !next.timelineEvent) {
      state.phase = "await";
      state.decision = { actorUid: next.uid };
      return state;
    }
    const act = enemyAction(setup, state, next);
    const from = state.events.length;
    execute(setup, state, next, act.skill, act.targetUid);
    processTriggers(setup, state, from);
    if (checkEnd(setup, state)) return state;
    if (next.alive) endTurn(setup, state, next);
  }
  throw new BattleError("戰鬥迴圈超過上限，可能有無限循環");
}

function endTurn(setup: BattleSetup, state: BattleState, u: UnitState) {
  preservingDistance(setup, u, () => {
    // Permanent statuses (duration 0) never tick or expire (spec §13.2).
    const timed = (s: StatusInstance) => statusDef(setup, s.statusId).duration > 0;
    for (const s of u.statuses) if (timed(s)) s.turnsLeft--;
    const expired = u.statuses.filter((s) => timed(s) && s.turnsLeft <= 0);
    u.statuses = u.statuses.filter((s) => !timed(s) || s.turnsLeft > 0);
    for (const s of expired) state.events.push({ t: "status", src: s.sourceUid, dst: u.uid, statusId: s.statusId, result: "expired" });
  });
  u.av = fullAv(setup, u);
}

function tickDots(setup: BattleSetup, state: BattleState, u: UnitState) {
  for (const inst of [...u.statuses]) {
    const def = statusDef(setup, inst.statusId);
    if (!def.dot || !u.alive) continue;
    dealDamage(setup, state, inst.sourceUid, u, dotDamage(setup, state, u, inst, def, 1), false, "dot");
  }
}

/** One DoT tick of `inst` on its holder; `ratio` scales the multiplier (1 for a normal tick, spec §13.10). */
function dotDamage(setup: BattleSetup, state: BattleState, u: UnitState, inst: StatusInstance, def: StatusDef, ratio: number): number {
  const sc = scenarioFor(setup, state, { unit: state.units.find((x) => x.uid === inst.sourceUid), base: inst.snapshot ?? {}, mods: [] }, u, {
    name: def.name,
    type: "dot",
    element: def.dot!.element,
    multiplier: def.dot!.multiplier * inst.stacks * ratio,
    hits: [1],
  });
  return computeHit(setup.damage, sc, resolveStats(setup.damage, sc), 0, false).damage;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export interface LegalAction {
  action: Action;
  skill: SkillDef;
  /** Valid target uids for this skill; empty when the skill takes no target. */
  targets: string[];
}

function defOf(setup: BattleSetup, u: UnitState): UnitDef {
  return setup.units.find((d) => d.id === u.defId)!;
}

function candidateTargets(setup: BattleSetup, state: BattleState, actor: UnitState, skill: SkillDef): string[] {
  if (skill.targeting === "none") return [];
  const { foes, friends } = sidesOf(setup, state, actor);
  return (skill.targeting === "ally" ? friends : foes).map((u) => u.uid);
}

export function canUltimate(state: BattleState, u: UnitState, skill: SkillDef): boolean {
  return u.alive && skill.type === "ultimate" && u.energy >= (skill.energyCost ?? u.maxEnergy);
}

/** Allies under the player's control: not charmed, not timeline events (spec §14.3, §14.4). */
function controllable(setup: BattleSetup, u: UnitState): boolean {
  return u.team === "ally" && !u.timelineEvent && !charmOf(setup, u);
}

export function legalActions(setup: BattleSetup, state: BattleState): LegalAction[] {
  if (state.phase !== "await" || !state.decision) return [];
  const out: LegalAction[] = [];
  const actor = unit(state, state.decision.actorUid);
  for (const skill of defOf(setup, actor).skills) {
    // Ultimates are listed below; follow-ups only fire from passives.
    if (skill.type === "ultimate" || skill.type === "followup" || skill.type === "dot") continue;
    if (skill.spDelta < 0 && state.sp + skill.spDelta < 0) continue;
    out.push({ action: { kind: "skill", actorUid: actor.uid, skillId: skill.id }, skill, targets: candidateTargets(setup, state, actor, skill) });
  }
  for (const u of alive(state, "ally").filter((x) => controllable(setup, x)).sort((a, b) => a.slot - b.slot)) {
    for (const skill of defOf(setup, u).skills) {
      if (canUltimate(state, u, skill)) out.push({ action: { kind: "ult", actorUid: u.uid, skillId: skill.id }, skill, targets: candidateTargets(setup, state, u, skill) });
    }
  }
  return out;
}

/**
 * Applies a player/policy action at a decision point and runs until the next decision.
 * Ultimates resolve immediately and return to the same decision; normal actions end the actor's turn.
 */
export function submitAction(setup: BattleSetup, prev: BattleState, action: Action): BattleState {
  if (prev.phase !== "await" || !prev.decision) throw new BattleError("目前不需要行動");
  const state = clone(prev);
  const decision = prev.decision;
  const actor = unit(state, action.actorUid);
  const skill = defOf(setup, actor).skills.find((s) => s.id === action.skillId);
  if (!skill) throw new BattleError(`「${actor.name}」沒有技能 ${action.skillId}`);

  if (action.kind === "ult") {
    if (!controllable(setup, actor) || !canUltimate(state, actor, skill)) throw new BattleError(`「${actor.name}」現在不能施放大招`);
    const from = state.events.length;
    execute(setup, state, actor, skill, action.targetUid);
    processTriggers(setup, state, from);
    // The decision actor can only die here in pathological setups (self-damage); resume the loop then.
    if (!checkEnd(setup, state) && !unit(state, decision.actorUid).alive) {
      state.decision = undefined;
      return run(setup, state);
    }
    return state;
  }

  if (action.actorUid !== decision.actorUid) throw new BattleError("現在不是這個角色的回合");
  if (skill.type === "ultimate") throw new BattleError("大招請用 ult 行動施放");
  if (skill.type === "followup" || skill.type === "dot") throw new BattleError("追加攻擊只能由被動觸發");
  if (skill.spDelta < 0 && state.sp + skill.spDelta < 0) throw new BattleError("技能點不足");
  state.decision = undefined;
  const from = state.events.length;
  execute(setup, state, actor, skill, action.targetUid);
  processTriggers(setup, state, from);
  if (checkEnd(setup, state)) return state;
  if (actor.alive) endTurn(setup, state, actor);
  return run(setup, state);
}

/** Number of living units that act before u (§4 step 2 order, timeline events included); −1 when u is not alive. */
function rankOf(state: BattleState, u: UnitState): number {
  return u.alive ? alive(state).sort(byTurnOrder).indexOf(u) : -1;
}

/** Fixed per-unit condition variables (spec §6, §14.1). */
function unitVars(state: BattleState, u: UnitState) {
  return {
    hpPct: u.hp / u.maxHp, broken: u.broken, energy: u.energy, toughnessPct: u.maxToughness ? u.toughness / u.maxToughness : 0,
    phase: u.phase, shield: u.statuses.reduce((a, s) => a + (s.shield ?? 0), 0), av: u.av, rank: rankOf(state, u),
  };
}

const NO_TARGET = { exists: false, isFoe: false, hpPct: 0, broken: false, energy: 0, toughnessPct: 0, phase: 0, shield: 0, av: 0, rank: -1 };

/**
 * Scope for AI rules and passive conditions. "allies"/"foes" are relative to u's team. `subject` is the
 * passive's trigger subject (spec §14.1); AI rules have none, so target.* reads as "no target".
 */
function unitScope(state: BattleState, u: UnitState, subject?: UnitState): Scope {
  const foeTeam = u.team === "ally" ? "enemy" : "ally";
  const base = objectScope({
    self: unitVars(state, u),
    target: subject ? { exists: true, isFoe: subject.team !== u.team, ...unitVars(state, subject) } : NO_TARGET,
    battle: { turn: state.turns, cycle: state.cycle, allies: fielded(state, u.team).length, foes: fielded(state, foeTeam).length },
  });
  // Dynamic keys (spec §13.11, §14.1): unknown counters and absent statuses read as 0.
  return (path) => {
    for (const [prefix, who] of [["self.", u], ["target.", subject]] as const) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest.startsWith("counter.")) return who?.counters[rest.slice(8)] ?? 0;
      if (rest.startsWith("status.")) return who?.statuses.find((s) => s.statusId === rest.slice(7))?.stacks ?? 0;
    }
    if (path.startsWith("battle.count.")) return alive(state).filter((x) => x.defId === path.slice(13)).length;
    return base(path);
  };
}

function enemyAction(setup: BattleSetup, state: BattleState, u: UnitState): { skill: SkillDef; targetUid?: string } {
  const def = defOf(setup, u);
  const rng = Rng.fromState(state.rng.ai);
  const scope = unitScope(state, u);
  const rules = (def.ai ?? []).filter((r) => r.weight > 0 && (!r.when || evalBool(r.when, scope)) && def.skills.some((s) => s.id === r.skillId));
  let skill = def.skills[0]!;
  const queued = u.nextSkill !== undefined ? def.skills.find((s) => s.id === u.nextSkill) : undefined;
  u.nextSkill = undefined;
  if (queued) skill = queued; // Forced action: no AI roll (spec §13.8).
  else if (rules.length) {
    const total = rules.reduce((a, r) => a + r.weight, 0);
    let roll = rng.next() * total;
    let picked = rules[rules.length - 1]!;
    for (const r of rules) {
      if (roll < r.weight) { picked = r; break; }
      roll -= r.weight;
    }
    skill = def.skills.find((s) => s.id === picked.skillId)!;
  }
  const targets = candidateTargets(setup, state, u, skill);
  const targetUid = targets.length ? pickAiTarget(setup, state, rng, targets, skill.targeting === "enemy") : undefined;
  state.rng.ai = rng.snapshot();
  return { skill, targetUid };
}

/** Uniform pick, or taunt-weighted for hostile skills when taunt differs between candidates (spec §13.3). */
function pickAiTarget(setup: BattleSetup, state: BattleState, rng: Rng, targets: string[], hostile: boolean): string {
  const weights = hostile ? targets.map((uid) => Math.max(0, unitStat(setup, unit(state, uid), "taunt"))) : [];
  if (!hostile || weights.every((w) => w === weights[0])) return targets[rng.int(targets.length)]!;
  const total = weights.reduce((a, w) => a + w, 0);
  let roll = rng.next() * total;
  let picked: string | undefined;
  for (let i = 0; i < targets.length; i++) {
    if (weights[i]! <= 0) continue;
    picked = targets[i]!; // Falls through to the last positive weight if rounding leaves roll ≥ every weight.
    if (roll < weights[i]!) break;
    roll -= weights[i]!;
  }
  return picked!;
}

// ---------------------------------------------------------------------------
// Passive triggers / follow-ups (spec §12)
// ---------------------------------------------------------------------------

/** Follow-ups resolved per top-level action, including chains. */
export const MAX_FOLLOWUPS_PER_ACTION = 20;

interface QueuedTrigger {
  uid: string;
  passiveId: string;
  targetUid?: string;
}

function processTriggers(setup: BattleSetup, state: BattleState, from: number) {
  const queue: QueuedTrigger[] = [];
  const teamOf = (uid: string) => state.units.find((u) => u.uid === uid)?.team;
  const holders = () => [...alive(state, "ally"), ...alive(state, "enemy")].sort((a, b) => (a.team === b.team ? a.slot - b.slot : a.team === "ally" ? -1 : 1));

  const scan = (start: number, end: number) => {
    for (let k = start; k < end; k++) {
      const e = state.events[k]!;
      for (const u of holders()) {
        for (const p of defOf(setup, u).passives ?? []) {
          let match = false;
          let targetUid: string | undefined;
          // Condition subject (spec §14.1): usually the chosen target; enemyKilled uses the fallen unit.
          let subject: string | undefined;
          if (p.on === "allyUltimate" && e.t === "action" && e.skillType === "ultimate" && teamOf(e.uid) === u.team) { match = true; targetUid = e.targetUid; }
          else if (p.on === "allyBreak" && e.t === "break" && teamOf(e.src) === u.team) { match = true; targetUid = e.dst; }
          else if (p.on === "selfHit" && e.t === "damage" && e.kind === "hit" && e.dst === u.uid && teamOf(e.src) !== u.team) { match = true; targetUid = e.src; }
          else if (p.on === "enemyKilled" && e.t === "death" && teamOf(e.by) === u.team && teamOf(e.uid) !== u.team) { match = true; subject = e.uid; }
          else if (p.on === "foeAction" && e.t === "action" && teamOf(e.uid) !== u.team && (!p.skillTypes || p.skillTypes.includes(e.skillType))) { match = true; targetUid = e.uid; }
          else if (p.on === "phaseChange" && e.t === "phase" && e.uid === u.uid) { match = true; }
          else if (p.on === "counterChange" && e.t === "counter" && e.uid === u.uid) { match = true; }
          else if (p.on === "allyHit" && e.t === "damage" && e.kind === "hit" && teamOf(e.src) === u.team && teamOf(e.dst) !== u.team) { match = true; targetUid = e.dst; }
          if (!match) continue;
          subject ??= targetUid;
          const used = u.passiveUses[p.id] ?? 0;
          if (p.limitPerTurn > 0 && used >= p.limitPerTurn) continue;
          if (p.when && !evalBool(p.when, unitScope(state, u, subject === undefined ? undefined : state.units.find((x) => x.uid === subject)))) continue;
          u.passiveUses[p.id] = used + 1;
          queue.push({ uid: u.uid, passiveId: p.id, targetUid });
        }
      }
    }
  };

  scan(from, state.events.length);
  for (let budget = MAX_FOLLOWUPS_PER_ACTION; queue.length && budget > 0; budget--) {
    if (checkEnd(setup, state)) return;
    const q = queue.shift()!;
    const u = unit(state, q.uid);
    if (!u.alive) continue;
    const def = defOf(setup, u);
    const p = def.passives!.find((x) => x.id === q.passiveId)!;
    const skill = def.skills.find((s) => s.id === p.skillId);
    if (!skill) throw new BattleError(`「${u.name}」的被動「${p.name}」指向不存在的技能 ${p.skillId}`);
    state.events.push({ t: "trigger", uid: u.uid, passiveId: p.id, passiveName: p.name, targetUid: q.targetUid });
    const start = state.events.length;
    execute(setup, state, u, skill, q.targetUid);
    scan(start, state.events.length);
  }
}

// ---------------------------------------------------------------------------
// Skill resolution
// ---------------------------------------------------------------------------

function resolveTargets(setup: BattleSetup, state: BattleState, actor: UnitState, mode: TargetMode, chosen: string | undefined): { main: UnitState[]; adjacent: UnitState[] } {
  const { foes, friends } = sidesOf(setup, state, actor);
  // A chosen target that died earlier in this action is not replaced: later effects on it are skipped.
  const chosenDead = chosen !== undefined && state.units.some((u) => u.uid === chosen && !u.alive);
  const pick = (list: UnitState[], fallback: UnitState | undefined) => (chosenDead ? undefined : (list.find((u) => u.uid === chosen) ?? fallback));
  switch (mode) {
    case "enemy": { const t = pick(foes, foes[0]); return { main: t ? [t] : [], adjacent: [] }; }
    case "blast": {
      const t = pick(foes, foes[0]);
      if (!t) return { main: [], adjacent: [] };
      const i = foes.indexOf(t);
      return { main: [t], adjacent: [foes[i - 1], foes[i + 1]].filter((x): x is UnitState => !!x) };
    }
    case "allEnemies": return { main: foes, adjacent: [] };
    case "self": return { main: [actor], adjacent: [] };
    case "ally": { const t = pick(friends, actor); return { main: t ? [t] : [], adjacent: [] }; }
    case "allAllies": return { main: friends, adjacent: [] };
  }
}

function execute(setup: BattleSetup, state: BattleState, actor: UnitState, skill: SkillDef, chosen: string | undefined) {
  state.events.push({ t: "action", uid: actor.uid, skillId: skill.id, skillName: skill.name, skillType: skill.type, targetUid: chosen, time: state.time });
  // Charmed allies don't touch the shared skill points (spec §14.3).
  if (actor.team === "ally" && skill.spDelta !== 0 && !charmOf(setup, actor)) {
    const before = state.sp;
    state.sp = Math.min(setup.rules.spMax, Math.max(0, state.sp + skill.spDelta));
    state.events.push({ t: "sp", before, after: state.sp });
  }
  if (skill.type === "ultimate") setEnergy(state, actor, 0);
  setEnergy(state, actor, actor.energy + skill.energyGain);

  const hitByThisAction = new Set<UnitState>();
  const element = skill.element ?? actor.element;
  for (const eff of skill.effects) {
    if (eff.kind === "summon" || eff.kind === "dismiss" || eff.kind === "sp") {
      applyUntargeted(setup, state, actor, eff);
      continue;
    }
    const { main, adjacent } = resolveTargets(setup, state, actor, eff.target, chosen);
    const all: [UnitState, boolean][] = [...main.map((u) => [u, false] as [UnitState, boolean]), ...adjacent.map((u) => [u, true] as [UnitState, boolean])];
    for (const [target, isAdj] of all) {
      if (!target.alive) continue;
      applyEffect(setup, state, actor, skill, element, eff, target, isAdj);
      if (eff.kind === "damage" && target.team !== actor.team) hitByThisAction.add(target);
    }
  }
  for (const t of hitByThisAction) if (t.alive && t.team === "ally") setEnergy(state, t, t.energy + setup.rules.energyOnHitTaken);
}

function setEnergy(state: BattleState, u: UnitState, value: number) {
  const before = u.energy;
  u.energy = Math.min(u.maxEnergy, Math.max(0, value));
  if (u.energy !== before) state.events.push({ t: "energy", uid: u.uid, before, after: u.energy });
}

function applyEffect(setup: BattleSetup, state: BattleState, actor: UnitState, skill: SkillDef, element: string, eff: Effect, target: UnitState, isAdj: boolean) {
  switch (eff.kind) {
    case "damage": {
      const hits = eff.hits ?? [1];
      const multiplier = isAdj ? (eff.adjMultiplier ?? 0) : eff.multiplier;
      const toughness = isAdj ? (eff.adjToughness ?? 0) : eff.toughness;
      const crng = Rng.fromState(state.rng.crit);
      for (let i = 0; i < hits.length && target.alive; i++) {
        const sc = scenarioFor(setup, state, scaledAttacker(setup, state, actor, target, eff.scale), target, { name: skill.name, type: skill.type, element, multiplier, hits });
        const stats = resolveStats(setup.damage, sc);
        const p = critChanceOf(setup.damage, sc, stats);
        // One crit draw per hit, always consumed (spec battle.md §5).
        const crit = crng.chance(p);
        const hit = computeHit(setup.damage, sc, stats, i, crit);
        dealDamage(setup, state, actor.uid, target, hit.damage, crit, "hit", skill.id);
        if (target.alive) reduceToughness(setup, state, actor, target, element, toughness * hits[i]!);
      }
      state.rng.crit = crng.snapshot();
      break;
    }
    case "heal": {
      const base = eff.scale === "atk" ? unitStat(setup, actor, "atk") : target.maxHp;
      // Heal bonuses (spec §5.4): both default to 0, leaving the amount unchanged.
      const factor = (1 + unitStat(setup, actor, "healBonus")) * (1 + unitStat(setup, target, "healTaken"));
      const amount = applyRounding((base * eff.multiplier + eff.flat) * factor, setup.rules.rounding);
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + amount);
      state.events.push({ t: "heal", src: actor.uid, dst: target.uid, amount: target.hp - before });
      break;
    }
    case "status":
      applyStatus(setup, state, actor, target, eff.statusId, eff.chance);
      break;
    case "advance": {
      const before = target.av;
      target.av = Math.max(0, target.av - fullAv(setup, target) * eff.amount);
      state.events.push({ t: "advance", uid: target.uid, before, after: target.av });
      break;
    }
    case "energy":
      setEnergy(state, target, target.energy + eff.amount);
      break;
    case "dispel": {
      const matching = target.statuses.filter((s) => {
        const d = statusDef(setup, s.statusId);
        return d.kind === eff.statusKind && d.dispellable !== false;
      });
      // Most recent first (spec §13.7).
      const removed = (eff.count > 0 ? matching.slice(-eff.count) : matching).reverse();
      if (!removed.length) break;
      preservingDistance(setup, target, () => {
        target.statuses = target.statuses.filter((s) => !removed.includes(s));
        for (const s of removed) state.events.push({ t: "status", src: actor.uid, dst: target.uid, statusId: s.statusId, result: "dispelled" });
      });
      break;
    }
    case "detonate":
      for (const inst of [...target.statuses]) {
        const def = statusDef(setup, inst.statusId);
        if (!def.dot || !target.alive || (eff.statusId !== undefined && inst.statusId !== eff.statusId)) continue;
        dealDamage(setup, state, inst.sourceUid, target, dotDamage(setup, state, target, inst, def, eff.ratio), false, "dot");
      }
      break;
    case "queueSkill":
      if (defOf(setup, target).skills.some((s) => s.id === eff.skillId)) {
        target.nextSkill = eff.skillId;
        state.events.push({ t: "queue", uid: target.uid, skillId: eff.skillId });
      }
      break;
    case "counter": {
      const before = target.counters[eff.key] ?? 0;
      const after = eff.op === "add" ? before + eff.value : eff.value;
      if (after !== before) {
        target.counters[eff.key] = after;
        state.events.push({ t: "counter", uid: target.uid, key: eff.key, before, after });
      }
      break;
    }
    case "summon":
    case "dismiss":
    case "sp":
      break; // Resolved once per action by applyUntargeted.
  }
}

/** Attacker for a damage effect. Non-ATK scaling swaps in the stat and drops ATK modifiers (spec §13.4). */
/**
 * Attacker for a damage effect. Non-ATK scaling swaps in the stat and drops ATK modifiers (spec §13.4);
 * targetMaxHp / targetHp take the victim's HP at the time of each hit (§15.3).
 */
function scaledAttacker(setup: BattleSetup, state: BattleState, actor: UnitState, target: UnitState, scale: DamageEffectScale | undefined): AttackerSide {
  const a = attackerOf(setup, state, actor, target);
  if (!scale || scale === "atk") return a;
  const atk = scale === "targetMaxHp" ? target.maxHp : scale === "targetHp" ? target.hp : scaleValue(setup, actor, scale);
  return { unit: actor, base: { ...actor.base, atk }, mods: a.mods.filter((m) => m.target !== "stat:attacker.atk") };
}

function scaleValue(setup: BattleSetup, u: UnitState, scale: DamageScale): number {
  return scale === "hp" ? u.maxHp : unitStat(setup, u, scale);
}

function applyUntargeted(setup: BattleSetup, state: BattleState, actor: UnitState, eff: UntargetedEffect) {
  switch (eff.kind) {
    case "sp": {
      const before = state.sp;
      state.sp = Math.min(setup.rules.spMax, Math.max(0, state.sp + eff.amount));
      state.events.push({ t: "sp", before, after: state.sp });
      break;
    }
    case "summon": {
      const limit = setup.rules.maxFieldUnits ?? DEFAULT_MAX_FIELD_UNITS;
      // Timeline events neither take nor need a field slot (spec §14.4).
      const isEvent = !!setup.units.find((d) => d.id === eff.unitId)?.timelineEvent;
      for (let i = 0; i < eff.count; i++) {
        if (!isEvent && fielded(state, actor.team).length >= limit) break;
        const team = state.units.filter((u) => u.team === actor.team);
        const u = makeUnit(setup, eff.unitId, actor.team, Math.max(...team.map((x) => x.slot)) + 1, `${uidPrefix(actor.team)}${team.length + 1}`);
        u.summonedBy = actor.uid;
        u.av = fullAv(setup, u);
        state.units.push(u);
        state.events.push({ t: "summon", uid: u.uid, defId: u.defId, by: actor.uid });
      }
      break;
    }
    case "dismiss": {
      const victims = eff.unitId === undefined ? [actor] : alive(state, actor.team).filter((u) => u.defId === eff.unitId);
      for (const v of victims) if (v.alive) dismiss(setup, state, v, actor.uid);
      break;
    }
  }
}

export const DEFAULT_MAX_FIELD_UNITS = 5;

/** Removes a unit without a kill: no death event, no kill energy, no enemyKilled trigger. */
function dismiss(setup: BattleSetup, state: BattleState, u: UnitState, by: string) {
  u.alive = false;
  u.statuses = [];
  state.events.push({ t: "dismiss", uid: u.uid, by });
  afterRemoval(setup, state, u);
}

/** A unit left the field (death or dismissal): release statuses it applied and dismiss its bound summons. */
function afterRemoval(setup: BattleSetup, state: BattleState, u: UnitState) {
  releaseFrom(setup, state, u.uid, ["sourceDeath", "sourceBreak"]);
  for (const s of alive(state)) if (s.summonedBy === u.uid && defOf(setup, s).boundToSummoner) dismiss(setup, state, s, u.uid);
}

function releaseFrom(setup: BattleSetup, state: BattleState, srcUid: string, kinds: NonNullable<StatusDef["release"]>[]) {
  for (const v of alive(state).sort((a, b) => (a.team === b.team ? a.slot - b.slot : a.team === "ally" ? -1 : 1))) {
    const gone = v.statuses.filter((s) => s.sourceUid === srcUid && kinds.includes(statusDef(setup, s.statusId).release!));
    if (!gone.length) continue;
    preservingDistance(setup, v, () => {
      v.statuses = v.statuses.filter((s) => !gone.includes(s));
      for (const s of gone) state.events.push({ t: "status", src: srcUid, dst: v.uid, statusId: s.statusId, result: "released" });
    });
  }
}

function dealDamage(setup: BattleSetup, state: BattleState, srcUid: string, target: UnitState, amount: number, crit: boolean, kind: "hit" | "break" | "dot", skillId?: string) {
  // Shields absorb first, in status-list order (spec §13.5).
  let rest = amount;
  let absorbed = 0;
  for (const s of target.statuses) {
    if (!(s.shield! > 0) || rest <= 0) continue;
    const a = Math.min(s.shield!, rest);
    s.shield! -= a;
    rest -= a;
    absorbed += a;
  }
  target.hp = Math.max(0, target.hp - rest);
  const ev: BattleEvent = { t: "damage", src: srcUid, dst: target.uid, amount, crit, kind, hpAfter: target.hp, skillId };
  if (absorbed > 0) ev.absorbed = absorbed;
  state.events.push(ev);
  if (target.hp <= 0 && target.alive) {
    const revive = target.statuses.find((s) => statusDef(setup, s.statusId).revive);
    if (revive) {
      preservingDistance(setup, target, () => { target.statuses = target.statuses.filter((s) => s !== revive); });
      target.hp = Math.max(1, applyRounding(target.maxHp * statusDef(setup, revive.statusId).revive!.hpPct, setup.rules.rounding));
      state.events.push({ t: "revive", uid: target.uid, statusId: revive.statusId, hp: target.hp });
      return;
    }
    const phases = defOf(setup, target).phases ?? [];
    if (target.phase <= phases.length) {
      enterPhase(setup, state, target, phases[target.phase - 1]!);
      return;
    }
    target.alive = false;
    target.statuses = [];
    state.events.push({ t: "death", uid: target.uid, by: srcUid });
    const killer = state.units.find((u) => u.uid === srcUid);
    if (killer?.alive && killer.team !== target.team) setEnergy(state, killer, killer.energy + setup.rules.energyOnKill);
    afterRemoval(setup, state, target);
  }
}

function enterPhase(setup: BattleSetup, state: BattleState, u: UnitState, ph: PhaseDef) {
  u.phase += 1;
  state.events.push({ t: "phase", uid: u.uid, phase: u.phase, name: ph.name });
  preservingDistance(setup, u, () => {
    if (ph.stats) u.base = { ...u.base, ...ph.stats };
    if (ph.weaknesses) u.weaknesses = [...ph.weaknesses];
    if (ph.clearDebuffs) {
      const gone = u.statuses.filter((s) => statusDef(setup, s.statusId).kind === "debuff");
      u.statuses = u.statuses.filter((s) => !gone.includes(s));
      for (const s of gone) state.events.push({ t: "status", src: u.uid, dst: u.uid, statusId: s.statusId, result: "dispelled" });
    }
  });
  u.maxHp = u.base.hp ?? u.maxHp;
  u.hp = u.maxHp;
  u.maxToughness = u.base.toughness ?? u.maxToughness;
  u.toughness = u.maxToughness;
  u.broken = false;
}

function reduceToughness(setup: BattleSetup, state: BattleState, actor: UnitState, target: UnitState, element: string, amount: number) {
  if (amount <= 0 || target.broken || target.maxToughness <= 0 || !target.weaknesses.includes(element)) return;
  if (target.statuses.some((s) => statusDef(setup, s.statusId).toughnessLock)) return;
  const before = target.toughness;
  target.toughness = Math.max(0, target.toughness - amount);
  state.events.push({ t: "toughness", dst: target.uid, before, after: target.toughness });
  if (target.toughness > 0) return;

  target.broken = true;
  state.events.push({ t: "break", src: actor.uid, dst: target.uid });
  const sc = scenarioFor(setup, state, attackerOf(setup, state, actor, target), target, { name: "擊破", type: "skill", element, multiplier: 0, hits: [1] });
  const stats = resolveStats(setup.damage, sc);
  const values = (side: "attacker" | "defender") => Object.fromEntries(Object.entries(stats[side]).map(([k, v]) => [k, v.value]));
  const breakScope = objectScope({
    attacker: { ...actor.base, ...values("attacker"), breakEffect: unitStat(setup, actor, "breakEffect") },
    defender: { ...target.base, ...values("defender"), maxToughness: target.maxToughness },
  });
  const dmg = applyRounding(Math.max(0, evalNumber(setup.rules.breakDamage, breakScope)), setup.rules.rounding);
  dealDamage(setup, state, actor.uid, target, dmg, false, "break");
  if (target.alive) {
    const before = target.av;
    target.av += fullAv(setup, target) * setup.rules.breakDelay;
    state.events.push({ t: "advance", uid: target.uid, before, after: target.av });
    // Captures held by the broken unit end (spec §13.7).
    releaseFrom(setup, state, target.uid, ["sourceBreak"]);
  }
}

function applyStatus(setup: BattleSetup, state: BattleState, actor: UnitState, target: UnitState, statusId: string, chance: number) {
  const def = statusDef(setup, statusId);
  let p = chance;
  if (def.kind === "debuff" && target.team !== actor.team) {
    p = chance * (1 + unitStat(setup, actor, "effectHit")) * (1 - unitStat(setup, target, "effectRes"));
    // Category resistance (spec §13.1) only multiplies in when the target declares one.
    const catRes = def.category === undefined ? undefined : defOf(setup, target).statusRes?.[def.category];
    if (catRes !== undefined) p = p * (1 - catRes);
  }
  if (p < 1) {
    const srng = Rng.fromState(state.rng.status);
    const ok = srng.chance(p);
    state.rng.status = srng.snapshot();
    if (!ok) {
      state.events.push({ t: "status", src: actor.uid, dst: target.uid, statusId, result: "resisted" });
      return;
    }
  }
  let snapshot: Record<string, number> | undefined;
  if (def.dot) {
    const sc = scenarioFor(setup, state, attackerOf(setup, state, actor, target), target, { name: def.name, type: "dot", element: def.dot.element, multiplier: 0, hits: [1] });
    snapshot = Object.fromEntries(Object.entries(resolveStats(setup.damage, sc).attacker).map(([k, v]) => [k, v.value]));
  }
  const shield = def.shield ? applyRounding(scaleValue(setup, actor, def.shield.scale) * def.shield.multiplier + def.shield.flat, setup.rules.rounding) : undefined;
  preservingDistance(setup, target, () => {
    const existing = target.statuses.find((s) => s.statusId === statusId);
    if (existing) {
      existing.stacks = Math.min(def.maxStacks, existing.stacks + 1);
      existing.turnsLeft = def.duration;
      existing.sourceUid = actor.uid;
      if (snapshot) existing.snapshot = snapshot;
      if (shield !== undefined) existing.shield = Math.max(existing.shield ?? 0, shield);
      state.events.push({ t: "status", src: actor.uid, dst: target.uid, statusId, result: "refreshed" });
    } else {
      const inst: StatusInstance = { statusId, sourceUid: actor.uid, stacks: 1, turnsLeft: def.duration };
      if (snapshot) inst.snapshot = snapshot;
      if (shield !== undefined) inst.shield = shield;
      target.statuses.push(inst);
      state.events.push({ t: "status", src: actor.uid, dst: target.uid, statusId, result: "applied" });
    }
  });
}

// ---------------------------------------------------------------------------
// Pure timeline preview (action order tool)
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  uid: string;
  name: string;
  team: "ally" | "enemy";
  time: number;
  cycle: number;
}

/** Predicts turn order from speeds alone (no combat effects). */
export function predictTimeline(
  rules: Pick<BattleRules, "avBase" | "firstCycleAv" | "cycleAv">,
  units: { uid: string; name: string; team: "ally" | "enemy"; slot: number; spd: number }[],
  cycles: number,
): TimelineEntry[] {
  const st = units.filter((u) => u.spd > 0).map((u) => ({ ...u, av: rules.avBase / u.spd }));
  const out: TimelineEntry[] = [];
  let time = 0;
  const limit = rules.firstCycleAv + (cycles - 1) * rules.cycleAv;
  for (let guard = 0; guard < 10000 && st.length; guard++) {
    const next = [...st].sort((a, b) => a.av - b.av || (a.team === b.team ? a.slot - b.slot : a.team === "ally" ? -1 : 1))[0]!;
    if (time + next.av >= limit) break;
    const elapsed = next.av;
    for (const u of st) u.av -= elapsed;
    time += elapsed;
    out.push({ uid: next.uid, name: next.name, team: next.team, time, cycle: cycleAt(rules as BattleRules, time) });
    next.av = rules.avBase / next.spd;
  }
  return out;
}

export type { BattleEvent };
