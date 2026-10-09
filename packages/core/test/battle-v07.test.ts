/**
 * Rules 0.7 mechanisms (docs/spec/battle.md §14): trigger subjects and target.* conditions, allyHit,
 * charm (side swap) and timeline events. Same minimal world as battle-ext.test.ts:
 * damage per hit = floor(atk × multiplier × ratio) (no DEF, RES, crit or bonus). avBase 10000, so spd 100 → AV 100.
 */
import { describe, expect, it } from "vitest";
import {
  DAMAGE_COMPONENTS,
  DEFAULT_BATTLE_RULES,
  composeRules,
  configFromTemplate,
  contentReferences,
  createBattle,
  legalActions,
  parseExpr,
  submitAction,
  validateBattle,
  type BattleEvent,
  type BattleSetup,
  type BattleState,
  type Effect,
  type SkillDef,
  type StatusDef,
  type UnitDef,
} from "../src";

const plain = (s: Record<string, number>) => ({ level: 80, def: 0, res: 0, resPen: 0, critRate: 0, critDmg: 0, dmgBonus: 0, defIgnore: 0, vulnerability: 0, effectHit: 0, effectRes: 0, breakEffect: 0, ...s });
const skill = (id: string, effects: Effect[], extra: Partial<SkillDef> = {}): SkillDef => ({ id, name: id, type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects, ...extra });
const hit = (mult: number, extra: Partial<Extract<Effect, { kind: "damage" }>> = {}): Effect => ({ kind: "damage", target: "enemy", multiplier: mult, toughness: 0, ...extra });
const f = parseExpr;

function world(opts: { ally?: Partial<UnitDef>; enemy?: Partial<UnitDef>; extra?: UnitDef[]; statuses?: StatusDef[]; allies?: string[]; enemies?: string[]; maxFieldUnits?: number }): BattleSetup {
  const ally: UnitDef = {
    id: "hero", name: "勇者", team: "ally", element: "fire", weaknesses: [],
    stats: plain({ hp: 1000, atk: 100, spd: 100, maxEnergy: 100 }),
    skills: [skill("basic", [hit(1)])],
    ...opts.ally,
  };
  const enemy: UnitDef = {
    id: "dummy", name: "木樁", team: "enemy", element: "ice", weaknesses: ["fire"],
    stats: plain({ hp: 100000, atk: 10, spd: 50, toughness: 30 }),
    skills: [skill("poke", [hit(1)])],
    ...opts.enemy,
  };
  return {
    damage: composeRules(configFromTemplate("tpl.standard"), DAMAGE_COMPONENTS),
    rules: { ...DEFAULT_BATTLE_RULES, breakDamage: parseExpr("attacker.atk * 0"), maxCycles: 10, rounding: "floor", maxFieldUnits: opts.maxFieldUnits },
    statuses: opts.statuses ?? [],
    units: [ally, enemy, ...(opts.extra ?? [])],
    encounter: { allies: opts.allies ?? ["hero"], enemies: opts.enemies ?? ["dummy"] },
  };
}

const use = (setup: BattleSetup, s: BattleState, skillId: string, targetUid?: string) =>
  submitAction(setup, s, { kind: "skill", actorUid: s.decision!.actorUid, skillId, targetUid });
const since = (s: BattleState, from: number) => s.events.slice(from);
const of = <T extends BattleEvent["t"]>(evs: BattleEvent[], t: T) => evs.filter((e): e is Extract<BattleEvent, { t: T }> => e.t === t);
const unitOf = (s: BattleState, uid: string) => s.units.find((u) => u.uid === uid)!;
const followup = (id: string, effects: Effect[]): SkillDef => skill(id, effects, { type: "followup" });

