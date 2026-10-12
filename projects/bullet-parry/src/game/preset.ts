import { Timing, c } from "@gml/core";
import { relocalizeTimingConfig, timingPresets } from "@gml/ui";
import { getLocale, type Locale } from "@gml/ui/i18n";
import { textFor } from "../i18n";

type Cfg = Timing.TimingConfig;

export const GAME_PRESET_ID = "bullet-parry-default";

/**
 * Game-tuned default: the core "lenient" preset with a 2-charge sequential dodge (3 s each), a full-gauge skill
 * granting 4 s of invulnerability.
 */
export function bulletParryDefault(locale: Locale = getLocale()): Cfg {
  const base = timingPresets(locale).find((p) => p.id === "lenient");
  if (!base) throw new Error("core preset 'lenient' missing");
  const cfg = base;
  cfg.id = GAME_PRESET_ID;
  const t = textFor(locale).preset;
  cfg.name = t.name;
  cfg.description = t.description;
  const dodge = cfg.interactions.find((i) => i.id === "dodge");
  if (dodge) dodge.charges = { max: 2, recharge: 180, mode: "sequential" };
  const skill = cfg.interactions.find((i) => i.id === "skill");
  if (skill) skill.cost = { resource: "gauge", amount: 100 };
  const colors: Record<string, string> = { parry: "#ffd45c", dodge: "#6ee7ff", skill: "#ff9de2" };
  for (const i of cfg.interactions) if (colors[i.id]) i.color = colors[i.id];
  for (const o of cfg.outcomes) {
    if (o.id === "perfectParry") for (const e of o.effects) if (e.type === "addResource") e.amount = c(30);
    if (o.id === "perfectDodge") for (const e of o.effects) if (e.type === "timeScale") e.frames = c(30);
  }
  return cfg;
}

/** Game default first, then every core preset (fresh copies, in the current language, so edits never leak back). */
export function gamePresets(locale: Locale = getLocale()): Cfg[] {
  return [bulletParryDefault(locale), ...timingPresets(locale)];
}

/** An untouched built-in (game default or core preset, in any language) in language `to`; null when edited or custom. */
export function relocalizeGameConfig(config: Cfg, to: Locale): Cfg | null {
  return relocalizeTimingConfig(config, to, gamePresets);
}
