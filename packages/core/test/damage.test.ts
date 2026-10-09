import { describe, expect, it } from "vitest";
import {
  DAMAGE_COMPONENTS as LIB,
  DAMAGE_TEMPLATES,
  analyzeDamage,
  checkCompat,
  composeRules,
  computeDamage,
  configFromTemplate,
  defaultScenario,
  parseExpr,
  sampleDamage,
  type DamageConfig,
  type Scenario,
} from "../src";

const rulesFor = (tpl: string) => composeRules(configFromTemplate(tpl), LIB);

/*
 * Hand-computed expectations for defaultScenario() — see docs/spec/damage.md §5.
 * Per hit base = 2400 × 2 × 0.5 = 2400.
 * Defense ratio = 1 − 1000 / (1000 + 200 + 10×80) = 0.5.  Resistance = 1 − 0.2 = 0.8.  Bonus = 1.4.
 */
describe("templates — hand-computed values", () => {
  it("standard: non-crit 1344/hit, crit 2956/hit", () => {
    const r = rulesFor("tpl.standard");
    const sc = defaultScenario();
    expect(computeDamage(r, sc, false).hits.map((h) => h.damage)).toEqual([1344, 1344]);
    // 2400 × 2.2 × 1.4 × 0.5 × 0.8 = 2956.8 → floor
    expect(computeDamage(r, sc, true).hits.map((h) => h.damage)).toEqual([2956, 2956]);
  });

  it("standard: exact distribution and expectation", () => {
    const a = analyzeDamage(rulesFor("tpl.standard"), defaultScenario());
    expect(a.critChance).toBe(0.6);
    expect(a.expected).toBeCloseTo(2 * (0.4 * 1344 + 0.6 * 2956), 9);
    expect(a.distribution.map((d) => d.value)).toEqual([2688, 4300, 5912]);
    expect(a.distribution.map((d) => d.prob).map((p) => +p.toFixed(12))).toEqual([0.16, 0.48, 0.36]);
  });

  it("weakness-break: unbroken applies reduction 0.9 and toughness 0.9", () => {
    const r = rulesFor("tpl.weakness-break");
    const sc = defaultScenario();
    expect(computeDamage(r, sc, false).hits[0]!.damage).toBe(1088); // 1344 × 0.81 = 1088.64
    expect(computeDamage(r, sc, true).hits[0]!.damage).toBe(2395); // 2956.8 × 0.81 = 2395.008
    const broken: Scenario = { ...sc, flags: { broken: true } };
    expect(computeDamage(r, broken, false).hits[0]!.damage).toBe(1209); // 1344 × 0.9 = 1209.6
  });

  it("subtraction: defense split per hit, floor at 10%", () => {
    const r = rulesFor("tpl.subtraction");
    const sc = defaultScenario();
    // max(2400 − 1000×0.5, 240) = 1900; × 1.4
    expect(computeDamage(r, sc, false).hits[0]!.damage).toBe(2660);
    expect(computeDamage(r, sc, true).hits[0]!.damage).toBe(5852);
    const tank: Scenario = { ...sc, defender: { ...sc.defender, def: 99999 } };
    expect(computeDamage(r, tank, false).hits[0]!.damage).toBe(336); // 240 × 1.4
  });
});

describe("modifiers", () => {
  const sc = (): Scenario => defaultScenario();

  it("pct scales base, add is flat, mul is independent", () => {
    const r = rulesFor("tpl.standard");
    const s = sc();
    s.modifiers = [
      { id: "m1", label: "攻擊+20%", target: "stat:attacker.atk", op: "pct", value: 0.2 },
      { id: "m2", label: "攻擊+100", target: "stat:attacker.atk", op: "add", value: 100 },
      { id: "m3", label: "攻擊×1.1", target: "stat:attacker.atk", op: "mul", value: 1.1 },
    ];
    const res = computeDamage(r, s, false);
    expect(res.stats.attacker.atk!.value).toBeCloseTo((2400 * 1.2 + 100) * 1.1, 9);
    expect(res.stats.attacker.atk!.contributions).toHaveLength(3);
  });

  it("condition false moves modifier to inactive", () => {
    const r = rulesFor("tpl.standard");
    const s = sc();
    s.modifiers = [{ id: "u", label: "大招增傷", target: "step:dmgBonus", op: "add", value: 0.5, condition: parseExpr('skill.type == "ultimate"') }];
    const res = computeDamage(r, s, false);
    const step = res.hits[0]!.steps.find((x) => x.id === "dmgBonus")!;
    expect(step.breakdown.value).toBe(1.4);
    expect(step.breakdown.inactive).toHaveLength(1);
    s.skill = { ...s.skill, type: "ultimate" };
    expect(computeDamage(r, s, false).hits[0]!.steps.find((x) => x.id === "dmgBonus")!.breakdown.value).toBeCloseTo(1.9, 12);
  });

  it("override wins and caps clamp", () => {
    const r = rulesFor("tpl.standard");
    const s = sc();
    s.defender.res = 5; // 1 − 5 = −4 → capped to 0.1
    s.modifiers = [{ id: "o", label: "固定防禦乘區", target: "step:defRatio", op: "override", value: 1 }];
    const hit = computeDamage(r, s, false).hits[0]!;
    expect(hit.steps.find((x) => x.id === "defRatio")!.breakdown.value).toBe(1);
    const res = hit.steps.find((x) => x.id === "res")!.breakdown;
    expect(res.value).toBe(0.1);
    expect(res.capped).toBe(true);
  });

  it("disabled modifiers are ignored entirely", () => {
    const r = rulesFor("tpl.standard");
    const s = sc();
    s.modifiers = [{ id: "x", label: "x", target: "stat:attacker.atk", op: "add", value: 1e6, enabled: false }];
    expect(computeDamage(r, s, false).total).toBe(2688);
  });
});

