/** Procedural placeholder art for every sprite slot (see slots.ts). Pure canvas calls, no game imports beyond config. */
import { BULLET_KINDS, type BulletKindId } from "../game/config";
import type { DrawFn, SlotParams } from "./slots";

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 1): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---- player ---------------------------------------------------------------------------------------------------

function figure(ctx: Ctx, x: number, y: number, w: number, h: number, o: { lean: number; body: string; scarf: string; crouch?: number; shade?: string }): void {
  const feet = y + h / 2;
  const crouch = o.crouch ?? 0;
  const hipY = feet - h * 0.34 + crouch;
  const shoulderY = feet - h * 0.7 + crouch;
  ctx.save();
  ctx.translate(x, feet);
  ctx.rotate(o.lean);
  ctx.translate(-x, -feet);
  // legs
  ctx.fillStyle = o.shade ?? "#27324d";
  roundRect(ctx, x - w * 0.22, hipY, w * 0.18, feet - hipY, 4);
  ctx.fill();
  roundRect(ctx, x + w * 0.04, hipY, w * 0.18, feet - hipY, 4);
  ctx.fill();
  // torso
  ctx.fillStyle = o.body;
  roundRect(ctx, x - w * 0.27, shoulderY, w * 0.54, hipY - shoulderY + 6, 8);
  ctx.fill();
  // head
  ctx.fillStyle = "#f2d3b3";
  ctx.beginPath();
  ctx.arc(x + w * 0.02, shoulderY - h * 0.1, h * 0.095, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#1c2236";
  ctx.beginPath();
  ctx.arc(x + w * 0.02, shoulderY - h * 0.125, h * 0.1, Math.PI, TAU);
  ctx.fill();
  // scarf
  ctx.fillStyle = o.scarf;
  roundRect(ctx, x - w * 0.34, shoulderY - 2, w * 0.4, 7, 3);
  ctx.fill();
  ctx.restore();
}

function swordArc(ctx: Ctx, x: number, y: number, h: number, a: number, color: string, alpha: number): void {
  ctx.save();
  ctx.translate(x + 8, y - h * 0.05);
  ctx.strokeStyle = color;
  ctx.globalAlpha *= alpha;
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, h * 0.42, -a, a * 0.55);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, 0, h * 0.42, -a * 0.8, a * 0.4);
  ctx.stroke();
  ctx.restore();
}

const playerIdle: DrawFn = (ctx, x, y, w, h, t) => {
  const bob = Math.sin(t * 3.2) * 1.6;
  figure(ctx, x, y + bob * 0.5, w, h, { lean: 0, body: "#4f7be8", scarf: "#ff6b81", crouch: bob });
  ctx.strokeStyle = "#cfd8ee";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.2, y + h * 0.02 + bob);
  ctx.lineTo(x + w * 0.55, y - h * 0.16 + bob);
  ctx.stroke();
};

const playerHurt: DrawFn = (ctx, x, y, w, h, t) => {
  const shake = Math.sin(t * 60) * 2;
  figure(ctx, x + shake, y, w, h, { lean: -0.22, body: "#c75a64", scarf: "#ffd1d6", crouch: 6 });
};

const playerSkill: DrawFn = (ctx, x, y, w, h, t, p) => {
  glow(ctx, x, y, h * 0.9, "rgba(255,226,120,0.9)", 0.8);
  figure(ctx, x, y, w, h, { lean: 0.04, body: "#ffd45c", scarf: "#fff", crouch: -2 });
  ctx.strokeStyle = "rgba(255,240,170,0.9)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x, y, h * (0.55 + i * 0.16 + ((p.progress ?? 0) + t) % 0.2), 0, TAU);
    ctx.globalAlpha *= 0.55;
    ctx.stroke();
  }
};

