/** Thin IndexedDB wrapper. Every call swallows errors and reports failure, so the game works without storage. */
import type { Pack } from "./pack";

export const DB_NAME = "gml.bullet-parry.assets.v1";
const STORE = "packs";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("indexedDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("open failed"));
    req.onblocked = () => reject(new Error("blocked"));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
    });
  } finally {
    db.close();
  }
}

/** All stored packs, or null when storage is unavailable. */
export async function dbLoadPacks(): Promise<Pack[] | null> {
  try { return (await run("readonly", (s) => s.getAll())) as Pack[]; } catch { return null; }
}

export async function dbPutPack(pack: Pack): Promise<boolean> {
  try { await run("readwrite", (s) => s.put(pack)); return true; } catch { return false; }
}

export async function dbDeletePack(id: string): Promise<boolean> {
  try { await run("readwrite", (s) => s.delete(id)); return true; } catch { return false; }
}
