import type { Project } from "@gml/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { compileProject, type LoadoutSel, type LoadoutStore } from "@gml/data-hsr/equipment";
import { clearStore, loadStore, saveStore } from "./loadoutStorage";

/** Per-unit loadouts (kept apart from the project) and the project with every loadout compiled in. */
export function useEquip(project: Project) {
  const [store, setStore] = useState<LoadoutStore>(loadStore);
  useEffect(() => { saveStore(store); }, [store]);
  const compiled = useMemo(() => compileProject(project, store), [project, store]);
  const setSel = useCallback((unitId: string, sel: LoadoutSel) => setStore((s) => ({ ...s, [unitId]: sel })), []);
  const resetAll = useCallback(() => { clearStore(); setStore({}); }, []);
  const resetUnits = useCallback((ids: string[]) => setStore((s) => {
    const next = { ...s };
    for (const id of ids) delete next[id];
    return next;
  }), []);
  return { store, compiled, setSel, resetAll, resetUnits };
}
export type EquipApi = ReturnType<typeof useEquip>;