const playerParry: DrawFn = (ctx, x, y, w, h, t, p) => {
  const prog = p.progress ?? 0;
  const startup = p.phase === "startup";
  const active = p.phase === "active";
  figure(ctx, x, y, w, h, { lean: startup ? -0.1 : 0.12, body: "#4f7be8", scarf: "#ff6b81" });
  const color = p.color ?? "#ffe08a";
  if (startup) swordArc(ctx, x, y, h, 0.5 + prog, color, 0.5);
  else if (active) {
    swordArc(ctx, x, y, h, 1.25, color, 0.9);
    glow(ctx, x + w * 0.6, y - h * 0.05, h * 0.5, color, 0.35 + 0.25 * Math.sin(t * 40));
  } else swordArc(ctx, x, y, h, 1.1 - prog, color, 0.4 * (1 - prog));
};

const playerDodge: DrawFn = (ctx, x, y, w, h, _t, p) => {
  const color = p.color ?? "#6ee7ff";
  const active = p.phase === "active";
  ctx.save();
  ctx.globalAlpha *= 0.28;
  figure(ctx, x - 26, y, w, h, { lean: -0.18, body: color, scarf: color });
  ctx.globalAlpha *= 1.6;
  figure(ctx, x - 12, y, w, h, { lean: -0.2, body: color, scarf: color });
  ctx.restore();
  ctx.save();
  ctx.globalAlpha *= active ? 1 : 0.7;
  figure(ctx, x, y + 6, w, h, { lean: -0.32, body: "#4f7be8", scarf: "#ff6b81", crouch: 14 });
  ctx.restore();
};

/** Generic action: the idle figure tinted by the interaction colour with its name above. */
const playerAction: DrawFn = (ctx, x, y, w, h, t, p) => {
  const color = p.color ?? "#c4b5fd";
  figure(ctx, x, y, w, h, { lean: p.phase === "active" ? 0.1 : -0.05, body: "#4f7be8", scarf: color });
  if (p.phase === "active" || p.phase === "startup") {
    glow(ctx, x + 4, y - h * 0.05, h * 0.6, color, p.phase === "active" ? 0.55 : 0.25);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, h * (0.5 + 0.04 * Math.sin(t * 30)), 0, TAU);
    ctx.stroke();
  }
  if (p.label) {
    ctx.fillStyle = color;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.label, x, y - h * 0.62);
  }
};

// ---- gunner ---------------------------------------------------------------------------------------------------

