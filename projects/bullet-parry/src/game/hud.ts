import { stepsOf } from "./util";
import type { World } from "./world";
import { scoreOf } from "./world";

export interface InteractionHud {
  id: string;
  name: string;
  key: string | undefined;
  color: string | undefined;
  /** Could be accepted right now (ignoring a busy action slot). */
  ready: boolean;
  /** Why not: "cooldown" | "noCharge" | "noResource". */
  reason: "cooldown" | "noCharge" | "noResource" | null;
  active: boolean;
  charges: { count: number; max: number; progress: number } | null;
  cost: { resource: string; amount: number; have: number } | null;
}

export interface Hud {
  hp: number;
  hpMax: number;
  gauge: number | null;
  gaugeMax: number;
  invulnerable: number;
  seconds: number;
  score: number;
  busy: boolean;
  interactions: InteractionHud[];
}

export function hudOf(w: World): Hud {
  const cfg = w.config;
  const t = w.timing;
  const f = w.frame;
  const hpDef = cfg.resources.find((r) => r.id === cfg.healthResource);
  const gaugeDef = cfg.resources.find((r) => r.id === "gauge");
  const interactions: InteractionHud[] = cfg.interactions.map((i) => {
    const ch = t.charges[i.id];
    let reason: InteractionHud["reason"] = null;
    if (f < (t.readyAt[i.id] ?? 0)) reason = "cooldown";
    else if (i.charges && (ch?.count ?? 0) <= 0) reason = "noCharge";
    else if (i.cost && (t.resources[i.cost.resource] ?? 0) < i.cost.amount) reason = "noResource";
    let charges: InteractionHud["charges"] = null;
    if (i.charges && ch) {
      const next = ch.pending[0];
      const progress = ch.count >= i.charges.max || next === undefined ? 1 : Math.min(1, Math.max(0, 1 - (next - f) / i.charges.recharge));
      charges = { count: ch.count, max: i.charges.max, progress };
    }
    return {
      id: i.id, name: i.name, key: i.key, color: i.color, ready: reason === null && !t.defeated, reason,
      active: t.action?.interaction === i.id, charges,
      cost: i.cost ? { resource: i.cost.resource, amount: i.cost.amount, have: t.resources[i.cost.resource] ?? 0 } : null,
    };
  });
  return {
    hp: t.resources[cfg.healthResource] ?? 0,
    hpMax: hpDef?.max ?? 0,
    gauge: gaugeDef ? (t.resources.gauge ?? 0) : null,
    gaugeMax: gaugeDef?.max ?? 100,
    invulnerable: Math.max(0, (t.statuses.invulnerable ?? 0) - f),
    seconds: stepsOf(f),
    score: scoreOf(w),
    busy: t.action !== null || f < t.stunUntil,
    interactions,
  };
}
