/**
 * Procedural visual effects: particles, shock rings, popups, screen flashes and vignettes. Real-time driven (keeps
 * animating during hitstop). Everything is capped and compacted in place so a long run does not allocate per frame.
 */
import { ARENA, BULLET_KINDS, CHEST_Y, HIT_X, MUZZLE, PLAYER_X } from "../game/config";
import type { Session } from "../game/session";
import type { GameEvent, Tone } from "../game/world";

const TAU = Math.PI * 2;
export const MAX_PARTICLES = 300;
const MAX_RINGS = 40;
const MAX_POPUPS = 8;

interface Particle { x: number; y: number; vx: number; vy: number; age: number; max: number; color: string; size: number; streak: boolean }
interface Ring { x: number; y: number; color: string; age: number; max: number; r: number; width: number }
interface Popup { text: string; sub: string | undefined; tone: Tone; x: number; y: number; age: number; big: boolean }

const TONE_COLOR: Record<Tone, string> = { perfect: "#ffe27a", success: "#9be7ff", fail: "#ff8a8a", info: "#e6e9ef" };

const easeOutBack = (u: number): number => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };

/** Drop elements for which `keep` is false, in place and without allocating. */
export function compact<T>(arr: T[], keep: (x: T) => boolean): void {
  let j = 0;
  for (let i = 0; i < arr.length; i++) { const x = arr[i] as T; if (keep(x)) arr[j++] = x; }
  arr.length = j;
}

export class Fx {
  particles: Particle[] = [];
  rings: Ring[] = [];
  popups: Popup[] = [];
  /** Seconds left on each screen effect. */
  shakeLeft = 0;
  shakeAmp = 0;
  white = 0;
  hurt = 0;
  heartShake = 0;
  afterimage = 0;
  muzzle = 0;
  muzzleColor = "#ffb454";
  /** Largest invulnerability seen in the current streak (for the remaining-time arc). */
  invulMax = 0;
  reduced = false;
  private trailAcc = 0;
  private vignettes = new Map<string, CanvasGradient>();

  reset(): void {
    this.particles.length = 0; this.rings.length = 0; this.popups.length = 0;
    this.shakeLeft = this.shakeAmp = this.white = this.hurt = this.heartShake = this.afterimage = this.muzzle = this.invulMax = 0;
  }

