/**
 * Rules 0.10 mechanisms (docs/spec/battle.md §17): energy regen efficiency and innate statuses.
 * Same minimal world as battle-v09.test.ts: damage per hit = floor(atk × multiplier) with def 0, res 0 and no crit,
 * avBase 10000 (spd 100 → AV 100, dummy spd 50 → AV 200), energyOnHitTaken = energyOnKill = 10 (default rules).
 */
import { describe, expect, it } from "vitest";
import {
  DAMAGE_COMPONENTS,
  DEFAULT_BATTLE_RULES,
  Rng,
  composeRules,
  configFromTemplate,
  createBattle,
  parseExpr,
  submitAction,
  unitStat,
  validateBattle,
  type BattleEvent,
  type BattleRules,
  type BattleSetup,
  type BattleState,
  type Effect,
  type SkillDef,
  type StatusDef,
  type UnitDef,
} from "../src";

const plain = (s: Record<string, number>) => ({ level: 80, def: 0, res: 0, resPen: 0, critRate: 0, critDmg: 0, dmgBonus: 0, defIgnore: 0, vulnerability: 0, effectHit: 0, effectRes: 0, breakEffect: 0, ...s });
const skill = (id: string, effects: Effect[], extra: Partial<SkillDef> = {}): SkillDef => ({ id, name: id, type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects, ...extra });
const hit = (multiplier: number): Effect => ({ kind: "damage", target: "enemy", multiplier, toughness: 0 });
const idle = skill("idle", [{ kind: "energy", target: "self", amount: 0 }]);
const status = (id: string, extra: Partial<StatusDef> = {}): StatusDef => ({ id, name: id, kind: "buff", duration: 0, maxStacks: 1, modifiers: [], ...extra });
const mod = (target: string, op: "add" | "pct" | "mul", value: number) => ({ target, op, value });
const of = <T extends BattleEvent["t"]>(evs: BattleEvent[], t: T) => evs.filter((e): e is Extract<BattleEvent, { t: T }> => e.t === t);
const use = (setup: BattleSetup, s: BattleState, skillId: string, targetUid?: string) =>
  submitAction(setup, s, { kind: "skill", actorUid: s.decision!.actorUid, skillId, targetUid });
const hero = (s: BattleState) => s.units.find((u) => u.uid === "A1")!;
const energyEvents = (s: BattleState) => of(s.events, "energy").map((e) => [e.uid, e.before, e.after] as const);

function world(opts: { ally?: Partial<UnitDef>; enemy?: Partial<UnitDef>; extra?: UnitDef[]; statuses?: StatusDef[]; rules?: Partial<BattleRules> }): BattleSetup {
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
    encounter: { allies: ["hero"], enemies: ["dummy"] },
  };
}

const withStats = (extra: Record<string, number>) => plain({ hp: 1000, atk: 100, spd: 100, maxEnergy: 100, ...extra });