describe("trigger subjects and target.* (§14.1, §14.2)", () => {
  it("allyHit fires per hit on a foe whose status matches, limited per turn", () => {
    const setup = world({
      statuses: [{ id: "static", name: "靜電", kind: "debuff", duration: 2, maxStacks: 1, modifiers: [] }],
      ally: {
        skills: [
          skill("basic", [hit(1)]),
          skill("brand", [{ kind: "status", target: "enemy", statusId: "static", chance: 1 }, hit(1, { hits: [0.5, 0.5] })]),
          followup("zap", [hit(0.5)]),
        ],
        passives: [{ id: "chain", name: "連鎖", on: "allyHit", skillId: "zap", limitPerTurn: 1, when: f("target.status.static > 0 && target.isFoe") }],
      },
    });
    let s = createBattle(setup, 1);
    let n = s.events.length;
    s = use(setup, s, "basic");
    expect(of(since(s, n), "trigger")).toHaveLength(0); // no static yet
    n = s.events.length;
    s = use(setup, s, "brand");
    const evs = since(s, n);
    // Two 50-damage hits; the first queues the follow-up, the second hits the per-turn limit; zap = floor(100 × 0.5).
    expect(of(evs, "damage").filter((e) => e.src === "A1").map((e) => e.amount)).toEqual([50, 50, 50]);
    expect(of(evs, "trigger").map((e) => [e.passiveId, e.targetUid])).toEqual([["chain", "E1"]]);
  });

  it("enemyKilled exposes the fallen unit as the subject", () => {
    const setup = world({
      enemy: { stats: plain({ hp: 100, atk: 10, spd: 50 }) },
      enemies: ["dummy", "dummy"],
      ally: {
        stats: plain({ hp: 1000, atk: 100, spd: 100, maxEnergy: 100 }),
        skills: [skill("basic", [hit(1)]), followup("cheer", [{ kind: "energy", target: "self", amount: 30 }])],
        passives: [{ id: "cheer", name: "歡呼", on: "enemyKilled", skillId: "cheer", limitPerTurn: 0, when: f("target.exists && target.isFoe && target.hpPct == 0 && target.rank == -1") }],
      },
    });
    let s = createBattle(setup, 1);
    const n = s.events.length;
    s = use(setup, s, "basic", "E1");
    expect(of(since(s, n), "death").map((e) => e.uid)).toEqual(["E1"]);
    // Kill energy (energyOnKill 10) first, then the follow-up's +30.
    expect(of(since(s, n), "energy").map((e) => [e.before, e.after])).toEqual([[0, 10], [10, 40]]);
  });

  it("self.rank / self.av / target.rank read the live action order", () => {
    // t=100 hero, t=200 hero (tie → ally first), then dummy at av 0 while hero waits 100 more.
    const setup = world({
      ally: {
        skills: [skill("basic", [hit(1)]), followup("note", [{ kind: "energy", target: "self", amount: 1 }])],
        passives: [
          { id: "right", name: "對", on: "foeAction", skillId: "note", limitPerTurn: 0, when: f("self.rank == 1 && self.av == 100 && target.rank == 0 && target.av == 0") },
          { id: "wrong", name: "錯", on: "foeAction", skillId: "note", limitPerTurn: 0, when: f("self.rank == 0") },
        ],
      },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic");
    const n = s.events.length;
    s = use(setup, s, "basic");
    expect(of(since(s, n), "trigger").map((e) => e.passiveId)).toEqual(["right"]);
  });

  it("battle.count counts living units by definition, timeline events included", () => {
    const bell: UnitDef = { id: "bell", name: "鐘", team: "enemy", element: "ice", weaknesses: [], timelineEvent: true, stats: plain({ hp: 1, atk: 0, spd: 1 }), skills: [skill("wait", [], { targeting: "none" })] };
    const setup = world({
      extra: [bell],
      enemies: ["dummy", "bell", "bell"],
      ally: { skills: [skill("basic", [hit(1)]), followup("note", [{ kind: "energy", target: "self", amount: 1 }])], passives: [{ id: "n", name: "n", on: "foeAction", skillId: "note", limitPerTurn: 0, when: f("battle.count.bell == 2 && battle.count.dummy == 1 && battle.foes == 1") }] },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic");
    const n = s.events.length;
    s = use(setup, s, "basic");
    expect(of(since(s, n), "trigger")).toHaveLength(1);
  });
});

describe("charm (§14.3)", () => {
  const charm: StatusDef = { id: "hex", name: "迷魂", kind: "debuff", duration: 1, maxStacks: 1, modifiers: [], charm: true };

  it("a charmed ally acts on its own against its team, without touching SP or ultimates", () => {
    const squire: UnitDef = {
      id: "squire", name: "侍從", team: "ally", element: "fire", weaknesses: [], stats: plain({ hp: 1000, atk: 100, spd: 1, maxEnergy: 0 }),
      skills: [skill("basic", [hit(1)]), skill("ult", [hit(1)], { type: "ultimate", energyCost: 0 })],
    };
    const setup = world({
      statuses: [charm],
      extra: [squire],
      allies: ["hero", "squire"],
      ally: { skills: [skill("basic", [hit(1)], { spDelta: 1 })] },
      enemy: {
        stats: plain({ hp: 100000, atk: 10, spd: 200 }),
        skills: [skill("hexAll", [{ kind: "status", target: "allEnemies", statusId: "hex", chance: 1 }], { targeting: "none" }), skill("idle", [], { targeting: "none" })],
        ai: [{ skillId: "hexAll", weight: 1, when: f("battle.turn == 1") }, { skillId: "idle", weight: 1, when: f("battle.turn > 1") }],
      },
    });
    // t=50 E1 charms both allies; t=100 A1 (tie with E1, ally first) acts charmed; charm expires at its turn end.
    const s = createBattle(setup, 1);
    expect(of(s.events, "charm")).toEqual([{ t: "charm", uid: "A1", reason: "迷魂" }]);
    const act = of(s.events, "action").find((e) => e.uid === "A1")!;
    expect([act.skillId, act.targetUid]).toEqual(["basic", "A2"]);
    expect(unitOf(s, "A2").hp).toBe(900);
    expect(of(s.events, "sp")).toHaveLength(0);
    expect(s.sp).toBe(DEFAULT_BATTLE_RULES.spStart);
    expect(of(s.events, "status").filter((e) => e.result === "expired").map((e) => e.dst)).toEqual(["A1"]);
    // Back under control at t=200; the still-charmed squire's ultimate is not offered.
    expect(s.decision).toEqual({ actorUid: "A1" });
    expect(s.time).toBe(200);
    expect(legalActions(setup, s).filter((a) => a.action.kind === "ult")).toHaveLength(0);
  });

  it("a charmed enemy attacks its own teammates", () => {
    const setup = world({
      statuses: [charm],
      enemies: ["dummy", "dummy"],
      ally: { skills: [skill("basic", [hit(1)]), skill("hex", [{ kind: "status", target: "enemy", statusId: "hex", chance: 1 }])] },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "hex", "E1");
    const n = s.events.length;
    s = use(setup, s, "basic", "E2"); // t=200: then E1 and E2 act (slot order)
    const evs = since(s, n);
    expect(of(evs, "charm").map((e) => e.uid)).toEqual(["E1"]);
    const dmg = of(evs, "damage").filter((e) => e.src === "E1");
    expect(dmg.map((e) => [e.dst, e.amount])).toEqual([["E2", 10]]);
  });
});

describe("timeline events (§14.4)", () => {
  const bell: UnitDef = {
    id: "bell", name: "暮鐘", team: "enemy", element: "ice", weaknesses: [], timelineEvent: true, boundToSummoner: true,
    stats: plain({ hp: 1, atk: 50, spd: 100 }),
    skills: [
      skill("tick", [{ kind: "counter", target: "self", key: "t", op: "add", value: 1 }], { targeting: "none" }),
      skill("toll", [hit(1, { target: "allEnemies" }), { kind: "dismiss" }], { targeting: "none" }),
    ],
    ai: [{ skillId: "tick", weight: 1, when: f("self.counter.t < 1") }, { skillId: "toll", weight: 1, when: f("self.counter.t >= 1") }],
  };

  it("acts through the AI, is never a target, ignores the field limit, and leaves by itself", () => {
    const setup = world({
      extra: [bell],
      maxFieldUnits: 1,
      enemy: {
        skills: [skill("ring", [{ kind: "summon", unitId: "bell", count: 1 }], { targeting: "none" }), skill("poke", [hit(1)])],
        ai: [{ skillId: "ring", weight: 1, when: f("battle.count.bell == 0") }, { skillId: "poke", weight: 1, when: f("battle.count.bell > 0") }],
      },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic"); // t=100
    s = use(setup, s, "basic"); // t=200, then E1 rings: bell E2 (AV 100) despite maxFieldUnits 1
    expect(of(s.events, "summon").map((e) => e.uid)).toEqual(["E2"]);
    expect(legalActions(setup, s).find((a) => a.skill.id === "basic")!.targets).toEqual(["E1"]);
    let n = s.events.length;
    s = use(setup, s, "basic"); // t=300: bell ticks
    expect(of(since(s, n), "counter")).toEqual([{ t: "counter", uid: "E2", key: "t", before: 0, after: 1 }]);
    n = s.events.length;
    s = use(setup, s, "basic"); // t=400: E1 pokes (slot 0), then the bell tolls 50 on every foe and dismisses itself
    const evs = since(s, n);
    expect(of(evs, "damage").filter((e) => e.dst === "A1").map((e) => [e.src, e.amount])).toEqual([["E1", 10], ["E2", 50]]);
    expect(of(evs, "dismiss")).toEqual([{ t: "dismiss", uid: "E2", by: "E2" }]);
    expect(s.decision).toEqual({ actorUid: "A1" });
  });

  it("does not keep its team in the battle", () => {
    const setup = world({ extra: [bell], enemies: ["bell", "dummy"], enemy: { stats: plain({ hp: 100, atk: 10, spd: 50 }) } });
    let s = createBattle(setup, 1);
    expect(legalActions(setup, s)[0]!.targets).toEqual(["E2"]);
    s = use(setup, s, "basic", "E1"); // E1 is not a valid target: falls back to the first fighter (E2)
    expect(of(s.events, "death").map((e) => e.uid)).toEqual(["E2"]);
    expect(s.result).toBe("win");
    expect(unitOf(s, "E1").alive).toBe(true);
  });
});

describe("validation and references (§14)", () => {
  it("checks target.* and battle.count references", () => {
    const setup = world({
      statuses: [{ id: "static", name: "靜電", kind: "debuff", duration: 2, maxStacks: 1, modifiers: [] }],
      ally: {
        skills: [skill("basic", [hit(1)]), followup("zap", [hit(0.5)])],
        passives: [
          { id: "ok", name: "ok", on: "allyHit", skillId: "zap", limitPerTurn: 1, when: f("target.status.static > 0 && target.counter.x == 0 && battle.count.dummy > 0") },
          { id: "bad", name: "bad", on: "allyHit", skillId: "zap", limitPerTurn: 1, when: f("target.status.nope > 0 || battle.count.ghost > 0") },
        ],
      },
      enemy: { ai: [{ skillId: "poke", weight: 1, when: f("target.hpPct < 0.5") }] },
    });
    const cfg = { rules: setup.rules, statuses: setup.statuses, units: setup.units, encounter: setup.encounter, encounters: [], policy: { ult: "asap", skill: "whenSp", target: "first" } } as unknown as Parameters<typeof validateBattle>[0];
    const errors = validateBattle(cfg, setup.damage).filter((i) => i.level === "error").map((i) => i.message);
    expect(errors).toEqual([
      "「勇者」的被動條件：狀態「nope」不存在",
      "「勇者」的被動條件：角色「ghost」不存在",
      "「木樁」的 AI 條件：「target.hpPct」只能用在被動條件（AI 規則沒有觸發對象）",
    ]);
    const refs = contentReferences(cfg).filter((r) => r.via === "condition").map((r) => [r.to.kind, r.to.id, r.broken]);
    expect(refs).toEqual([["status", "static"], ["unit", "dummy"], ["status", "nope"], ["unit", "ghost"]].map(([k, id]) => [k, id, id === "nope" || id === "ghost"]));
  });
});
