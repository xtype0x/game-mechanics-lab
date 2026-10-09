/**
 * Turn-based battle engine (docs/spec/battle.md).
 *
 * Pure and deterministic: every public function takes a state and returns a new one. Randomness comes only
 * from the three RNG streams stored in the state, so (setup, seed, actions) fully determines a battle.
 */
import { computeHit, critChanceOf, resolveStats, type DamageRules, type Scenario } from "../damage";
import { evalBool, evalNumber, objectScope } from "../expr";
import { applyRounding, resolveValue, type Modifier } from "../modifier";
import { Rng } from "../rng";
import type {
  Action,
  BattleEvent,
  BattleRules,
  BattleState,
  EncounterDef,
  Effect,
  SkillDef,
  StatusDef,
  StatusInstance,
  TargetMode,
  UnitDef,
  UnitState,
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

export function createBattle(setup: BattleSetup, seed: number | string): BattleState {
  const units: UnitState[] = [];
  const add = (defId: string, team: "ally" | "enemy", slot: number) => {
    const def = setup.units.find((u) => u.id === defId);
    if (!def) throw new BattleError(`找不到角色「${defId}」`);
    if (def.team !== team) throw new BattleError(`「${def.name}」不是${team === "ally" ? "我方" : "敵方"}單位`);
    const hp = def.stats.hp ?? 1;
    units.push({
      uid: `${team === "ally" ? "A" : "E"}${slot + 1}`,
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
    });
  };
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

/** Holder stat modifiers from statuses, as plain modifiers on `targetPrefix + key`. */
function statusMods(setup: BattleSetup, u: UnitState, side: "attacker" | "defender" | null): Modifier[] {
  const out: Modifier[] = [];
  for (const inst of u.statuses) {
    const def = statusDef(setup, inst.statusId);
    def.modifiers.forEach((m, i) => {
      const base = { id: `${def.id}#${i}`, label: def.name, op: m.op, value: m.op === "mul" ? Math.pow(m.value, inst.stacks) : m.op === "override" ? m.value : m.value * inst.stacks, source: inst.sourceUid };
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

function scenarioFor(
  setup: BattleSetup,
  attacker: { base: Record<string, number>; mods: Modifier[] },
  defender: UnitState,
  skill: { name: string; type: Scenario["skill"]["type"]; element: string; multiplier: number; hits: number[] },
): Scenario {
  return {
    name: "",
    attacker: attacker.base,
    defender: defender.base,
    skill: { ...skill },
    flags: { broken: defender.broken, weakness: defender.weaknesses.includes(skill.element) },
    modifiers: [...attacker.mods, ...statusMods(setup, defender, "defender")],
  };
}

function attackerOf(setup: BattleSetup, u: UnitState) {
  return { base: u.base, mods: statusMods(setup, u, "attacker") };
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

function alive(state: BattleState, team?: "ally" | "enemy") {
  return state.units.filter((u) => u.alive && (!team || u.team === team));
}

function unit(state: BattleState, uid: string): UnitState {
  const u = state.units.find((x) => x.uid === uid);
  if (!u) throw new BattleError(`找不到單位 ${uid}`);
  return u;
}

function cycleAt(rules: BattleRules, time: number): number {
  return time < rules.firstCycleAv ? 1 : 2 + Math.floor((time - rules.firstCycleAv) / rules.cycleAv);
}

function checkEnd(state: BattleState): boolean {
  if (state.phase === "ended") return true;
  let result: BattleState["result"];
  if (alive(state, "enemy").length === 0) result = "win";
  else if (alive(state, "ally").length === 0) result = "lose";
  if (!result) return false;
  finish(state, result);
  return true;
}

function finish(state: BattleState, result: NonNullable<BattleState["result"]>) {
  state.phase = "ended";
  state.result = result;
  state.decision = undefined;
  state.events.push({ t: "end", result, time: state.time });
}

/** Advances the battle until an ally needs a decision or the battle ends. Mutates and returns state. */
function run(setup: BattleSetup, state: BattleState): BattleState {
  for (let guard = 0; guard < 100000; guard++) {
    if (state.phase === "ended" || checkEnd(state)) return state;

    // Next actor: smallest AV; ties → allies first, then slot.
    const next = alive(state).sort((a, b) => a.av - b.av || (a.team === b.team ? a.slot - b.slot : a.team === "ally" ? -1 : 1))[0]!;
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
    if (checkEnd(state)) return state;

    const control = next.statuses.find((s) => statusDef(setup, s.statusId).skipTurn);
    if (control) {
      state.events.push({ t: "skip", uid: next.uid, reason: statusDef(setup, control.statusId).name });
      endTurn(setup, state, next);
      continue;
    }

    if (next.team === "ally") {
      state.phase = "await";
      state.decision = { actorUid: next.uid };
      return state;
    }
    const act = enemyAction(setup, state, next);
    const from = state.events.length;
    execute(setup, state, next, act.skill, act.targetUid);
    processTriggers(setup, state, from);
    if (checkEnd(state)) return state;
    if (next.alive) endTurn(setup, state, next);
  }
  throw new BattleError("戰鬥迴圈超過上限，可能有無限循環");
}

function endTurn(setup: BattleSetup, state: BattleState, u: UnitState) {
  preservingDistance(setup, u, () => {
    for (const s of u.statuses) s.turnsLeft--;
    const expired = u.statuses.filter((s) => s.turnsLeft <= 0);
    u.statuses = u.statuses.filter((s) => s.turnsLeft > 0);
    for (const s of expired) state.events.push({ t: "status", src: s.sourceUid, dst: u.uid, statusId: s.statusId, result: "expired" });
  });
  u.av = fullAv(setup, u);
}

function tickDots(setup: BattleSetup, state: BattleState, u: UnitState) {
  for (const inst of [...u.statuses]) {
    const def = statusDef(setup, inst.statusId);
    if (!def.dot || !u.alive) continue;
    const sc = scenarioFor(setup, { base: inst.snapshot ?? {}, mods: [] }, u, {
      name: def.name,
      type: "dot",
      element: def.dot.element,
      multiplier: def.dot.multiplier * inst.stacks,
      hits: [1],
    });
    const hit = computeHit(setup.damage, sc, resolveStats(setup.damage, sc), 0, false);
    dealDamage(setup, state, inst.sourceUid, u, hit.damage, false, "dot");
  }
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

function candidateTargets(state: BattleState, actor: UnitState, skill: SkillDef): string[] {
  if (skill.targeting === "none") return [];
  const team = skill.targeting === "ally" ? actor.team : actor.team === "ally" ? "enemy" : "ally";
  return alive(state, team).sort((a, b) => a.slot - b.slot).map((u) => u.uid);
}

export function canUltimate(state: BattleState, u: UnitState, skill: SkillDef): boolean {
  return u.alive && skill.type === "ultimate" && u.energy >= (skill.energyCost ?? u.maxEnergy);
}

export function legalActions(setup: BattleSetup, state: BattleState): LegalAction[] {
  if (state.phase !== "await" || !state.decision) return [];
  const out: LegalAction[] = [];
  const actor = unit(state, state.decision.actorUid);
  for (const skill of defOf(setup, actor).skills) {
    // Ultimates are listed below; follow-ups only fire from passives.
    if (skill.type === "ultimate" || skill.type === "followup" || skill.type === "dot") continue;
    if (skill.spDelta < 0 && state.sp + skill.spDelta < 0) continue;
    out.push({ action: { kind: "skill", actorUid: actor.uid, skillId: skill.id }, skill, targets: candidateTargets(state, actor, skill) });
  }
  for (const u of alive(state, "ally").sort((a, b) => a.slot - b.slot)) {
    for (const skill of defOf(setup, u).skills) {
      if (canUltimate(state, u, skill)) out.push({ action: { kind: "ult", actorUid: u.uid, skillId: skill.id }, skill, targets: candidateTargets(state, u, skill) });
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
    if (actor.team !== "ally" || !canUltimate(state, actor, skill)) throw new BattleError(`「${actor.name}」現在不能施放大招`);
    const from = state.events.length;
    execute(setup, state, actor, skill, action.targetUid);
    processTriggers(setup, state, from);
    // The decision actor can only die here in pathological setups (self-damage); resume the loop then.
    if (!checkEnd(state) && !unit(state, decision.actorUid).alive) {
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
  if (checkEnd(state)) return state;
  if (actor.alive) endTurn(setup, state, actor);
  return run(setup, state);
}

/** Scope for AI rules and passive conditions. "allies"/"foes" are relative to u's team. */
function unitScope(state: BattleState, u: UnitState) {
  const foeTeam = u.team === "ally" ? "enemy" : "ally";
  return objectScope({
    self: { hpPct: u.hp / u.maxHp, broken: u.broken, energy: u.energy, toughnessPct: u.maxToughness ? u.toughness / u.maxToughness : 0 },
    battle: { turn: state.turns, cycle: state.cycle, allies: alive(state, u.team).length, foes: alive(state, foeTeam).length },
  });
}

function enemyAction(setup: BattleSetup, state: BattleState, u: UnitState): { skill: SkillDef; targetUid?: string } {
  const def = defOf(setup, u);
  const rng = Rng.fromState(state.rng.ai);
  const scope = unitScope(state, u);
  const rules = (def.ai ?? []).filter((r) => r.weight > 0 && (!r.when || evalBool(r.when, scope)) && def.skills.some((s) => s.id === r.skillId));
  let skill = def.skills[0]!;
  if (rules.length) {
    const total = rules.reduce((a, r) => a + r.weight, 0);
    let roll = rng.next() * total;
    let picked = rules[rules.length - 1]!;
    for (const r of rules) {
      if (roll < r.weight) { picked = r; break; }
      roll -= r.weight;
    }
    skill = def.skills.find((s) => s.id === picked.skillId)!;
  }
  const targets = candidateTargets(state, u, skill);
  const targetUid = targets.length ? targets[rng.int(targets.length)] : undefined;
  state.rng.ai = rng.snapshot();
  return { skill, targetUid };
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
          if (p.on === "allyUltimate" && e.t === "action" && e.skillType === "ultimate" && teamOf(e.uid) === u.team) { match = true; targetUid = e.targetUid; }
          else if (p.on === "allyBreak" && e.t === "break" && teamOf(e.src) === u.team) { match = true; targetUid = e.dst; }
          else if (p.on === "selfHit" && e.t === "damage" && e.kind === "hit" && e.dst === u.uid && teamOf(e.src) !== u.team) { match = true; targetUid = e.src; }
          else if (p.on === "enemyKilled" && e.t === "death" && teamOf(e.by) === u.team && teamOf(e.uid) !== u.team) { match = true; }
          if (!match) continue;
          const used = u.passiveUses[p.id] ?? 0;
          if (p.limitPerTurn > 0 && used >= p.limitPerTurn) continue;
          if (p.when && !evalBool(p.when, unitScope(state, u))) continue;
          u.passiveUses[p.id] = used + 1;
          queue.push({ uid: u.uid, passiveId: p.id, targetUid });
        }
      }
    }
  };

  scan(from, state.events.length);
  for (let budget = MAX_FOLLOWUPS_PER_ACTION; queue.length && budget > 0; budget--) {
    if (checkEnd(state)) return;
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

function resolveTargets(state: BattleState, actor: UnitState, mode: TargetMode, chosen: string | undefined): { main: UnitState[]; adjacent: UnitState[] } {
  const foeTeam = actor.team === "ally" ? "enemy" : "ally";
  const foes = alive(state, foeTeam).sort((a, b) => a.slot - b.slot);
  const friends = alive(state, actor.team).sort((a, b) => a.slot - b.slot);
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
  if (actor.team === "ally" && skill.spDelta !== 0) {
    const before = state.sp;
    state.sp = Math.min(setup.rules.spMax, Math.max(0, state.sp + skill.spDelta));
    state.events.push({ t: "sp", before, after: state.sp });
  }
  if (skill.type === "ultimate") setEnergy(state, actor, 0);
  setEnergy(state, actor, actor.energy + skill.energyGain);

  const hitByThisAction = new Set<UnitState>();
  const element = skill.element ?? actor.element;
  for (const eff of skill.effects) {
    const { main, adjacent } = resolveTargets(state, actor, eff.target, chosen);
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
        const sc = scenarioFor(setup, attackerOf(setup, actor), target, { name: skill.name, type: skill.type, element, multiplier, hits });
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
      const amount = applyRounding(base * eff.multiplier + eff.flat, setup.rules.rounding);
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
  }
}

function dealDamage(setup: BattleSetup, state: BattleState, srcUid: string, target: UnitState, amount: number, crit: boolean, kind: "hit" | "break" | "dot", skillId?: string) {
  target.hp = Math.max(0, target.hp - amount);
  state.events.push({ t: "damage", src: srcUid, dst: target.uid, amount, crit, kind, hpAfter: target.hp, skillId });
  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    target.statuses = [];
    state.events.push({ t: "death", uid: target.uid, by: srcUid });
    const killer = state.units.find((u) => u.uid === srcUid);
    if (killer?.alive && killer.team !== target.team) setEnergy(state, killer, killer.energy + setup.rules.energyOnKill);
  }
}

function reduceToughness(setup: BattleSetup, state: BattleState, actor: UnitState, target: UnitState, element: string, amount: number) {
  if (amount <= 0 || target.broken || target.maxToughness <= 0 || !target.weaknesses.includes(element)) return;
  const before = target.toughness;
  target.toughness = Math.max(0, target.toughness - amount);
  state.events.push({ t: "toughness", dst: target.uid, before, after: target.toughness });
  if (target.toughness > 0) return;

  target.broken = true;
  state.events.push({ t: "break", src: actor.uid, dst: target.uid });
  const sc = scenarioFor(setup, attackerOf(setup, actor), target, { name: "擊破", type: "skill", element, multiplier: 0, hits: [1] });
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
  }
}

function applyStatus(setup: BattleSetup, state: BattleState, actor: UnitState, target: UnitState, statusId: string, chance: number) {
  const def = statusDef(setup, statusId);
  let p = chance;
  if (def.kind === "debuff" && target.team !== actor.team) {
    p = chance * (1 + unitStat(setup, actor, "effectHit")) * (1 - unitStat(setup, target, "effectRes"));
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
    const sc = scenarioFor(setup, attackerOf(setup, actor), target, { name: def.name, type: "dot", element: def.dot.element, multiplier: 0, hits: [1] });
    snapshot = Object.fromEntries(Object.entries(resolveStats(setup.damage, sc).attacker).map(([k, v]) => [k, v.value]));
  }
  preservingDistance(setup, target, () => {
    const existing = target.statuses.find((s) => s.statusId === statusId);
    if (existing) {
      existing.stacks = Math.min(def.maxStacks, existing.stacks + 1);
      existing.turnsLeft = def.duration;
      existing.sourceUid = actor.uid;
      if (snapshot) existing.snapshot = snapshot;
      state.events.push({ t: "status", src: actor.uid, dst: target.uid, statusId, result: "refreshed" });
    } else {
      const inst: StatusInstance = { statusId, sourceUid: actor.uid, stacks: 1, turnsLeft: def.duration };
      if (snapshot) inst.snapshot = snapshot;
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
