import type { LoadoutStore } from "@gml/data-hsr/equipment";

// Loadouts chosen in the lab, kept in this browser. The key keeps its old name so visitors' saves survive.
const STORE_KEY = "ggt.site.battle.loadouts.v1";

export function loadStore(): LoadoutStore {
  try {
    const raw0 = localStorage.getItem(STORE_KEY);
    const x = raw0 ? (JSON.parse(raw0) as unknown) : null;
    if (x && typeof x === "object") return x as LoadoutStore;
  } catch { /* storage unavailable or corrupt */ }
  return {};
}
export function saveStore(s: LoadoutStore): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
export function clearStore(): void {
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
}
