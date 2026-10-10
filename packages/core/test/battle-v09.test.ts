/**
 * Rules 0.9 mechanisms (docs/spec/battle.md §16): formula values, effect conditions, proc gates, HP costs,
 * hit riders, status adjustment, tags and the new triggers. Same minimal world as battle-v08.test.ts:
 * damage per hit = floor(atk × multiplier × hits[i]) with def 0, res 0 and no crit (atk 100 → 100 per 1.0).
 * avBase 10000, so spd 100 → AV 100 and the dummy's spd 50 → AV 200. Hero (ally) acts first on ties.
 * Dummies idle unless a test gives them skills, so nothing but the hero changes the board.
 */
import { describe, expect, it } from "vitest";
import {
  DAMAGE_COMPONENTS,
  DEFAULT_BATTLE_RULES,
  Rng,
  composeRules,
  configFromTemplate,
  contentReferences,
  createBattle,
  op,
  c,
  parseExpr,
  submitAction,
  validateBattle,
  type BattleEvent,
  type BattleRules,
  type BattleSetup,
  type BattleState,
  type Effect,
  type Num,
  type PassiveDef,
  type SkillDef,
  type StatusDef,
  type UnitDef,
} from "../src";

const plain = (s: Record<string, number>) => ({ level: 80, def: 0, res: 0, resPen: 0, critRate: 0, critDmg: 0, dmgBonus: 0, defIgnore: 0, vulnerability: 0, effectHit: 0, effectRes: 0, breakEffect: 0, ...s });
const skill = (id: string, effects: Effect[], extra: Partial<SkillDef> = {}): SkillDef => ({ id, name: id, type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects, ...extra });
const hit = (mult: Num, extra: Partial<Extract<Effect, { kind: "damage" }>> = {}): Effect => ({ kind: "damage", target: "enemy", multiplier: mult, toughness: 0, ...extra });
const f = parseExpr;
const followup = (id: string, effects: Effect[]): SkillDef => skill(id, effects, { type: "followup", targeting: "none" });
/** Follow-up that bumps one of the caster's counters by 1. */
const bump = (key: string): SkillDef => followup(key, [{ kind: "counter", target: "self", key, op: "add", value: 1 }]);
const idle = skill("idle", [{ kind: "energy", target: "self", amount: 0 }]);

function world(opts: {
  ally?: Partial<UnitDef>; enemy?: Partial<UnitDef>; extra?: UnitDef[]; statuses?: StatusDef[]; allies?: string[]; enemies?: string[]; rules?: Partial<BattleRules>;
}): BattleSetup {
  const ally: UnitDef = {
    id: "hero", name: "勇者", team: "ally", element: "fire", weaknesses: [],
    stats: plain({ hp: 1000, atk: 100, spd: 100, maxEnergy: 100 }),
    skills: [skill("basic", [hit(1)])],
    ...opts.ally,
  };
  const enemy: UnitDef = {
    id: "dummy", name: "木樁", team: "enemy", element: "ice", weaknesses: ["fire"],
    stats: plain({ hp: 100000, atk: 10, spd: 50, toughness: 30 }),
    skills: [idle],
    ...opts.enemy,
  };
  return {
    damage: composeRules(configFromTemplate("tpl.standard"), DAMAGE_COMPONENTS),
    rules: { ...DEFAULT_BATTLE_RULES, breakDamage: parseExpr("attacker.atk * 0"), maxCycles: 10, rounding: "floor", ...opts.rules },
    statuses: opts.statuses ?? [],
    units: [ally, enemy, ...(opts.extra ?? [])],
    encounter: { allies: opts.allies ?? ["hero"], enemies: opts.enemies ?? ["dummy"] },
  };
}

const squire = (extra: Partial<UnitDef> = {}): UnitDef => ({
  id: "squire", name: "侍從", team: "ally", element: "fire", weaknesses: [],
  stats: plain({ hp: 1000, atk: 100, spd: 80, maxEnergy: 100 }), skills: [skill("basic", [hit(1)])], ...extra,
});

const use = (setup: BattleSetup, s: BattleState, skillId: string, targetUid?: string) =>
  submitAction(setup, s, { kind: "skill", actorUid: s.decision!.actorUid, skillId, targetUid });
const since = (s: BattleState, from: number) => s.events.slice(from);
const of = <T extends BattleEvent["t"]>(evs: BattleEvent[], t: T) => evs.filter((e): e is Extract<BattleEvent, { t: T }> => e.t === t);
const status = (id: string, extra: Partial<StatusDef> = {}): StatusDef => ({ id, name: id, kind: "buff", duration: 0, maxStacks: 1, modifiers: [], ...extra });
const self = (id: string, statusId: string) => skill(id, [{ kind: "status", target: "self", statusId, chance: 1 }], { targeting: "none" });
const types = (evs: BattleEvent[]) => evs.map((e) => e.t);
/** Hero damage amounts (hits) per destination since n. */
const dmg = (s: BattleState, n: number) => of(since(s, n), "damage").filter((e) => e.kind === "hit").map((e) => [e.dst, e.amount] as const);
/** Events of the action just taken, up to (not including) the next unit's turn. */
const untilNextTurn = (s: BattleState, n: number) => {
  const evs = since(s, n);
  const i = evs.findIndex((e) => e.t === "turn");
  return i < 0 ? evs : evs.slice(0, i);
};
const hero = (s: BattleState) => s.units.find((u) => u.uid === "A1")!;

/** The first `n` draws of the proc stream for a seed, and its state after k draws. */
const procDraws = (seed: number, n: number) => { const r = new Rng(seed, "battle.proc"); return Array.from({ length: n }, () => r.next()); };
const procAfter = (seed: number, k: number) => { const r = new Rng(seed, "battle.proc"); for (let i = 0; i < k; i++) r.next(); return r.snapshot(); };
const seedWith = (n: number, pred: (d: number[]) => boolean) => {
  for (let s = 1; s < 1000; s++) if (pred(procDraws(s, n))) return s;
  throw new Error("no seed found");
};

