/** Sound slots and the pure mapping from game events to sound ids (no audio APIs here). */
import type { GameEvent } from "../game/world";

/** Sound slots; their labels are in the dictionary (assets.soundLabels, by id). */
export const SOUND_SLOTS = [
  { id: "sfx.hit" }, { id: "sfx.parry" }, { id: "sfx.perfect" }, { id: "sfx.dodge" }, { id: "sfx.skill" }, { id: "sfx.fire" }, { id: "sfx.gameOver" },
] as const;

export type SoundId = (typeof SOUND_SLOTS)[number]["id"];

export const SOUND_IDS: readonly string[] = SOUND_SLOTS.map((s) => s.id);

/** Minimum gap between two plays of the same sound, in ms. */
export const SOUND_THROTTLE_MS: Record<SoundId, number> = {
  "sfx.hit": 80, "sfx.parry": 50, "sfx.perfect": 80, "sfx.dodge": 50, "sfx.skill": 120, "sfx.fire": 50, "sfx.gameOver": 500,
};

/**
 * Sounds for one batch of events, in order, without duplicates. Outcome kind comes from the popup tone:
 * perfect -> sfx.perfect; success -> sfx.dodge when the bullet passes through, else sfx.parry.
 */
export function soundsForEvents(events: readonly GameEvent[]): SoundId[] {
  const out: SoundId[] = [];
  const add = (id: SoundId) => { if (!out.includes(id)) out.push(id); };
  for (const e of events) {
    switch (e.type) {
      case "fire": add("sfx.fire"); break;
      case "hurt": add("sfx.hit"); break;
      case "popup":
        if (e.tone === "perfect") add("sfx.perfect");
        else if (e.tone === "success") add(e.pass ? "sfx.dodge" : "sfx.parry");
        break;
      case "accept": if (e.interaction === "skill") add("sfx.skill"); break;
      case "vfx": if (e.name === "skill") add("sfx.skill"); break;
      case "defeated": add("sfx.gameOver"); break;
      default: break;
    }
  }
  return out;
}
