import type { DepNode } from "@gml/core";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

/** What an editor should select when opened through a link. `seq` changes on every jump. */
export interface Focus {
  toolId: string;
  seq: number;
  unitId?: string;
  skillId?: string;
  passiveId?: string;
  statusId?: string;
  encounterId?: string;
  tab?: "stats" | "skills" | "passives" | "phases";
}

interface Nav {
  focus: Focus | null;
  go: (toolId: string, focus?: Omit<Focus, "toolId" | "seq">) => void;
}

const NavCtx = createContext<Nav>({ focus: null, go: () => {} });
export const NavProvider = ({ value, children }: { value: Nav; children: ReactNode }) => <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
export const useNav = () => useContext(NavCtx);

/** Runs `apply` once for each new focus aimed at one of `toolIds` (including the one that opened the tool). */
export function useFocus(toolIds: string[], apply: (f: Focus) => void) {
  const { focus } = useNav();
  const seen = useRef(-1);
  useEffect(() => {
    if (!focus || seen.current === focus.seq || !toolIds.includes(focus.toolId)) return;
    seen.current = focus.seq;
    apply(focus);
  }); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Where a dependency node is edited. */
export function linkFor(node: DepNode): { toolId: string; focus: Omit<Focus, "toolId" | "seq"> } {
  switch (node.kind) {
    case "unit": return { toolId: "character.stats", focus: { unitId: node.id, tab: "stats" } };
    case "skill": return { toolId: "character.skills", focus: { unitId: node.unitId, skillId: node.id, tab: "skills" } };
    case "passive": return { toolId: "character.skills", focus: { unitId: node.unitId, passiveId: node.id, tab: "passives" } };
    case "status": return { toolId: "status.effects", focus: { statusId: node.id } };
    case "encounter": return { toolId: "enemy.encounter", focus: { encounterId: node.id || undefined } };
  }
}

export function GoLink({ node, children, title }: { node: DepNode; children: ReactNode; title?: string }) {
  const { go } = useNav();
  const l = linkFor(node);
  return <button type="button" className="link go-link" title={title} onClick={() => go(l.toolId, l.focus)}>{children}</button>;
}
