import { describe, expect, it } from "vitest";
import {
  DAMAGE_COMPONENTS,
  DEFAULT_BATTLE_RULES,
  DEFAULT_POLICY,
  MAX_FOLLOWUPS_PER_ACTION,
  PROJECT_TEMPLATES,
  autoPlay,
  battleSetupOf,
  composeRules,
  configFromTemplate,
  createBattle,
  legalActions,
  loadProject,
  newProject,
  parseExpr,
  projectFromSnapshot,
  snapshotOf,
  submitAction,
  validateBattle,
  type BattleSetup,
  type BattleState,
  type SkillDef,
  type UnitDef,
} from "../src";

// Same minimal world as battle.test.ts: damage per hit = floor(atk × multiplier × ratio).
const plain = (s: Record<string, number>) => ({ level: 80, def: 0, res: 0, resPen: 0, critRate: 0, critDmg: 0, dmgBonus: 0, defIgnore: 0, vulnerability: 0, effectHit: 0, effectRes: 0, breakEffect: 0, ...s });
const hitSkill = (id: string, type: SkillDef["type"], mult: number, extra: Partial<SkillDef> = {}): SkillDef => ({
  id, name: id, type, spDelta: type === "basic" ? 1 : type === "skill" ? -1 : 0, energyGain: type === "ultimate" ? 5 : 20, targeting: "enemy",
  effects: [{ kind: "damage", target: "enemy", multiplier: mult, toughness: 10 }], ...extra,
});
const follow = (id: string, mult: number, target: "enemy" | "allEnemies" = "enemy"): SkillDef => ({
  id, name: id, type: "followup", spDelta: 0, energyGain: 0, targeting: target === "enemy" ? "enemy" : "none",
  effects: [{ kind: "damage", target, multiplier: mult, toughness: 0 }],
});

function world(opts: { enemySpd?: number; enemyHp?: number; ally?: Partial<UnitDef> } = {}): BattleSetup {
  const ally: UnitDef = {
    id: "hero", name: "勇者", team: "ally", element: "fire", weaknesses: [],
    stats: plain({ hp: 1000, atk: 100, spd: 100, maxEnergy: 100 }),
    skills: [hitSkill("basic", "basic", 1)],
    ...opts.ally,
  };
  const enemy: UnitDef = {
    id: "dummy", name: "木樁", team: "enemy", element: "ice", weaknesses: ["fire"],
    stats: plain({ hp: opts.enemyHp ?? 100000, atk: 10, spd: opts.enemySpd ?? 50, toughness: 30, maxEnergy: 0 }),
    skills: [hitSkill("poke", "basic", 1, { spDelta: 0, energyGain: 0, effects: [{ kind: "damage", target: "enemy", multiplier: 1, toughness: 0 }] })],
  };
  return {
    damage: composeRules(configFromTemplate("tpl.standard"), DAMAGE_COMPONENTS),
    rules: { ...DEFAULT_BATTLE_RULES, breakDamage: parseExpr("attacker.atk * 2"), maxCycles: 10 },
    statuses: [],
    units: [ally, enemy],
    encounter: { allies: ["hero"], enemies: ["dummy"] },
  };
}

const act = (setup: BattleSetup, s: BattleState, skillId: string, kind: "skill" | "ult" = "skill", targetUid = "E1") =>
  submitAction(setup, s, { kind, actorUid: s.decision!.actorUid, skillId, targetUid });
const triggers = (s: BattleState, passiveId?: string) => s.events.filter((e) => e.t === "trigger" && (!passiveId || e.passiveId === passiveId));

