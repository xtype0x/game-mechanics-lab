import {
  DEFAULT_STATUSES, DEFAULT_UNITS, SHOWCASE_ALLIES, SHOWCASE_STATUSES, SHOWCASE_V07_ALLIES, SHOWCASE_V07_STATUSES,
  type StatusDef, type UnitDef,
} from "@ggt/core";
import type { Preset, PresetGroup } from "./types";

const statusPool: StatusDef[] = [...DEFAULT_STATUSES, ...SHOWCASE_STATUSES, ...SHOWCASE_V07_STATUSES];

/** Statuses a unit applies, found by scanning its JSON for "statusId" references. */
function neededStatuses(unit: UnitDef): StatusDef[] {
  const ids = new Set([...JSON.stringify(unit).matchAll(/"statusId":"([^"]+)"/g)].map((m) => m[1]!));
  return statusPool.filter((s) => ids.has(s.id));
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const toPreset = (u: UnitDef): Preset => ({
  id: u.id,
  name: u.name,
  subtitle: [u.role, u.description?.split("。")[0]].filter(Boolean).join("・"),
  available: true,
  apply: clone(u),
  statuses: clone(neededStatuses(u)),
});

export const templateGroup: PresetGroup = {
  id: "templates",
  title: "範本角色",
  source: "本工具的原創範例角色",
  presets: [...DEFAULT_UNITS, ...SHOWCASE_ALLIES, ...SHOWCASE_V07_ALLIES].filter((u) => u.team === "ally").map(toPreset),
};
