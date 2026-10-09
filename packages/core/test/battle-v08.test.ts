/**
 * Rules 0.8 mechanisms (docs/spec/battle.md §15): conditional status modifiers, team defeat by status, and
 * damage scaled by the victim's HP. Same minimal world as battle-v07.test.ts:
 * damage per hit = floor(atk × multiplier × ratio × (1 − res)). avBase 10000, so spd 100 → AV 100.
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
const status = (id: string, extra: Partial<StatusDef> = {}): StatusDef => ({ id, name: id, kind: "buff", duration: 0, maxStacks: 1, modifiers: [], ...extra });
const self = (id: string, statusId: string) => skill(id, [{ kind: "status", target: "self", statusId, chance: 1 }], { targeting: "none" });
const onFoe = (id: string, statusId: string) => skill(id, [{ kind: "status", target: "enemy", statusId, chance: 1 }]);
/** Hero's own hit damage in the events since n. */
const heroHits = (s: BattleState, n: number) => of(since(s, n), "damage").filter((e) => e.src === "A1" && e.kind === "hit").map((e) => e.amount);

describe("conditional status modifiers (§15.1)", () => {
  it("when: the attacker's bonus reads the defender as target.*", () => {
    const setup = world({
      statuses: [status("hunter", { modifiers: [{ target: "stat:atk", op: "add", value: 100, when: f("target.status.mark > 0") }] }), status("mark", { kind: "debuff" })],
      ally: { skills: [skill("basic", [hit(1)]), self("ready", "hunter"), onFoe("markIt", "mark")] },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "ready");
    let n = s.events.length;
    s = use(setup, s, "basic");
    expect(heroHits(s, n)).toEqual([100]); // unmarked: bonus off
    s = use(setup, s, "markIt");
    n = s.events.length;
    s = use(setup, s, "basic");
    expect(heroHits(s, n)).toEqual([200]); // 100 + 100
  });

  it("scaleBy multiplies the per-stack value (battle.count)", () => {
    const setup = world({
      statuses: [status("pack", { modifiers: [{ target: "stat:atk", op: "add", value: 50, scaleBy: f("battle.count.dummy") }] })],
      enemies: ["dummy", "dummy"],
      ally: { skills: [skill("basic", [hit(1)]), self("rally", "pack")] },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "rally");
    const n = s.events.length;
    s = use(setup, s, "basic", "E1");
    expect(heroHits(s, n)).toEqual([200]); // 100 + 50 × 2
  });

  it("defender-side modifiers read the attacker as target.*", () => {
    const setup = world({
      statuses: [status("brittle", { kind: "debuff", modifiers: [{ target: "stat:res", op: "add", value: -0.5, when: f("target.status.focus > 0") }] }), status("focus")],
      ally: { skills: [skill("basic", [hit(1)]), onFoe("crack", "brittle"), self("aim", "focus")] },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "crack");
    let n = s.events.length;
    s = use(setup, s, "basic");
    expect(heroHits(s, n)).toEqual([100]); // attacker has no focus
    s = use(setup, s, "aim");
    n = s.events.length;
    s = use(setup, s, "basic");
    expect(heroHits(s, n)).toEqual([150]); // res 0 − 0.5 → × 1.5
  });

  it("conditional modifiers do not affect battle stats outside damage (spd)", () => {
    const setup = world({
      statuses: [status("rush", { modifiers: [{ target: "stat:spd", op: "add", value: 100, when: f("battle.turn > 0") }] })],
      ally: { skills: [skill("basic", [hit(1)]), self("go", "rush")] },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "go");
    expect(s.time).toBe(200); // speed still 100: next turn after a full 100 AV (tie with the dummy at 200)
  });
});

describe("team defeat by status (§15.2)", () => {
  const dream = status("dream", { kind: "debuff", duration: 2, skipTurn: true, defeatIfAll: true });
  const lull = (target: "allEnemies" | "enemy") => skill("lull", [{ kind: "status", target, statusId: "dream", chance: 1 }], { targeting: target === "enemy" ? "enemy" : "none" });

  it("loses as soon as every living ally carries it", () => {
    const setup = world({ statuses: [dream], enemy: { stats: plain({ hp: 100000, atk: 10, spd: 200 }), skills: [lull("allEnemies")] } });
    const s = createBattle(setup, 1);
    expect(s.result).toBe("lose");
    expect(s.events.at(-1)).toEqual({ t: "end", result: "lose", time: 50, reason: "disabled" });
  });

  it("does not end while one ally is still free", () => {
    const squire: UnitDef = { id: "squire", name: "侍從", team: "ally", element: "fire", weaknesses: [], stats: plain({ hp: 1000, atk: 100, spd: 90 }), skills: [skill("basic", [hit(1)])] };
    const setup = world({ statuses: [dream], extra: [squire], allies: ["hero", "squire"], enemy: { stats: plain({ hp: 100000, atk: 10, spd: 120 }), skills: [lull("enemy")] } });
    // One lull at t≈83.3 before the squire's first decision at t≈111.1 (next lull: t≈166.7).
    const s = createBattle(setup, 1);
    expect(s.phase).toBe("await");
    expect(of(s.events, "status").filter((e) => e.result === "applied")).toHaveLength(1);
  });

  it("wins when every living enemy carries it", () => {
    const setup = world({ statuses: [dream], ally: { skills: [skill("basic", [hit(1)]), lull("enemy")] } });
    let s = createBattle(setup, 1);
    s = use(setup, s, "lull");
    expect(s.result).toBe("win");
    expect(s.events.at(-1)).toMatchObject({ t: "end", result: "win", reason: "disabled" });
  });
});

describe("damage from the victim's HP (§15.3)", () => {
  it("targetHp re-reads current HP every hit; ATK modifiers are dropped", () => {
    const setup = world({
      statuses: [status("fury", { modifiers: [{ target: "stat:atk", op: "add", value: 5000 }] })],
      enemy: { skills: [skill("drain", [hit(0.2, { hits: [0.5, 0.5], scale: "targetHp" }), { kind: "status", target: "self", statusId: "fury", chance: 1 }])] },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic");
    s = use(setup, s, "basic"); // t=200: the dummy acts after the hero
    const hits = of(s.events, "damage").filter((e) => e.src === "E1").map((e) => e.amount);
    expect(hits).toEqual([100, 90]); // 1000 × 0.2 × 0.5, then 900 × 0.2 × 0.5
  });

  it("targetMaxHp uses the victim's maximum HP", () => {
    const setup = world({ enemy: { skills: [skill("crush", [hit(0.1, { scale: "targetMaxHp" })])] } });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic");
    s = use(setup, s, "basic");
    s = use(setup, s, "basic");
    s = use(setup, s, "basic"); // dummy has acted twice (t=200, t=400)
    expect(of(s.events, "damage").filter((e) => e.src === "E1").map((e) => e.amount)).toEqual([100, 100]);
  });
});

describe("validation and references (§15)", () => {
  it("checks conditional modifier expressions and ops", () => {
    const setup = world({
      statuses: [
        status("ok", { modifiers: [{ target: "stat:atk", op: "pct", value: 0.1, when: f("target.isFoe"), scaleBy: f("battle.count.dummy") }] }),
        status("bad", { modifiers: [{ target: "stat:atk", op: "mul", value: 1.1, scaleBy: f("2") }, { target: "stat:atk", op: "add", value: 1, when: f("target.status.nope > 0") }] }),
        status("slow", { modifiers: [{ target: "stat:spd", op: "add", value: 1, when: f("self.hpPct < 0.5") }] }),
      ],
    });
    const cfg = { rules: setup.rules, statuses: setup.statuses, units: setup.units, encounter: setup.encounter, encounters: [], policy: { ult: "asap", skill: "whenSp", target: "first" } } as unknown as Parameters<typeof validateBattle>[0];
    const issues = validateBattle(cfg, setup.damage).filter((i) => i.where.statusId).map((i) => `${i.level}:${i.message}`);
    expect(issues).toEqual([
      "error:狀態「bad」的修正倍數只能用在「加」或「百分比」",
      "error:狀態「bad」修正的條件：狀態「nope」不存在",
      "warning:狀態「slow」的條件式修正只在傷害計算中生效；「spd」不是傷害公式的數值，不會有效果",
    ]);
    const refs = contentReferences(cfg).filter((r) => r.from.kind === "status").map((r) => [r.from.id, r.to.kind, r.to.id, r.broken]);
    expect(refs).toEqual([["ok", "unit", "dummy", false], ["bad", "status", "nope", true]]);
  });
});
