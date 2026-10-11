import { PROJECT_TEMPLATES, loadProject, type Project, type StatusDef, type UnitDef } from "@ggt/core";
import type { Preset } from "./presets";

/** Engine limit for the ally line-up (validateBattle: 1 to 4). */
export const MAX_ALLIES = 4;
const STORAGE_KEY = "ggt.site.battle.v1";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Original template content: the boss-mechanics template holds every sample ally, enemy and status. */
export function freshProject(): Project {
  const t = PROJECT_TEMPLATES.find((x) => x.id === "boss-mechanics") ?? PROJECT_TEMPLATES[0]!;
  const p = t.create("星穹鐵道戰鬥研究室");
  const normal = p.battle.encounters.find((e) => e.id === "normal");
  p.battle.encounter = { allies: ["homura", "shimo", "raimei", "akari"], enemies: [...(normal?.enemies ?? p.battle.encounter.enemies)] };
  return p;
}

/** Drop line-up ids the project no longer has, so a stale save never breaks the page. */
function repaired(p: Project): Project {
  const ids = (team: "ally" | "enemy") => new Set(p.battle.units.filter((u) => u.team === team).map((u) => u.id));
  const allies = ids("ally");
  const enemies = ids("enemy");
  const enc = p.battle.encounter;
  enc.allies = enc.allies.filter((id) => allies.has(id)).slice(0, MAX_ALLIES);
  enc.enemies = enc.enemies.filter((id) => enemies.has(id));
  if (!enc.allies.length) enc.allies = [...allies].slice(0, 1);
  if (!enc.enemies.length) enc.enemies = [...enemies].slice(0, 1);
  return p;
}

export function loadSaved(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return repaired(loadProject(JSON.parse(raw)));
  } catch {
    /* storage unavailable or corrupt: start from the template */
  }
  return freshProject();
}

export function saveProject(p: Project): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function clearSaved() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * Put a preset's unit into a team slot (mutates the draft). The unit keeps its id unless another slot already
 * uses it; an existing project unit with that id is replaced. Statuses are merged by id.
 * Returns the id now in the slot, or null when nothing was applied.
 */
export function applyPreset(draft: Project, slotUnitId: string, preset: Preset): string | null {
  if (!preset.available || !preset.apply) return null;
  const team = draft.battle.encounter.allies;
  const slot = team.indexOf(slotUnitId);
  if (slot < 0) return null;
  const unit: UnitDef = clone(preset.apply);
  unit.team = "ally";
  const others = team.filter((_, i) => i !== slot);
  const baseId = unit.id;
  for (let n = 2; others.includes(unit.id); n++) { unit.id = `${baseId}-${n}`; unit.name = `${preset.apply.name}${n}`; }
  for (const s of clone(preset.statuses ?? []) as StatusDef[]) {
    const at = draft.battle.statuses.findIndex((x) => x.id === s.id);
    if (at >= 0) draft.battle.statuses[at] = s; else draft.battle.statuses.push(s);
  }
  const at = draft.battle.units.findIndex((u) => u.id === unit.id);
  if (at >= 0) draft.battle.units[at] = unit; else draft.battle.units.push(unit);
  team[slot] = unit.id;
  return unit.id;
}
