/**
 * M6 extension check (docs/m6-extension-check.md): one damage variant and one gacha rule added as project
 * data only — no change to packages/core/src. The project built here is written to examples/m6-extension.json
 * (regenerate with `npm run vectors`), so it can be opened in the console.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DAMAGE_COMPONENTS,
  Rng,
  analyzeDamage,
  autoPlay,
  battleSetupOf,
  checkCompat,
  composeRules,
  createBattle,
  loadProject,
  newGachaState,
  newProject,
  parseExpr,
  pullMany,
  rateUpBanner,
  targetDistribution,
  tierCap,
  validateBanner,
  validateBattle,
  type BannerDef,
  type Project,
} from "../src";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "examples", "m6-extension.json");
const UPDATE = process.env.UPDATE_VECTORS === "1";

/** Damage variant: a mastery-scaled amplifying multiplier for fire skills (original constants). */
function addAmplify(p: Project) {
  const c = p.damage.config;
  c.customStats = [...(c.customStats ?? []), { side: "attacker", key: "mastery", label: "精通", default: 0, unit: "flat", min: 0 }];
  c.customFlags = [...(c.customFlags ?? []), { key: "amplify", label: "觸發增幅反應", default: true }];
  c.customSteps = [...c.customSteps, {
    id: "amplify",
    label: "增幅反應",
    apply: "mul",
    order: 25,
    base: parseExpr('if(flags.amplify && skill.element == "fire", 1.5 * (1 + 2.5 * attacker.mastery / (attacker.mastery + 1200)), 1)'),
    description: "火屬性技能觸發增幅反應：基礎 ×1.5，再依精通提高（精通 1200 時再 ×2.25）。",
  }];
  // Content: the fire attacker gets mastery, and a buff raises it (status modifiers reach custom stats).
  p.battle.units.find((u) => u.id === "homura")!.stats.mastery = 300;
  p.battle.statuses.push({ id: "kindle", name: "熾燃", kind: "buff", duration: 2, maxStacks: 1, modifiers: [{ target: "stat:mastery", op: "add", value: 200 }], description: "精通 +200。" });
}

/** Gacha rule: automatic spark — every 200 pulls guarantee the featured 5★, independent of the 5★ pity. */
function sparkBanner(p: Project): BannerDef {
  const b = rateUpBanner(p.battle);
  b.id = "spark";
  b.name = "天井限定池（每 200 抽必得限定）";
  b.description = "限定池加上天井：每累計 200 抽自動獲得限定 5★，與 5★ 保底分開計算。";
  b.tiers.unshift({ id: "spark", name: "天井", rate: 0, hardPity: 200, items: [...b.tiers[0]!.featured!.items] });
  return b;
}

function m6Project(): Project {
  const p = newProject("M6 擴充驗證");
  addAmplify(p);
  const b = sparkBanner(p);
  p.gacha.banners.push(b);
  p.gacha.active = b.id;
  return p;
}

