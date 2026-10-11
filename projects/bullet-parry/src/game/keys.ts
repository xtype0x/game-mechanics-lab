import type { Timing } from "@gml/core";

/** Alternate bindings per interaction id (the primary key comes from `InteractionDef.key`). Hosts own real bindings. */
export const ALT_KEYS: Record<string, string[]> = {
  parry: ["Space"],
  dodge: ["ShiftLeft", "ShiftRight"],
  skill: ["KeyE"],
};

/** Keys the game itself uses; they can't be bound to an interaction. */
export const RESERVED_KEYS: readonly string[] = ["Escape", "KeyP", "Enter", "Tab"];

/** Player remaps: interaction id -> KeyboardEvent.code. A remap replaces the default key and its alternates. */
export type KeyOverrides = Record<string, string>;

/** Keep only usable string entries (storage / import hygiene). */
export function cleanOverrides(raw: unknown): KeyOverrides {
  const out: KeyOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, code] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof code === "string" && code.length > 0 && code.length < 24 && !RESERVED_KEYS.includes(code)) out[id] = code;
  }
  return out;
}

/** Codes bound to an interaction: the remap alone, or the config key plus alternates. */
export function codesOf(config: Timing.TimingConfig, id: string, overrides: KeyOverrides = {}): string[] {
  const o = overrides[id];
  if (o && !RESERVED_KEYS.includes(o)) return [o];
  const def = config.interactions.find((i) => i.id === id);
  return [def?.key, ...(ALT_KEYS[id] ?? [])].filter((x): x is string => !!x);
}

/** KeyboardEvent.code -> interaction id. Primary keys win over alternates; earlier interactions win ties. */
export function buildKeyMap(config: Timing.TimingConfig, overrides: KeyOverrides = {}): Map<string, string> {
  const m = new Map<string, string>();
  for (const i of config.interactions) {
    const first = codesOf(config, i.id, overrides)[0];
    if (first && !m.has(first)) m.set(first, i.id);
  }
  for (const i of config.interactions) {
    for (const k of codesOf(config, i.id, overrides).slice(1)) if (!m.has(k)) m.set(k, i.id);
  }
  return m;
}

/** Primary keys claimed by more than one interaction (the later ones are ignored by `buildKeyMap`). */
export function keyConflicts(config: Timing.TimingConfig, overrides: KeyOverrides = {}): { code: string; ids: string[] }[] {
  const by = new Map<string, string[]>();
  for (const i of config.interactions) {
    const c = codesOf(config, i.id, overrides)[0];
    if (c) by.set(c, [...(by.get(c) ?? []), i.id]);
  }
  return [...by].filter(([, ids]) => ids.length > 1).map(([code, ids]) => ({ code, ids }));
}

/** Display string such as "J / 空白". */
export function keyHint(config: Timing.TimingConfig, id: string, label: (code: string) => string, overrides: KeyOverrides = {}): string {
  return codesOf(config, id, overrides).slice(0, 2).map(label).join(" / ");
}