describe("formula values (§16.1)", () => {
  it("effect.targets splits a total across the targets", () => {
    const setup = world({ enemies: ["dummy", "dummy", "dummy"], ally: { skills: [skill("split", [hit(f("6 / effect.targets"), { target: "allEnemies" })], { targeting: "none" })] } });
    let s = createBattle(setup, 1);
    const n = s.events.length;
    s = use(setup, s, "split");
    // 6 / 3 targets = 2 → 100 × 2 = 200 each.
    expect(dmg(s, n)).toEqual([["E1", 200], ["E2", 200], ["E3", 200]]);
  });

  it("effect.index and effect.adjacent: main target first, then the neighbours (blast on E2)", () => {
    const setup = world({
      enemies: ["dummy", "dummy", "dummy"],
      ally: { skills: [skill("blast", [hit(f("1 + effect.index"), { target: "blast", adjMultiplier: f("10 * effect.adjacent + effect.index") })])] },
    });
    let s = createBattle(setup, 1);
    const n = s.events.length;
    s = use(setup, s, "blast", "E2");
    // E2: index 0, multiplier 1 + 0 = 1 → 100. E1: index 1, adjacent → 10 × 1 + 1 = 11 → 1100. E3: index 2 → 12 → 1200.
    expect(dmg(s, n)).toEqual([["E2", 100], ["E1", 1100], ["E3", 1200]]);
  });

  it("action.hitCount counts units already hit by this action, read before each target", () => {
    const setup = world({
      enemies: ["dummy", "dummy"],
      ally: { skills: [skill("double", [hit(1), hit(f("1 + action.hitCount"), { target: "allEnemies" })])] },
    });
    let s = createBattle(setup, 1);
    const n = s.events.length;
    s = use(setup, s, "double", "E1");
    // Effect 1 hits E1 → set {E1}. Effect 2: E1 reads 1 → ×2 = 200; E2 is evaluated before it joins the set → 1 → 200.
    expect(dmg(s, n)).toEqual([["E1", 100], ["E1", 200], ["E2", 200]]);
  });

  it("is evaluated once per target, before the first hit", () => {
    const setup = world({ ally: { skills: [skill("twice", [hit(f("if(target.hpPct >= 1, 2, 1)"), { hits: [0.5, 0.5] })])] } });
    let s = createBattle(setup, 1);
    const n = s.events.length;
    s = use(setup, s, "twice");
    // hpPct is 1 before the first hit → multiplier 2 for both hits: 100 × 2 × 0.5 = 100 each (a per-hit read would give 100, 50).
    expect(dmg(s, n)).toEqual([["E1", 100], ["E1", 100]]);
  });

  it("a non-finite result counts as 0", () => {
    const setup = world({ ally: { skills: [skill("boom", [{ kind: "energy", target: "self", amount: op("mul", c(1e308), c(10)) }], { targeting: "none" })] } });
    let s = createBattle(setup, 1);
    const n = s.events.length;
    s = use(setup, s, "boom");
    // 1e308 × 10 = Infinity → 0: energy stays 0 with no event (taken literally it would be capped at maxEnergy 100).
    expect(of(since(s, n), "energy")).toHaveLength(0);
    expect(hero(s).energy).toBe(0);
  });

  it("covers sp, energy, counter and status chance formulas", () => {
    const setup = world({
      statuses: [status("mark", { kind: "debuff" })],
      ally: {
        skills: [skill("mix", [
          { kind: "sp", amount: f("battle.turn + 1") },
          { kind: "energy", target: "self", amount: f("10 * effect.targets") },
          { kind: "counter", target: "self", key: "k", op: "add", value: f("self.energy") },
          { kind: "status", target: "enemy", statusId: "mark", chance: f("effect.targets") },
        ])],
      },
    });
    let s = createBattle(setup, 1);
    const n = s.events.length;
    s = use(setup, s, "mix");
    const evs = since(s, n);
    expect(of(evs, "sp")).toEqual([{ t: "sp", before: 3, after: 5 }]); // turn 1 → +2, spStart 3 → 5 (spMax 5)
    expect(of(evs, "energy")[0]).toEqual({ t: "energy", uid: "A1", before: 0, after: 10 }); // 10 × 1 target
    expect(of(evs, "counter")).toEqual([{ t: "counter", uid: "A1", key: "k", before: 0, after: 10 }]); // energy 10 after the previous effect
    expect(of(evs, "status")[0]).toMatchObject({ result: "applied" }); // chance 1 (1 target) → no status draw
    expect(s.rng.status).toEqual(new Rng(1, "battle.status").snapshot());
  });
});

