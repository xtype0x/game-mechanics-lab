// Visual-cue constants of the stick-figure scene. The reaction analysis uses the same numbers, so what the
// visitor sees and what the analysis assumes stay in step.

/** Frames the attacker needs to close in before a melee hit (the dash is the only cue when there is no tell). */
export const DASH = 6;
/** Frames a projectile is visible before impact. */
export const TRAVEL = 18;
export const isRanged = (tags: string[]): boolean => tags.includes("bullet") || tags.includes("energy");
