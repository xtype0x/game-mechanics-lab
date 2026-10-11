/**
 * Loadout compilation (docs/spec/loadout.md). Expected values are hand-calculated; all inputs are dyadic
 * fractions (0.5, 0.25, 0.125, …) so every sum and product below is exact in IEEE 754.
 */
import { describe, expect, it } from "vitest";
import {
  DAMAGE_COMPONENTS,
  DEFAULT_BATTLE_RULES,
  applyLoadout,
  composeRules,
  configFromTemplate,
  createBattle,
  parseExpr,
  validateLoadout,
  type BattleSetup,
  type EquipmentPiece,
  type Loadout,
  type PassiveDef,
  type SkillDef,
  type StatusDef,
  type UnitDef,
} from "../src";

const skill = (id: string): SkillDef => ({ id, name: id, type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 1, toughness: 0 }] });
const followup = (id: string): SkillDef => ({ ...skill(id), type: "followup", targeting: "none" });
const passive = (id: string): PassiveDef => ({ id, name: id, on: "selfHit", skillId: id, limitPerTurn: 1 });
const status = (id: string, extra: Partial<StatusDef> = {}): StatusDef => ({ id, name: id, kind: "buff", duration: 0, maxStacks: 1, modifiers: [], ...extra });

const unit = (): UnitDef => ({
  id: "hero", name: "勇者", team: "ally", element: "fire", weaknesses: [],
  stats: { hp: 1000, atk: 100, def: 50, spd: 100, maxEnergy: 100 },
  skills: [skill("basic")],
  passives: [passive("own")],
  innateStatuses: ["base-aura"],
});

const piece = (slot: string, extra: Partial<EquipmentPiece> = {}): EquipmentPiece => ({ id: `p-${slot}`, name: `裝備-${slot}`, slot, ...extra });

describe("applyLoadout stats (§2.1–2.4)", () => {
  it("base pool, then (B) × (1 + P) + F per key", () => {
    const loadout: Loadout = {
      pieces: [
        piece("weapon", { setId: "s", base: { atk: 50, hp: 200 }, bonuses: [{ key: "atk", op: "pct", value: 0.5 }] }),
        piece("armor", { setId: "s", base: { def: 30, critRate: 0.05 }, bonuses: [{ key: "def", op: "pct", value: 0.25 }, { key: "hp", op: "flat", value: 100 }] }),
        piece("ring", { bonuses: [{ key: "atk", op: "flat", value: 10 }, { key: "atk", op: "pct", value: 0.25 }, { key: "spd", op: "flat", value: 5 }, { key: "energyRegen", op: "flat", value: 0.25 }] }),
      ],
      sets: [{ id: "s", name: "S", tiers: [{ pieces: 2, bonuses: [{ key: "atk", op: "pct", value: 0.125 }, { key: "hp", op: "pct", value: 0.25 }] }, { pieces: 4, bonuses: [{ key: "atk", op: "flat", value: 999 }] }] }],
    };
    const { unit: out } = applyLoadout(unit(), loadout);
    // Base pool: atk 100 + 50 = 150; hp 1000 + 200 = 1200; def 50 + 30 = 80; critRate 0 + 0.05 = 0.05; spd 100.
    // Set "s": 2 pieces (weapon, armor) → tier 2 active (atk pct 0.125, hp pct 0.25), tier 4 not.
    // atk: P = 0.5 + 0.25 + 0.125 = 0.875, F = 10 → 150 × 1.875 + 10 = 281.25 + 10 = 291.25
    // hp:  P = 0.25, F = 100 → 1200 × 1.25 + 100 = 1600
    // def: P = 0.25, F = 0 → 80 × 1.25 = 100
    // spd: P = 0, F = 5 → 100 × 1 + 5 = 105
    // energyRegen: no base → 0 × 1 + 0.25 = 0.25
    expect(out.stats).toEqual({ hp: 1600, atk: 291.25, def: 100, spd: 105, maxEnergy: 100, critRate: 0.05, energyRegen: 0.25 });
  });

  it("pct applies to the whole base pool, flat after it: order of bonuses does not matter within a kind", () => {
    const a = applyLoadout(unit(), { pieces: [piece("a", { bonuses: [{ key: "atk", op: "flat", value: 20 }, { key: "atk", op: "pct", value: 0.5 }] })] });
    const b = applyLoadout(unit(), { pieces: [piece("a", { bonuses: [{ key: "atk", op: "pct", value: 0.5 }, { key: "atk", op: "flat", value: 20 }] })] });
    // 100 × 1.5 + 20 = 170 either way (not (100 + 20) × 1.5 = 180).
    expect(a.unit.stats.atk).toBe(170);
    expect(b.unit.stats.atk).toBe(170);
  });

  it("a bonus on a key without any base gives 0 × (1 + P) + F: pct alone stays 0, flat alone is F", () => {
    const { unit: out } = applyLoadout(unit(), { pieces: [piece("a", { bonuses: [{ key: "x", op: "pct", value: 0.5 }, { key: "y", op: "flat", value: 7 }] })] });
    expect(out.stats.x).toBe(0);
    expect(out.stats.y).toBe(7);
  });

  it("base of the same key from several pieces adds up: atk 100 + 20 + 30 = 150, then × (1 + 0.5) = 225", () => {
    const { unit: out } = applyLoadout(unit(), { pieces: [piece("a", { base: { atk: 20 } }), piece("b", { base: { atk: 30 }, bonuses: [{ key: "atk", op: "pct", value: 0.5 }] })] });
    expect(out.stats.atk).toBe(225);
  });

  it("does not round", () => {
    const { unit: out } = applyLoadout(unit(), { pieces: [piece("a", { bonuses: [{ key: "def", op: "pct", value: 0.125 }] })] });
    expect(out.stats.def).toBe(56.25); // 50 × 1.125
  });

  it("does not modify the input unit", () => {
    const u = unit();
    const before = structuredClone(u);
    applyLoadout(u, { pieces: [piece("a", { base: { atk: 5 }, bonuses: [{ key: "atk", op: "flat", value: 1 }], skills: [skill("extra")] })] });
    expect(u).toEqual(before);
  });
});