describe("effect conditions (§16.2)", () => {
  it("when=false skips the target: no RNG, no hit-set entry", () => {
    const setup = world({
      ally: {
        skills: [skill("nope", [
          hit(1, { when: f("battle.turn > 100"), chance: 0.5 }),
          { kind: "energy", target: "self", amount: f("10 + action.hitCount") },
        ])],
      },
    });
    const fresh = createBattle(setup, 7);
    const s = use(setup, fresh, "nope");
    expect(of(s.events, "damage")).toHaveLength(0);
    expect(s.rng).toEqual(fresh.rng); // crit, status, ai and proc all untouched (the chance gate comes after `when`)
    expect(of(s.events, "energy")).toEqual([{ t: "energy", uid: "A1", before: 0, after: 10 }]); // hitCount 0 → 10 + 0
  });

  it("when can use effect.index to leave one target out (E1 and E3 of three)", () => {
    const setup = world({
      enemies: ["dummy", "dummy", "dummy"], statuses: [status("mark", { kind: "debuff" })],
      ally: { skills: [skill("most", [{ kind: "status", target: "allEnemies", statusId: "mark", chance: 1, when: f("effect.index != 1") }], { targeting: "none" })] },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "most");
    expect(s.units.filter((u) => u.statuses.length).map((u) => u.uid)).toEqual(["E1", "E3"]);
  });
});

describe("proc gate (§16.3)", () => {
  it("p < 1 draws exactly one proc draw per target, before any damage", () => {
    const seed = seedWith(1, (d) => d[0]! < 0.5);
    const setup = world({ ally: { skills: [skill("gamble", [hit(1, { chance: 0.5 })])] } });
    let s = createBattle(setup, seed);
    const n = s.events.length;
    s = use(setup, s, "gamble");
    // Draw < 0.5 → the hit lands: 100. One proc draw, one crit draw (the crit stream is separate).
    expect(dmg(s, n)).toEqual([["E1", 100]]);
    expect(s.rng.proc).toEqual(procAfter(seed, 1));
    const crit = new Rng(seed, "battle.crit");
    crit.next();
    expect(s.rng.crit).toEqual(crit.snapshot());
  });

  it("a failed gate skips the effect and draws nothing else", () => {
    const seed = seedWith(1, (d) => d[0]! >= 0.5);
    const setup = world({ ally: { skills: [skill("gamble", [hit(1, { chance: 0.5 })])] } });
    let s = createBattle(setup, seed);
    s = use(setup, s, "gamble");
    expect(of(s.events, "damage")).toHaveLength(0);
    expect(s.rng.proc).toEqual(procAfter(seed, 1));
    expect(s.rng.crit).toEqual(new Rng(seed, "battle.crit").snapshot()); // no hit, no crit draw
  });

  it("draws once per target, and a formula chance ≥ 1 draws none", () => {
    const seed = seedWith(2, (d) => d[0]! < 0.5 && d[1]! >= 0.5);
    const two = world({ enemies: ["dummy", "dummy"], ally: { skills: [skill("each", [hit(1, { target: "allEnemies", chance: 0.5 })], { targeting: "none" })] } });
    let s = createBattle(two, seed);
    const n = s.events.length;
    s = use(two, s, "each");
    expect(dmg(s, n)).toEqual([["E1", 100]]); // E1 draw < 0.5 passes, E2 draw ≥ 0.5 fails
    expect(s.rng.proc).toEqual(procAfter(seed, 2));

    // chance = effect.targets / 2 = 2 / 2 = 1 for both targets → no draws.
    const sure = world({ enemies: ["dummy", "dummy"], ally: { skills: [skill("each", [hit(1, { target: "allEnemies", chance: f("effect.targets / 2") })], { targeting: "none" })] } });
    let t = createBattle(sure, seed);
    const m = t.events.length;
    t = use(sure, t, "each");
    expect(dmg(t, m)).toEqual([["E1", 100], ["E2", 100]]);
    expect(t.rng.proc).toEqual(procAfter(seed, 0));
  });

  it("status effects keep their own chance on the status stream", () => {
    const setup = world({ statuses: [status("mark", { kind: "debuff" })], ally: { skills: [skill("tag", [{ kind: "status", target: "enemy", statusId: "mark", chance: f("0.5 * effect.targets") }])] } });
    const fresh = createBattle(setup, 3);
    const s = use(setup, fresh, "tag");
    expect(s.rng.proc).toEqual(fresh.rng.proc); // chance 0.5 < 1 draws from `status`, not `proc`
    expect(s.rng.status).not.toEqual(fresh.rng.status);
  });

  it("a passive's chance comes after `when` and limitPerTurn; a failed roll does not use up the limit", () => {
    const seed = seedWith(2, (d) => d[0]! >= 0.5 && d[1]! < 0.5);
    const passive: PassiveDef = { id: "p", name: "p", on: "allyHit", skillId: "echo", limitPerTurn: 1, chance: 0.5 };
    const setup = world({ ally: { skills: [skill("basic", [hit(1, { hits: [0.5, 0.5] })]), followup("echo", [hit(0.2)])], passives: [passive] } });
    let s = createBattle(setup, seed);
    s = use(setup, s, "basic");
    // Hit 1: draw ≥ 0.5 → no trigger, limit untouched. Hit 2: draw < 0.5 → one trigger. The echo's own hit is blocked by
    // the limit before any draw, so the stream has advanced exactly 2.
    expect(of(s.events, "trigger")).toHaveLength(1);
    expect(s.rng.proc).toEqual(procAfter(seed, 2));
    // The echo: 100 × 0.2 = 20 after the two 50s.
    expect(of(s.events, "damage").map((e) => e.amount)).toEqual([50, 50, 20]);
  });

  it("passive chance ≥ 1 draws nothing", () => {
    const passive: PassiveDef = { id: "p", name: "p", on: "allyHit", skillId: "echo", limitPerTurn: 1, chance: f("battle.foes") };
    const setup = world({ ally: { skills: [skill("basic", [hit(1)]), followup("echo", [hit(0.2)])], passives: [passive] } });
    const s = use(setup, createBattle(setup, 5), "basic");
    expect(of(s.events, "trigger")).toHaveLength(1); // battle.foes = 1 → p = 1
    expect(s.rng.proc).toEqual(procAfter(5, 0));
  });
});

describe("HP cost and set (§16.4)", () => {
  it("lose by maxHp / hp, the floor, set, and storeAs (sums, may go negative)", () => {
    const cost = (id: string, e: Partial<Extract<Effect, { kind: "hpCost" }>>) =>
      skill(id, [{ kind: "hpCost", target: "self", op: "lose", basis: "maxHp", ratio: 0.25, storeAs: "spent", ...e }], { targeting: "none" });
    const setup = world({
      ally: {
        skills: [
          cost("c1", {}),
          cost("c2", { basis: "hp", ratio: 0.5 }),
          cost("c3", { ratio: 0.9 }),
          cost("c4", { op: "set", ratio: 0.5 }),
          cost("c5", { ratio: 0.9, floor: 100 }),
          cost("c6", { op: "set", ratio: 0.0004 }),
        ],
      },
    });
    let s = createBattle(setup, 1);
    const step = (id: string) => {
      const n = s.events.length;
      s = use(setup, s, id);
      return since(s, n);
    };
    const spent = () => hero(s).counters.spent;

    // c1: floor(1000 × 0.25) = 250 → hp 1000 − 250 = 750; spent 0 + 250.
    let evs = step("c1");
    expect(of(evs, "hp")).toEqual([{ t: "hp", uid: "A1", before: 1000, after: 750 }]);
    expect(spent()).toBe(250);
    // c2 (basis hp): floor(750 × 0.5) = 375 → hp 375; spent 250 + 375 = 625.
    evs = step("c2");
    expect(of(evs, "hp")).toEqual([{ t: "hp", uid: "A1", before: 750, after: 375 }]);
    expect(spent()).toBe(625);
    // c3: floor(1000 × 0.9) = 900; hp = max(min(375, 1), 375 − 900) = max(1, −525) = 1 → never dies; reduction 374; spent 625 + 374 = 999.
    evs = step("c3");
    expect(of(evs, "hp")).toEqual([{ t: "hp", uid: "A1", before: 375, after: 1 }]);
    expect(hero(s).alive).toBe(true);
    expect(spent()).toBe(999);
    // c4 (set 50%): min(1000, max(1, floor(1000 × 0.5))) = 500; reduction 1 − 500 = −499; spent 999 − 499 = 500.
    evs = step("c4");
    expect(of(evs, "hp")).toEqual([{ t: "hp", uid: "A1", before: 1, after: 500 }]);
    expect(spent()).toBe(500);
    // c5 (floor 100): amount 900; hp = max(min(500, 100), 500 − 900) = max(100, −400) = 100; reduction 400; spent 900.
    evs = step("c5");
    expect(of(evs, "hp")).toEqual([{ t: "hp", uid: "A1", before: 500, after: 100 }]);
    expect(spent()).toBe(900);
    // c6 (set 0.04%): floor(1000 × 0.0004) = 0 → max(1, 0) = 1; reduction 99; spent 999.
    evs = step("c6");
    expect(of(evs, "hp")).toEqual([{ t: "hp", uid: "A1", before: 100, after: 1 }]);
    expect(spent()).toBe(999);
    expect(of(s.events, "damage")).toHaveLength(0); // no damage events, no shield, no death
  });

  it("gives no event when HP does not change, and set caps at maxHp", () => {
    const setup = world({
      ally: {
        skills: [
          skill("zero", [{ kind: "hpCost", target: "self", op: "lose", basis: "maxHp", ratio: 0, storeAs: "spent" }], { targeting: "none" }),
          skill("big", [{ kind: "hpCost", target: "self", op: "set", basis: "maxHp", ratio: 5 }], { targeting: "none" }),
        ],
      },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "zero");
    expect(of(s.events, "hp")).toHaveLength(0);
    expect(hero(s).counters.spent).toBeUndefined(); // += 0 changes nothing, so no counter event either
    s = use(setup, s, "big");
    expect(of(s.events, "hp")).toHaveLength(0); // min(1000, 5000) = 1000 = current
  });
});

describe("hit riders (§16.5)", () => {
  const bumpBy = (key: string, value: Num): Effect => ({ kind: "counter", target: "self", key, op: "add", value });

  it("hit.index / isLast / crit / amount, in order after each hit", () => {
    const setup = world({
      ally: {
        stats: plain({ hp: 1000, atk: 100, spd: 100, maxEnergy: 100, critRate: 1, critDmg: 1 }),
        skills: [skill("combo", [hit(1, {
          hits: [0.5, 0.5],
          onHit: [bumpBy("idx", f("1 + hit.index")), bumpBy("last", f("if(hit.isLast, 1, 0)")), bumpBy("crit", f("hit.crit")), bumpBy("amt", f("hit.amount"))],
        })])],
      },
    });
    let s = createBattle(setup, 1);
    const n = s.events.length;
    s = use(setup, s, "combo");
    const evs = since(s, n);
    // critRate 1, critDmg 1 → ×2: 100 × 0.5 × 2 = 100 per hit.
    expect(dmg(s, n)).toEqual([["E1", 100], ["E1", 100]]);
    // hit 0: idx 0→1, crit 0→1, amt 0→100 ("last" adds 0 → no event); hit 1: idx 1→3 (1 + 1 = 2), last 0→1, crit 1→2, amt 100→200.
    expect(evs.filter((e) => e.t === "damage" || e.t === "counter").map((e) => (e.t === "damage" ? `d${e.amount}` : `${e.key}:${e.before}>${e.after}`))).toEqual([
      "d100", "idx:0>1", "crit:0>1", "amt:0>100",
      "d100", "idx:1>3", "last:0>1", "crit:1>2", "amt:100>200",
    ]);
  });

  it("runs after a killing hit; victim is skipped when dead; hit.killed", () => {
    const setup = world({
      enemy: { stats: plain({ hp: 150, atk: 10, spd: 50, toughness: 30 }) },
      enemies: ["dummy", "dummy"],
      ally: {
        skills: [skill("burst", [hit(1, {
          hits: [0.5, 0.5, 0.5],
          onHit: [bumpBy("kills", f("if(hit.killed, 1, 0)")), { kind: "counter", target: "victim", key: "marks", op: "add", value: 1 }],
        })])],
      },
    });
    let s = createBattle(setup, 1);
    const n = s.events.length;
    s = use(setup, s, "burst", "E1");
    // 50 per hit: 150 → 100 → 50 → 0. The third hit kills; its rider still runs.
    expect(dmg(s, n)).toEqual([["E1", 50], ["E1", 50], ["E1", 50]]);
    expect(hero(s).counters.kills).toBe(1);
    // "victim" lands on hits 1 and 2 only: the dead victim is skipped on hit 3.
    expect(s.units.find((u) => u.uid === "E1")!.counters.marks).toBe(2);
    const order = since(s, n).filter((e) => e.t === "death" || (e.t === "counter" && e.key === "kills")).map((e) => e.t);
    expect(order).toEqual(["death", "counter"]);
  });

  it("hit.broke is true only on the breaking hit, and hit.amount excludes break damage", () => {
    const setup = world({
      rules: { breakDamage: parseExpr("attacker.atk * 3") },
      ally: {
        skills: [skill("crack", [hit(1, { hits: [0.5, 0.5], toughness: 30, onHit: [bumpBy("broke", f("hit.broke")), bumpBy("amt", f("hit.amount"))] })])],
      },
    });
    let s = createBattle(setup, 1);
    const n = s.events.length;
    s = use(setup, s, "crack");
    // Toughness 30 × 0.5 = 15 per hit: 30 → 15 → 0 breaks on hit 2 (break damage 100 × 3 = 300).
    const evs = since(s, n);
    expect(of(evs, "break")).toHaveLength(1);
    expect(of(evs, "counter").filter((e) => e.key === "broke")).toEqual([{ t: "counter", uid: "A1", key: "broke", before: 0, after: 1 }]);
    expect(of(evs, "counter").filter((e) => e.key === "amt").map((e) => e.after)).toEqual([50, 100]); // 50 + 50, never 300
    expect(of(evs, "damage").map((e) => [e.kind, e.amount])).toEqual([["hit", 50], ["hit", 50], ["break", 300]]);
  });

  it("a rider damage effect follows each hit; victim outside onHit has no target", () => {
    const setup = world({
      ally: {
        skills: [
          skill("echo", [hit(1, { hits: [0.5, 0.5], onHit: [{ kind: "damage", target: "victim", multiplier: 0.2, toughness: 0 }] })]),
          skill("stray", [{ kind: "counter", target: "victim", key: "x", op: "add", value: 1 }], { targeting: "none" }),
        ],
      },
    });
    let s = createBattle(setup, 1);
    let n = s.events.length;
    s = use(setup, s, "echo");
    // 100 × 0.5 = 50, then the rider's 100 × 0.2 = 20, twice.
    expect(of(since(s, n), "damage").map((e) => e.amount)).toEqual([50, 20, 50, 20]);
    n = s.events.length;
    s = use(setup, s, "stray");
    expect(of(since(s, n), "counter")).toHaveLength(0);
  });
});

describe("status adjustment (§16.6)", () => {
  const adj = (id: string, op: "add" | "set" | "turns", value: Num, extra: Partial<Extract<Effect, { kind: "statusAdjust" }>> = {}): SkillDef =>
    skill(id, [{ kind: "statusAdjust", target: "self", statusId: "stack", op, value, ...extra }], { targeting: "none" });

  it("add / set clamp to [0, maxStacks]; removal is `consumed`; storeAs sets old − new on the actor", () => {
    const setup = world({
      statuses: [status("stack", { maxStacks: 5 })],
      ally: {
        skills: [
          skill("build", ["", "", ""].map(() => ({ kind: "status", target: "self", statusId: "stack", chance: 1 }) as Effect), { targeting: "none" }),
          adj("minus", "add", -1, { storeAs: "used" }),
          adj("set4", "set", 4, { storeAs: "used" }),
          adj("over", "add", 10, { storeAs: "used" }),
          adj("pop", "set", 0, { storeAs: "used" }),
          adj("absent", "add", 1, { storeAs: "used" }),
        ],
      },
    });
    let s = createBattle(setup, 1);
    const step = (id: string) => { const n = s.events.length; s = use(setup, s, id); return since(s, n); };
    const stacks = () => hero(s).statuses[0]?.stacks;
    step("build");
    expect(stacks()).toBe(3);
    // add −1: 3 → 2, no status event; used = old − new = 1 (counter 0 → 1).
    let evs = step("minus");
    expect(stacks()).toBe(2);
    expect(of(evs, "status")).toHaveLength(0);
    expect(of(evs, "counter")).toEqual([{ t: "counter", uid: "A1", key: "used", before: 0, after: 1 }]);
    // set 4: 2 → 4; used is SET to 2 − 4 = −2 (not added).
    evs = step("set4");
    expect(stacks()).toBe(4);
    expect(of(evs, "counter")).toEqual([{ t: "counter", uid: "A1", key: "used", before: 1, after: -2 }]);
    // add 10: min(5, 14) = 5; used = 4 − 5 = −1.
    evs = step("over");
    expect(stacks()).toBe(5);
    expect(of(evs, "counter")).toEqual([{ t: "counter", uid: "A1", key: "used", before: -2, after: -1 }]);
    // set 0: removed with a `consumed` event; used = 5 − 0 = 5.
    evs = step("pop");
    expect(hero(s).statuses).toEqual([]);
    expect(of(evs, "status")).toEqual([{ t: "status", src: "A1", dst: "A1", statusId: "stack", result: "consumed" }]);
    expect(hero(s).counters.used).toBe(5);
    // Nothing left to adjust: no effect, no storeAs.
    evs = step("absent");
    expect(of(evs, "status")).toHaveLength(0);
    expect(of(evs, "counter")).toHaveLength(0);
  });

  it("turns changes turnsLeft; ≤ 0 removes; permanent statuses are unaffected; storeAs is stacks lost", () => {
    const setup = world({
      statuses: [status("stack", { duration: 5 }), status("perm", { duration: 0 })],
      ally: {
        skills: [
          self("apply", "stack"),
          self("applyPerm", "perm"),
          adj("extend", "turns", 2, { storeAs: "t" }),
          adj("cut", "turns", -10, { storeAs: "t" }),
          skill("permTurns", [{ kind: "statusAdjust", target: "self", statusId: "perm", op: "turns", value: 3, storeAs: "p" }], { targeting: "none" }),
        ],
      },
    });
    let s = createBattle(setup, 1);
    const step = (id: string) => { const n = s.events.length; s = use(setup, s, id); return since(s, n); };
    step("apply"); // turnsLeft 5; the end of the hero's turn counts it down to 4
    expect(hero(s).statuses[0]!.turnsLeft).toBe(4);
    step("extend"); // 4 + 2 = 6; end of turn → 5. Stacks unchanged → stored 1 − 1 = 0 (no counter event: 0 → 0)
    expect(hero(s).statuses[0]!.turnsLeft).toBe(5);
    expect(hero(s).counters.t).toBeUndefined();
    const evs = step("cut"); // 5 − 10 = −5 ≤ 0 → removed; stored = old stacks 1 − 0 = 1
    expect(hero(s).statuses).toEqual([]);
    expect(of(evs, "status")).toEqual([{ t: "status", src: "A1", dst: "A1", statusId: "stack", result: "consumed" }]);
    expect(hero(s).counters.t).toBe(1);
    step("applyPerm");
    const perm = step("permTurns"); // duration 0: no effect at all
    expect(hero(s).statuses.map((x) => [x.statusId, x.turnsLeft])).toEqual([["perm", 0]]);
    expect(of(perm, "counter")).toHaveLength(0);
  });

  it("keeps the target's remaining action distance when its speed changes", () => {
    const setup = world({
      statuses: [status("chill", { kind: "debuff", maxStacks: 3, modifiers: [{ target: "stat:spd", op: "mul", value: 0.5 }] })],
      ally: {
        skills: [
          skill("freeze2", ["", ""].map(() => ({ kind: "status", target: "enemy", statusId: "chill", chance: 1 }) as Effect)),
          skill("thaw", [{ kind: "statusAdjust", target: "enemy", statusId: "chill", op: "set", value: 1 }]),
        ],
      },
    });
    let s = createBattle(setup, 1);
    const dummyAv = () => s.units.find((u) => u.uid === "E1")!.av;
    s = use(setup, s, "freeze2");
    // t = 100: the dummy (spd 50) has 100 AV left. Stack 1: spd 25 → 100 × 50 / 25 = 200; stack 2: spd 12.5 → 200 × 25 / 12.5 = 400.
    // By the hero's next turn at t = 200, 100 has elapsed: 300.
    expect(dummyAv()).toBe(300);
    s = use(setup, s, "thaw");
    // Set to 1 stack: spd 12.5 → 25, 300 × 12.5 / 25 = 150; the hero's next turn (t = 300) takes 100 away: 50.
    expect(dummyAv()).toBe(50);
  });
});

describe("tags and queries (§16.7)", () => {
  const tagged = [
    status("atag", { maxStacks: 3, tags: ["power"] }),
    status("btag", { maxStacks: 3, tags: ["power", "extra"] }),
    status("plain"),
    status("curse", { kind: "debuff", tags: ["curse"] }),
  ];

  it("tag.<t> sums stacks; buffs / debuffs count instances", () => {
    const setup = world({
      statuses: tagged,
      ally: {
        skills: [
          skill("setup", [
            { kind: "status", target: "self", statusId: "atag", chance: 1 },
            { kind: "status", target: "self", statusId: "btag", chance: 1 },
            { kind: "status", target: "self", statusId: "btag", chance: 1 },
            { kind: "status", target: "self", statusId: "curse", chance: 1 },
            { kind: "status", target: "enemy", statusId: "curse", chance: 1 },
          ]),
          skill("probe", [
            hit(f("1 + self.tag.power")),
            hit(f("self.buffs * 10 + self.debuffs")),
            hit(f("1 + target.tag.curse + target.debuffs")),
          ]),
        ],
      },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "setup");
    const n = s.events.length;
    s = use(setup, s, "probe");
    // power = 1 (atag) + 2 (btag ×2) = 3 → ×4 = 400. Hero: 2 buff instances, 1 debuff → 21 → 2100.
    // Enemy curse: 1 stack, 1 debuff instance → 1 + 1 + 1 = 3 → 300.
    expect(dmg(s, n)).toEqual([["E1", 400], ["E1", 2100], ["E1", 300]]);
  });

  it("battle.holders / battle.maxStacks count living holders and the highest stack", () => {
    const setup = world({
      enemies: ["dummy", "dummy", "dummy"],
      statuses: [status("mark", { kind: "debuff", maxStacks: 3 })],
      ally: {
        skills: [
          skill("markMost", [{ kind: "status", target: "allEnemies", statusId: "mark", chance: 1, when: f("effect.index != 1") }], { targeting: "none" }),
          skill("markOne", [{ kind: "status", target: "enemy", statusId: "mark", chance: 1 }]),
          skill("probe", [hit(f("battle.holders.mark * 10 + battle.maxStacks.mark"))]),
        ],
      },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "markMost"); // E1 and E3: 1 stack each
    s = use(setup, s, "markOne", "E1"); // E1: 2 stacks
    const n = s.events.length;
    s = use(setup, s, "probe", "E2");
    // 2 holders × 10 + highest stack 2 = 22 → 2200.
    expect(dmg(s, n)).toEqual([["E2", 2200]]);
  });

  it("dispel and detonate honor the tag filter", () => {
    const setup = world({
      statuses: [
        ...tagged,
        status("burn", { kind: "debuff", duration: 3, tags: ["fire"], dot: { multiplier: 1, element: "fire" } }),
        status("bleed", { kind: "debuff", duration: 3, tags: ["bleed"], dot: { multiplier: 1, element: "fire" } }),
      ],
      ally: {
        skills: [
          skill("grant", ["atag", "btag", "plain"].map((id) => ({ kind: "status", target: "self", statusId: id, chance: 1 }) as Effect), { targeting: "none" }),
          skill("strip", [{ kind: "dispel", target: "self", statusKind: "buff", count: 0, tag: "extra" }], { targeting: "none" }),
          skill("ignite", [{ kind: "status", target: "enemy", statusId: "burn", chance: 1 }, { kind: "status", target: "enemy", statusId: "bleed", chance: 1 }]),
          skill("boom", [{ kind: "detonate", target: "enemy", ratio: 1, tag: "fire" }]),
        ],
      },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "grant");
    let n = s.events.length;
    s = use(setup, s, "strip");
    // Only btag carries "extra".
    expect(of(since(s, n), "status")).toEqual([{ t: "status", src: "A1", dst: "A1", statusId: "btag", result: "dispelled" }]);
    expect(hero(s).statuses.map((x) => x.statusId)).toEqual(["atag", "plain"]);
    s = createBattle(setup, 1);
    s = use(setup, s, "ignite");
    n = s.events.length;
    s = use(setup, s, "boom");
    // One tick of burn only: snapshot atk 100 × multiplier 1 × 1 stack × ratio 1 = 100 (bleed untouched).
    const dots = of(untilNextTurn(s, n), "damage").filter((e) => e.kind === "dot");
    expect(dots.map((e) => [e.dst, e.amount])).toEqual([["E1", 100]]);
  });
});

describe("new triggers (§16.8)", () => {
  it("battleStart runs before the first turn, with chains; no battleStart passives means nothing happens", () => {
    const open: PassiveDef = { id: "open", name: "open", on: "battleStart", skillId: "opening", limitPerTurn: 0 };
    const echo: PassiveDef = { id: "echo", name: "echo", on: "allyHit", skillId: "echo", limitPerTurn: 1 };
    const setup = world({ ally: { skills: [skill("basic", [hit(1)]), followup("opening", [hit(0.5)]), followup("echo", [hit(0.2)])], passives: [open, echo] } });
    const s = createBattle(setup, 1);
    // opening: 100 × 0.5 = 50 → allyHit → echo: 100 × 0.2 = 20 (its own hit is blocked by limit 1). Then the first turn.
    expect(types(s.events)).toEqual(["cycle", "trigger", "action", "damage", "trigger", "action", "damage", "turn"]);
    expect(of(s.events, "damage").map((e) => e.amount)).toEqual([50, 20]);
    expect(of(s.events, "action").map((e) => e.time)).toEqual([0, 0]); // both casts happen at time 0, before the first turn (t = 100)

    const none = createBattle(world({}), 1);
    expect(types(none.events)).toEqual(["cycle", "turn"]);
    expect(none.rng.proc).toEqual(procAfter(1, 0));
  });

  it("battleStart can end the battle before any turn, and honors `when`", () => {
    const open: PassiveDef = { id: "open", name: "open", on: "battleStart", skillId: "opening", limitPerTurn: 0 };
    const kill = world({ enemy: { stats: plain({ hp: 50, atk: 10, spd: 50 }) }, ally: { skills: [skill("basic", [hit(1)]), followup("opening", [hit(0.5)])], passives: [open] } });
    const s = createBattle(kill, 1);
    expect(s.result).toBe("win");
    expect(of(s.events, "turn")).toHaveLength(0);
    expect(s.events.at(-1)).toMatchObject({ t: "end", result: "win", time: 0 });

    const gated: PassiveDef = { ...open, when: f("battle.foes > 5") };
    const t = createBattle(world({ ally: { skills: [skill("basic", [hit(1)]), followup("opening", [hit(0.5)])], passives: [gated] } }), 1);
    expect(of(t.events, "trigger")).toHaveLength(0);
  });

  it("action: actor relations, skillTypes, skillIds, actorDefId and the action's target as target.*", () => {
    const base: Omit<PassiveDef, "id" | "skillId" | "name"> = { on: "action", skillTypes: ["basic", "skill", "ultimate"], limitPerTurn: 0 };
    const p = (id: string, extra: Partial<PassiveDef>): PassiveDef => ({ id, name: id, skillId: id, ...base, ...extra });
    const setup = world({
      extra: [squire({ skills: [skill("basic", [hit(1)]), skill("boost", [{ kind: "energy", target: "self", amount: 0 }], { type: "skill", targeting: "none" })] })],
      allies: ["hero", "squire"],
      ally: {
        skills: [skill("basic", [hit(1)]), ...["cSelf", "cOther", "cFoe", "cSq", "cIds", "cTgt"].map(bump)],
        passives: [
          p("cSelf", { actor: "self" }),
          p("cOther", { actor: "otherAlly" }),
          p("cFoe", { actor: "foe" }),
          p("cSq", { actorDefId: "squire" }),
          p("cIds", { skillIds: ["boost"] }),
          p("cTgt", { actor: "self", when: f("target.isFoe") }),
        ],
      },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic", "E1"); // t=100 hero: self, tgt (target E1 is a foe)
    expect(s.decision!.actorUid).toBe("A2");
    s = use(setup, s, "boost"); // t=125 squire "skill": other, sq, ids
    s = use(setup, s, "basic", "E1"); // t=200 hero: self, tgt; then the dummy's idle at t=200: foe
    // The followups are type "followup", so skillTypes keeps their own actions from re-triggering.
    expect(hero(s).counters).toEqual({ cSelf: 2, cTgt: 2, cOther: 1, cSq: 1, cIds: 1, cFoe: 1 });
  });

  it("allyDamaged matches once per passive and victim within a scan, even across hits and victims", () => {
    const react = (id: string): PassiveDef => ({ id, name: id, on: "allyDamaged", skillId: "react", limitPerTurn: 0, when: f("!target.isFoe") });
    const setup = world({
      enemy: { skills: [skill("sweep", [hit(1, { target: "allEnemies", hits: [0.5, 0.5, 0.5] })], { targeting: "none" })] },
      extra: [squire({ skills: [skill("basic", [hit(1)]), bump("react")], passives: [react("squireReact")] })],
      allies: ["hero", "squire"],
      ally: { skills: [skill("basic", [hit(1)]), bump("react")], passives: [react("heroReact")] },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic", "E1"); // t=100 hero
    s = use(setup, s, "basic", "E1"); // t=125 squire
    const n = s.events.length;
    s = use(setup, s, "basic", "E1"); // t=200 hero, then the dummy sweeps both allies: 3 hits each
    const triggers = of(since(s, n), "trigger");
    // 6 damage events, but one match per (passive, victim): hero victim → A1's and A2's passive, squire victim → both again.
    // Queue order follows the scan: hit on A1 (A1, A2), then the first hit on A2 (A1, A2). Attacker E1 is the chosen target.
    expect(triggers.map((t) => [t.uid, t.targetUid])).toEqual([["A1", "E1"], ["A2", "E1"], ["A1", "E1"], ["A2", "E1"]]);
    expect(of(since(s, n), "damage").filter((e) => e.src === "E1")).toHaveLength(6);
  });

  it("unitEnter / unitLeave (death and dismiss) with the unit as target.*; revived", () => {
    const imp: UnitDef = { id: "imp", name: "小鬼", team: "ally", element: "fire", weaknesses: [], stats: plain({ hp: 10, atk: 1, spd: 10 }), skills: [skill("nibble", [hit(1)])] };
    const note = (id: string, on: PassiveDef["on"], when?: string): PassiveDef => ({ id, name: id, on, skillId: id, limitPerTurn: 0, ...(when ? { when: f(when) } : {}) });
    const setup = world({
      enemies: ["dummy", "dummy"], extra: [imp],
      statuses: [status("phoenix", { revive: { hpPct: 0.5 } })],
      ally: {
        skills: [
          skill("basic", [hit(1)]),
          skill("call", [{ kind: "summon", unitId: "imp", count: 1 }], { targeting: "none" }),
          skill("recall", [{ kind: "dismiss", unitId: "imp" }], { targeting: "none" }),
          skill("snipe", [hit(2000)]),
          skill("bless", [{ kind: "status", target: "enemy", statusId: "phoenix", chance: 1 }]),
          ...["entered", "leftAny", "leftAlly", "revived"].map(bump),
        ],
        passives: [note("entered", "unitEnter"), note("leftAny", "unitLeave"), note("leftAlly", "unitLeave", "!target.isFoe"), note("revived", "revived", "target.isFoe")],
      },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "call"); // t=100: summon → entered
    expect(hero(s).counters).toEqual({ entered: 1 });
    s = use(setup, s, "recall"); // t=200: dismiss the imp (an ally: !isFoe) → leftAny and leftAlly
    expect(hero(s).counters).toEqual({ entered: 1, leftAny: 1, leftAlly: 1 });
    s = use(setup, s, "bless", "E1"); // t=300: E1 gets a revive status
    s = use(setup, s, "snipe", "E1"); // t=400: 100 × 2000 = 200000 ≥ 100000 → revived at max(1, floor(100000 × 0.5)) = 50000
    expect(of(s.events, "revive")).toEqual([{ t: "revive", uid: "E1", statusId: "phoenix", hp: 50000 }]);
    expect(hero(s).counters.revived).toBe(1);
    expect(hero(s).counters.leftAny).toBe(1); // no death yet
    s = use(setup, s, "snipe", "E1"); // t=500: 200000 ≥ 50000 → E1 dies (an enemy: isFoe, so leftAlly does not count)
    expect(hero(s).counters).toEqual({ entered: 1, leftAny: 2, leftAlly: 1, revived: 1 });
  });
});

describe("validation and references (§16)", () => {
  const cfgOf = (setup: BattleSetup) => ({ rules: setup.rules, statuses: setup.statuses, units: setup.units, encounter: setup.encounter, encounters: [], policy: { ult: "asap", skill: "whenSp", target: "first" } }) as unknown as Parameters<typeof validateBattle>[0];
  const issues = (setup: BattleSetup) => validateBattle(cfgOf(setup), setup.damage).map((i) => `${i.level}:${i.message}`);

  it("flags formula variables out of scope, nesting, victim misuse and unknown references", () => {
    const setup = world({
      statuses: [status("known", { tags: ["t1"] })],
      ally: {
        skills: [
          skill("s", [
            hit(f("hit.index")), // hit.* outside onHit
            hit(1, { onHit: [hit(1, { onHit: [hit(1)] })] }), // nested onHit
            { kind: "counter", target: "victim", key: "k", op: "add", value: 1 }, // victim outside riders
            { kind: "statusAdjust", target: "self", statusId: "nope", op: "add", value: 1 },
            { kind: "sp", amount: f("battle.holders.nope + battle.maxStacks.known + self.tag.ghost") },
            { kind: "heal", target: "self", scale: "atk", multiplier: { op: "add", args: [] } as never, flat: 0 },
            { kind: "dispel", target: "self", statusKind: "buff", count: 0, tag: "ghost2" },
            hit(1, { when: f("effect.targets > 0 && action.hitCount >= 0") }), // fine
          ]),
          followup("f", [hit(1)]),
        ],
        passives: [
          { id: "p1", name: "p1", on: "action", actorDefId: "nobody", skillId: "f", limitPerTurn: 1 },
          { id: "p2", name: "p2", on: "selfHit", actor: "foe", skillIds: ["s"], skillId: "f", limitPerTurn: 1 },
          { id: "p3", name: "p3", on: "battleStart", skillId: "f", limitPerTurn: 0, chance: f("effect.targets") },
        ],
      },
    });
    const out = issues(setup);
    expect(out).toContain("error:「勇者・s」的「multiplier」：「hit.index」只能用在命中附帶效果（onHit）內");
    expect(out).toContain("error:「勇者・s」的命中附帶效果中的傷害不能再有命中附帶效果");
    expect(out).toContain("warning:「勇者・s」在命中附帶效果以外使用「受害者」目標，不會有任何目標");
    expect(out).toContain("error:「勇者・s」調整不存在的狀態「nope」");
    expect(out).toContain("error:「勇者・s」的「amount」：狀態「nope」不存在");
    expect(out).toContain("warning:「勇者・s」的「amount」使用的標籤「ghost」沒有任何狀態宣告");
    expect(out).toContain("warning:「勇者・s」使用的標籤「ghost2」沒有任何狀態宣告");
    expect(out.some((m) => m.startsWith("error:「勇者・s」的「multiplier」：expr: add 需要 2 個參數"))).toBe(true);
    expect(out).toContain("error:「勇者」的被動「p1」指定的行動者角色「nobody」不存在");
    expect(out).toContain("warning:「勇者」的被動「p2」設定了行動者條件，但只有「有人行動」觸發會使用");
    expect(out).toContain("warning:「勇者」的被動「p2」設定了技能篩選，但只有「有人行動」觸發會使用");
    expect(out).toContain("error:「勇者」的被動機率：「effect.targets」只能用在效果的條件與數值");
    // known status IDs and in-scope effect variables raise nothing.
    expect(out.filter((m) => m.includes("known"))).toEqual([]);
    expect(out.filter((m) => m.includes("action.hitCount"))).toEqual([]);
  });

  it("collects status references from formulas and status adjustments", () => {
    const setup = world({
      statuses: [status("a"), status("b")],
      ally: {
        skills: [skill("s", [
          { kind: "statusAdjust", target: "self", statusId: "a", op: "add", value: 1 },
          hit(f("battle.holders.b + battle.maxStacks.missing")),
        ])],
      },
    });
    const refs = contentReferences(cfgOf(setup)).filter((r) => r.from.kind === "skill").map((r) => [r.via, r.to.id, r.broken]);
    expect(refs).toEqual([["adjusts", "a", false], ["condition", "b", false], ["condition", "missing", true]]);
  });
});
