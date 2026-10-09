import { describe, expect, it } from "vitest";
import {
  DAMAGE_COMPONENTS,
  DEFAULT_BATTLE_RULES,
  aggregate,
  autoPlay,
  battleSetupOf,
  batchSeed,
  composeRules,
  configFromTemplate,
  createBattle,
  legalActions,
  loadProject,
  newProject,
  parseExpr,
  predictTimeline,
  simulateOne,
  submitAction,
  DEFAULT_POLICY,
  SCHEMA_VERSION,
  type BattleSetup,
  type BattleState,
  type SkillDef,
  type StatusDef,
  type UnitDef,
} from "../src";

/*
 * Minimal deterministic world: standard damage template with def 0, res 0, crit 0, so
 * damage per hit = floor(atk × multiplier × hitRatio).
 */
const plain = (s: Record<string, number>) => ({ level: 80, def: 0, res: 0, resPen: 0, critRate: 0, critDmg: 0, dmgBonus: 0, defIgnore: 0, vulnerability: 0, effectHit: 0, effectRes: 0, breakEffect: 0, ...s });
const hitSkill = (id: string, type: SkillDef["type"], mult: number, extra: Partial<SkillDef> = {}): SkillDef => ({
  id, name: id, type, spDelta: type === "basic" ? 1 : type === "skill" ? -1 : 0, energyGain: type === "ultimate" ? 5 : 20, targeting: "enemy",
  effects: [{ kind: "damage", target: "enemy", multiplier: mult, toughness: 10 }], ...extra,
});

function world(opts: { allySpd?: number; enemySpd?: number; enemyHp?: number; statuses?: StatusDef[]; enemy?: Partial<UnitDef>; ally?: Partial<UnitDef> } = {}): BattleSetup {
  const ally: UnitDef = {
    id: "hero", name: "勇者", team: "ally", element: "fire", weaknesses: [],
    stats: plain({ hp: 1000, atk: 100, spd: opts.allySpd ?? 100, maxEnergy: 100 }),
    skills: [hitSkill("basic", "basic", 1), hitSkill("skill", "skill", 2), hitSkill("ult", "ultimate", 3, { energyCost: 100 })],
    ...opts.ally,
  };
  const enemy: UnitDef = {
    id: "dummy", name: "木樁", team: "enemy", element: "ice", weaknesses: ["fire"],
    stats: plain({ hp: opts.enemyHp ?? 100000, atk: 10, spd: opts.enemySpd ?? 50, toughness: 30, maxEnergy: 0 }),
    skills: [hitSkill("poke", "basic", 1, { spDelta: 0, energyGain: 0, effects: [{ kind: "damage", target: "enemy", multiplier: 1, toughness: 0 }] })],
    ...opts.enemy,
  };
  return {
    damage: composeRules(configFromTemplate("tpl.standard"), DAMAGE_COMPONENTS),
    rules: { ...DEFAULT_BATTLE_RULES, breakDamage: parseExpr("attacker.atk * 2"), maxCycles: 10 },
    statuses: opts.statuses ?? [],
    units: [ally, enemy],
    encounter: { allies: ["hero"], enemies: ["dummy"] },
  };
}

const act = (setup: BattleSetup, s: BattleState, skillId: string, kind: "skill" | "ult" = "skill") =>
  submitAction(setup, s, { kind, actorUid: s.decision!.actorUid, skillId, targetUid: "E1" });
const dmgEvents = (s: BattleState) => s.events.filter((e) => e.t === "damage");
const unitOf = (s: BattleState, uid: string) => s.units.find((u) => u.uid === uid)!;