describe("M6: damage variant as data", () => {
  const p = m6Project();
  const rules = composeRules(p.damage.config, DAMAGE_COMPONENTS);
  const sc = (element: string, mastery: number, amplify = true) => ({
    ...p.damage.scenarios.A, skill: { ...p.damage.scenarios.A.skill, element }, flags: { ...p.damage.scenarios.A.flags, amplify },
    attacker: { ...p.damage.scenarios.A.attacker, mastery },
  });
  const amp = (s: ReturnType<typeof sc>) => analyzeDamage(rules, s).nonCrit.hits[0]!.steps.find((x) => x.id === "amplify")!.breakdown.value;

  it("composes cleanly and validates", () => {
    expect(checkCompat(p.damage.config, DAMAGE_COMPONENTS).status).not.toBe("incompatible");
    expect(rules.steps.map((s) => s.id)).toEqual(["base", "crit", "dmgBonus", "amplify", "defRatio", "res", "vuln", "reduction", "toughness"]);
    expect(validateBattle(p.battle, rules).filter((i) => i.level === "error")).toEqual([]);
  });

  it("multiplier: 1.5 × (1 + 2.5 m / (m + 1200)) for fire, 1 otherwise or when the flag is off", () => {
    expect(amp(sc("fire", 300))).toBeCloseTo(2.25, 15); // 1.5 × (1 + 2.5 × 300 / 1500)
    expect(amp(sc("fire", 0))).toBe(1.5);
    expect(amp(sc("ice", 300))).toBe(1);
    expect(amp(sc("fire", 300, false))).toBe(1);
  });

  it("flows into battles: mastery from unit stats and from status modifiers", () => {
    const setup = battleSetupOf(p);
    const end = autoPlay(setup, createBattle(setup, 1), p.battle.policy);
    expect(end.result).toBeDefined();
    // Same seed with mastery removed: homura's hits shrink by 2.25 / 1.5 = 1.5 before rounding.
    const q = m6Project();
    delete q.battle.units.find((u) => u.id === "homura")!.stats.mastery;
    const s2 = battleSetupOf(q);
    const first = (st: typeof end) => st.events.find((e) => e.t === "damage" && e.src === "A1" && e.kind === "hit") as { amount: number } | undefined;
    const a = first(end)!.amount;
    const b = first(autoPlay(s2, createBattle(s2, 1), q.battle.policy))!.amount;
    expect(a / b).toBeCloseTo(1.5, 2);
  });
});

describe("M6: gacha rule as data (spark)", () => {
  const p = m6Project();
  const b = p.gacha.banners.find((x) => x.id === "spark")!;

  it("validates and grants the featured 5★ on every 200th pull without touching the 5★ pity", () => {
    expect(validateBanner(b, new Set(p.battle.units.map((u) => u.id))).filter((i) => i.level === "error")).toEqual([]);
    const st = newGachaState(b);
    const res = pullMany(b, st, new Rng(5, "m6"), 450);
    const sparks = res.map((r, i) => (r.tierId === "spark" ? i + 1 : 0)).filter(Boolean);
    expect(sparks).toEqual([200, 400]);
    expect(new Set(res.filter((r) => r.tierId === "spark").map((r) => r.itemId))).toEqual(new Set(b.tiers[0]!.items));
    // The 5★ counter keeps counting through pull 200: the spark tier hit, not the 5★ tier.
    const st2 = newGachaState(b);
    const rng = new Rng(5, "m6");
    pullMany(b, st2, rng, 199);
    const c5 = st2.counters["5"]!;
    expect(pullMany(b, st2, rng, 1)[0]!.tierId).toBe("spark");
    expect(st2.counters["5"]).toBe(c5 + 1);
    expect(st2.counters.spark).toBe(0);
  });

  it("known limits of the M1 analysis (see docs/m6-extension-check.md)", () => {
    // 1. Exact long-run rates need the joint pity chain: 200 × 90 × 10 states, too slow for interactive use.
    expect(b.tiers.slice(0, -1).map(tierCap).reduce((x, y) => x * y, 1)).toBe(180000);
    // 2. targetDistribution analyses tiers[0], which is now the spark: "first top-tier hit" is always pull 200.
    const d = targetDistribution(b, { mode: "tier", copies: 1 });
    expect(d.pmf.length - 1).toBe(200);
    expect(d.pmf[200]).toBe(1);
  });
});

describe("M6 example project", () => {
  it("examples/m6-extension.json loads and matches the data built here", () => {
    const fresh = JSON.parse(JSON.stringify(m6Project()));
    if (UPDATE || !existsSync(FILE)) {
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(FILE, JSON.stringify(fresh, null, 2) + "\n");
    }
    const onDisk = JSON.parse(readFileSync(FILE, "utf8"));
    expect(onDisk).toEqual(fresh);
    expect(loadProject(onDisk)).toEqual(fresh);
  });
});