describe("compatibility", () => {
  const base = (): DamageConfig => configFromTemplate("tpl.standard");

  it("pristine template is verified", () => {
    for (const t of DAMAGE_TEMPLATES) {
      expect(checkCompat(configFromTemplate(t.id), LIB, DAMAGE_TEMPLATES)).toMatchObject({ status: "verified", matchedTemplate: t.id });
    }
  });

  it("two defense models conflict", () => {
    const c = base();
    c.components.push("dmg.def-sub");
    const rep = checkCompat(c, LIB, DAMAGE_TEMPLATES);
    expect(rep.status).toBe("incompatible");
    expect(rep.issues[0]!.message).toContain("dmg:defense");
  });

  it("missing dependency is reported", () => {
    const rep = checkCompat({ ...base(), components: ["dmg.crit"] }, LIB, DAMAGE_TEMPLATES);
    expect(rep.status).toBe("incompatible");
    expect(rep.issues.some((i) => i.message.includes("dmg:base"))).toBe(true);
  });

  it("unknown variable and forward step reference are errors", () => {
    const c = base();
    c.customSteps.push({ id: "x", label: "自訂", apply: "mul", order: 15, base: parseExpr("1 + attacker.mystery + step.res") });
    const msgs = checkCompat(c, LIB, DAMAGE_TEMPLATES).issues.map((i) => i.message).join("\n");
    expect(msgs).toContain("attacker.mystery");
    expect(msgs).toContain("step.res");
  });

  it("valid custom step makes it experimental and is applied in order", () => {
    const c = base();
    c.customSteps.push({ id: "elite", label: "精英加成", apply: "mul", order: 25, base: parseExpr("1 + step.dmgBonus * 0") });
    expect(checkCompat(c, LIB, DAMAGE_TEMPLATES).status).toBe("experimental");
    const ids = composeRules(c, LIB).steps.map((s) => s.id);
    expect(ids.indexOf("elite")).toBe(ids.indexOf("dmgBonus") + 1);
  });

  it("override of a step formula takes effect", () => {
    const c = base();
    c.overrides.defRatio = { base: parseExpr("0.25") };
    expect(computeDamage(composeRules(c, LIB), defaultScenario(), false).hits[0]!.damage).toBe(672);
  });
});

describe("sampling vs exact", () => {
  it("sample mean converges to exact expectation and is seed-reproducible", () => {
    const a = analyzeDamage(rulesFor("tpl.standard"), defaultScenario());
    const s1 = sampleDamage(a, 20000, 42);
    const s2 = sampleDamage(a, 20000, 42);
    expect(s1.samples).toEqual(s2.samples);
    expect(Math.abs(s1.mean - a.expected) / a.expected).toBeLessThan(0.01);
    expect(sampleDamage(a, 50, 43).samples).not.toEqual(s1.samples.slice(0, 50));
  });

  it("distribution sums to 1 and its mean equals expectation", () => {
    const sc = defaultScenario();
    sc.skill.hits = [0.1, 0.2, 0.3, 0.4];
    const a = analyzeDamage(rulesFor("tpl.weakness-break"), sc);
    const total = a.distribution.reduce((x, d) => x + d.prob, 0);
    const mean = a.distribution.reduce((x, d) => x + d.prob * d.value, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(mean).toBeCloseTo(a.expected, 6);
  });
});
