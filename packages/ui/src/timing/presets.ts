// The core's built-in timing presets, with names / descriptions in the requested language.
// Core presets stay untouched (they are part of the test vectors); this layer only swaps text by preset id + item id.
// A config the visitor already saved or loaded is their data and is never passed through here.
import { Timing } from "@gml/core";
import { LOCALES, type Locale } from "../i18n";
import { timingPresetsEn } from "./i18n/en";
import type { PresetTable } from "./i18n/presetText";

/** zh-Hant is the core's own text, so it needs no table. */
const TABLES: Record<Locale, PresetTable | null> = { "zh-Hant": null, en: timingPresetsEn };

const rename = <T extends { id: string; name: string }>(items: T[], names: Record<string, string> | undefined) => {
  if (!names) return;
  for (const item of items) {
    const name = names[item.id];
    if (name !== undefined) item.name = name;
  }
};

/** Fresh copies of the core presets, translated for `locale`. Safe to edit. */
export function timingPresets(locale: Locale): Timing.TimingConfig[] {
  const table = TABLES[locale];
  return Timing.TIMING_PRESETS.map((core) => {
    const cfg = structuredClone(core);
    const text = table?.[cfg.id];
    if (!text) return cfg;
    if (text.name !== undefined) cfg.name = text.name;
    if (text.description !== undefined) cfg.description = text.description;
    rename(cfg.tags, text.tags);
    rename(cfg.resources, text.resources);
    rename(cfg.statuses, text.statuses);
    rename(cfg.outcomes, text.outcomes);
    for (const it of cfg.interactions) {
      const itText = text.interactions?.[it.id];
      if (!itText) continue;
      if (itText.name !== undefined) it.name = itText.name;
      rename(it.windows, itText.windows);
    }
    return cfg;
  });
}

/** JSON with object keys sorted, so two equal values compare equal whatever their key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Untouched built-in presets follow the language; edited ones are the visitor's data and stay as they are.
 * Returns a fresh `to`-language copy when `config` equals the built-in preset with the same id in ANY language,
 * otherwise null (edited, or not a built-in). `presets` defaults to the core presets; hosts with their own list pass it.
 */
export function relocalizeTimingConfig(
  config: Timing.TimingConfig,
  to: Locale,
  presets: (locale: Locale) => Timing.TimingConfig[] = timingPresets,
): Timing.TimingConfig | null {
  const key = stableStringify(config);
  const same = LOCALES.some((l) => presets(l).some((p) => p.id === config.id && stableStringify(p) === key));
  if (!same) return null;
  return structuredClone(presets(to).find((p) => p.id === config.id) ?? config);
}
