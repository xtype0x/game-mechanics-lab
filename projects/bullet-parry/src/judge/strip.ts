/** Draws a StripModel on a 2D canvas (CSS pixel coordinates; the caller sets the DPR transform). */
import type { Timing } from "@gml/core";
import { text } from "../i18n";
import { TONE_COLORS, type StripModel } from "./model";

export const ROW_H = 16;
export const LABEL_W = 56;
export const PAD = 4;

export function stripHeight(config: Timing.TimingConfig): number {
  return (config.interactions.length + 3) * ROW_H + PAD * 2;
}

export function drawStrip(ctx: CanvasRenderingContext2D, w: number, m: StripModel, config: Timing.TimingConfig, playhead: number): void {
  const h = stripHeight(config);
  const span = m.to - m.from;
  const tw = w - LABEL_W - PAD;
  const fw = tw / span;
  const x = (f: number) => LABEL_W + (f - m.from) * fw;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b0f20";
  ctx.fillRect(0, 0, w, h);
  ctx.font = "11px system-ui, 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const nR = m.rows.length;
  const tj = text().judge;
  const labels = [tj.rowIncoming, ...m.rows.map((r) => r.name), tj.rowResolve, tj.rowState];
  const y0 = (r: number) => PAD + r * ROW_H;
  for (let r = 0; r < labels.length; r++) {
    if (r % 2 === 0) { ctx.fillStyle = "rgba(255,255,255,0.035)"; ctx.fillRect(0, y0(r), w, ROW_H); }
    ctx.fillStyle = r >= 1 && r <= nR ? m.rows[r - 1]!.color : "#98a1bd";
    ctx.fillText(labels[r]!, 4, y0(r) + ROW_H / 2, LABEL_W - 6);
  }
  // 0.5 s grid anchored to world time
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let f = Math.ceil(m.from / 30) * 30; f < m.to; f += 30) {
    const gx = Math.round(x(f)) + 0.5;
    ctx.moveTo(gx, PAD);
    ctx.lineTo(gx, h - PAD);
  }
  ctx.stroke();

  // incoming bullet impacts (hollow = predicted)
  const by = y0(0) + ROW_H / 2;
  for (const b of m.bullets) {
    ctx.beginPath();
    ctx.arc(x(b.frame) + fw / 2, by, 4.5, 0, Math.PI * 2);
    if (b.future) { ctx.strokeStyle = b.color; ctx.lineWidth = 1.5; ctx.stroke(); } else { ctx.fillStyle = b.color; ctx.fill(); }
  }
  // each interaction: startup, windows, recovery, presses
  m.rows.forEach((row, ri) => {
    const y = y0(ri + 1) + 2;
    const hh = ROW_H - 4;
    for (const a of row.actions) {
      if (a.startup) { ctx.fillStyle = "rgba(150,165,190,0.35)"; ctx.fillRect(x(a.startup.from), y + 3, Math.max(1, (a.startup.to - a.startup.from) * fw), hh - 6); }
      for (const win of a.windows) {
        ctx.fillStyle = row.color;
        ctx.globalAlpha = win.strict ? 1 : 0.7;
        ctx.fillRect(x(win.from), y, Math.max(1.5, (win.to - win.from) * fw), hh);
        ctx.globalAlpha = 1;
      }
      if (a.recovery) { ctx.fillStyle = "rgba(90,100,125,0.55)"; ctx.fillRect(x(a.recovery.from), y + 3, Math.max(1, (a.recovery.to - a.recovery.from) * fw), hh - 6); }
    }
    for (const p of row.presses) {
      const px = x(p.frame) + fw / 2;
      ctx.fillStyle = p.status === "accepted" ? "#ffffff" : p.status === "buffered" ? "#ffd45c" : "#f0707a";
      ctx.beginPath();
      ctx.moveTo(px - 4, y - 1);
      ctx.lineTo(px + 4, y - 1);
      ctx.lineTo(px, y + 5);
      ctx.closePath();
      ctx.fill();
    }
  });
  // resolutions
  const ry = y0(nR + 1) + ROW_H / 2;
  for (const r of m.resolves) {
    const px = x(r.frame) + fw / 2;
    ctx.fillStyle = TONE_COLORS[r.tone] ?? TONE_COLORS.neutral!;
    ctx.beginPath();
    ctx.moveTo(px, ry - 6);
    ctx.lineTo(px + 5, ry);
    ctx.lineTo(px, ry + 6);
    ctx.lineTo(px - 5, ry);
    ctx.closePath();
    ctx.fill();
  }
  // stun (orange) and invulnerability (cyan)
  const sy = y0(nR + 2) + 2;
  for (const s of m.stun) { ctx.fillStyle = "#c07a3a"; ctx.fillRect(x(s.from), sy, Math.max(1, (s.to - s.from) * fw), 5); }
  for (const s of m.invul) { ctx.fillStyle = "#6ee7ff"; ctx.fillRect(x(s.from), sy + 7, Math.max(1, (s.to - s.from) * fw), 5); }
  // playhead
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x(playhead) + fw / 2, PAD);
  ctx.lineTo(x(playhead) + fw / 2, h - PAD);
  ctx.stroke();
}