describe("action value timeline", () => {
  it("orders turns by AV = 10000 / spd with cycles at 150 then every 100", () => {
    const tl = predictTimeline(DEFAULT_BATTLE_RULES, [
      { uid: "A", name: "A", team: "ally", slot: 0, spd: 100 },
      { uid: "B", name: "B", team: "enemy", slot: 0, spd: 150 },
    ], 2);
    // B at 66.67, A at 100, B at 133.33, (cycle 2 starts at 150), B 200, A 200 (ally first on tie)
    expect(tl.map((e) => [e.uid, +e.time.toFixed(2), e.cycle])).toEqual([
      ["B", 66.67, 1], ["A", 100, 1], ["B", 133.33, 1], ["A", 200, 2], ["B", 200, 2],
    ]);
  });

  it("battle starts with the fastest unit and records elapsed time", () => {
    const setup = world({ allySpd: 100, enemySpd: 200 });
    const s = createBattle(setup, 1);
    // Enemy (AV 50) acts first automatically, then the ally decision at time 100.
    expect(s.events.find((e) => e.t === "turn")).toMatchObject({ uid: "E1", time: 50 });
    expect(s.decision).toEqual({ actorUid: "A1" });
    expect(s.time).toBe(100);
  });
});

describe("skill points, energy, ultimates", () => {
  it("basic +1 SP, skill −1 SP, skill unavailable at 0 SP", () => {
    const setup = world();
    let s = createBattle(setup, 1);
    expect(s.sp).toBe(3);
    s = act(setup, s, "skill"); s = act(setup, s, "skill"); s = act(setup, s, "skill");
    expect(s.sp).toBe(0);
    expect(legalActions(setup, s).map((l) => l.skill.id)).toEqual(["basic"]);
    expect(() => act(setup, s, "skill")).toThrow(/技能點不足/);
    s = act(setup, s, "basic");
    expect(s.sp).toBe(1);
  });

  it("damage = floor(atk × multiplier) and energy accrues; ult resolves without ending the turn", () => {
    const setup = world();
    let s = createBattle(setup, 1);
    s = act(setup, s, "skill");
    expect(dmgEvents(s).at(-1)).toMatchObject({ src: "A1", amount: 200, crit: false });
    for (let i = 0; i < 4; i++) s = act(setup, s, "basic"); // 20 + 4×20 = 100 energy
    expect(unitOf(s, "A1").energy).toBe(100);
    const decisionBefore = s.decision;
    const turnsBefore = s.turns;
    s = act(setup, s, "ult", "ult");
    expect(dmgEvents(s).at(-1)!.amount).toBe(300);
    expect(unitOf(s, "A1").energy).toBe(5);
    expect(s.decision).toEqual(decisionBefore);
    expect(s.turns).toBe(turnsBefore);
    expect(() => act(setup, s, "ult", "ult")).toThrow(/不能施放大招/);
  });

  it("allies gain energy when hit, once per enemy action", () => {
    const setup = world({ enemySpd: 200 });
    const s = createBattle(setup, 1);
    expect(unitOf(s, "A1").energy).toBe(DEFAULT_BATTLE_RULES.energyOnHitTaken);
  });
});

describe("toughness and break", () => {
  it("weakness hits reduce toughness; break deals break damage, delays 25% and recovers on its turn", () => {
    const setup = world({ allySpd: 100, enemySpd: 50 });
    let s = createBattle(setup, 1);
    s = act(setup, s, "skill"); // toughness 30 → 20
    s = act(setup, s, "skill"); // → 10
    expect(unitOf(s, "E1").toughness).toBe(10);
    const avBefore = unitOf(s, "E1").av;
    s = act(setup, s, "skill"); // → 0, break
    const brk = s.events.find((e) => e.t === "break");
    expect(brk).toMatchObject({ src: "A1", dst: "E1" });
    expect(s.events.find((e) => e.t === "damage" && e.kind === "break")).toMatchObject({ amount: 200 }); // atk × 2
    // Break pushes the enemy back by 25% of its full AV (10000/50 × 0.25 = 50), measured before the ally's next turn
    const pushed = s.events.find((e) => e.t === "advance");
    expect(pushed && pushed.t === "advance" && pushed.after - pushed.before).toBe(50);
    expect(unitOf(s, "E1").broken).toBe(true);
    void avBefore;
    // Keep acting until the enemy's turn comes: it recovers to full toughness
    while (!s.events.some((e) => e.t === "recover")) s = act(setup, s, "basic");
    expect(unitOf(s, "E1").broken).toBe(false);
    expect(unitOf(s, "E1").toughness).toBe(30);
  });

  it("non-weakness element does not reduce toughness", () => {
    const setup = world({ enemy: { weaknesses: ["ice"] } as Partial<UnitDef> });
    let s = createBattle(setup, 1);
    s = act(setup, s, "skill");
    expect(unitOf(s, "E1").toughness).toBe(30);
  });
});

