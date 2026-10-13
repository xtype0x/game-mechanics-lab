import type { Project, UnitDef } from "@gml/core";
import { HSR_PRESET_LEVEL, hsrStatsAt } from "@gml/data-hsr/characters";

/** Local lab balance; shared engine demos and imported HSR data keep their original values. */
export const TRIAL_BALANCE_VERSION = 1;

// Match the base-stat scale of a comparable Lv80 character, while keeping each original kit.
const ALLY_BASELINES: Record<string, string> = {
  homura: "1003", // Himeko: blast / follow-up damage
  shimo: "1106", // Pela: control / debuffs
  raimei: "1103", // Serval: lightning DoT
  aoba: "1009", // Asta: speed support
  akari: "1105", // Natasha: healing
  yoru: "1002", // Dan Heng: single-target damage
  iwamori: "1104", // Gepard: defense / shields
  kasumi: "1013", // Herta: follow-up damage
};

// Short encounters for unequipped characters. These are trial values, not official enemy stats.
const ENEMY_STATS: Record<string, Record<string, number>> = {
  bat: { hp: 1800, atk: 160 },
  golem: { hp: 2800, atk: 190 },
  sentinel: { hp: 2600, atk: 190 },
  colossus: { hp: 9500, atk: 250 },
  lantern: { hp: 4500, atk: 200 },
  pillar: { hp: 900, atk: 160 },
  wisp: { hp: 1300, atk: 140 },
  weaver: { hp: 6500, atk: 200 },
};

/** Returns an independent preset so the core's shared content is never mutated. */
export function trialUnit(original: UnitDef): UnitDef {
  const unit = structuredClone(original);
  const baseline = ALLY_BASELINES[unit.id];
  if (unit.team === "ally" && baseline) {
    unit.stats = {
      ...unit.stats,
      ...hsrStatsAt(baseline, HSR_PRESET_LEVEL),
      level: HSR_PRESET_LEVEL,
      dmgBonus: 0, effectHit: 0, effectRes: 0, breakEffect: 0,
    };
    // Keep the wind follow-up character's turn rhythm, rather than Herta's ice baseline speed.
    if (unit.id === "kasumi") unit.stats.spd = 110;
  }
  const enemy = ENEMY_STATS[unit.id];
  if (unit.team === "enemy" && enemy) {
    unit.stats = { ...unit.stats, ...enemy, dmgReduction: 0 };
    unit.elementRes = { ...unit.elementRes, ...Object.fromEntries(unit.weaknesses.map((e) => [e, 0])) };
    // Phase two is a separate health bar, not a return to the old geared-character scale.
    if (unit.id === "lantern") {
      for (const phase of unit.phases ?? []) {
        phase.stats = { ...phase.stats, hp: 3500 };
        for (const element of phase.weaknesses ?? []) unit.elementRes[element] = 0;
      }
    }
  }
  return unit;
}

/** Upgrade only untouched template definitions. User edits and imported units survive intact. */
export function upgradeTrialBalance(project: Project, originals: readonly UnitDef[]): void {
  project.battle.units = project.battle.units.map((unit) => {
    // Repeated selections get ids like homura-2 and names like 焰華2.
    const baseId = unit.id.replace(/-\d+$/, "");
    const suffix = unit.id === baseId ? "" : unit.id.slice(baseId.length + 1);
    const original = originals.find((u) => u.id === baseId
      && JSON.stringify(unit) === JSON.stringify({ ...u, id: unit.id, name: `${u.name}${suffix}` }));
    if (!original) return unit;
    const tuned = trialUnit(original);
    return { ...tuned, id: unit.id, name: unit.name };
  });
}
