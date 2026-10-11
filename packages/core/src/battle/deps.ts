/**
 * Cross-references between battle content (who uses what). Pure data, for delete guards, the dependency map
 * and "used by" lists in the editors. Not part of the battle rules.
 */
import { collectRefs } from "../expr";
import type { BattleConfig } from "../project";
import { effectNums, flatEffects } from "./types";

export type DepKind = "unit" | "skill" | "status" | "passive" | "encounter";

export interface DepNode {
  kind: DepKind;
  id: string;
  /** Owning unit for skills and passives. */
  unitId?: string;
}

export interface DepRef {
  from: DepNode;
  to: DepNode;
  /** What kind of link this is (UI label key). */
  via: "applies" | "detonates" | "adjusts" | "summons" | "dismisses" | "queues" | "casts" | "ai" | "condition" | "roster";
  /** Target does not exist. */
  broken: boolean;
}

export function contentReferences(cfg: BattleConfig): DepRef[] {
  const out: DepRef[] = [];
  const unitIds = new Set(cfg.units.map((u) => u.id));
  const statusIds = new Set(cfg.statuses.map((s) => s.id));
  const hasSkill = (unitId: string | undefined, skillId: string) =>
    unitId === undefined ? cfg.units.some((u) => u.skills.some((s) => s.id === skillId)) : !!cfg.units.find((u) => u.id === unitId)?.skills.some((s) => s.id === skillId);
  const seen = new Set<string>();
  const push = (from: DepNode, to: DepNode, via: DepRef["via"]) => {
    const key = JSON.stringify([from.kind, from.id, from.unitId, to.kind, to.id, to.unitId, via]);
    if (seen.has(key)) return;
    seen.add(key);
    const broken = to.kind === "unit" ? !unitIds.has(to.id) : to.kind === "status" ? !statusIds.has(to.id) : to.kind === "skill" ? !hasSkill(to.unitId, to.id) : false;
    out.push({ from, to, via, broken });
  };
  const conditionRefs = (from: DepNode, when: Parameters<typeof collectRefs>[0] | undefined) => {
    if (!when) return;
    for (const ref of collectRefs(when)) {
      const status = /^(?:self|target)\.status\.(.+)$/.exec(ref)?.[1] ?? /^battle\.(?:holders|maxStacks)\.(.+)$/.exec(ref)?.[1];
      if (status !== undefined) push(from, { kind: "status", id: status }, "condition");
      else if (ref.startsWith("battle.count.")) push(from, { kind: "unit", id: ref.slice(13) }, "condition");
    }
  };

  for (const s of cfg.statuses) {
    for (const m of s.modifiers) {
      conditionRefs({ kind: "status", id: s.id }, m.when);
      conditionRefs({ kind: "status", id: s.id }, m.scaleBy);
    }
  }
  for (const u of cfg.units) {
    for (const sk of u.skills) {
      const from: DepNode = { kind: "skill", id: sk.id, unitId: u.id };
      for (const { effect: e } of flatEffects(sk.effects)) {
        if (e.when) conditionRefs(from, e.when);
        for (const [, v] of effectNums(e)) if (typeof v !== "number") conditionRefs(from, v);
        if (e.kind === "statusAdjust") push(from, { kind: "status", id: e.statusId }, "adjusts");
        else if (e.kind === "status") push(from, { kind: "status", id: e.statusId }, "applies");
        else if (e.kind === "detonate" && e.statusId !== undefined) push(from, { kind: "status", id: e.statusId }, "detonates");
        else if (e.kind === "summon") push(from, { kind: "unit", id: e.unitId }, "summons");
        else if (e.kind === "dismiss" && e.unitId !== undefined) push(from, { kind: "unit", id: e.unitId }, "dismisses");
        else if (e.kind === "queueSkill") push(from, { kind: "skill", id: e.skillId }, "queues");
      }
    }
    for (const p of u.passives ?? []) {
      const from: DepNode = { kind: "passive", id: p.id, unitId: u.id };
      push(from, { kind: "skill", id: p.skillId, unitId: u.id }, "casts");
      conditionRefs(from, p.when);
      if (p.chance !== undefined && typeof p.chance !== "number") conditionRefs(from, p.chance);
    }
    for (const id of u.innateStatuses ?? []) push({ kind: "unit", id: u.id }, { kind: "status", id }, "applies");
    for (const r of u.ai ?? []) {
      const from: DepNode = { kind: "unit", id: u.id };
      push(from, { kind: "skill", id: r.skillId, unitId: u.id }, "ai");
      conditionRefs(from, r.when);
    }
  }
  const current: DepNode = { kind: "encounter", id: "" };
  for (const id of new Set([...cfg.encounter.allies, ...cfg.encounter.enemies])) push(current, { kind: "unit", id }, "roster");
  for (const e of cfg.encounters) for (const id of new Set(e.enemies)) push({ kind: "encounter", id: e.id }, { kind: "unit", id }, "roster");
  return out;
}

const same = (a: DepNode, b: DepNode) => a.kind === b.kind && a.id === b.id && (a.unitId === undefined || b.unitId === undefined || a.unitId === b.unitId);

/** References pointing at a node (for "used by" lists and delete guards). */
export function referencesTo(refs: DepRef[], node: DepNode): DepRef[] {
  return refs.filter((r) => same(r.to, node));
}

/** References pointing at a unit, its skills, or anything else it owns from outside the unit itself. */
export function externalReferencesToUnit(refs: DepRef[], unitId: string): DepRef[] {
  return refs.filter((r) => r.to.kind === "unit" && r.to.id === unitId && (r.from.kind === "encounter" || (r.from.unitId ?? r.from.id) !== unitId));
}