describe("statuses", () => {
  const freeze: StatusDef = { id: "freeze", name: "冰封", kind: "debuff", duration: 1, maxStacks: 1, modifiers: [], skipTurn: true };
  const burn: StatusDef = { id: "burn", name: "燃燒", kind: "debuff", duration: 2, maxStacks: 3, modifiers: [], dot: { multiplier: 0.5, element: "fire" } };
  const haste: StatusDef = { id: "haste", name: "加速", kind: "buff", duration: 2, maxStacks: 1, modifiers: [{ target: "stat:spd", op: "pct", value: 1 }] };

  it("skipTurn status makes the holder skip and then expires", () => {
    const setup = world({ statuses: [freeze], ally: { skills: [hitSkill("basic", "basic", 1, { effects: [{ kind: "damage", target: "enemy", multiplier: 1, toughness: 0 }, { kind: "status", target: "enemy", statusId: "freeze", chance: 1 }] })] } as Partial<UnitDef> });
    let s = createBattle(setup, 1);
    s = act(setup, s, "basic");
    s = act(setup, s, "basic"); // by now the enemy (spd 50) has had its turn
    expect(s.events.some((e) => e.t === "skip" && e.uid === "E1")).toBe(true);
    expect(s.events.some((e) => e.t === "status" && e.result === "expired")).toBe(true);
    expect(s.events.some((e) => e.t === "action" && e.uid === "E1")).toBe(false);
  });

  it("DoT ticks at the holder's turn start using the source snapshot and stacks", () => {
    const setup = world({ statuses: [burn], enemySpd: 50, ally: { skills: [hitSkill("basic", "basic", 0, { effects: [{ kind: "status", target: "enemy", statusId: "burn", chance: 1 }] })] } as Partial<UnitDef> });
    let s = createBattle(setup, 1);
    s = act(setup, s, "basic"); // 1 stack
    s = act(setup, s, "basic"); // 2 stacks, then the enemy's turn (time 200) → tick
    const dot = s.events.find((e) => e.t === "damage" && e.kind === "dot");
    expect(dot).toMatchObject({ src: "A1", dst: "E1", amount: 100 }); // 100 atk × 0.5 × 2 stacks
  });

  it("speed buffs rescale remaining AV so distance is preserved", () => {
    const setup = world({ statuses: [haste], ally: { skills: [hitSkill("basic", "basic", 0, { targeting: "none", effects: [{ kind: "status", target: "self", statusId: "haste", chance: 1 }] })] } as Partial<UnitDef> });
    let s = createBattle(setup, 1);
    s = act(setup, s, "basic"); // spd 100 → 200; next full AV = 50
    expect(unitOf(s, "A1").statuses).toHaveLength(1);
    const turns = s.events.filter((e) => e.t === "turn" && e.uid === "A1").map((e) => e.t === "turn" && e.time);
    expect(turns.slice(0, 2)).toEqual([100, 150]);
  });

  it("resisted debuffs consume one status draw and log 'resisted'", () => {
    const setup = world({ statuses: [freeze], ally: { skills: [hitSkill("basic", "basic", 0, { effects: [{ kind: "status", target: "enemy", statusId: "freeze", chance: 0 }] })] } as Partial<UnitDef> });
    let s = createBattle(setup, 1);
    s = act(setup, s, "basic");
    expect(s.events.some((e) => e.t === "status" && e.result === "resisted")).toBe(true);
  });
});

