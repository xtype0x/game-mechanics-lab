import { text } from "./i18n";
import { cleanOverrides, type KeyOverrides } from "./game";

// These keys (and the IndexedDB `gml.bullet-parry.assets.v1`) keep the old project id on purpose: the game used to be
// its own project, and visitors' best scores, options and uploaded packs live under these names.
export const BEST_KEY = "gml.bullet-parry.best.v1";
export const SETTINGS_KEY = "gml.bullet-parry.settings.v1";

/** Game options. The timing rules are shared with the frame lab and live in the shell (shell/config.ts), not here. */
export interface GameSettings {
  difficulty: number;
  showFrameBar: boolean;
  /** Active custom asset pack id (null = built-in default art and sounds). Packs themselves live in IndexedDB. */
  packActive: string | null;
  /** Last selected custom pack: target of the quick switch. */
  packLast: string | null;
  /** Master volume 0..1 and mute. */
  volume: number;
  muted: boolean;
  /** Practice mode: infinite lives, slower bullets, score not saved. */
  practice: boolean;
  /** While paused, the judgement strip can be scrubbed back through the last few seconds. */
  judgeFreeze: boolean;
  /** Key remaps per interaction id (KeyboardEvent.code); missing = the interaction's own key. */
  keys: KeyOverrides;
}

export const DIFFICULTY_RANGE = { min: 0.5, max: 3, step: 0.1 } as const;

/** Named tiers shown next to the slider (the value at or below the current difficulty wins). Names: dictionary settings.tiers. */
export const DIFFICULTY_TIERS = [
  { at: 0.5, id: "easy" },
  { at: 1, id: "normal" },
  { at: 1.5, id: "hard" },
  { at: 2, id: "hell" },
  { at: 2.6, id: "asura" },
] as const;
export type TierId = (typeof DIFFICULTY_TIERS)[number]["id"];
/** Tier id for a difficulty value. */
export const tierId = (d: number): TierId => [...DIFFICULTY_TIERS].reverse().find((t) => d >= t.at - 1e-9)?.id ?? DIFFICULTY_TIERS[0].id;
/** Tier name in the current language. */
export const tierName = (d: number): string => text().settings.tiers[tierId(d)];

export function defaultSettings(): GameSettings {
  return { difficulty: 1, showFrameBar: false, packActive: null, packLast: null, volume: 0.7, muted: false, practice: false, judgeFreeze: true, keys: {} };
}

export function loadBest(): number {
  try {
    const n = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function saveBest(score: number): void {
  try { localStorage.setItem(BEST_KEY, String(Math.floor(score))); } catch { /* storage unavailable */ }
}

/**
 * Parse stored settings. The v1 key is kept: asset/audio fields were added later and default when missing
 * (older saves stay valid), so no version bump or migration step is needed. A `config` field written by earlier
 * versions is ignored here (the shell reads it once, see loadSharedConfig).
 */
export function parseSettings(raw: string | null): GameSettings {
  const fallback = defaultSettings();
  try {
    if (!raw) return fallback;
    const v = JSON.parse(raw) as Partial<GameSettings>;
    const d = Number(v.difficulty);
    const vol = typeof v.volume === "number" ? v.volume : Number.NaN;
    return {
      difficulty: Number.isFinite(d) ? Math.min(DIFFICULTY_RANGE.max, Math.max(DIFFICULTY_RANGE.min, d)) : 1,
      showFrameBar: v.showFrameBar === true,
      packActive: typeof v.packActive === "string" ? v.packActive : null,
      packLast: typeof v.packLast === "string" ? v.packLast : null,
      volume: Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : fallback.volume,
      muted: v.muted === true,
      practice: v.practice === true,
      judgeFreeze: v.judgeFreeze !== false,
      keys: cleanOverrides(v.keys),
    };
  } catch {
    return fallback;
  }
}

export function loadSettings(): GameSettings {
  try { return parseSettings(localStorage.getItem(SETTINGS_KEY)); } catch { return defaultSettings(); }
}

export function saveSettings(s: GameSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
