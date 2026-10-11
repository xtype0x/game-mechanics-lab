/** Canvas 2D renderer. Reads a Session (never mutates it) and draws everything through sprite slots plus procedural fx. */
import { ARENA, BULLET_KINDS, GROUND_Y, GUNNER_X, HIT_X, MUZZLE, PLAYER_X } from "../game/config";
import { telegraphOf } from "../game/director";
import { hudOf } from "../game/hud";
import type { Session } from "../game/session";
import { playerView, type Bullet, type GameEvent } from "../game/world";
import { Fx } from "./fx";
import { defaultRegistry, drawSlot, type SlotRegistry } from "./slots";

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

export interface RenderUi {
  best: number;
  /** Key hint text for an interaction id (e.g. "J / 空白"). */
  hint: (id: string) => string;
  /** Full-screen art slot to cover the scene with (title / game over); nothing is drawn when the slot has no upload. */
  screenArt?: "screen.title" | "screen.gameOver" | null;
}

export interface Renderer {
  push(events: GameEvent[]): void;
  render(session: Session, ui: RenderUi): void;
  reset(): void;
}

export function createRenderer(canvas: HTMLCanvasElement, registry: SlotRegistry = defaultRegistry): Renderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  const c2 = ctx;
  const fx = new Fx();
  const mql = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  fx.reduced = mql?.matches ?? false;
  const onMql = () => { fx.reduced = mql?.matches ?? false; };
  mql?.addEventListener?.("change", onMql);
  const shakeOff = { x: 0, y: 0 };
  let last = performance.now();
  let auraGrad: CanvasGradient | null = null;

  const push = (events: GameEvent[]) => fx.push(events);
  const reset = () => fx.reset();

  function heart(x: number, y: number, s: number, fill: string | null, stroke: string): void {
    c2.save();
    c2.translate(x, y);
    c2.scale(s / 20, s / 20);
    c2.beginPath();
    c2.moveTo(10, 18);
    c2.bezierCurveTo(-8, 6, 2, -4, 10, 4);
    c2.bezierCurveTo(18, -4, 28, 6, 10, 18);
    c2.closePath();
    if (fill) { c2.fillStyle = fill; c2.fill(); }
    c2.lineWidth = 2;
    c2.strokeStyle = stroke;
    c2.stroke();
    c2.restore();
  }

  function text(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", bold = true): void {
    c2.font = (bold ? "bold " : "") + size + "px system-ui, 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    c2.textAlign = align;
    c2.textBaseline = "alphabetic";
    c2.lineWidth = 4;
    c2.strokeStyle = "rgba(8,10,20,0.75)";
    c2.strokeText(s, x, y);
    c2.fillStyle = color;
    c2.fillText(s, x, y);
  }

  function drawHud(session: Session, ui: RenderUi, t: number, k: number): void {
    c2.save();
    c2.scale(k, k);
    const W = ARENA.w / k;
    const H = ARENA.h / k;
    const w = session.world;
    const hud = hudOf(w);
    const hs = fx.heartShake > 0 && !fx.reduced ? fx.heartShake : 0;
    for (let i = 0; i < hud.hpMax; i++) {
      const on = i < hud.hp;
      const ox = hs ? (Math.random() - 0.5) * 12 * hs : 0;
      const oy = hs ? (Math.random() - 0.5) * 12 * hs : 0;
      heart(24 + i * 32 + ox, 18 + oy, 26, on ? "#ff5d73" : "rgba(255,255,255,0.08)", on ? "#ffd2d8" : "rgba(255,255,255,0.35)");
    }
    if (w.practice) text("練習 ∞", 24 + hud.hpMax * 32 + 4, 38, 14, "#9be7ff");
    let y = 62;
    if (hud.gauge !== null) {
      const frac = Math.min(1, hud.gauge / hud.gaugeMax);
      const full = frac >= 1;
      const pulse = 0.5 + 0.5 * Math.sin(t * 7);
      c2.fillStyle = "rgba(10,12,24,0.7)";
      c2.fillRect(24, y, 224, 16);
      c2.fillStyle = full ? "#ffd45c" : "#e0a93a";
      c2.fillRect(26, y + 2, 220 * frac, 12);
      if (full) {
        // pulsing glow: two widening halos around the full bar
        for (let g = 1; g <= 2; g++) {
          c2.strokeStyle = "rgba(255,226,120," + (0.32 * pulse) / g + ")";
          c2.lineWidth = 3 * g;
          c2.strokeRect(24 - g * 2, y - g * 2, 224 + g * 4, 16 + g * 4);
        }
      }
      c2.strokeStyle = full ? "rgba(255,240,170," + (0.6 + 0.4 * pulse) + ")" : "rgba(255,255,255,0.4)";
      c2.lineWidth = full ? 3 : 1.5;
      c2.strokeRect(24, y, 224, 16);
      text("技能", 256, y + 13, 13, "#f0d58a");
      if (full) {
        const ready = hud.interactions.find((i) => i.cost && i.cost.resource === "gauge" && i.ready);
        if (ready) {
          c2.save();
          c2.translate(24, y + 36 + (fx.reduced ? 0 : Math.sin(t * 6) * 1.5));
          c2.scale(1 + 0.04 * pulse, 1 + 0.04 * pulse);
          text(ready.name + " 就緒 [" + ui.hint(ready.id) + "]", 0, 0, 14, "#ffe9a3");
          c2.restore();
        }
      }
      y += full ? 50 : 34;
    }
    for (const it of hud.interactions) {
      if (!it.charges) continue;
      const col = it.color ?? "#6ee7ff";
      text(it.name, 24, y + 12, 13, "#cfd8ee");
      for (let i = 0; i < it.charges.max; i++) {
        const cx = 80 + i * 26;
        const cy = y + 7;
        c2.beginPath();
        c2.arc(cx, cy, 9, 0, TAU);
        c2.fillStyle = "rgba(10,12,24,0.7)";
        c2.fill();
        if (i < it.charges.count) {
          c2.fillStyle = col;
          c2.beginPath();
          c2.arc(cx, cy, 7, 0, TAU);
          c2.fill();
        } else if (i === it.charges.count) {
          // recharge sweep: translucent pie plus a bright leading arc
          const end = -HALF_PI + TAU * it.charges.progress;
          c2.globalAlpha = 0.5;
          c2.fillStyle = col;
          c2.beginPath();
          c2.moveTo(cx, cy);
          c2.arc(cx, cy, 7, -HALF_PI, end);
          c2.closePath();
          c2.fill();
          c2.globalAlpha = 1;
          c2.strokeStyle = col;
          c2.lineWidth = 3;
          c2.beginPath();
          c2.arc(cx, cy, 8.5, -HALF_PI, end);
          c2.stroke();
        }
        c2.strokeStyle = "rgba(255,255,255,0.45)";
        c2.lineWidth = 1.5;
        c2.beginPath();
        c2.arc(cx, cy, 9, 0, TAU);
        c2.stroke();
      }
      y += 26;
    }
    const sec = Math.floor(hud.seconds);
    text(String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0"), W / 2, 38, 28, "#fff", "center");
    text("分數 " + hud.score, W - 24, 36, 24, "#fff", "right");
    text(w.practice ? "練習模式" : "最佳 " + Math.max(ui.best, hud.score), W - 24, 60, 14, "#a7afbd", "right");
    if (hud.invulnerable > 0 && !w.over) text("無敵 " + (hud.invulnerable / 60).toFixed(1) + "s", 24, y + 14, 14, "#8fe9ff");
    c2.restore();
  }

  /** Procedural tail behind a bullet; each kind has its own look. Sprite art is drawn on top by drawSlot. */
  function drawTrail(b: Bullet, t: number): void {
    const kind = BULLET_KINDS[b.kind];
    const reflected = b.state === "reflected";
    const dir = reflected ? -1 : 1;
    const color = reflected ? "#fff4b0" : kind.color;
    const r = kind.radius;
    const step = b.speed * (reflected ? 1.4 : 1.1);
    c2.fillStyle = color;
    c2.strokeStyle = color;
    if (reflected) {
      c2.lineWidth = 3;
      for (let i = 1; i <= 5; i++) {
        c2.globalAlpha = 0.5 / i;
        c2.beginPath();
        c2.moveTo(b.x + dir * i * step * 0.9, b.y + i * 3.2);
        c2.lineTo(b.x + dir * (i + 1) * step * 0.9, b.y + (i + 1) * 3.2);
        c2.stroke();
      }
    } else if (b.kind === "low") {
      c2.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        c2.globalAlpha = 0.4 - Math.abs(i) * 0.14;
        c2.beginPath();
        c2.moveTo(b.x + r, b.y + i * 4);
        c2.lineTo(b.x + r + 46 + Math.abs(i) * -10, b.y + i * 4);
        c2.stroke();
      }
    } else if (b.kind === "bounce") {
      c2.lineWidth = 2;
      for (let i = 1; i <= 4; i++) {
        c2.globalAlpha = 0.34 / i;
        c2.beginPath();
        c2.arc(b.x + i * step * 1.5, b.y, r * (1 - i * 0.1) + 2, 0, TAU);
        c2.stroke();
      }
    } else if (b.kind === "energy") {
      const g = c2.createRadialGradient(b.x + 18, b.y, 0, b.x + 18, b.y, r * 3);
      g.addColorStop(0, "rgba(94,234,154,0.5)");
      g.addColorStop(1, "rgba(94,234,154,0)");
      c2.globalAlpha = 0.8;
      c2.fillStyle = g;
      c2.beginPath();
      c2.arc(b.x + 18, b.y, r * 3, 0, TAU);
      c2.fill();
    } else if (b.kind === "red") {
      for (let i = 1; i <= 5; i++) {
        c2.globalAlpha = 0.3 / i * 1.6;
        c2.beginPath();
        c2.arc(b.x + i * step * 1.1, b.y + Math.sin(t * 40 + i * 2) * 3, r * (1 - i * 0.12), 0, TAU);
        c2.fill();
      }
    } else if (b.kind === "feint") {
      for (let i = 1; i <= 4; i++) {
        c2.globalAlpha = 0.3 / i;
        const x = b.x + i * step * 1.2;
        c2.beginPath();
        c2.moveTo(x, b.y - r * 0.8);
        c2.lineTo(x + r * 0.7, b.y);
        c2.lineTo(x, b.y + r * 0.8);
        c2.lineTo(x - r * 0.7, b.y);
        c2.closePath();
        c2.fill();
      }
    } else {
      for (let i = 1; i <= 4; i++) {
        c2.globalAlpha = 0.16 / i;
        c2.beginPath();
        c2.arc(b.x + i * step, b.y, r * (1 - i * 0.12), 0, TAU);
        c2.fill();
      }
    }
    c2.globalAlpha = 1;
  }

  function drawAura(inv: number, t: number): void {
    const cy = GROUND_Y - 68;
    const blink = inv <= 60 && Math.floor(t * 14) % 2 === 0;
    const a = blink ? 0.4 : 1;
    if (!auraGrad) {
      auraGrad = c2.createRadialGradient(PLAYER_X, cy, 30, PLAYER_X, cy, 88);
      auraGrad.addColorStop(0, "rgba(143,233,255,0)");
      auraGrad.addColorStop(1, "rgba(143,233,255,0.3)");
    }
    c2.save();
    c2.globalAlpha = a * (fx.reduced ? 0.7 : 0.75 + 0.25 * Math.sin(t * 9));
    c2.fillStyle = auraGrad;
    c2.beginPath();
    c2.arc(PLAYER_X, cy, 88, 0, TAU);
    c2.fill();
    c2.globalAlpha = a;
    // rotating dashed rings (frozen under reduced motion)
    const spin = fx.reduced ? 0 : t;
    c2.lineWidth = 2.5;
    c2.strokeStyle = "rgba(143,233,255,0.85)";
    c2.setLineDash([14, 10]);
    c2.lineDashOffset = -spin * 40;
    c2.beginPath();
    c2.arc(PLAYER_X, cy, 80, 0, TAU);
    c2.stroke();
    c2.strokeStyle = "rgba(255,226,140,0.7)";
    c2.setLineDash([4, 12]);
    c2.lineDashOffset = spin * 55;
    c2.beginPath();
    c2.arc(PLAYER_X, cy, 70, 0, TAU);
    c2.stroke();
    c2.setLineDash([]);
    // shimmer motes orbiting the ring
    if (!fx.reduced) {
      c2.fillStyle = "#fff";
      for (let i = 0; i < 4; i++) {
        const ang = spin * 1.6 + (i * TAU) / 4;
        c2.globalAlpha = a * (0.5 + 0.5 * Math.sin(t * 8 + i));
        c2.fillRect(PLAYER_X + Math.cos(ang) * 80 - 2, cy + Math.sin(ang) * 80 - 2, 4, 4);
      }
      c2.globalAlpha = a;
    }
    // remaining-time arc
    const frac = fx.invulMax > 0 ? Math.min(1, inv / fx.invulMax) : 1;
    c2.strokeStyle = "rgba(255,255,255,0.18)";
    c2.lineWidth = 5;
    c2.beginPath();
    c2.arc(PLAYER_X, cy, 92, 0, TAU);
    c2.stroke();
    c2.strokeStyle = "#8fe9ff";
    c2.beginPath();
    c2.arc(PLAYER_X, cy, 92, -HALF_PI, -HALF_PI + TAU * frac);
    c2.stroke();
    c2.restore();
  }

  function render(session: Session, ui: RenderUi): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || ARENA.w;
    const pw = Math.max(2, Math.round(cssW * dpr));
    const ph = Math.round((pw * ARENA.h) / ARENA.w);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; auraGrad = null; }
    const w = session.world;

    fx.update(dt, session);

    c2.setTransform(canvas.width / ARENA.w, 0, 0, canvas.width / ARENA.w, 0, 0);
    c2.clearRect(0, 0, ARENA.w, ARENA.h);
    c2.save();
    fx.shakeOffset(session.hitstop, shakeOff);
    c2.translate(shakeOff.x, shakeOff.y);

    drawSlot(c2, "background", ARENA.w / 2, ARENA.h / 2, ARENA.w + 20, ARENA.h + 20, t, fx.reduced ? { reduced: true } : {}, registry);

    // hit line hint
    c2.save();
    c2.strokeStyle = "rgba(255,255,255,0.14)";
    c2.setLineDash([6, 8]);
    c2.lineWidth = 2;
    c2.beginPath();
    c2.moveTo(HIT_X, 90);
    c2.lineTo(HIT_X, GROUND_Y + 6);
    c2.stroke();
    c2.restore();

    // gunner
    const tele = telegraphOf(w.director, w.frame);
    const gunnerSlot = w.frame - w.gunner.lastFire < 8 ? "gunner.shoot" : "gunner.idle";
    if (tele) {
      const col = BULLET_KINDS[tele.kind].color;
      const pulse = 0.5 + 0.5 * Math.sin(t * (10 + tele.level * 24));
      const g = c2.createRadialGradient(MUZZLE.x, MUZZLE.y, 0, MUZZLE.x, MUZZLE.y, 26 + tele.level * 44);
      g.addColorStop(0, col);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c2.save();
      c2.globalAlpha = (0.25 + 0.55 * tele.level) * (0.7 + 0.3 * pulse);
      c2.fillStyle = g;
      c2.beginPath();
      c2.arc(MUZZLE.x, MUZZLE.y, 70, 0, TAU);
      c2.fill();
      c2.restore();
    }
    drawSlot(c2, gunnerSlot, GUNNER_X, GROUND_Y - 80, 120, 160, t, {}, registry);

    // player
    const pv = playerView(w);
    const def = w.config.interactions.find((i) => i.id === pv.pose);
    const blink = pv.invulnerable > 0 && pv.invulnerable <= 60 && Math.floor(t * 14) % 2 === 0;
    const slot = "player." + pv.pose;
    const params = {
      phase: pv.phase, progress: pv.progress, alpha: blink ? 0.35 : 1,
      ...(def?.color ? { color: def.color } : {}), ...(def ? { label: def.name } : {}),
    };
    c2.fillStyle = "rgba(0,0,0,0.3)";
    c2.beginPath();
    c2.ellipse(PLAYER_X, GROUND_Y + 4, 44, 9, 0, 0, TAU);
    c2.fill();
    if (fx.afterimage > 0) {
      // perfect-dodge / slow-motion afterimages trailing behind the player
      const u = Math.min(1, fx.afterimage / 0.45);
      for (let i = 4; i >= 1; i--) {
        drawSlot(c2, slot, PLAYER_X - i * 15 * u, GROUND_Y - 68, 96, 136, t, { ...params, alpha: 0.2 * u * (1 - i / 5.5) }, registry);
      }
      c2.fillStyle = "rgba(110,231,255," + 0.25 * u + ")";
      c2.beginPath();
      c2.ellipse(PLAYER_X - 30 * u, GROUND_Y + 4, 54, 10, 0, 0, TAU);
      c2.fill();
    }
    drawSlot(c2, slot, PLAYER_X, GROUND_Y - 68, 96, 136, t, params, registry);
    if (pv.invulnerable > 0 && !w.over) drawAura(pv.invulnerable, t);

    // bullets
    for (const b of w.bullets) {
      const kind = BULLET_KINDS[b.kind];
      const reflected = b.state === "reflected";
      drawTrail(b, t);
      const d = kind.radius * 2.6;
      drawSlot(c2, "bullet." + b.kind, b.x, b.y, d, d, t + b.id, {
        color: reflected ? "#fff4b0" : kind.color, alpha: b.state === "passed" ? 0.55 : 1, flip: reflected,
      }, registry);
    }

    fx.drawWorld(c2, text);
    c2.restore();

    fx.drawScreen(c2, session, t);
    drawHud(session, ui, t, cssW < 600 ? 1.55 : cssW < 800 ? 1.25 : 1);
    if (ui.screenArt && registry.has(ui.screenArt)) drawSlot(c2, ui.screenArt, ARENA.w / 2, ARENA.h / 2, ARENA.w, ARENA.h, t, {}, registry);
  }

  return { push, render, reset };
}