describe("targeting", () => {
  it("effects after the chosen target dies are skipped, not redirected", () => {
    const mark: StatusDef = { id: "mark", name: "標記", kind: "debuff", duration: 2, maxStacks: 1, modifiers: [] };
    const setup = world({
      statuses: [mark],
      enemyHp: 50,
      ally: { skills: [hitSkill("basic", "basic", 1, { effects: [{ kind: "damage", target: "enemy", multiplier: 1, toughness: 0 }, { kind: "status", target: "enemy", statusId: "mark", chance: 1 }] })] } as Partial<UnitDef>,
    });
    setup.encounter.enemies = ["dummy", "dummy"];
    let s = createBattle(setup, 1);
    s = submitAction(setup, s, { kind: "skill", actorUid: "A1", skillId: "basic", targetUid: "E1" });
    expect(unitOf(s, "E1").alive).toBe(false);
    expect(unitOf(s, "E2").statuses).toHaveLength(0);
    expect(s.events.some((e) => e.t === "status")).toBe(false);
  });
});

describe("enemy AI", () => {
  it("rules whose condition is false are never chosen", () => {
    const setup = world({
      enemySpd: 300,
      enemy: {
        skills: [
          hitSkill("poke", "basic", 1, { spDelta: 0, energyGain: 0 }),
          hitSkill("nuke", "skill", 50, { spDelta: 0, energyGain: 0 }),
        ],
        ai: [{ skillId: "poke", weight: 1 }, { skillId: "nuke", weight: 100, when: parseExpr("self.hpPct < 0.5") }],
      } as Partial<UnitDef>,
    });
    let s = createBattle(setup, 7);
    for (let i = 0; i < 5; i++) s = act(setup, s, "basic");
    const enemyActs = s.events.filter((e) => e.t === "action" && e.uid === "E1");
    expect(enemyActs.length).toBeGreaterThan(5);
    expect(enemyActs.every((e) => e.t === "action" && e.skillId === "poke")).toBe(true);
  });
});

describe("determinism and simulation", () => {
  it("same seed → identical battle; different seed → different crit pattern", () => {
    const setup = battleSetupOf(newProject());
    const a = autoPlay(setup, createBattle(setup, "s1"), DEFAULT_POLICY);
    const b = autoPlay(setup, createBattle(setup, "s1"), DEFAULT_POLICY);
    const c = autoPlay(setup, createBattle(setup, "s2"), DEFAULT_POLICY);
    expect(a).toEqual(b);
    expect(JSON.stringify(a.events)).not.toEqual(JSON.stringify(c.events));
  });

  it("states are not mutated by submitAction", () => {
    const setup = world();
    const s = createBattle(setup, 1);
    const frozen = JSON.stringify(s);
    act(setup, s, "skill");
    expect(JSON.stringify(s)).toBe(frozen);
  });

  it("default content: every battle ends and the stats are consistent", () => {
    const setup = battleSetupOf(newProject());
    const res = Array.from({ length: 40 }, (_, i) => simulateOne(setup, DEFAULT_POLICY, batchSeed(9, i)));
    const st = aggregate(res);
    expect(st.winRate + st.loseRate + st.timeoutRate).toBeCloseTo(1, 12);
    expect(st.damageShare.reduce((a, d) => a + d.share, 0)).toBeCloseTo(1, 9);
    expect(st.winRate).toBeGreaterThan(0.5);
  });

  it("timeout after maxCycles", () => {
    const setup = world({ enemyHp: 1e12 });
    setup.rules.maxCycles = 3;
    const s = autoPlay(setup, createBattle(setup, 1), DEFAULT_POLICY);
    expect(s.result).toBe("timeout");
    expect(s.cycle).toBe(3);
  });
});

describe("project migration", () => {
  it("v1 files gain the default battle section", () => {
    const v2 = newProject();
    const { battle: _drop, ...rest } = v2;
    const v1 = { ...rest, schemaVersion: 1 };
    const loaded = loadProject(JSON.parse(JSON.stringify(v1)));
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.battle.units.length).toBeGreaterThan(0);
  });
});
