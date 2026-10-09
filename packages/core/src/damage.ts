/**
 * Damage pipeline (docs/spec/damage.md).
 *
 * A damage rule is an ordered list of steps. Each step computes a value from its base formula plus
 * modifiers targeting `step:<id>`, then either replaces the running value ("set") or multiplies it ("mul").
 * Every hit of a skill runs the full pipeline independently with `hit.ratio` in scope.
 */
import { collectRefs, evalNumber, objectScope, type Expr, type Value } from "./expr";
import { applyRounding, resolveValue, type Cap, type Modifier, type RoundingMode, type ValueBreakdown } from "./modifier";
import { Rng } from "./rng";

export type Side = "attacker" | "defender";

export interface StatDef {
  side: Side;
  key: string;
  label: string;
  default: number;
  /** Display hint only; values are always stored as plain numbers (50% = 0.5). */
  unit: "flat" | "percent" | "level";
  min?: number;
  max?: number;
}

export interface FlagDef {
  key: string;
  label: string;
  default: boolean;
}

export interface StepDef {
  id: string;
  label: string;
  apply: "set" | "mul";
  base: Expr;
  order: number;
  cap?: Cap;
  rounding?: RoundingMode;
  description?: string;
}

export interface DamageComponent {
  id: string;
  name: string;
  description: string;
  provides: string[];
  requires: string[];
  conflicts?: string[];
  stats: StatDef[];
  flags?: FlagDef[];
  steps: StepDef[];
  /** Probability that a hit crits. At most one selected component may define it. */
  critChance?: Expr;
}

export interface StepOverride {
  label?: string;
  base?: Expr;
  cap?: Cap;
  rounding?: RoundingMode;
  order?: number;
}

export interface DamageConfig {
  components: string[];
  customSteps: StepDef[];
  overrides: Record<string, StepOverride>;
  disabledSteps: string[];
  finalRounding: RoundingMode;
  minDamage: number;
  /** User-defined stats/flags usable in custom formulas. Optional for older project files. */
  customStats?: StatDef[];
  customFlags?: FlagDef[];
}

export type SkillType = "basic" | "skill" | "ultimate" | "followup";

export interface Skill {
  name: string;
  multiplier: number;
  type: SkillType;
  element: string;
  /** Damage split per hit; ratios normally sum to 1. */
  hits: number[];
}

export interface Scenario {
  name: string;
  attacker: Record<string, number>;
  defender: Record<string, number>;
  skill: Skill;
  flags: Record<string, boolean>;
  modifiers: Modifier[];
}

/** Fully resolved rules ready for evaluation. */
export interface DamageRules {
  steps: StepDef[];
  stats: StatDef[];
  flags: FlagDef[];
  critChance?: Expr;
  finalRounding: RoundingMode;
  minDamage: number;
}

export type CompatStatus = "verified" | "experimental" | "incompatible";

export interface CompatIssue {
  level: "error" | "warning";
  message: string;
  componentId?: string;
  stepId?: string;
}

export interface CompatReport {
  status: CompatStatus;
  issues: CompatIssue[];
  matchedTemplate?: string;
}

export interface DamageTemplate {
  id: string;
  name: string;
  description: string;
  components: string[];
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export function composeRules(config: DamageConfig, library: readonly DamageComponent[]): DamageRules {
  const byId = new Map(library.map((comp) => [comp.id, comp]));
  const steps: StepDef[] = [];
  const stats = new Map<string, StatDef>();
  const flags = new Map<string, FlagDef>();
  let critChance: Expr | undefined;

  for (const id of config.components) {
    const comp = byId.get(id);
    if (!comp) continue;
    for (const s of comp.stats) if (!stats.has(`${s.side}.${s.key}`)) stats.set(`${s.side}.${s.key}`, s);
    for (const f of comp.flags ?? []) if (!flags.has(f.key)) flags.set(f.key, f);
    steps.push(...comp.steps);
    critChance ??= comp.critChance;
  }
  steps.push(...config.customSteps);
  for (const s of config.customStats ?? []) if (!stats.has(`${s.side}.${s.key}`)) stats.set(`${s.side}.${s.key}`, s);
  for (const f of config.customFlags ?? []) if (!flags.has(f.key)) flags.set(f.key, f);

  const disabled = new Set(config.disabledSteps);
  const resolved = steps
    .filter((s) => !disabled.has(s.id))
    .map((s) => ({ ...s, ...stripUndefined(config.overrides[s.id] ?? {}) }))
    // Stable sort: equal order keeps component order.
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.order - b.s.order || a.i - b.i)
    .map(({ s }) => s);