  burst(x: number, y: number, color: string, n: number, speed: number, streak = false): void {
    const room = MAX_PARTICLES - this.particles.length;
    if (room < n) this.particles.splice(0, Math.min(this.particles.length, n - room));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, max: 0.3 + Math.random() * 0.3, color, size: 2 + Math.random() * 3, streak });
    }
  }

  private ring(x: number, y: number, color: string, max: number, r: number, width = 4): void {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x, y, color, age: 0, max, r, width });
  }

  private shake(amount: number, frames: number): void {
    const k = this.reduced ? 0.25 : 1;
    this.shakeAmp = Math.max(this.shakeAmp, amount * k);
    this.shakeLeft = Math.max(this.shakeLeft, frames / 60);
  }

  push(events: GameEvent[]): void {
    const calm = this.reduced ? 0.4 : 1;
    for (const e of events) {
      switch (e.type) {
        case "fire": {
          const col = BULLET_KINDS[e.kind].color;
          this.muzzle = 0.14;
          this.muzzleColor = col;
          this.ring(MUZZLE.x, MUZZLE.y, col, 0.16, 46, 3);
          for (let i = 0; i < 5; i++) {
            if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
            this.particles.push({ x: MUZZLE.x - 6, y: MUZZLE.y + (Math.random() - 0.5) * 10, vx: -(160 + Math.random() * 240), vy: (Math.random() - 0.5) * 90, age: 0, max: 0.18 + Math.random() * 0.12, color: col, size: 2 + Math.random() * 2, streak: true });
          }
          break;
        }
        case "spark":
          this.burst(e.x, e.y, e.color, e.big ? 22 : 12, e.big ? 380 : 240, true);
          this.ring(e.x, e.y, e.color, 0.3, e.big ? 54 : 30);
          this.ring(e.x, e.y, "#ffffff", 0.14, e.big ? 40 : 22, 2);
          break;
        case "popup":
          if (this.popups.length >= MAX_POPUPS) this.popups.shift();
          this.popups.push({ text: e.text, sub: e.sub, tone: e.tone, x: e.x, y: e.y, age: 0, big: e.tone === "perfect" });
          if (e.tone === "perfect") {
            if (e.pass) {
              this.afterimage = 0.7;
              this.ring(PLAYER_X, CHEST_Y, "#6ee7ff", 0.45, 110);
            } else {
              this.white = 0.5 * calm;
              this.ring(HIT_X, CHEST_Y, "#ffd45c", 0.5, 130, 6);
              this.ring(HIT_X, CHEST_Y, "#fff4b0", 0.3, 80, 3);
              this.shake(4, 10);
            }
          }
          break;
        case "shake": this.shake(e.amount, e.frames); break;
        case "hurt": this.hurt = 0.5; this.heartShake = 0.45; break;
        case "reflect": this.ring(e.x, e.y, "#fff4b0", 0.45, 90); break;
        case "vfx": this.ring(PLAYER_X, CHEST_Y, e.name === "perfectDodge" ? "#6ee7ff" : e.name === "skill" ? "#ffe27a" : "#cfd8ee", 0.5, 100); break;
        default: break;
      }
    }
  }

  update(dt: number, s: Session): void {
    const ps = this.particles;
    for (const p of ps) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.streak) p.vy += 500 * dt; p.vx *= 0.97; }
    compact(ps, (p) => p.age < p.max);
    for (const r of this.rings) r.age += dt;
    compact(this.rings, (r) => r.age < r.max);
    for (const p of this.popups) p.age += dt;
    compact(this.popups, (p) => p.age < 1);
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    if (this.shakeLeft === 0) this.shakeAmp = 0;
    this.white = Math.max(0, this.white - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    this.heartShake = Math.max(0, this.heartShake - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.afterimage = Math.max(0, this.afterimage - dt);
    if (s.scaleFrames > 0) this.afterimage = Math.max(this.afterimage, 0.25);
    // Ambient trail embers for the kinds that smoulder, at ~30 Hz.
    this.trailAcc += dt;
    if (this.trailAcc >= 1 / 30) {
      this.trailAcc = 0;
      for (const b of s.world.bullets) {
        if (b.state === "flying" && (b.kind === "red" || b.kind === "energy" || b.kind === "feint") && ps.length < MAX_PARTICLES) {
          const kind = BULLET_KINDS[b.kind];
          ps.push({ x: b.x + 6, y: b.y + (Math.random() - 0.5) * kind.radius, vx: 30 + Math.random() * 40, vy: (Math.random() - 0.5) * 50 - (b.kind === "red" ? 30 : 0), age: 0, max: 0.25 + Math.random() * 0.2, color: kind.color, size: 1.5 + Math.random() * 2, streak: false });
        }
      }
    }
    const inv = Math.max(0, (s.world.timing.statuses.invulnerable ?? 0) - s.world.frame);
    if (inv > this.invulMax) this.invulMax = inv;
    if (inv === 0) this.invulMax = 0;
  }

  /** Camera offset for this frame (hit shake, plus a small jitter during hitstop). */
  shakeOffset(hitstop: number, out: { x: number; y: number }): void {
    out.x = out.y = 0;
    if (this.shakeLeft > 0) { out.x = (Math.random() - 0.5) * this.shakeAmp * 2; out.y = (Math.random() - 0.5) * this.shakeAmp * 2; }
    else if (hitstop > 0 && !this.reduced) { out.x = (Math.random() - 0.5) * 5; out.y = (Math.random() - 0.5) * 5; }
  }

  /** Muzzle flare, shock rings, particles, popups (world space). */
  drawWorld(ctx: CanvasRenderingContext2D, text: (s: string, x: number, y: number, size: number, color: string, align?: CanvasTextAlign) => void): void {
    if (this.muzzle > 0) {
      const k = this.muzzle / 0.14;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.fillStyle = this.muzzleColor;
      ctx.translate(MUZZLE.x - 4, MUZZLE.y);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; const r = i % 2 === 0 ? 30 * k + 8 : 8; ctx.lineTo(Math.cos(a) * r - 8, Math.sin(a) * r * 0.6); }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-4, 0, 7 * k, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    for (const r of this.rings) {
      const k = r.age / r.max;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = r.width * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.25 + 0.75 * Math.sqrt(k)), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.age / p.max;
      if (p.streak) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * 0.7);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    for (const p of this.popups) {
      const k = p.age;
      const u = Math.min(1, k / 0.2);
      const pop = (p.big ? 1.4 : 1.1) * (0.35 + 0.65 * easeOutBack(u)) * (k > 0.2 ? 1 - Math.min(0.1, (k - 0.2) * 0.2) : 1);
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.translate(p.x, p.y - k * (p.big ? 28 : 36));
      ctx.scale(pop, pop);
      text(p.text, 0, 0, p.big ? 34 : 22, TONE_COLOR[p.tone], "center");
      if (p.sub) text(p.sub, 0, 22, 16, "#fff", "center");
      ctx.restore();
    }
  }

  private vignette(ctx: CanvasRenderingContext2D, name: string, rgb: string): CanvasGradient {
    let g = this.vignettes.get(name);
    if (!g) {
      g = ctx.createRadialGradient(ARENA.w / 2, ARENA.h / 2, ARENA.h * 0.28, ARENA.w / 2, ARENA.h / 2, ARENA.w * 0.62);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(1, `rgba(${rgb},1)`);
      this.vignettes.set(name, g);
    }
    return g;
  }

  /** Full-screen layers (screen space, after the shake is undone). */
  drawScreen(ctx: CanvasRenderingContext2D, s: Session, t: number): void {
    if (s.scaleFrames > 0) {
      ctx.globalAlpha = (this.reduced ? 0.4 : 0.55 + 0.15 * Math.sin(t * 6));
      ctx.fillStyle = this.vignette(ctx, "cyan", "70,200,255");
      ctx.fillRect(0, 0, ARENA.w, ARENA.h);
      ctx.globalAlpha = 1;
    }
    if (this.hurt > 0) {
      ctx.globalAlpha = Math.min(1, this.hurt / 0.5) * (this.reduced ? 0.5 : 0.95);
      ctx.fillStyle = this.vignette(ctx, "red", "255,30,50");
      ctx.fillRect(0, 0, ARENA.w, ARENA.h);
      if (!this.reduced) { ctx.globalAlpha = (this.hurt / 0.5) * 0.12; ctx.fillStyle = "#ff2038"; ctx.fillRect(0, 0, ARENA.w, ARENA.h); }
      ctx.globalAlpha = 1;
    }
    if (this.white > 0) {
      ctx.globalAlpha = Math.min(0.5, this.white);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, ARENA.w, ARENA.h);
      ctx.globalAlpha = 1;
    }
    if (s.hitstop > 0) { ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(0, 0, ARENA.w, ARENA.h); }
  }
}
