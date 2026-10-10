/**
 * Automatic play and statistics (docs/spec/battle.md §7).
 */
import { BattleError, createBattle, legalActions, submitAction, type BattleSetup } from "./engine";
import type { Action, AllyPolicy, BattleResult, BattleState } from "./types";

export const DEFAULT_POLICY: AllyPolicy = { ult: "asap", skill: "whenSp", target: "weaknessFirst" };

/** "whenSp" heal-only skills are used only when some ally is below this HP ratio. */
export const HEAL_THRESHOLD = 0.7;

/** Deterministic ally decision for the current decision point. */
export function policyAction(setup: BattleSetup, state: BattleState, policy: AllyPolicy): Action {
  const legal = legalActions(setup, state);
  if (!legal.length) throw new BattleError("沒有可用的行動");
  const pickTarget = (targets: string[], element: string | undefined) => {
    if (!targets.length) return undefined;
    const units = targets.map((uid) => state.units.find((u) => u.uid === uid)!);
    if (units[0]!.team === "ally") {
      // Ally-targeted skills (heals, buffs): lowest HP ratio first.
      return [...units].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.slot - b.slot)[0]!.uid;
    }
    switch (policy.target) {
      case "first": return units[0]!.uid;
      case "lowestHp": return [...units].sort((a, b) => a.hp - b.hp || a.slot - b.slot)[0]!.uid;
      case "highestHp": return [...units].sort((a, b) => b.hp - a.hp || a.slot - b.slot)[0]!.uid;
      case "weaknessFirst": {
        const weak = units.filter((u) => element && u.weaknesses.includes(element) && !u.broken && u.toughness > 0);
        return (weak.length ? weak.sort((a, b) => a.toughness - b.toughness || a.slot - b.slot)[0]! : [...units].sort((a, b) => a.hp - b.hp || a.slot - b.slot)[0]!).uid;
      }
    }
  };
  const elementOf = (actorUid: string, skillElement: string | undefined) => skillElement ?? state.units.find((u) => u.uid === actorUid)!.element;

  if (policy.ult === "asap") {
    const ult = legal.find((l) => l.action.kind === "ult");
    if (ult) return { ...ult.action, targetUid: pickTarget(ult.targets, elementOf(ult.action.actorUid, ult.skill.element)) };
  }
  const normal = legal.filter((l) => l.action.kind === "skill");
  let skill = normal.find((l) => l.skill.type === "skill");
  const basic = normal.find((l) => l.skill.type === "basic");
  // Don't spend skill points healing a healthy team.
  const lowestRatio = Math.min(...state.units.filter((u) => u.alive && u.team === "ally").map((u) => u.hp / u.maxHp));
  if (skill && policy.skill !== "always" && skill.skill.effects.every((e) => e.kind === "heal") && lowestRatio >= HEAL_THRESHOLD) skill = undefined;
  const chosen = (policy.skill !== "never" && skill) || basic || normal[0]!;
  return { ...chosen.action, targetUid: pickTarget(chosen.targets, elementOf(chosen.action.actorUid, chosen.skill.element)) };
}

export function autoPlay(setup: BattleSetup, state: BattleState, policy: AllyPolicy, maxDecisions = 5000): BattleState {
  let s = state;
  for (let i = 0; i < maxDecisions && s.phase === "await"; i++) s = submitAction(setup, s, policyAction(setup, s, policy));
  if (s.phase !== "ended") throw new BattleError("自動戰鬥超過決策上限");
  return s;
}

export interface UnitSummary {
  uid: string;
  name: string;
  team: "ally" | "enemy";
  damage: { hit: number; break: number; dot: number; total: number };
  actions: number;
  ults: number;
  breaks: number;
  survived: boolean;
}

export interface BattleSummary {
  seed: number | string;
  result: BattleResult;
  /** Cycle in which the battle ended. */
  cycles: number;
  time: number;
  turns: number;
  units: UnitSummary[];
  breaks: number;
  firstBreakTime: number | null;
}