  return {
    steps: resolved,
    stats: [...stats.values()],
    flags: [...flags.values()],
    critChance,
    finalRounding: config.finalRounding,
    minDamage: config.minDamage,
  };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const BUILTIN_REFS = ["skill.multiplier", "skill.type", "skill.element", "hit.ratio", "hit.index", "hit.count", "flags.crit", "prev"];

export function checkCompat(
  config: DamageConfig,
  library: readonly DamageComponent[],
  templates: readonly DamageTemplate[] = [],
): CompatReport {
  const issues: CompatIssue[] = [];
  const byId = new Map(library.map((comp) => [comp.id, comp]));
  const selected: DamageComponent[] = [];

  for (const id of config.components) {
    const comp = byId.get(id);
    if (!comp) issues.push({ level: "error", message: `找不到機制元件「${id}」`, componentId: id });
    else selected.push(comp);
  }

  const providers = new Map<string, DamageComponent[]>();
  for (const comp of selected) {
    for (const cap of comp.provides) providers.set(cap, [...(providers.get(cap) ?? []), comp]);
  }
  for (const [cap, comps] of providers) {
    if (comps.length > 1) {
      issues.push({
        level: "error",
        message: `${comps.map((x) => `「${x.name}」`).join("與")}都提供「${cap}」，同一種機制只能選一個`,
        componentId: comps[1]!.id,
      });
    }
  }
  for (const comp of selected) {
    for (const req of comp.requires) {
      if (!providers.has(req)) issues.push({ level: "error", message: `「${comp.name}」需要「${req}」，但沒有元件提供`, componentId: comp.id });
    }
    for (const other of comp.conflicts ?? []) {
      if (providers.has(other)) issues.push({ level: "error", message: `「${comp.name}」與「${other}」互斥`, componentId: comp.id });
    }
  }
  // Same stat declared twice: first wins (spec §3.1); differing defaults are surprising, so warn.
  const statDefaults = new Map<string, { def: number; owner: string }>();
  const statOwners = [
    ...selected.map((comp) => ({ owner: `「${comp.name}」`, stats: comp.stats })),
    { owner: "自訂數值", stats: config.customStats ?? [] },
  ];
  for (const { owner, stats } of statOwners) {
    for (const s of stats) {
      const id = `${s.side}.${s.key}`;
      const prev = statDefaults.get(id);
      if (!prev) statDefaults.set(id, { def: s.default, owner });
      else if (owner === "自訂數值") issues.push({ level: "warning", message: `自訂數值「${id}」已由${prev.owner}定義，自訂版本被忽略` });
      else if (prev.def !== s.default) issues.push({ level: "warning", message: `${prev.owner}與${owner}都定義「${id}」但預設值不同（${prev.def} / ${s.default}），採用前者` });
    }
  }
  const flagIds = new Set(selected.flatMap((x) => (x.flags ?? []).map((f) => f.key)));
  for (const f of config.customFlags ?? []) {
    if (flagIds.has(f.key)) issues.push({ level: "warning", message: `自訂狀態「${f.key}」已由元件定義，自訂版本被忽略` });
  }

  const critSources = selected.filter((x) => x.critChance);
  if (critSources.length > 1) issues.push({ level: "error", message: "有多個元件定義暴擊率", componentId: critSources[1]!.id });

  const rules = composeRules(config, library);
  if (!rules.steps.some((s) => s.apply === "set")) {
    issues.push({ level: "error", message: "沒有任何「設定基礎值」的步驟，傷害永遠是 0" });
  } else if (rules.steps[0]?.apply !== "set") {
    issues.push({ level: "warning", message: `第一個步驟「${rules.steps[0]!.label}」是乘算，乘在 0 上沒有作用` });
  }

  const ids = new Set<string>();
  for (const s of rules.steps) {
    if (ids.has(s.id)) issues.push({ level: "error", message: `步驟 ID「${s.id}」重複`, stepId: s.id });
    ids.add(s.id);
  }

  const known = new Set<string>([...BUILTIN_REFS, ...rules.stats.map((s) => `${s.side}.${s.key}`), ...rules.flags.map((f) => `flags.${f.key}`)]);
  const seenSteps = new Set<string>();
  for (const s of rules.steps) {
    for (const ref of collectRefs(s.base)) {
      if (ref.startsWith("step.")) {
        const target = ref.slice(5);
        if (!seenSteps.has(target)) {
          issues.push({ level: "error", message: `步驟「${s.label}」引用了「${ref}」，但該步驟不存在或排在後面`, stepId: s.id });
        }
      } else if (!known.has(ref)) {
        issues.push({ level: "error", message: `步驟「${s.label}」使用未定義的變數「${ref}」`, stepId: s.id });
      }
    }
    seenSteps.add(s.id);
  }
  if (rules.critChance) {
    // Crit chance is evaluated outside the hit loop: no hit.*, step.* or prev (spec §4.3).
    for (const ref of collectRefs(rules.critChance)) {
      if (!known.has(ref) || ref.startsWith("hit.") || ref === "prev") issues.push({ level: "error", message: `暴擊率公式使用未定義的變數「${ref}」` });
    }
  }

  if (issues.some((i) => i.level === "error")) return { status: "incompatible", issues };

  const isPristine =
    config.customSteps.length === 0 &&
    Object.keys(config.overrides).length === 0 &&
    config.disabledSteps.length === 0 &&
    !config.customStats?.length &&
    !config.customFlags?.length;
  const selectedSet = [...config.components].sort().join("|");
  const matched = templates.find((t) => [...t.components].sort().join("|") === selectedSet);
  if (isPristine && matched) return { status: "verified", issues, matchedTemplate: matched.id };
  return { status: "experimental", issues };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface StepResult {
  id: string;
  label: string;
  apply: "set" | "mul";
  before: number;
  after: number;
  breakdown: ValueBreakdown;
}

export interface HitResult {
  index: number;
  ratio: number;
  crit: boolean;
  steps: StepResult[];
  /** Running value after all steps, before min damage and final rounding. */
  raw: number;
  damage: number;
}

export interface ResolvedStats {
  attacker: Record<string, ValueBreakdown>;
  defender: Record<string, ValueBreakdown>;
}

export interface DamageResult {
  crit: boolean;
  stats: ResolvedStats;
  hits: HitResult[];
  total: number;
}

function partitionMods(mods: readonly Modifier[]) {
  const byTarget = new Map<string, Modifier[]>();
  for (const m of mods) byTarget.set(m.target, [...(byTarget.get(m.target) ?? []), m]);
  return byTarget;
}

function baseScopeObject(rules: DamageRules, sc: Scenario, crit: boolean) {
  const flags: Record<string, boolean> = { crit };
  for (const f of rules.flags) flags[f.key] = sc.flags[f.key] ?? f.default;
  const skill: Record<string, Value> = { multiplier: sc.skill.multiplier, type: sc.skill.type, element: sc.skill.element };
  return { flags, skill };
}

export function resolveStats(rules: DamageRules, sc: Scenario): ResolvedStats {
  const byTarget = partitionMods(sc.modifiers);
  const raw: Record<Side, Record<string, number>> = { attacker: {}, defender: {} };
  for (const s of rules.stats) raw[s.side][s.key] = sc[s.side][s.key] ?? s.default;
  // Stat modifier conditions see base (unmodified) stats to avoid circular dependencies.
  const condScope = objectScope({ ...raw, ...baseScopeObject(rules, sc, false) });
  const out: ResolvedStats = { attacker: {}, defender: {} };
  for (const s of rules.stats) {
    const cap: Cap = { min: s.min, max: s.max };
    out[s.side][s.key] = resolveValue(raw[s.side][s.key]!, byTarget.get(`stat:${s.side}.${s.key}`) ?? [], condScope, cap);
  }
  return out;
}

function finalStatValues(stats: ResolvedStats) {
  const pick = (r: Record<string, ValueBreakdown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.value]));
  return { attacker: pick(stats.attacker), defender: pick(stats.defender) };
}

