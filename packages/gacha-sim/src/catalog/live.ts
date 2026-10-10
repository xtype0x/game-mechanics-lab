/**
 * Current banners from public sources. Standalone (no imports) so the snapshot script can run it in Node.
 *
 * - Honkai: Star Rail, Genshin Impact: api.ennead.cc (open-source torikushiii/hoyoverse-api, built on the
 *   official event calendar). No key; rate limit 2 requests/s per IP.
 * - Blue Archive: SchaleDB public data (config.min.json + students). Its "current gacha" can lag behind the game.
 */

export type GameId = "hsr" | "genshin" | "ba";
export type BannerKind = "character" | "weapon" | "pickup";

export interface LiveUnit { id: string; name: string }

export interface LiveBanner {
  /** Stable id within the game (source id). */
  id: string;
  game: GameId;
  kind: BannerKind;
  /** Blue Archive: "jp" | "global". */
  region?: string;
  version?: string;
  featured5: LiveUnit[];
  featured4: LiveUnit[];
  /** Unix seconds; 0 when unknown. */
  start: number;
  end: number;
}

export interface LiveData {
  fetchedAt: string;
  banners: LiveBanner[];
  /** Per source: ok or the error text. */
  sources: Record<string, string>;
}

export const SOURCES = {
  hoyo: { label: "api.ennead.cc（torikushiii/hoyoverse-api）", url: "https://github.com/torikushiii/hoyoverse-api" },
  schale: { label: "SchaleDB", url: "https://schaledb.com" },
} as const;

interface HoyoUnit { id: number; name: string; rarity: number }
interface HoyoBanner { id: number; version?: string; characters?: HoyoUnit[]; light_cones?: HoyoUnit[]; weapons?: HoyoUnit[]; start_time: number; end_time: number }

const unit = (u: { id: number | string; name: string }): LiveUnit => ({ id: String(u.id), name: u.name });

/** Normalizes one calendar response. Banners mixing characters and weapons (special formats) are skipped. */
export function adaptHoyo(game: "hsr" | "genshin", json: { banners?: HoyoBanner[] }): LiveBanner[] {
  const out: LiveBanner[] = [];
  for (const b of json.banners ?? []) {
    const chars = b.characters ?? [];
    const gear = [...(b.light_cones ?? []), ...(b.weapons ?? [])];
    if (chars.length && gear.length) continue;
    const list = chars.length ? chars : gear;
    if (!list.some((x) => x.rarity === 5)) continue;
    out.push({
      id: `${game}-${b.id}`, game, kind: chars.length ? "character" : "weapon", version: b.version,
      featured5: list.filter((x) => x.rarity === 5).map(unit),
      featured4: list.filter((x) => x.rarity === 4).map(unit),
      start: b.start_time, end: b.end_time,
    });
  }
  return out;
}

interface SchaleConfig { Regions?: { Name: string; CurrentGacha?: { characters: number[]; start: number; end: number }[] }[] }

/** SchaleDB: each current pickup becomes one banner per region. Student rarity 3 → featured5 slot. */
export function adaptSchale(config: SchaleConfig, students: Record<string, { Name: string; StarGrade?: number }>): LiveBanner[] {
  const out: LiveBanner[] = [];
  for (const r of config.Regions ?? []) {
    const region = r.Name.toLowerCase();
    if (region !== "jp" && region !== "global") continue;
    (r.CurrentGacha ?? []).forEach((g, i) => {
      const units = g.characters.map((id) => ({ id: String(id), name: students[String(id)]?.Name ?? `#${id}`, star: students[String(id)]?.StarGrade ?? 3 }));
      out.push({
        id: `ba-${region}-${g.start}-${i}`, game: "ba", kind: "pickup", region,
        featured5: units.filter((u) => u.star >= 3).map(unit), featured4: [],
        start: g.start, end: g.end,
      });
    });
  }
  return out;
}

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches every source; a failing source only drops its banners. */
export async function fetchLive(timeoutMs = 8000): Promise<LiveData> {
  const sources: Record<string, string> = {};
  const banners: LiveBanner[] = [];
  const tasks: Promise<void>[] = [
    ...(["hsr", "genshin"] as const).map(async (game) => {
      const key = `hoyo:${game}`;
      try {
        const path = game === "hsr" ? "starrail" : "genshin";
        banners.push(...adaptHoyo(game, (await getJson(`https://api.ennead.cc/mihoyo/${path}/calendar?lang=zh-tw`, timeoutMs)) as { banners?: HoyoBanner[] }));
        sources[key] = "ok";
      } catch (e) { sources[key] = String(e instanceof Error ? e.message : e); }
    }),
    (async () => {
      try {
        const [config, students] = await Promise.all([
          getJson("https://schaledb.com/data/config.min.json", timeoutMs),
          getJson("https://schaledb.com/data/tw/students.min.json", timeoutMs),
        ]);
        banners.push(...adaptSchale(config as SchaleConfig, students as Record<string, { Name: string; StarGrade?: number }>));
        sources.schale = "ok";
      } catch (e) { sources.schale = String(e instanceof Error ? e.message : e); }
    })(),
  ];
  await Promise.all(tasks);
  banners.sort((a, b) => a.game.localeCompare(b.game) || a.kind.localeCompare(b.kind) || a.start - b.start || a.id.localeCompare(b.id));
  return { fetchedAt: new Date().toISOString(), banners, sources };
}
