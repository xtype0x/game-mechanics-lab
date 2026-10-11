/**
 * Tiny canvas particle system for hit effects. Purely cosmetic: never touches battle state.
 */
export type BurstKind = "fire" | "ice" | "thunder" | "wind" | "light" | "shadow" | "heal" | "shatter" | "hit" | "ult";

interface P {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  size: number; color: string; shape: "dot" | "shard" | "spark" | "plus" | "ring" | "bolt"; rot: number; vr: number; gravity: number;
}

const COLORS: Record<BurstKind, string[]> = {
  fire: ["#ffcf6b", "#ff8a3d", "#ff4b2b"],
  ice: ["#ffffff", "#c9f1ff", "#6cc6ff"],
  thunder: ["#ffffff", "#e2c6ff", "#b57bff"],
  wind: ["#ffffff", "#b9ffd6", "#4fd18b"],
  light: ["#ffffff", "#fff4b0", "#ffd447"],
  shadow: ["#c3a9ff", "#7d5ad6", "#3a2466"],
  heal: ["#d3ffe1", "#69db7c", "#2f9e44"],
  shatter: ["#ffffff", "#ffe8a3", "#ffb347"],
  hit: ["#ffffff", "#fff2c6"],
  ult: ["#ffffff", "#ffe08a", "#ff9a3d"],
};

export class Particles {
  private ps: P[] = [];
  private raf = 0;
  private ctx: CanvasRenderingContext2D | null;
  speed = 1;
  enabled = true;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
  }

  burst(kind: BurstKind, x: number, y: number, power = 1) {
    if (!this.enabled || !this.ctx) return;
    const colors = COLORS[kind];
    const pick = () => colors[Math.floor(Math.random() * colors.length)]!;
    const n = Math.round((kind === "ult" ? 60 : kind === "shatter" ? 36 : 18) * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 4.5) * (kind === "shatter" || kind === "ult" ? 1.6 : 1);
      const p: P = {
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 30 + Math.random() * 26,
        size: 3 + Math.random() * 5, color: pick(), shape: "dot", rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, gravity: 0,
      };
      switch (kind) {
        case "fire": p.vy = -Math.abs(p.vy) - 1.5; p.gravity = -0.04; p.vx *= 0.6; break;
        case "ice": p.shape = "shard"; p.size += 3; break;
        case "thunder": p.shape = i % 3 === 0 ? "bolt" : "spark"; p.max *= 0.6; p.size += 2; break;
        case "wind": p.shape = "ring"; p.vx = Math.cos(a) * sp * 1.4; p.vy *= 0.4; break;
        case "light": p.shape = "spark"; break;
        case "shadow": p.vy -= 1; p.size += 4; p.gravity = -0.02; break;
        case "heal": p.shape = "plus"; p.vy = -1.5 - Math.random() * 2; p.vx *= 0.3; p.size += 3; break;
        case "shatter": p.shape = "shard"; p.gravity = 0.18; p.size += 5; break;
        case "hit": p.shape = "spark"; p.max *= 0.5; break;
        case "ult": p.shape = i % 2 ? "spark" : "dot"; p.max += 20; break;
      }
      this.ps.push(p);
    }
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    const ctx = this.ctx!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.speed;
    this.ps = this.ps.filter((p) => (p.life += s) < p.max);
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.ps) {
      p.vy += p.gravity * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.rot += p.vr * s;
      const t = p.life / p.max;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      const sz = p.size * (1 - t * 0.5);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      switch (p.shape) {
        case "dot": ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI * 2); ctx.fill(); break;
        case "shard": ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.45, 0); ctx.lineTo(0, sz); ctx.lineTo(-sz * 0.45, 0); ctx.closePath(); ctx.fill(); break;
        case "spark": ctx.fillRect(-sz * 1.4, -0.8, sz * 2.8, 1.6); ctx.fillRect(-0.8, -sz * 1.4, 1.6, sz * 2.8); break;
        case "plus": ctx.fillRect(-sz, -sz * 0.3, sz * 2, sz * 0.6); ctx.fillRect(-sz * 0.3, -sz, sz * 0.6, sz * 2); break;
        case "ring": ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, sz * 1.6, 0, Math.PI); ctx.stroke(); break;
        case "bolt": ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-sz * 2, -sz * 2); ctx.lineTo(0, -sz * 0.5); ctx.lineTo(-sz * 0.6, sz * 0.5); ctx.lineTo(sz * 2, sz * 2); ctx.stroke(); break;
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    this.raf = this.ps.length ? requestAnimationFrame(this.tick) : 0;
  };

  clear() {
    this.ps = [];
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