export function computeHit(
  rules: DamageRules,
  sc: Scenario,
  stats: ResolvedStats,
  hitIndex: number,
  crit: boolean,
): HitResult {
  const byTarget = partitionMods(sc.modifiers);
  const ratio = sc.skill.hits[hitIndex] ?? 1;
  const ctx: Record<string, unknown> = {
    ...finalStatValues(stats),
    ...baseScopeObject(rules, sc, crit),
    hit: { ratio, index: hitIndex, count: sc.skill.hits.length },
    step: {} as Record<string, number>,
    prev: 0,
  };
  const scope = objectScope(ctx);
  let running = 0;
  const steps: StepResult[] = [];
  for (const s of rules.steps) {
    ctx.prev = running;
    const base = evalNumber(s.base, scope);
    const bd = resolveValue(base, byTarget.get(`step:${s.id}`) ?? [], scope, s.cap, s.rounding);
    const before = running;
    running = s.apply === "set" ? bd.value : running * bd.value;
    (ctx.step as Record<string, number>)[s.id] = bd.value;
    steps.push({ id: s.id, label: s.label, apply: s.apply, before, after: running, breakdown: bd });
  }
  const damage = applyRounding(Math.max(running, rules.minDamage), rules.finalRounding);
  return { index: hitIndex, ratio, crit, steps, raw: running, damage };
}