describe("set tiers by piece count (§2.2)", () => {
  const s = { id: "s", name: "S", tiers: [{ pieces: 2, bonuses: [{ key: "atk", op: "flat" as const, value: 10 }] }, { pieces: 4, bonuses: [{ key: "atk", op: "flat" as const, value: 100 }] }, { pieces: 1, bonuses: [{ key: "atk", op: "flat" as const, value: 1 }] }] };
  const setPieces = (n: number) => Array.from({ length: n }, (_, i) => piece(`slot${i}`, { setId: "s" }));
  const atkWith = (n: number) => applyLoadout(unit(), { pieces: setPieces(n), sets: [s] }).unit.stats.atk;

  it("each tier counts when n >= pieces, in any tier order", () => {
    expect(atkWith(0)).toBe(100); // no pieces, no tiers
    expect(atkWith(1)).toBe(101); // tier 1 only → +1
    expect(atkWith(2)).toBe(111); // tiers 2 and 1 → +10 + 1
    expect(atkWith(3)).toBe(111); // still tiers 2 and 1
    expect(atkWith(4)).toBe(211); // all three → +10 + 100 + 1
  });

  it("only counts pieces of that set", () => {
    const pieces = [piece("a", { setId: "s" }), piece("b", { setId: "other" }), piece("c")];
    const { unit: out } = applyLoadout(unit(), { pieces, sets: [s, { id: "other", name: "O", tiers: [{ pieces: 2, bonuses: [{ key: "atk", op: "flat", value: 5000 }] }] }] });
    expect(out.stats.atk).toBe(101); // s: 1 piece → tier 1 (+1); other: 1 piece, tier 2 inactive
  });

  it("set tier passives and innate statuses join when active", () => {
    const sets = [{ id: "s", name: "S", tiers: [{ pieces: 2, passives: [passive("t2")], innateStatuses: ["t2-aura"] }, { pieces: 3, passives: [passive("t3")], innateStatuses: ["t3-aura"] }] }];
    const two = applyLoadout(unit(), { pieces: setPieces(2), sets }).unit;
    expect(two.passives!.map((p) => p.id)).toEqual(["own", "t2"]);
    expect(two.innateStatuses).toEqual(["base-aura", "t2-aura"]);
    const three = applyLoadout(unit(), { pieces: setPieces(3), sets }).unit;
    expect(three.passives!.map((p) => p.id)).toEqual(["own", "t2", "t3"]);
  });
});

