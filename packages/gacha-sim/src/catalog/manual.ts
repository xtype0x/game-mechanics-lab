/**
 * Hand-maintained banners for games without a browser-readable public source (manual.json).
 * Edit the JSON when a new phase starts; times are ISO strings with an explicit offset.
 */
import type { BannerKind, GameId, LiveBanner, LiveData, LiveUnit } from "./live";
import manual from "./manual.json";

export interface ManualEntry {
  game: GameId;
  kind: BannerKind;
  version?: string;
  featured5: LiveUnit[];
  featured4: LiveUnit[];
  start: string;
  end: string;
  source: string;
}

export interface ManualList { updated: string; note: string; banners: ManualEntry[] }

export const MANUAL = manual as ManualList;

const secs = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/** Stable ids: game, kind, first featured unit and start time, so pity and history survive edits elsewhere. */
export function manualBanners(list: ManualList = MANUAL): LiveBanner[] {
  return list.banners.map((b) => ({
    id: `${b.game}-${b.kind}-${b.featured5[0]?.id ?? "none"}-${secs(b.start)}`,
    game: b.game, kind: b.kind, version: b.version,
    featured5: b.featured5, featured4: b.featured4,
    start: secs(b.start), end: secs(b.end),
  }));
}

/** Games whose banners come from the manual list. */
export const MANUAL_GAMES = new Set<GameId>(MANUAL.banners.map((b) => b.game));

/** Adds the manual banners to live or snapshot data (replacing any older copies of them). */
export function withManual(d: LiveData): LiveData {
  return { ...d, banners: [...d.banners.filter((b) => !MANUAL_GAMES.has(b.game)), ...manualBanners()] };
}
