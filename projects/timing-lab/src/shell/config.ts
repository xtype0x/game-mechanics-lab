// The timing rules shared by both modes (frame lab and bullet parry): one config, one storage key.
import { Timing } from "@gml/core";
import { parseTimingConfig } from "@gml/ui";
import { getLocale } from "@gml/ui/i18n";
import { bulletParryDefault, relocalizeGameConfig } from "./presets";

export const CONFIG_KEY = "gml.timing-lab.config.v1";
/**
 * The game's settings key. It keeps the old project id (bullet-parry) on purpose: visitors' saves, and the uploaded
 * asset packs in IndexedDB `gml.bullet-parry.assets.v1`, live under these names. Only read here, to migrate a rules
 * config saved before the two projects were merged.
 */
export const LEGACY_GAME_SETTINGS_KEY = "gml.bullet-parry.settings.v1";

type Cfg = Timing.TimingConfig;
type ReadableStorage = Pick<Storage, "getItem">;

export function safeStorage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function save(key: string, value: unknown): void {
  try { safeStorage()?.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export function saveSharedConfig(config: Cfg): void {
  save(CONFIG_KEY, { format: "gml-timing-config", version: 1, config });
}

/**
 * Structural check for a config stored by the game before the merge. Looser than parseTimingConfig: rules with
 * validation errors are kept so the visitor can fix them in the editor (starting a run is blocked instead).
 */
export function isUsableConfig(config: unknown): config is Cfg {
  const c = config as Partial<Cfg> | null | undefined;
  if (!c || typeof c !== "object" || c.version !== 1 || !Array.isArray(c.interactions) || c.interactions.length === 0) return false;
  for (const k of ["tags", "resources", "statuses", "outcomes"] as const) if (!Array.isArray(c[k])) return false;
  return typeof c.fps === "number" && typeof c.hitOutcome === "string" && typeof c.healthResource === "string";
}

function fromLabKey(storage: ReadableStorage | null): Cfg | null {
  try {
    const t = storage?.getItem(CONFIG_KEY);
    return t ? parseTimingConfig(t) : null;
  } catch { return null; /* corrupt or unavailable */ }
}

function fromGameSettings(storage: ReadableStorage | null): Cfg | null {
  try {
    const t = storage?.getItem(LEGACY_GAME_SETTINGS_KEY);
    if (!t) return null;
    const config = (JSON.parse(t) as { config?: unknown } | null)?.config;
    return isUsableConfig(config) ? config : null;
  } catch { return null; }
}

/**
 * The starting rules: the saved shared config; else the config an earlier game version saved in its own settings
 * (it is written to the shared key by the normal save); else the game-tuned default. An untouched built-in saved in
 * another language is shown in the current one.
 */
export function loadSharedConfig(storage: ReadableStorage | null = safeStorage()): Cfg {
  const cfg = fromLabKey(storage) ?? fromGameSettings(storage) ?? bulletParryDefault();
  return relocalizeGameConfig(cfg, getLocale()) ?? cfg;
}