export function summarize(state: BattleState, seed: number | string): BattleSummary {
  const units = new Map<string, UnitSummary>(
    state.units.map((u) => [u.uid, { uid: u.uid, name: u.name, team: u.team, damage: { hit: 0, break: 0, dot: 0, total: 0 }, actions: 0, ults: 0, breaks: 0, survived: u.alive }]),
  );
  let breaks = 0;
  let firstBreakTime: number | null = null;
  let time = 0;
  for (const e of state.events) {
    if (e.t === "turn" || e.t === "cycle") time = e.time;
    if (e.t === "action") {
      const u = units.get(e.uid)!;
      u.actions++;
      if (e.skillType === "ultimate") u.ults++;
      time = e.time;
    } else if (e.t === "damage") {
      const u = units.get(e.src);
      if (u) { u.damage[e.kind] += e.amount; u.damage.total += e.amount; }
    } else if (e.t === "break") {
      breaks++;
      units.get(e.src)!.breaks++;
      firstBreakTime ??= time;
    }
  }
  return { seed, result: state.result!, cycles: state.cycle, time: state.time, turns: state.turns, units: [...units.values()], breaks, firstBreakTime };
}

export function simulateOne(setup: BattleSetup, policy: AllyPolicy, seed: number | string): BattleSummary {
  return summarize(autoPlay(setup, createBattle(setup, seed), policy), seed);
}

/** Seed of the i-th battle in a batch. */
export const batchSeed = (seed: number | string, i: number) => `${seed}#${i}`;

export interface BatchStats {
  n: number;
  winRate: number;
  loseRate: number;
  timeoutRate: number;
  /** Over winning battles only. */
  cycles: { mean: number; p50: number; p90: number; histogram: { cycle: number; count: number }[] } | null;
  breaksMean: number;
  damageShare: { uid: string; name: string; mean: number; share: number; hit: number; break: number; dot: number }[];
  survival: { uid: string; name: string; rate: number }[];
}

export function aggregate(results: BattleSummary[]): BatchStats {
  const n = results.length;
  const wins = results.filter((r) => r.result === "win");
  const quant = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;
  let cycles: BatchStats["cycles"] = null;
  if (wins.length) {
    const c = wins.map((r) => r.cycles).sort((a, b) => a - b);
    const hist = new Map<number, number>();
    for (const x of c) hist.set(x, (hist.get(x) ?? 0) + 1);
    cycles = {
      mean: c.reduce((a, b) => a + b, 0) / c.length,
      p50: quant(c, 0.5),
      p90: quant(c, 0.9),
      histogram: [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([cycle, count]) => ({ cycle, count })),
    };
  }
  const allyIds = results[0]?.units.filter((u) => u.team === "ally") ?? [];
  const totals = allyIds.map((a) => {
    const per = results.map((r) => r.units.find((u) => u.uid === a.uid)!);
    const sum = (f: (u: UnitSummary) => number) => per.reduce((x, u) => x + f(u), 0) / Math.max(1, n);
    return { uid: a.uid, name: a.name, mean: sum((u) => u.damage.total), hit: sum((u) => u.damage.hit), break: sum((u) => u.damage.break), dot: sum((u) => u.damage.dot), survived: per.filter((u) => u.survived).length / Math.max(1, n) };
  });
  const grand = totals.reduce((a, t) => a + t.mean, 0) || 1;
  return {
    n,
    winRate: wins.length / Math.max(1, n),
    loseRate: results.filter((r) => r.result === "lose").length / Math.max(1, n),
    timeoutRate: results.filter((r) => r.result === "timeout").length / Math.max(1, n),
    cycles,
    breaksMean: results.reduce((a, r) => a + r.breaks, 0) / Math.max(1, n),
    damageShare: totals.map((t) => ({ uid: t.uid, name: t.name, mean: t.mean, share: t.mean / grand, hit: t.hit, break: t.break, dot: t.dot })),
    survival: totals.map((t) => ({ uid: t.uid, name: t.name, rate: t.survived })),
  };
}
