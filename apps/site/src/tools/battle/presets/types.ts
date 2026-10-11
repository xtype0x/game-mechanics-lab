import type { StatusDef, UnitDef } from "@ggt/core";

/**
 * One entry of the preset menu. `apply` is the unit that replaces the selected team slot (its team is forced to
 * "ally" and its id made unique in the team). Statuses the unit casts are merged into the project by id.
 * Unavailable presets keep `apply: null` and explain why in `reason`.
 */
export interface Preset {
  id: string;
  name: string;
  subtitle?: string;
  available: boolean;
  reason?: string;
  apply: UnitDef | null;
  /** Extra StatusDefs the unit needs; merged into the project's statuses by id (same id is replaced). */
  statuses?: StatusDef[];
  /** Approximations or caveats of the modelled kit (tooltip). */
  note?: string;
  /** Filter facets for large groups, e.g. { 屬性: "冰", 命途: "智識" }; the menu offers one dropdown per key. */
  facets?: Record<string, string>;
}

export interface PresetGroup {
  id: string;
  title: string;
  /** Where the data comes from (shown as small text). */
  source?: string;
  /** Short note under the title, e.g. "整理中". */
  note?: string;
  presets: Preset[];
}
