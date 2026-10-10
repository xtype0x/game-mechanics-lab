import { useEffect, useState } from "react";
import { fetchLive, type LiveData } from "./live";
import snapshot from "./snapshot.json";

export type LiveStatus = "snapshot" | "loading" | "live" | "offline";

const CACHE_KEY = "ggt.gacha-sim.live.v1";
const CACHE_MS = 30 * 60 * 1000;

function readCache(): LiveData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as LiveData;
    return Date.now() - Date.parse(d.fetchedAt) < CACHE_MS ? d : null;
  } catch { return null; }
}

/**
 * Current banners: the bundled snapshot right away (works offline), then live data from the public sources.
 * Live results are cached for 30 minutes so a busy page does not hit the sources on every visit.
 */
export function useLiveBanners(): { data: LiveData; status: LiveStatus; refresh: () => void } {
  const cached = readCache();
  const [data, setData] = useState<LiveData>(cached ?? (snapshot as LiveData));
  const [status, setStatus] = useState<LiveStatus>(cached ? "live" : "snapshot");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick === 0 && cached) return;
    let alive = true;
    setStatus((s) => (s === "live" ? s : "loading"));
    fetchLive().then((d) => {
      if (!alive) return;
      // Keep whatever we had for a source that failed this time.
      const okGames = new Set(Object.entries(d.sources).filter(([, v]) => v === "ok").map(([k]) => (k === "schale" ? "ba" : k.split(":")[1])));
      if (!okGames.size) { setStatus("offline"); return; }
      setData((prev) => {
        const merged: LiveData = { ...d, banners: [...d.banners, ...prev.banners.filter((b) => !okGames.has(b.game))] };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
        return merged;
      });
      setStatus("live");
    }).catch(() => alive && setStatus("offline"));
    return () => { alive = false; };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, status, refresh: () => setTick((t) => t + 1) };
}
