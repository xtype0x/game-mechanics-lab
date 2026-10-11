import { ELEMENT_LABELS, type UnitDef } from "@gml/core";
import { useMemo } from "react";

export const ELEMENT_OPTIONS = Object.keys(ELEMENT_LABELS);

/** Built-in elements plus any custom element keys already used by the project's units. */
export function elementOptions(units: UnitDef[]): string[] {
  const out = new Set(ELEMENT_OPTIONS);
  for (const u of units) {
    out.add(u.element);
    for (const w of u.weaknesses) out.add(w);
    for (const k of Object.keys(u.elementRes ?? {})) out.add(k);
    for (const s of u.skills) if (s.element) out.add(s.element);
  }
  return [...out];
}

export function useElementOptions(units: UnitDef[]): string[] {
  return useMemo(() => elementOptions(units), [units]);
}
