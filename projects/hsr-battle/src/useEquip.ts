import type { Project } from "@gml/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearStore, compileProject, loadStore, saveStore, type LoadoutSel, type LoadoutStore } from "./equip";

/** Per-unit loadouts (kept apart from the project) and the project with every loadout compiled in. */
export function useEquip(project: Project) {
  const [store, setStore] = useState<LoadoutStore>(loadStore);
  useEffect(() => { saveStore(store); }, [store]);
  const compiled = useMemo(() => compileProject(project, store), [project, store]);
  const setSel = useCallback((unitId: string, sel: LoadoutSel) => setStore((s) => ({ ...s, [unitId]: sel })), []);
  const resetAll = useCallback(() => { clearStore(); setStore({}); }, []);
  return { store, compiled, setSel, resetAll };
}
export type EquipApi = ReturnType<typeof useEquip>;