describe("energyRegen (§17.1)", () => {
  it("scales the skill's energyGain: 20 × (1 + 0.5) = 30", () => {
    const setup = world({ ally: { stats: withStats({ energyRegen: 0.5 }), skills: [skill("basic", [hit(1)], { energyGain: 20 })] } });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic", "E1");
    expect(energyEvents(s)).toEqual([["A1", 0, 30]]);
  });

  it("is a no-op when the stat is absent or 0: 20 → 20", () => {
    const setup = world({ ally: { skills: [skill("basic", [hit(1)], { energyGain: 20 })] } });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic", "E1");
    expect(energyEvents(s)).toEqual([["A1", 0, 20]]);
  });

  it("scales energyOnHitTaken: dummy (spd 200 → acts at t=50) hits the hero; 10 × (1 + 0.25) = 12.5", () => {
    const setup = world({
      ally: { stats: withStats({ energyRegen: 0.25 }) },
      enemy: { stats: plain({ hp: 100000, atk: 10, spd: 200 }), skills: [skill("poke", [hit(1)])] },
    });
    const s = createBattle(setup, 1);
    // The dummy's 10 damage (atk 10 × 1) lands first; the hero is on the decision at t=100 with 12.5 energy.
    expect(of(s.events, "damage").map((e) => [e.dst, e.amount])).toEqual([["A1", 10]]);
    expect(energyEvents(s)).toEqual([["A1", 0, 12.5]]);
    expect(hero(s).energy).toBe(12.5);
  });

  it("scales energyOnKill: 10 × (1 + 0.5) = 15", () => {
    const setup = world({ ally: { stats: withStats({ energyRegen: 0.5 }) }, enemy: { stats: plain({ hp: 100, atk: 10, spd: 50 }) } });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic", "E1"); // 100 damage kills the 100 hp dummy
    expect(of(s.events, "death").length).toBe(1);
    expect(energyEvents(s)).toEqual([["A1", 0, 15]]);
  });

  it("scales positive energy effects (10 × 1.5 = 15) but not negative ones (−10 stays −10)", () => {
    const setup = world({
      ally: {
        stats: withStats({ energyRegen: 0.5, startEnergy: 50 }),
        skills: [skill("basic", [hit(1)]), skill("gain", [{ kind: "energy", target: "self", amount: 10 }], { targeting: "none" }), skill("drain", [{ kind: "energy", target: "self", amount: -10 }], { targeting: "none" })],
      },
    });
    let s = createBattle(setup, 1);
    expect(hero(s).energy).toBe(50); // startEnergy is not scaled
    s = use(setup, s, "gain");
    expect(hero(s).energy).toBe(65); // 50 + 10 × 1.5
    s = use(setup, s, "drain");
    expect(hero(s).energy).toBe(55); // 65 − 10
    expect(energyEvents(s)).toEqual([["A1", 50, 65], ["A1", 65, 55]]);
  });

  it("still clamps to maxEnergy: 60 × (1 + 1) = 120 → 100", () => {
    const setup = world({ ally: { stats: withStats({ energyRegen: 1 }), skills: [skill("basic", [hit(1)], { energyGain: 60 })] } });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic", "E1");
    expect(energyEvents(s)).toEqual([["A1", 0, 100]]);
  });

  it("an ultimate zeroes energy first, then gains scaled: 100 → 0 → 10 × 1.5 = 15", () => {
    const setup = world({
      ally: {
        stats: withStats({ energyRegen: 0.5, startEnergy: 100 }),
        skills: [skill("basic", [hit(1)]), skill("ult", [hit(1)], { type: "ultimate", energyGain: 10 })],
      },
    });
    let s = createBattle(setup, 1);
    s = submitAction(setup, s, { kind: "ult", actorUid: "A1", skillId: "ult", targetUid: "E1" });
    expect(energyEvents(s)).toEqual([["A1", 100, 0], ["A1", 0, 15]]);
  });

  it("reads the stat through statuses: a status adding 0.5 gives 20 × 1.5 = 30", () => {
    const setup = world({
      statuses: [status("focus", { modifiers: [mod("stat:energyRegen", "add", 0.5)] })],
      ally: { innateStatuses: ["focus"], skills: [skill("basic", [hit(1)], { energyGain: 20 })] },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic", "E1");
    expect(energyEvents(s)).toEqual([["A1", 0, 30]]);
  });
});

describe("innate statuses (§17.2)", () => {
  it("adds the status at creation without events or RNG draws", () => {
    const setup = world({ statuses: [status("aura", { duration: 3 })], ally: { innateStatuses: ["aura"] } });
    const s = createBattle(setup, 7);
    expect(hero(s).statuses).toEqual([{ statusId: "aura", sourceUid: "A1", stacks: 1, turnsLeft: 3 }]);
    expect(of(s.events, "status")).toEqual([]);
    expect(s.rng.status).toEqual(new Rng(7, "battle.status").snapshot());
    expect(s.rng.crit).toEqual(new Rng(7, "battle.crit").snapshot());
  });

  it("stacks repeated ids up to maxStacks: [stk, stk] → 2 stacks → atk 100 + 2 × 10 = 120", () => {
    const setup = world({
      statuses: [status("stk", { maxStacks: 3, modifiers: [mod("stat:atk", "add", 10)] }), status("capped", { maxStacks: 2 })],
      ally: { innateStatuses: ["stk", "stk", "capped", "capped", "capped"] },
    });
    const s = createBattle(setup, 1);
    expect(hero(s).statuses.map((x) => [x.statusId, x.stacks])).toEqual([["stk", 2], ["capped", 2]]);
    expect(unitStat(setup, hero(s), "atk")).toBe(120);
  });

  it("refreshes turnsLeft to the duration when stacking", () => {
    const setup = world({ statuses: [status("a", { duration: 2, maxStacks: 5 })], ally: { innateStatuses: ["a", "a"] } });
    expect(hero(createBattle(setup, 1)).statuses).toEqual([{ statusId: "a", sourceUid: "A1", stacks: 2, turnsLeft: 2 }]);
  });

  it("computes a shield from the holder: atk 100 × 1.5 + 10 = 160", () => {
    const setup = world({ statuses: [status("ward", { shield: { scale: "atk", multiplier: 1.5, flat: 10 } })], ally: { innateStatuses: ["ward"] } });
    const s = createBattle(setup, 1);
    expect(hero(s).statuses[0]).toEqual({ statusId: "ward", sourceUid: "A1", stacks: 1, turnsLeft: 0, shield: 160 });
  });

  it("uses the values at the moment of application, in list order", () => {
    const statuses = [
      status("ward", { maxStacks: 2, shield: { scale: "atk", multiplier: 1.5, flat: 10 } }),
      status("boost", { modifiers: [mod("stat:atk", "add", 100)] }),
    ];
    // [boost, ward]: atk 200 → 200 × 1.5 + 10 = 310.
    const a = createBattle(world({ statuses, ally: { innateStatuses: ["boost", "ward"] } }), 1);
    expect(hero(a).statuses.find((x) => x.statusId === "ward")!.shield).toBe(310);
    // [ward, boost, ward]: first 160; the second application (atk 200) gives 310 and the larger value is kept → 310, 2 stacks.
    const b = createBattle(world({ statuses, ally: { innateStatuses: ["ward", "boost", "ward"] } }), 1);
    const ward = hero(b).statuses.find((x) => x.statusId === "ward")!;
    expect([ward.stacks, ward.shield]).toEqual([2, 310]);
    // [ward, ward, boost]: 160 both times, boost later → 160.
    const c = createBattle(world({ statuses, ally: { innateStatuses: ["ward", "ward", "boost"] } }), 1);
    expect(hero(c).statuses.find((x) => x.statusId === "ward")!.shield).toBe(160);
  });

  it("speed modifiers reach the first action value with no distance preserved: spd 100 × (1 + 1) = 200 → AV 10000 / 200 = 50", () => {
    const setup = world({ statuses: [status("swift", { modifiers: [mod("stat:spd", "pct", 1)] })], ally: { innateStatuses: ["swift"] } });
    const s = createBattle(setup, 1);
    // The hero acts first at t=50 (dummy: 10000 / 50 = 200).
    expect(s.time).toBe(50);
    expect(s.decision!.actorUid).toBe("A1");
    expect(hero(s).av).toBe(0);
    expect(s.units.find((u) => u.uid === "E1")!.av).toBe(150); // 200 − 50
  });

  it("applies to summoned units too: imp spd 10 × (1 + 1) = 20 → AV 500; no status event, uid A2", () => {
    const imp: UnitDef = { id: "imp", name: "小鬼", team: "ally", element: "fire", weaknesses: [], stats: plain({ hp: 10, atk: 1, spd: 10 }), skills: [skill("nibble", [hit(1)])], innateStatuses: ["swift", "ward"] };
    const setup = world({
      extra: [imp],
      statuses: [status("swift", { modifiers: [mod("stat:spd", "pct", 1)] }), status("ward", { shield: { scale: "hp", multiplier: 2, flat: 5 } })],
      ally: { skills: [skill("basic", [hit(1)]), skill("call", [{ kind: "summon", unitId: "imp", count: 1 }], { targeting: "none" })] },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "call"); // t=100
    const spawned = s.units.find((u) => u.uid === "A2")!;
    expect(spawned.statuses).toEqual([
      { statusId: "swift", sourceUid: "A2", stacks: 1, turnsLeft: 0 },
      { statusId: "ward", sourceUid: "A2", stacks: 1, turnsLeft: 0, shield: 25 }, // hp 10 × 2 + 5
    ]);
    // 10000 / 20 = 500, set at summon time (t=100); the next decision (hero at t=200) has advanced it by 100 → 400.
    expect(spawned.av).toBe(400);
    expect(of(s.events, "status")).toEqual([]);
    expect(of(s.events, "summon").length).toBe(1);
  });

  it("is unused by default: units without the field behave as before", () => {
    const setup = world({});
    expect(hero(createBattle(setup, 1)).statuses).toEqual([]);
  });
});

describe("validation (§17.2)", () => {
  const cfgOf = (setup: BattleSetup) => ({ rules: setup.rules, statuses: setup.statuses, units: setup.units, encounter: setup.encounter, encounters: [], policy: { ult: "asap", skill: "whenSp", target: "first" } }) as unknown as Parameters<typeof validateBattle>[0];
  const issues = (setup: BattleSetup) => validateBattle(cfgOf(setup), setup.damage).map((i) => `${i.level}:${i.message}`);

  it("rejects unknown ids and dot statuses; accepts ordinary ones", () => {
    const ok = world({ statuses: [status("aura")], ally: { innateStatuses: ["aura"] } });
    expect(issues(ok)).toEqual([]);
    const bad = world({ statuses: [status("burn", { kind: "debuff", dot: { multiplier: 1, element: "fire" } })], ally: { innateStatuses: ["ghost", "burn"] } });
    expect(issues(bad)).toEqual([
      "error:「勇者」的開場狀態「ghost」不存在",
      "error:「勇者」的開場狀態「burn」是持續傷害，不能作為開場狀態",
    ]);
  });
});