describe("concatenation order (§2.5, §2.6)", () => {
  it("unit first, then pieces in order, then active set tiers in set/tier order", () => {
    const loadout: Loadout = {
      pieces: [
        piece("a", { setId: "s", skills: [followup("a-fu")], passives: [passive("a-p")], innateStatuses: ["a-i"] }),
        piece("b", { setId: "s", skills: [followup("b-fu"), followup("b-fu2")], passives: [passive("b-p")], innateStatuses: ["b-i", "a-i"] }),
      ],
      sets: [
        { id: "s", name: "S", tiers: [{ pieces: 2, passives: [passive("s-p")], innateStatuses: ["s-i"] }] },
        { id: "t", name: "T", tiers: [{ pieces: 1, passives: [passive("t-p")] }] },
      ],
      statuses: [status("a-i"), status("b-i")],
    };
    const { unit: out, statuses } = applyLoadout(unit(), loadout);
    expect(out.skills.map((s) => s.id)).toEqual(["basic", "a-fu", "b-fu", "b-fu2"]);
    expect(out.passives!.map((p) => p.id)).toEqual(["own", "a-p", "b-p", "s-p"]);
    // Duplicates are kept (the engine stacks them): the unit's own, piece a, piece b (b-i, a-i), set tier.
    expect(out.innateStatuses).toEqual(["base-aura", "a-i", "b-i", "a-i", "s-i"]);
    expect(statuses.map((s) => s.id)).toEqual(["a-i", "b-i"]);
  });

  it("copies other unit fields unchanged", () => {
    const u: UnitDef = { ...unit(), elementRes: { fire: 0.5 }, role: "dps", description: "d" };
    const { unit: out } = applyLoadout(u, { pieces: [piece("a")] });
    expect(out.elementRes).toEqual({ fire: 0.5 });
    expect(out.role).toBe("dps");
    expect(out.id).toBe("hero");
  });
});

describe("empty loadout (§4)", () => {
  it("returns an identical unit and no statuses", () => {
    const u = unit();
    const r = applyLoadout(u, { pieces: [] });
    expect(r.unit).toEqual(u);
    expect(r.statuses).toEqual([]);
  });

  it("does not add innateStatuses or passives that the unit did not have", () => {
    const u: UnitDef = { id: "x", name: "x", team: "ally", element: "fire", weaknesses: [], stats: { hp: 1, spd: 1 }, skills: [skill("basic")] };
    const r = applyLoadout(u, { pieces: [] });
    expect(r.unit).toEqual(u);
    expect("innateStatuses" in r.unit).toBe(false);
    expect("passives" in r.unit).toBe(false);
  });
});