describe("passives and follow-ups", () => {
  it("allyUltimate fires after an ultimate, respects limitPerTurn, resets on own turn, and is not a legal action", () => {
    const setup = world({
      ally: {
        stats: plain({ hp: 1000, atk: 100, spd: 100, maxEnergy: 100, startEnergy: 100 }),
        skills: [hitSkill("basic", "basic", 1), hitSkill("ult", "ultimate", 3, { energyCost: 100, energyGain: 100 }), follow("echo", 0.5)],
        passives: [{ id: "p", name: "回響", on: "allyUltimate", skillId: "echo", limitPerTurn: 1 }],
      },
    });
    let s = createBattle(setup, 1);
    expect(legalActions(setup, s).map((l) => l.skill.id)).not.toContain("echo");
    s = act(setup, s, "ult", "ult");
    expect(triggers(s)).toHaveLength(1);
    expect(s.events.filter((e) => e.t === "damage").at(-1)).toMatchObject({ amount: 50, skillId: "echo" });
    // energyGain 100 refills; a second ult in the same turn hits the limit
    s = act(setup, s, "ult", "ult");
    expect(triggers(s)).toHaveLength(1);
    // next own turn resets the counter
    s = act(setup, s, "basic");
    s = act(setup, s, "ult", "ult");
    expect(triggers(s)).toHaveLength(2);
    expect(() => submitAction(setup, s, { kind: "skill", actorUid: "A1", skillId: "echo" })).toThrow(/被動觸發/);
  });

  it("selfHit counters the attacker only while the condition holds and within the limit", () => {
    const setup = world({
      enemySpd: 300,
      ally: {
        skills: [hitSkill("basic", "basic", 1), follow("counter", 1)],
        passives: [{ id: "c", name: "反擊", on: "selfHit", skillId: "counter", limitPerTurn: 1, when: parseExpr("self.hpPct < 0.995") }],
      },
    });
    const s = createBattle(setup, 1);
    // Enemy (AV 33.3) hits 3 times before our first turn (AV 100), 10 dmg each:
    // hit 1 → 990/1000 = 0.99 < 0.995 → counter; hits 2–3 → limit reached.
    const c = triggers(s, "c");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ targetUid: "E1" });
  });

  it("allyBreak follow-up targets the broken enemy", () => {
    const setup = world({
      ally: {
        skills: [hitSkill("basic", "basic", 1, { effects: [{ kind: "damage", target: "enemy", multiplier: 1, toughness: 30 }] }), follow("chase", 1)],
        passives: [{ id: "chase", name: "追擊", on: "allyBreak", skillId: "chase", limitPerTurn: 0 }],
      },
    });
    const s = act(setup, createBattle(setup, 1), "basic");
    expect(triggers(s, "chase")).toHaveLength(1);
    expect(triggers(s, "chase")[0]).toMatchObject({ targetUid: "E1" });
    // Follow-up damage lands after the break event
    const iBreak = s.events.findIndex((e) => e.t === "break");
    const iTrig = s.events.findIndex((e) => e.t === "trigger");
    expect(iTrig).toBeGreaterThan(iBreak);
  });

  it("an endless counter ping-pong stops at 20 follow-ups per action", () => {
    const setup = world({
      ally: {
        skills: [hitSkill("basic", "basic", 1), follow("counter", 0.01)],
        passives: [{ id: "c", name: "反擊", on: "selfHit", skillId: "counter", limitPerTurn: 0 }],
      },
    });
    const enemy = setup.units.find((u) => u.id === "dummy")!;
    enemy.skills.push({ ...follow("counter", 0.01), effects: [{ kind: "damage", target: "enemy", multiplier: 0.01, toughness: 0 }] });
    enemy.passives = [{ id: "c", name: "反擊", on: "selfHit", skillId: "counter", limitPerTurn: 0 }];
    const s = act(setup, createBattle(setup, 1), "basic");
    // Our basic → enemy counters → we counter → … capped at MAX_FOLLOWUPS_PER_ACTION.
    const start = s.events.findIndex((e) => e.t === "action" && e.uid === "A1" && e.skillId === "basic");
    const nextTop = s.events.findIndex((e, i) => i > start && e.t === "action" && e.skillType !== "followup");
    const within = s.events.slice(start, nextTop < 0 ? undefined : nextTop).filter((e) => e.t === "trigger");
    expect(within).toHaveLength(MAX_FOLLOWUPS_PER_ACTION);
  });

  it("enemyKilled fires on a kill; victory ends immediately without an end-of-turn step", () => {
    const setup = world({
      enemyHp: 50,
      ally: {
        skills: [hitSkill("basic", "basic", 1), follow("cheer", 0, "allEnemies")],
        passives: [{ id: "k", name: "勝利", on: "enemyKilled", skillId: "cheer", limitPerTurn: 0 }],
      },
    });
    setup.encounter.enemies = ["dummy", "dummy"];
    let s = createBattle(setup, 1);
    s = act(setup, s, "basic", "skill", "E1");
    expect(triggers(s, "k")).toHaveLength(1);
    s = act(setup, s, "basic", "skill", "E2");
    expect(s.result).toBe("win");
    expect(s.events.at(-1)).toMatchObject({ t: "end" });
    expect(s.events.filter((e) => e.t === "end")).toHaveLength(1);
    // The pending kill trigger is dropped once the battle is over.
    expect(triggers(s, "k")).toHaveLength(1);
    // No end-of-turn: the final actor's AV stays 0.
    expect(s.units.find((u) => u.uid === "A1")!.av).toBe(0);
  });
});