function gunnerBody(ctx: Ctx, x: number, y: number, w: number, h: number, o: { recoil: number; tilt: number; gunUp?: number }): void {
  const feet = y + h / 2;
  ctx.save();
  ctx.translate(x, feet);
  ctx.rotate(o.tilt);
  ctx.translate(-x, -feet);
  ctx.fillStyle = "#2a2233";
  roundRect(ctx, x - w * 0.2, feet - h * 0.34, w * 0.15, h * 0.34, 4);
  ctx.fill();
  roundRect(ctx, x + w * 0.02, feet - h * 0.34, w * 0.15, h * 0.34, 4);
  ctx.fill();
  ctx.fillStyle = "#5b2f48";
  roundRect(ctx, x - w * 0.28, feet - h * 0.72, w * 0.56, h * 0.42, 10);
  ctx.fill();
  ctx.fillStyle = "#d9b99b";
  ctx.beginPath();
  ctx.arc(x, feet - h * 0.8, h * 0.085, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#1a1620";
  ctx.beginPath();
  ctx.ellipse(x, feet - h * 0.86, h * 0.14, h * 0.035, 0, 0, TAU);
  ctx.fill();
  roundRect(ctx, x - h * 0.08, feet - h * 0.95, h * 0.16, h * 0.1, 4);
  ctx.fill();
  // arm + gun pointing left
  const ay = feet - h * 0.58 - (o.gunUp ?? 0);
  ctx.fillStyle = "#3a2b46";
  roundRect(ctx, x - w * 0.62 + o.recoil, ay, w * 0.42, 10, 4);
  ctx.fill();
  ctx.fillStyle = "#8d93a6";
  roundRect(ctx, x - w * 0.82 + o.recoil, ay - 4, w * 0.32, 14, 3);
  ctx.fill();
  ctx.restore();
}

const gunnerIdle: DrawFn = (ctx, x, y, w, h, t) => gunnerBody(ctx, x, y + Math.sin(t * 2.4) * 1.2, w, h, { recoil: 0, tilt: 0 });
const gunnerShoot: DrawFn = (ctx, x, y, w, h) => {
  gunnerBody(ctx, x, y, w, h, { recoil: 12, tilt: 0.05 });
  glow(ctx, x - w * 0.86, y - h * 0.08, 38, "rgba(255,230,160,1)", 0.9);
};

// ---- bullets --------------------------------------------------------------------------------------------------

function bulletDraw(kind: BulletKindId): DrawFn {
  const def = BULLET_KINDS[kind];
  return (ctx, x, y, w, h, t, p) => {
    const r = Math.min(w, h) / 2;
    const color = p.color ?? def.color;
    glow(ctx, x, y, r * 2.6, color, 0.55);
    ctx.fillStyle = color;
    switch (kind) {
      case "red": {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * TAU) / 8 + t * 4;
          const rr = i % 2 === 0 ? r * 1.35 : r * 0.7;
          ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x, y, r * 0.38, 0, TAU);
        ctx.fill();
        break;
      }
      case "low": {
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.8, r * 0.75, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#f4e6ff";
        ctx.beginPath();
        ctx.ellipse(x - r * 0.3, y, r * 0.9, r * 0.28, 0, 0, TAU);
        ctx.fill();
        break;
      }
      case "energy": {
        ctx.beginPath();
        ctx.arc(x, y, r * (1 + 0.08 * Math.sin(t * 12)), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "#d8ffe9";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.35, t * 3, t * 3 + 4.4);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x, y, r * 0.4, 0, TAU);
        ctx.fill();
        break;
      }
      case "bounce": {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "#e8fbff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, TAU);
        ctx.stroke();
        break;
      }
      case "feint": {
        ctx.beginPath();
        ctx.moveTo(x - r * 1.3, y);
        ctx.lineTo(x, y - r);
        ctx.lineTo(x + r * 1.1, y);
        ctx.lineTo(x, y + r);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#fffbd0";
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      default: {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#fff6e0";
        ctx.beginPath();
        ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.4, 0, TAU);
        ctx.fill();
      }
    }
  };
}

// ---- background -----------------------------------------------------------------------------------------------

const STARS = Array.from({ length: 46 }, (_, i) => ({ x: ((i * 97) % 100) / 100, y: ((i * 53) % 52) / 100, ph: i * 1.7, r: 0.8 + (i % 3) * 0.5 }));

const PERIODS = new Map<number, number>();
/** Total width of the 28 buildings of a skyline layer, so the scroll loops seamlessly. */
function skylinePeriod(seed: number): number {
  let n = PERIODS.get(seed);
  if (n === undefined) {
    n = 0;
    for (let i = 0; i < 28; i++) { const k = i + seed; n += 46 + ((k * 37) % 5) * 14 + 5 + (k % 3) * 4; }
    PERIODS.set(seed, n);
  }
  return n;
}