/** Deterministic damage with every hit forced to crit (or not). */
export function computeDamage(rules: DamageRules, sc: Scenario, crit: boolean): DamageResult {
  const stats = resolveStats(rules, sc);
  const hits = sc.skill.hits.map((_, i) => computeHit(rules, sc, stats, i, crit));
  return { crit, stats, hits, total: hits.reduce((a, h) => a + h.damage, 0) };
}

export function critChanceOf(rules: DamageRules, sc: Scenario, stats = resolveStats(rules, sc)): number {
  if (!rules.critChance) return 0;
  const scope = objectScope({ ...finalStatValues(stats), ...baseScopeObject(rules, sc, false) });
  return Math.min(1, Math.max(0, evalNumber(rules.critChance, scope)));
}

export interface DistPoint {
  value: number;
  prob: number;
}

export interface DamageAnalysis {
  nonCrit: DamageResult;
  crit: DamageResult;
  critChance: number;
  expected: number;
  /** Exact distribution of total damage over independent per-hit crit rolls, ascending by value. */
  distribution: DistPoint[];
  min: number;
  max: number;
}

const MAX_DIST_POINTS = 4096;

export function analyzeDamage(rules: DamageRules, sc: Scenario): DamageAnalysis {
  const nonCrit = computeDamage(rules, sc, false);
  const crit = computeDamage(rules, sc, true);
  const p = critChanceOf(rules, sc, nonCrit.stats);
  let expected = 0;
  let dist = new Map<number, number>([[0, 1]]);
  for (let i = 0; i < nonCrit.hits.length; i++) {
    const a = nonCrit.hits[i]!.damage;
    const b = crit.hits[i]!.damage;
    expected += (1 - p) * a + p * b;
    const next = new Map<number, number>();
    for (const [v, pr] of dist) {
      if (p < 1) next.set(v + a, (next.get(v + a) ?? 0) + pr * (1 - p));
      if (p > 0) next.set(v + b, (next.get(v + b) ?? 0) + pr * p);
    }
    if (next.size > MAX_DIST_POINTS) throw new RangeError("命中段數過多，無法精確計算分布");
    dist = next;
  }
  const distribution = [...dist.entries()].map(([value, prob]) => ({ value, prob })).sort((x, y) => x.value - y.value);
  return { nonCrit, crit, critChance: p, expected, distribution, min: nonCrit.total, max: crit.total };
}

export interface SampleResult {
  n: number;
  seed: number | string;
  mean: number;
  samples: number[];
}

/**
 * Monte Carlo sampling using the "damage.crit" RNG stream: one chance() draw per hit, in hit order.
 * Exists so users can see sampled vs exact results side by side.
 */
export function sampleDamage(analysis: DamageAnalysis, n: number, seed: number | string): SampleResult {
  const rng = new Rng(seed, "damage.crit");
  const samples: number[] = [];
  let sum = 0;
  for (let k = 0; k < n; k++) {
    let total = 0;
    for (let i = 0; i < analysis.nonCrit.hits.length; i++) {
      total += rng.chance(analysis.critChance) ? analysis.crit.hits[i]!.damage : analysis.nonCrit.hits[i]!.damage;
    }
    samples.push(total);
    sum += total;
  }
  return { n, seed, mean: n ? sum / n : 0, samples };
}
