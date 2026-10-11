/**
 * Sprite slot registry. The renderer never draws characters or bullets directly; it asks for a slot id
 * ("player.parry", "bullet.red", "gunner.shoot", "background", "screen.gameOver") and the registry supplies an
 * implementation: an uploaded image / frame strip, or the procedural default. Game logic never touches this module.
 */
import type { Timing } from "@gml/core";
import { ARENA, BULLET_KINDS, type BulletKindId } from "../game/config";
import { proceduralFor } from "./procedural";

/** Extra context for a draw call; everything optional. */
export interface SlotParams {
  color?: string;
  label?: string;
  /** Pose phase and progress (0..1) for player/gunner animations. */
  phase?: string;
  progress?: number;
  /** Strength of an effect overlay (e.g. gunner muzzle glow 0..1). */
  level?: number;
  alpha?: number;
  /** Face right instead of left (reflected bullets). */
  flip?: boolean;
  /** prefers-reduced-motion: freeze ambient animation (background scroll, twinkle). */
  reduced?: boolean;
}

/** Draws centred on (x, y) inside a w x h box. `t` is real seconds (for looping animation). */
export type DrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, p: SlotParams) => void;

/** Placement of uploaded art: `scale` multiplies the slot box, (dx, dy) shifts the anchor in arena pixels. */
export interface ArtPlacement { scale?: number; dx?: number; dy?: number }

export type SlotArt =
  | { kind: "draw"; draw: DrawFn }
  | ({ kind: "image"; image: CanvasImageSource; width: number; height: number } & ArtPlacement)
  /** Horizontal frame strip: `frames` equal cells of `frameW` x `frameH`, played at `fps`. */
  | ({ kind: "strip"; image: CanvasImageSource; frames: number; frameW: number; frameH: number; fps: number } & ArtPlacement);

export class SlotRegistry {
  private readonly art = new Map<string, SlotArt>();
  set(slotId: string, art: SlotArt): void { this.art.set(slotId, art); }
  delete(slotId: string): void { this.art.delete(slotId); }
  has(slotId: string): boolean { return this.art.has(slotId); }
  get(slotId: string): SlotArt | undefined { return this.art.get(slotId); }
  clear(): void { this.art.clear(); }
}

/** Shared instance (the asset store owns its own registry; this one serves tests and simple callers). */
export const defaultRegistry = new SlotRegistry();

/** How uploaded art is fitted into a slot box. */
export type FitMode = "contain" | "cover" | "stretch";

export function fitOf(slotId: string): FitMode {
  if (slotId === "background") return "stretch";
  if (slotId.startsWith("screen.")) return "cover";
  return "contain";
}

/** Draw-box size of a slot (arena pixels) as the renderer uses it. */
export function slotBox(slotId: string): { w: number; h: number } {
  if (slotId.startsWith("player.")) return { w: 96, h: 136 };
  if (slotId.startsWith("gunner.")) return { w: 120, h: 160 };
  if (slotId.startsWith("bullet.")) {
    const d = (BULLET_KINDS[slotId.slice(7) as BulletKindId]?.radius ?? 12) * 2.6;
    return { w: d, h: d };
  }
  if (slotId === "background") return { w: ARENA.w + 20, h: ARENA.h + 20 };
  return { w: ARENA.w, h: ARENA.h };
}

/** Lookup order: the slot itself, then its generic fallback. */
export function slotFallbacks(slotId: string): string[] {
  if (slotId.startsWith("player.") && !["player.idle", "player.hurt", "player.skill", "player.action"].includes(slotId)) {
    return [slotId, "player.action"];
  }
  return [slotId];
}

function drawArt(
  ctx: CanvasRenderingContext2D, art: Exclude<SlotArt, { kind: "draw" }>, fit: FitMode,
  x: number, y: number, w: number, h: number, t: number,
): void {
  const s = art.scale ?? 1;
  const bw = w * s;
  const bh = h * s;
  const cx = x + (art.dx ?? 0);
  const cy = y + (art.dy ?? 0);
  const sw = art.kind === "image" ? art.width : art.frameW;
  const sh = art.kind === "image" ? art.height : art.frameH;
  if (sw <= 0 || sh <= 0) return;
  let dw = bw;
  let dh = bh;
  if (fit !== "stretch") {
    const k = fit === "cover" ? Math.max(bw / sw, bh / sh) : Math.min(bw / sw, bh / sh);
    dw = sw * k;
    dh = sh * k;
  }
  if (art.kind === "image") ctx.drawImage(art.image, cx - dw / 2, cy - dh / 2, dw, dh);
  else {
    const i = Math.floor(t * art.fps) % art.frames;
    ctx.drawImage(art.image, i * art.frameW, 0, art.frameW, art.frameH, cx - dw / 2, cy - dh / 2, dw, dh);
  }
}

export function drawSlot(
  ctx: CanvasRenderingContext2D, slotId: string, x: number, y: number, w: number, h: number, t: number,
  params: SlotParams = {}, registry: SlotRegistry = defaultRegistry,
): void {
  for (const id of slotFallbacks(slotId)) {
    const art = registry.get(id);
    if (!art) continue;
    ctx.save();
    if (params.alpha !== undefined) ctx.globalAlpha *= params.alpha;
    if (params.flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
    if (art.kind === "draw") art.draw(ctx, x, y, w, h, t, params);
    else drawArt(ctx, art, fitOf(id), x, y, w, h, t);
    ctx.restore();
    return;
  }
  ctx.save();
  if (params.alpha !== undefined) ctx.globalAlpha *= params.alpha;
  if (params.flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
  proceduralFor(slotId)(ctx, x, y, w, h, t, params);
  ctx.restore();
}

export interface SlotInfo { id: string; label: string; group: "player" | "gunner" | "bullet" | "scene" }

/** Every image slot the game can draw for a given timing config (for the asset manager). */
export function listSlots(config: Timing.TimingConfig): SlotInfo[] {
  const out: SlotInfo[] = [
    { id: "player.idle", label: "玩家・待機", group: "player" },
    { id: "player.hurt", label: "玩家・受傷", group: "player" },
    { id: "player.skill", label: "玩家・技能", group: "player" },
    { id: "player.action", label: "玩家・通用動作", group: "player" },
  ];
  for (const i of config.interactions) if (i.id !== "skill") out.push({ id: "player." + i.id, label: "玩家・" + i.name, group: "player" });
  out.push(
    { id: "gunner.idle", label: "槍手・待機", group: "gunner" },
    { id: "gunner.shoot", label: "槍手・開火", group: "gunner" },
  );
  for (const k of Object.values(BULLET_KINDS)) out.push({ id: "bullet." + k.id, label: k.name, group: "bullet" });
  out.push(
    { id: "background", label: "背景", group: "scene" },
    { id: "screen.title", label: "標題畫面圖片", group: "scene" },
    { id: "screen.gameOver", label: "遊戲結束畫面圖片", group: "scene" },
  );
  return out;
}