/** Skyline layer: deterministic buildings scrolling left at `speed` px/s, optional lit windows. */
function skyline(ctx: Ctx, left: number, w: number, baseY: number, seed: number, speed: number, t: number, fill: string, lit: boolean): void {
  const period = skylinePeriod(seed);
  let px = -((t * speed) % period);
  ctx.fillStyle = fill;
  for (let i = 0; px < w + 120; i++) {
    const k = (i % 28) + seed;
    const bw = 46 + ((k * 37) % 5) * 14;
    const bh = 56 + ((k * 53) % 7) * 17;
    ctx.fillRect(left + px, baseY - bh, bw, bh + 60);
    px += bw + 5 + (k % 3) * 4;
  }
  if (!lit) return;
  ctx.fillStyle = "rgba(255,214,130,0.5)";
  ctx.beginPath();
  px = -((t * speed) % period);
  for (let i = 0; px < w + 120; i++) {
    const k = (i % 28) + seed;
    const bw = 46 + ((k * 37) % 5) * 14;
    const bh = 56 + ((k * 53) % 7) * 17;
    for (let wy = 10; wy < bh - 6; wy += 16) {
      for (let wx = 8; wx < bw - 8; wx += 14) if (((k * 7 + wy * 3 + wx) % 5) < 2) ctx.rect(left + px + wx, baseY - bh + wy, 5, 7);
    }
    px += bw + 5 + (k % 3) * 4;
  }
  ctx.fill();
}

const background: DrawFn = (ctx, x, y, w, h, t, p) => {
  const left = x - w / 2;
  const top = y - h / 2;
  const tt = p.reduced ? 0 : t;
  const sky = ctx.createLinearGradient(0, top, 0, top + h);
  sky.addColorStop(0, "#0e1330");
  sky.addColorStop(0.65, "#2a2255");
  sky.addColorStop(1, "#4a2f62");
  ctx.fillStyle = sky;
  ctx.fillRect(left, top, w, h);
  // twinkling stars
  ctx.fillStyle = "#fff";
  for (const s of STARS) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(tt * 1.4 + s.ph);
    ctx.fillRect(left + s.x * w, top + s.y * h, s.r, s.r);
  }
  ctx.globalAlpha = 1;
  glow(ctx, left + w * 0.72, top + h * 0.2, 120, "rgba(255,240,200,0.85)", 0.55);
  ctx.fillStyle = "#f3ecd0";
  ctx.beginPath();
  ctx.arc(left + w * 0.72, top + h * 0.2, 26, 0, TAU);
  ctx.fill();
  // drifting clouds (slowest layer)
  ctx.fillStyle = "rgba(190,170,230,0.1)";
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 380 - tt * 7) % (w + 260) + (w + 260)) % (w + 260) - 130;
    ctx.beginPath();
    ctx.ellipse(left + cx, top + h * (0.2 + (i % 2) * 0.12), 110, 14, 0, 0, TAU);
    ctx.fill();
  }
  // parallax skylines: far (slow, dim) -> mid (lit windows) -> near silhouette
  skyline(ctx, left, w, top + h * 0.8, 3, 3, tt, "#1d1d46", false);
  skyline(ctx, left, w, top + h * 0.83, 11, 8, tt, "#171738", true);
  skyline(ctx, left, w, top + h * 0.86, 19, 17, tt, "#121228", false);
  ctx.fillStyle = "#171527";
  ctx.fillRect(left, top + h * 0.815, w, h * 0.19);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(left, top + h * 0.815, w, 3);
  // ground stripes slide with the near layer
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let gx = -((tt * 60) % 80); gx < w; gx += 80) ctx.fillRect(left + gx, top + h * 0.9, 36, 3);
};

// ---- lookup ---------------------------------------------------------------------------------------------------

const TABLE: Record<string, DrawFn> = {
  "player.idle": playerIdle,
  "player.hurt": playerHurt,
  "player.skill": playerSkill,
  "player.parry": playerParry,
  "player.dodge": playerDodge,
  "player.action": playerAction,
  "gunner.idle": gunnerIdle,
  "gunner.shoot": gunnerShoot,
  background,
};
for (const id of Object.keys(BULLET_KINDS) as BulletKindId[]) TABLE["bullet." + id] = bulletDraw(id);

export function proceduralFor(slotId: string): DrawFn {
  const hit = TABLE[slotId];
  if (hit) return hit;
  if (slotId.startsWith("player.")) return playerAction;
  if (slotId.startsWith("bullet.")) return bulletDraw("normal");
  if (slotId.startsWith("gunner.")) return gunnerIdle;
  return () => undefined;
}

export type { SlotParams };