describe("validation and templates", () => {
  it("default content and both templates validate without errors", () => {
    for (const t of PROJECT_TEMPLATES) {
      const p = t.create("x");
      const errors = validateBattle(p.battle, battleSetupOf(p).damage).filter((i) => i.level === "error");
      expect(errors).toEqual([]);
    }
  });

  it("basic-turn template has no toughness and still plays to an end", () => {
    const p = PROJECT_TEMPLATES.find((t) => t.id === "basic-turn")!.create("b");
    const setup = battleSetupOf(p);
    expect(setup.units.filter((u) => u.team === "enemy").every((u) => !u.stats.toughness)).toBe(true);
    const s = autoPlay(setup, createBattle(setup, 1), DEFAULT_POLICY);
    expect(s.events.some((e) => e.t === "break")).toBe(false);
    expect(s.phase).toBe("ended");
  });

  it("catches broken references, impossible ultimates and wrong teams", () => {
    const p = newProject();
    const u = p.battle.units[0]!;
    u.skills.find((s) => s.type === "ultimate")!.energyCost = 999;
    u.skills[1]!.effects.push({ kind: "status", target: "enemy", statusId: "nope", chance: 1 });
    p.battle.units.find((x) => x.id === "sentinel")!.ai!.push({ skillId: "shot", weight: 1, when: parseExpr("self.mystery > 1") });
    p.battle.encounter.allies.push("golem");
    const msgs = validateBattle(p.battle, battleSetupOf(p).damage).filter((i) => i.level === "error").map((i) => i.message).join("\n");
    expect(msgs).toContain("永遠無法施放");
    expect(msgs).toContain("nope");
    expect(msgs).toContain("self.mystery");
    expect(msgs).toContain("不是我方");
  });

  it("v2 projects migrate to v3 keeping their content", () => {
    const p = newProject();
    p.battle.units[0]!.name = "改過的名字";
    const { snapshots: _s, ...rest } = p;
    const { encounters: _e, ...battle } = rest.battle;
    const loaded = loadProject(JSON.parse(JSON.stringify({ ...rest, battle, schemaVersion: 2 })));
    expect(loaded.schemaVersion).toBe(3);
    expect(loaded.battle.units[0]!.name).toBe("改過的名字");
    expect(loaded.battle.encounters).toHaveLength(3);
    expect(loaded.snapshots).toEqual([]);
  });

  it("snapshots freeze rules and content", () => {
    const p = newProject();
    const snap = snapshotOf(p, "基準", "2026-10-09T00:00:00Z");
    const original = snap.battle.units[0]!.stats.atk;
    p.battle.units[0]!.stats.atk = 1;
    expect(snap.battle.units[0]!.stats.atk).toBe(original);
    expect(projectFromSnapshot(p, snap).battle.units[0]!.stats.atk).toBe(original);
  });
});