describe("validateLoadout (§3)", () => {
  const msgs = (l: Loadout, project: StatusDef[] = [status("base-aura")], damageStatKeys?: string[]) => validateLoadout(unit(), l, project, damageStatKeys).map((i) => `${i.level}:${i.message}`);

  it("accepts a sound loadout", () => {
    const l: Loadout = {
      pieces: [piece("a", { setId: "s", innateStatuses: ["from-loadout"], skills: [followup("fu")] }), piece("b", { innateStatuses: ["from-project"] })],
      sets: [{ id: "s", name: "S", tiers: [{ pieces: 1, innateStatuses: ["base-aura"] }] }],
      statuses: [status("from-loadout")],
    };
    expect(msgs(l, [status("from-project"), status("base-aura")])).toEqual([]);
  });

  it("errors on a repeated slot", () => {
    expect(msgs({ pieces: [piece("a"), piece("a")] })).toEqual(["error:欄位「a」出現兩次"]);
  });

  it("errors on a setId missing from sets", () => {
    expect(msgs({ pieces: [piece("a", { setId: "ghost" })] })).toEqual(["error:裝備「裝備-a」的套裝「ghost」不在 sets 中"]);
  });

  it("errors on a tier needing fewer than 1 piece", () => {
    expect(msgs({ pieces: [], sets: [{ id: "s", name: "S", tiers: [{ pieces: 0 }, { pieces: 2 }] }] })).toEqual(["error:套裝「S」的件數必須至少為 1"]);
  });

  it("errors on unknown innate statuses (unit's own, piece, and set tier), counting loadout and project definitions", () => {
    const l: Loadout = {
      pieces: [piece("a", { innateStatuses: ["nope-piece"] })],
      sets: [{ id: "s", name: "S", tiers: [{ pieces: 5, innateStatuses: ["nope-tier"] }] }],
    };
    // "base-aura" (the unit's own) is not defined anywhere here, so it is reported too.
    expect(msgs(l, [])).toEqual([
      "error:單位「勇者」的開場狀態「base-aura」不存在",
      "error:裝備「裝備-a」的開場狀態「nope-piece」不存在",
      "error:套裝「S」的開場狀態「nope-tier」不存在",
    ]);
  });

  it("errors on dot statuses used as innate statuses", () => {
    const l: Loadout = { pieces: [piece("a", { innateStatuses: ["burn"] })], statuses: [status("burn", { kind: "debuff", dot: { multiplier: 1, element: "fire" } })] };
    expect(msgs(l, [status("base-aura")])).toEqual(["error:裝備「裝備-a」的開場狀態「burn」是持續傷害，不能作為開場狀態"]);
  });

  it("errors on skill or passive ids that repeat the unit's own", () => {
    const l: Loadout = { pieces: [piece("a", { skills: [skill("basic")], passives: [passive("own")] })], sets: [{ id: "s", name: "S", tiers: [{ pieces: 1, passives: [passive("own")] }] }] };
    expect(msgs(l, [status("base-aura")])).toEqual([
      "error:裝備「裝備-a」的技能 ID「basic」與單位原有的重複",
      "error:裝備「裝備-a」的被動 ID「own」與單位原有的重複",
      "error:套裝「S」的被動 ID「own」與單位原有的重複",
    ]);
  });

  it("warns about bonus keys that are neither unit stats nor damage stats (only when the damage keys are given)", () => {
    const l: Loadout = { pieces: [piece("a", { base: { shiny: 1 }, bonuses: [{ key: "atk", op: "flat", value: 1 }, { key: "critRate", op: "flat", value: 0.1 }, { key: "bogus", op: "pct", value: 0.1 }, { key: "shiny", op: "flat", value: 1 }] })] };
    expect(msgs(l, [status("base-aura")])).toEqual([]);
    expect(msgs(l, [status("base-aura")], ["critRate", "critDmg"])).toEqual(["warning:加成的數值「bogus」不是單位數值也不是傷害規則的統計值，不會有效果"]);
  });
});

describe("compiled unit in a battle", () => {
  it("energyRegen and innate statuses from equipment reach the engine", () => {
    const loadout: Loadout = {
      pieces: [piece("charm", { bonuses: [{ key: "energyRegen", op: "flat", value: 0.5 }], innateStatuses: ["ward"] })],
      statuses: [status("ward", { shield: { scale: "hp", multiplier: 0.25, flat: 0 } })],
    };
    const base: UnitDef = { ...unit(), innateStatuses: undefined, passives: undefined };
    delete base.innateStatuses;
    delete base.passives;
    base.skills = [{ ...skill("basic"), energyGain: 20 }];
    const { unit: hero, statuses } = applyLoadout(base, loadout);
    const dummy: UnitDef = { id: "dummy", name: "木樁", team: "enemy", element: "ice", weaknesses: [], stats: { hp: 100000, atk: 10, spd: 50, level: 80 }, skills: [{ ...skill("idle"), effects: [{ kind: "energy", target: "self", amount: 0 }] }] };
    const setup: BattleSetup = {
      damage: composeRules(configFromTemplate("tpl.standard"), DAMAGE_COMPONENTS),
      rules: { ...DEFAULT_BATTLE_RULES, breakDamage: parseExpr("attacker.atk * 0"), rounding: "floor" },
      statuses,
      units: [hero, dummy],
      encounter: { allies: ["hero"], enemies: ["dummy"] },
    };
    const s = createBattle(setup, 1);
    const a = s.units[0]!;
    // Shield: hp 1000 × 0.25 = 250. Skill gain 20 × (1 + 0.5) = 30 is checked by battle-v010.test.ts.
    expect(a.statuses).toEqual([{ statusId: "ward", sourceUid: "A1", stacks: 1, turnsLeft: 0, shield: 250 }]);
    expect(a.base.energyRegen).toBe(0.5);
  });
});
