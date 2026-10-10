/**
 * Modifier model shared by stats and damage steps (docs/spec/damage.md §2).
 *
 *   value = override ?? (base × (1 + Σpct) + Σadd) × Πmul
 *   value = clamp(value, cap.min, cap.max)
 *   value = round(value, rounding)
 *
 * When several overrides apply, the last one in list order wins.
 */
import { evalBool, roundHalfAway, type Expr, type Scope } from "./expr";

export type ModOp = "add" | "pct" | "mul" | "override";

export interface Modifier {
  id: string;
  label: string;
  /** "stat:attacker.atk" | "stat:defender.def" | "step:<stepId>" */
  target: string;
  op: ModOp;
  value: number;
  condition?: Expr;
  source?: string;
  enabled?: boolean;
}

export type RoundingMode = "none" | "floor" | "ceil" | "round";

export interface Cap {
  min?: number;
  max?: number;
}

export interface Contribution {
  modId: string;
  label: string;
  op: ModOp;
  value: number;
  source?: string;
}

export interface ValueBreakdown {
  base: number;
  pctSum: number;
  addSum: number;
  mulProd: number;
  override?: number;
  /** Before cap and rounding. */
  raw: number;
  value: number;
  capped: boolean;
  contributions: Contribution[];
  /** Modifiers that target this value but whose condition was false. */
  inactive: Contribution[];
}

export function applyRounding(x: number, mode: RoundingMode | undefined): number {
  switch (mode ?? "none") {
    case "none": return x;
    case "floor": return Math.floor(x);
    case "ceil": return Math.ceil(x);
    case "round": return roundHalfAway(x);
  }
}

export function resolveValue(
  base: number,
  mods: readonly Modifier[],
  conditionScope: Scope,
  cap?: Cap,
  rounding?: RoundingMode,
): ValueBreakdown {
  let pctSum = 0;
  let addSum = 0;
  let mulProd = 1;
  let override: number | undefined;
  const contributions: Contribution[] = [];
  const inactive: Contribution[] = [];

  for (const m of mods) {
    if (m.enabled === false) continue;
    const contrib: Contribution = { modId: m.id, label: m.label, op: m.op, value: m.value, source: m.source };
    if (m.condition && !evalBool(m.condition, conditionScope)) {
      inactive.push(contrib);
      continue;
    }
    contributions.push(contrib);
    switch (m.op) {
      case "add": addSum += m.value; break;
      case "pct": pctSum += m.value; break;
      case "mul": mulProd *= m.value; break;
      case "override": override = m.value; break;
    }
  }

  const raw = override ?? (base * (1 + pctSum) + addSum) * mulProd;
  let value = raw;
  if (cap?.min !== undefined && value < cap.min) value = cap.min;
  if (cap?.max !== undefined && value > cap.max) value = cap.max;
  const capped = value !== raw;
  value = applyRounding(value, rounding);
  return { base, pctSum, addSum, mulProd, override, raw, value, capped, contributions, inactive };
}
