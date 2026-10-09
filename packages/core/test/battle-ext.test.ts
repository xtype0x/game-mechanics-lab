/**
 * Extension mechanisms (docs/spec/battle.md §13). Hand-computed expectations in a minimal world where
 * damage per hit = floor(atk × multiplier × ratio × (1 − res)) (no DEF, no crit, no bonus).
 */
import { describe, expect, it } from "vitest";
import {
  DAMAGE_COMPONENTS,
  DEFAULT_BATTLE_RULES,
  PROJECT_TEMPLATES,
  autoPlay,
  battleSetupOf,
  composeRules,
  configFromTemplate,
  contentReferences,
  createBattle,
  parseExpr,
  referencesTo,
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
const status = (id: string, extra: Partial<StatusDef> = {}): StatusDef => ({ id, name: id, kind: "buff", duration: 2, maxStacks: 1, modifiers: [], ...extra });

describe("resistances (§13.1)", () => {
  it("per-element resistance replaces res only for that element", () => {
    const setup = world({
      ally: { skills: [skill("basic", [hit(1)]), skill("frost", [hit(1)], { element: "ice" })] },
      enemy: { elementRes: { fire: 0.5 } },
    });
    let s = createBattle(setup, 1);
    let n = s.events.length;
    s = use(setup, s, "basic");
    expect(of(since(s, n), "damage")[0]!.amount).toBe(50); // floor(100 × (1 − 0.5))
    n = s.events.length;
    s = use(setup, s, "frost");
    expect(of(since(s, n), "damage")[0]!.amount).toBe(100); // ice not listed → base res 0
  });

  it("category resistance multiplies the debuff chance; uncategorised debuffs ignore it", () => {
    const setup = world({
      statuses: [status("frost", { kind: "debuff", category: "freeze" }), status("mark", { kind: "debuff" })],
      ally: { skills: [skill("a", [{ kind: "status", target: "enemy", statusId: "frost", chance: 1 }]), skill("b", [{ kind: "status", target: "enemy", statusId: "mark", chance: 1 }])] },
      enemy: { statusRes: { freeze: 1 } },
    });
    let s = createBattle(setup, 1);
    const before = s.rng.status;
    s = use(setup, s, "a");
    expect(of(s.events, "status").at(-1)!.result).toBe("resisted"); // p = 1 × 1 × 1 × (1 − 1) = 0
    expect(s.rng.status).not.toEqual(before); // p < 1 → one draw
    const mid = s.rng.status;
    s = use(setup, s, "b");
    expect(of(s.events, "status").at(-1)!.result).toBe("applied"); // p = 1, no draw
    expect(s.rng.status).toEqual(mid);
  });
});

describe("taunt (§13.3)", () => {
  const twoAllies = (tauntA?: number, tauntB?: number) =>
    world({
      ally: { stats: plain({ hp: 1000, atk: 100, spd: 10, maxEnergy: 100, ...(tauntA === undefined ? {} : { taunt: tauntA }) }) },
      extra: [{ id: "hero2", name: "勇者2", team: "ally", element: "fire", weaknesses: [], stats: plain({ hp: 1000, atk: 100, spd: 10, maxEnergy: 100, ...(tauntB === undefined ? {} : { taunt: tauntB }) }), skills: [skill("basic", [hit(1)])] }],
      enemy: { stats: plain({ hp: 100000, atk: 10, spd: 300, toughness: 0 }) },
      allies: ["hero", "hero2"],
    });
  const targets = (setup: BattleSetup) => of(createBattle(setup, 9).events, "action").map((e) => e.targetUid);

  it("zero-taunt units are never picked when others have taunt", () => {
    expect(new Set(targets(twoAllies(0, 100)))).toEqual(new Set(["A2"]));
  });
  it("equal taunt keeps the uniform draw (same picks as no taunt at all)", () => {
    expect(targets(twoAllies(100, 100))).toEqual(targets(twoAllies()));
  });
});

describe("statuses: shield, permanent, revive, dispel, lock, release", () => {
  it("shield = floor(def × 0.5 + 10) absorbs before HP; refresh keeps the larger value", () => {
    const setup = world({
      statuses: [status("ward", { shield: { scale: "def", multiplier: 0.5, flat: 10 } })],
      ally: { stats: plain({ hp: 1000, atk: 100, def: 200, spd: 100, maxEnergy: 100 }), skills: [skill("guard", [{ kind: "status", target: "self", statusId: "ward", chance: 1 }], { targeting: "none" })] },
      enemy: { stats: plain({ hp: 100000, atk: 100, spd: 101, toughness: 0 }) },
    });
    // Hero DEF 200 → DEF multiplier 1 − 200 / (200 + 200 + 10 × 80) → each enemy hit = floor(100 × 5/6) = 83.
    let s = createBattle(setup, 1); // enemy (spd 101) acts first, no shield yet
    expect(s.units[0]!.hp).toBe(917);
    let n = s.events.length;
    s = use(setup, s, "guard"); // shield 110, then the enemy hits before the next decision: 83 absorbed → 27 left
    expect(of(since(s, n), "damage")[0]).toMatchObject({ amount: 83, absorbed: 83, hpAfter: 917 });
    expect(s.units[0]!.statuses[0]!.shield).toBe(27);
    n = s.events.length;
    s = use(setup, s, "guard"); // refresh → max(27, 110) = 110; next hit → 27 again, HP untouched
    expect(of(since(s, n), "status")[0]!.result).toBe("refreshed");
    expect(s.units[0]!.statuses[0]!.shield).toBe(27);
    expect(s.units[0]!.hp).toBe(917);
  });

  it("duration 0 statuses never expire", () => {
    const setup = world({ statuses: [status("aura", { duration: 0 })], ally: { skills: [skill("buff", [{ kind: "status", target: "self", statusId: "aura", chance: 1 }], { targeting: "none" }), skill("basic", [hit(1)])] } });
    let s = use(setup, createBattle(setup, 1), "buff");
    for (let i = 0; i < 5; i++) s = use(setup, s, "basic");
    expect(s.units[0]!.statuses).toEqual([{ statusId: "aura", sourceUid: "A1", stacks: 1, turnsLeft: 0 }]);
    expect(of(s.events, "status").filter((e) => e.result === "expired")).toEqual([]);
  });

  it("revive: lethal damage consumes the status and sets HP to max(1, floor(maxHp × 0.25))", () => {
    const setup = world({
      statuses: [status("undying", { duration: 0, revive: { hpPct: 0.25 } })],
      ally: { stats: plain({ hp: 1000, atk: 200, spd: 100, maxEnergy: 100 }), skills: [skill("bless", [{ kind: "status", target: "enemy", statusId: "undying", chance: 1 }]), skill("basic", [hit(1)])] },
      enemy: { stats: plain({ hp: 100, atk: 10, spd: 50, toughness: 0 }) },
    });
    let s = use(setup, createBattle(setup, 1), "bless");
    const n = s.events.length;
    s = use(setup, s, "basic");
    const evs = since(s, n);
    expect(of(evs, "revive")).toEqual([{ t: "revive", uid: "E1", statusId: "undying", hp: 25 }]);
    expect(of(evs, "death")).toEqual([]);
    expect(s.units[1]!.statuses).toEqual([]);
    s = use(setup, s, "basic");
    expect(s.result).toBe("win");
  });

  it("dispel removes the most recent dispellable statuses of one kind", () => {
    const setup = world({
      statuses: [status("a"), status("b"), status("c", { dispellable: false }), status("d", { kind: "debuff" })],
      ally: {
        skills: [
          skill("buffs", ["a", "b", "c"].map((id): Effect => ({ kind: "status", target: "enemy", statusId: id, chance: 1 })).concat([{ kind: "status", target: "enemy", statusId: "d", chance: 1 }])),
          skill("purge", [{ kind: "dispel", target: "enemy", statusKind: "buff", count: 1 }]),
          skill("purgeAll", [{ kind: "dispel", target: "enemy", statusKind: "buff", count: 0 }]),
        ],
      },
    });
    let s = use(setup, createBattle(setup, 1), "buffs");
    s = use(setup, s, "purge");
    expect(s.units[1]!.statuses.map((x) => x.statusId)).toEqual(["a", "c", "d"]); // "b" was the most recent dispellable buff
    s = use(setup, s, "purgeAll");
    expect(s.units[1]!.statuses.map((x) => x.statusId)).toEqual(["c", "d"]);
    expect(of(s.events, "status").filter((e) => e.result === "dispelled").map((e) => e.statusId)).toEqual(["b", "a"]);
  });

  it("toughness lock blocks toughness reduction", () => {
    const setup = world({
      statuses: [status("shell", { toughnessLock: true })],
      ally: { skills: [skill("lock", [{ kind: "status", target: "enemy", statusId: "shell", chance: 1 }]), skill("basic", [hit(1, { toughness: 30 })])] },
    });
    let s = use(setup, createBattle(setup, 1), "lock");
    s = use(setup, s, "basic");
    expect(of(s.events, "toughness")).toEqual([]);
    expect(s.units[1]!.broken).toBe(false);
  });

  it("sourceBreak statuses end when their source is broken", () => {
    const setup = world({
      statuses: [status("chain", { kind: "debuff", duration: 0, release: "sourceBreak" })],
      enemy: { stats: plain({ hp: 100000, atk: 10, spd: 200, toughness: 30 }), skills: [skill("bind", [{ kind: "status", target: "enemy", statusId: "chain", chance: 1 }])] },
      ally: { skills: [skill("basic", [hit(1, { toughness: 30 })])] },
    });
    let s = createBattle(setup, 1);
    expect(s.units[0]!.statuses.map((x) => x.statusId)).toEqual(["chain"]);
    const n = s.events.length;
    s = use(setup, s, "basic");
    const evs = since(s, n);
    expect(of(evs, "break")).toHaveLength(1);
    // Released right after the break (the enemy re-applies it on its next turn).
    const k = evs.findIndex((e) => e.t === "break");
    expect(evs.slice(k).find((e) => e.t === "status")).toEqual({ t: "status", src: "E1", dst: "A1", statusId: "chain", result: "released" });
  });
});

describe("summons, dismissal and phases", () => {
  const minion: UnitDef = { id: "minion", name: "僕從", team: "enemy", element: "ice", weaknesses: [], boundToSummoner: true, stats: plain({ hp: 50, atk: 1, spd: 10 }), skills: [skill("nip", [hit(1)])] };

  it("summon appends units (uid by team count, slot after the last) up to maxFieldUnits", () => {
    const setup = world({ enemy: { stats: plain({ hp: 100, atk: 10, spd: 200, toughness: 0 }), skills: [skill("call", [{ kind: "summon", unitId: "minion", count: 3 }], { targeting: "none" })] }, extra: [minion], maxFieldUnits: 2 });
    const s = createBattle(setup, 1);
    expect(of(s.events, "summon")).toEqual([{ t: "summon", uid: "E2", defId: "minion", by: "E1" }]);
    // Summoned at time 50 with a full AV of 10000 / 10; the hero's turn at time 100 elapses 50 more.
    expect(s.units[2]).toMatchObject({ uid: "E2", slot: 1, summonedBy: "E1", hp: 50, av: 1000 - 50 });
  });

  it("bound summons are dismissed when the summoner dies (no death event, no kill energy)", () => {
    const setup = world({
      enemy: { stats: plain({ hp: 100, atk: 10, spd: 200, toughness: 0 }), skills: [skill("call", [{ kind: "summon", unitId: "minion", count: 1 }], { targeting: "none" })] },
      extra: [minion],
      ally: { stats: plain({ hp: 1000, atk: 500, spd: 100, maxEnergy: 100 }) },
    });
    let s = createBattle(setup, 1);
    const n = s.events.length;
    s = use(setup, s, "basic", "E1");
    const evs = since(s, n);
    expect(of(evs, "death").map((e) => e.uid)).toEqual(["E1"]);
    expect(of(evs, "dismiss")).toEqual([{ t: "dismiss", uid: "E2", by: "E1" }]);
    expect(s.result).toBe("win");
  });

  it("dismiss without unitId removes the actor itself", () => {
    const setup = world({
      enemy: { stats: plain({ hp: 100, atk: 10, spd: 200, toughness: 0 }), skills: [skill("boom", [{ kind: "damage", target: "allEnemies", multiplier: 3, toughness: 0 }, { kind: "dismiss" }], { targeting: "none" })] },
    });
    const s = createBattle(setup, 1);
    expect(of(s.events, "damage")[0]!.amount).toBe(30);
    expect(of(s.events, "dismiss")).toEqual([{ t: "dismiss", uid: "E1", by: "E1" }]);
    expect(s.result).toBe("win");
  });

  it("lethal damage enters the next phase: new stats, HP, weaknesses; phaseChange passive fires", () => {
    const setup = world({
      enemy: {
        stats: plain({ hp: 100, atk: 10, spd: 50, toughness: 30 }),
        phases: [{ name: "二階", stats: { hp: 300, spd: 100, toughness: 60 }, weaknesses: ["ice"] }],
        skills: [skill("poke", [hit(1)]), skill("roar", [{ kind: "counter", target: "self", key: "roars", op: "add", value: 1 }], { type: "followup", targeting: "none" })],
        passives: [{ id: "p", name: "p", on: "phaseChange", skillId: "roar", limitPerTurn: 0, when: parseExpr("self.phase == 2") }],
      },
      ally: { stats: plain({ hp: 1000, atk: 150, spd: 100, maxEnergy: 100 }) },
    });
    let s = createBattle(setup, 1);
    const avBefore = s.units[1]!.av; // 200 − 100 = 100 left at spd 50
    s = use(setup, s, "basic");
    const e = s.units[1]!;
    expect(of(s.events, "phase")).toEqual([{ t: "phase", uid: "E1", phase: 2, name: "二階" }]);
    expect(of(s.events, "death")).toEqual([]);
    expect(e).toMatchObject({ phase: 2, hp: 300, maxHp: 300, toughness: 60, maxToughness: 60, weaknesses: ["ice"], counters: { roars: 1 } });
    expect(avBefore).toBe(100);
    // Phase at time 100: av 100 rescaled to 100 × 50/100 = 50 (spd 50 → 100), so the enemy acts at 150
    // (full av 100), and at the hero's next turn (time 200) it has 100 − 50 = 50 left.
    expect(e.av).toBe(50);
  });
});

describe("forced action, counters, foeAction, SP, detonate, scaling, heal bonuses", () => {
  it("foeAction counts opponent basics; at 2 a counterChange passive queues the big skill for the next AI turn", () => {
    const setup = world({
      enemy: {
        stats: plain({ hp: 100000, atk: 10, spd: 40, toughness: 0 }),
        skills: [
          skill("poke", [hit(1)]),
          skill("big", [hit(5)]),
          skill("count", [{ kind: "counter", target: "self", key: "n", op: "add", value: 1 }], { type: "followup", targeting: "none" }),
          skill("arm", [{ kind: "counter", target: "self", key: "n", op: "set", value: 0 }, { kind: "queueSkill", target: "self", skillId: "big" }], { type: "followup", targeting: "none" }),
        ],
        ai: [{ skillId: "poke", weight: 1 }],
        passives: [
          { id: "count", name: "count", on: "foeAction", skillTypes: ["basic"], skillId: "count", limitPerTurn: 0 },
          { id: "arm", name: "arm", on: "counterChange", skillId: "arm", limitPerTurn: 0, when: parseExpr("self.counter.n >= 2") },
        ],
      },
    });
    let s = createBattle(setup, 1);
    s = use(setup, s, "basic"); // n = 1
    s = use(setup, s, "basic"); // n = 2 → arm: n = 0, queue big
    expect(s.units[1]!.counters).toEqual({ n: 0 });
    expect(of(s.events, "queue")).toEqual([{ t: "queue", uid: "E1", skillId: "big" }]);
    // spd 100 vs 40: the enemy's first turn comes after the hero's 2nd action.
    const enemyActions = of(s.events, "action").filter((e) => e.uid === "E1" && e.skillType === "basic");
    expect(enemyActions[0]!.skillId).toBe("big");
    expect(s.units[1]!.nextSkill).toBeUndefined();
  });

  it("sp effect changes the shared pool with clamping", () => {
    const setup = world({ enemy: { stats: plain({ hp: 100000, atk: 10, spd: 200, toughness: 0 }), skills: [skill("drain", [{ kind: "sp", amount: -5 }], { targeting: "none" })] } });
    const s = createBattle(setup, 1);
    expect(of(s.events, "sp")[0]).toEqual({ t: "sp", before: 3, after: 0 });
  });

  it("detonate deals the DoT tick × ratio immediately, credited to the DoT's source", () => {
    const setup = world({
      statuses: [status("burn", { kind: "debuff", dot: { multiplier: 0.5, element: "fire" } })],
      ally: { skills: [skill("ignite", [{ kind: "status", target: "enemy", statusId: "burn", chance: 1 }]), skill("pop", [{ kind: "detonate", target: "enemy", ratio: 2 }])] },
    });
    let s = use(setup, createBattle(setup, 1), "ignite");
    const n = s.events.length;
    s = use(setup, s, "pop");
    expect(of(since(s, n), "damage").filter((e) => e.kind === "dot")[0]).toMatchObject({ src: "A1", amount: 100 }); // floor(100 × 0.5 × 2)
  });

  it("DEF/HP-scaled damage swaps the scaling stat and ignores ATK modifiers", () => {
    const setup = world({
      statuses: [status("might", { modifiers: [{ target: "stat:atk", op: "pct", value: 0.5 }] })],
      ally: {
        stats: plain({ hp: 1000, atk: 100, def: 300, spd: 100, maxEnergy: 100 }),
        skills: [
          skill("pump", [{ kind: "status", target: "self", statusId: "might", chance: 1 }], { targeting: "none" }),
          skill("bash", [hit(1, { scale: "def" })]),
          skill("slam", [hit(0.1, { scale: "hp" })]),
        ],
      },
    });
    let s = use(setup, createBattle(setup, 1), "pump");
    let n = s.events.length;
    s = use(setup, s, "bash");
    expect(of(since(s, n), "damage")[0]!.amount).toBe(300);
    n = s.events.length;
    s = use(setup, s, "slam");
    expect(of(since(s, n), "damage")[0]!.amount).toBe(100); // floor(1000 × 0.1)
  });

  it("heal = floor((atk × mult + flat) × (1 + healBonus) × (1 + healTaken))", () => {
    const setup = world({
      ally: { stats: plain({ hp: 1000, atk: 100, spd: 100, maxEnergy: 100, healBonus: 0.2, healTaken: -0.5 }), skills: [skill("mend", [{ kind: "heal", target: "self", scale: "atk", multiplier: 1, flat: 0 }], { targeting: "none" })] },
      enemy: { stats: plain({ hp: 100000, atk: 200, spd: 200, toughness: 0 }) },
    });
    let s = createBattle(setup, 1);
    expect(s.units[0]!.hp).toBe(800);
    s = use(setup, s, "mend");
    expect(of(s.events, "heal")[0]!.amount).toBe(60);
  });
});

describe("validation and references", () => {
  it("flags broken extension references and accepts dynamic scope variables", () => {
    const setup = world({
      enemy: {
        skills: [skill("call", [{ kind: "summon", unitId: "ghost", count: 1 }], { targeting: "none" })],
        ai: [{ skillId: "call", weight: 1, when: parseExpr("self.counter.x == 0 && self.status.nope == 0 && self.phase == 1") }],
      },
    });
    const cfg = { rules: setup.rules, units: setup.units, statuses: setup.statuses, encounter: setup.encounter, encounters: [], policy: { ult: "asap", skill: "whenSp", target: "first" } } as const;
    const msgs = validateBattle(structuredClone(cfg) as never, setup.damage).filter((i) => i.level === "error").map((i) => i.message);
    expect(msgs.some((m) => m.includes("ghost"))).toBe(true);
    expect(msgs.some((m) => m.includes("nope"))).toBe(true);
    expect(msgs.some((m) => m.includes("counter"))).toBe(false);
    expect(msgs.some((m) => m.includes("phase"))).toBe(false);
  });

  it("showcase template validates cleanly, its references resolve, and battles finish", () => {
    const p = PROJECT_TEMPLATES.find((t) => t.id === "boss-mechanics")!.create("x");
    const setup = battleSetupOf(p);
    expect(validateBattle(p.battle, setup.damage).filter((i) => i.level === "error")).toEqual([]);
    const refs = contentReferences(p.battle);
    expect(refs.filter((r) => r.broken)).toEqual([]);
    expect(referencesTo(refs, { kind: "unit", id: "pillar" }).map((r) => r.via)).toContain("summons");
    const end = autoPlay(setup, createBattle(setup, 11), p.battle.policy);
    expect(end.phase).toBe("ended");
  });
});
