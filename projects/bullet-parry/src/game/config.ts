/** Static tuning for the bullet-parry sim: arena geometry, bullet kinds, director curve. No DOM. */
import { text } from "../i18n";

export const FPS = 60;
/** Logical arena size; the renderer scales this to the canvas. */
export const ARENA = { w: 960, h: 540 } as const;
export const GROUND_Y = 440;
export const CEIL_Y = 70;
export const PLAYER_X = 150;
/** A bullet whose centre reaches this x hits the player (the attack's impact frame). */
export const HIT_X = 196;
export const GUNNER_X = 860;
export const MUZZLE = { x: 806, y: 366 } as const;
/** Player chest height: where aimed bullets arrive. */
export const CHEST_Y = GROUND_Y - 62;

export type BulletKindId = "normal" | "red" | "bounce" | "low" | "energy" | "feint";
export type Motion = "straight" | "bounce" | "variable";

export interface BulletKind {
  id: BulletKindId;
  color: string;
  /** Pixels per world frame at difficulty 1 and no ramp. */
  speed: number;
  radius: number;
  tags: string[];
  damage: number;
  motion: Motion;
  /** Frames the muzzle glows before this kind fires. */
  telegraph: number;
}

/** Bullet kind name in the current language (read at call time). */
export const bulletKindName = (id: string): string => text().bulletKinds[id] ?? id;

export const BULLET_KINDS: Record<BulletKindId, BulletKind> = {
  normal: { id: "normal", color: "#ffb454", speed: 6.6, radius: 9, tags: ["bullet"], damage: 1, motion: "straight", telegraph: 36 },
  red: { id: "red", color: "#ff4d5e", speed: 6.2, radius: 11, tags: ["bullet", "unblockable"], damage: 1, motion: "straight", telegraph: 46 },
  bounce: { id: "bounce", color: "#7bdcff", speed: 5.6, radius: 9, tags: ["bullet"], damage: 1, motion: "bounce", telegraph: 34 },
  low: { id: "low", color: "#c78bff", speed: 7.2, radius: 8, tags: ["bullet", "sweep"], damage: 1, motion: "straight", telegraph: 30 },
  energy: { id: "energy", color: "#5eea9a", speed: 4.6, radius: 15, tags: ["energy"], damage: 1, motion: "straight", telegraph: 38 },
  feint: { id: "feint", color: "#f4f06a", speed: 6, radius: 9, tags: ["bullet"], damage: 1, motion: "variable", telegraph: 34 },
};

/** Feint speed profile by flight progress 0..1: cruise, crawl, then dash. */
export function feintProfile(p: number): number {
  if (p < 0.3) return 1.1;
  if (p < 0.62) return 0.32;
  return 2.1;
}

/** One place for the difficulty curve. Intervals are frames between patterns (measured gun-idle to next telegraph). */
export const DIRECTOR = {
  firstDelay: 120,
  startInterval: 190,
  minInterval: 62,
  /** Absolute floor for the gap between patterns at any difficulty. */
  floorInterval: 22,
  /** Interval multiplier per 30 s of world time. */
  intervalRamp: 0.88,
  /** Bullet speed multiplier = 1 + speedRamp × (seconds / 30), capped. */
  speedRamp: 0.045,
  maxSpeedMult: 1.4,
} as const;

/** Opening: bullets start slower and ramp to full speed over the first 30 s. */
export const OPENING = { seconds: 30, speedStart: 0.82 } as const;

/** Practice mode: slower bullets and wider gaps; lives never run out (see world.ts). */
export const PRACTICE = { speedMult: 0.7, gapMult: 0.8 } as const;

export const SCORE = { perSecond: 10, perfect: 50 } as const;
