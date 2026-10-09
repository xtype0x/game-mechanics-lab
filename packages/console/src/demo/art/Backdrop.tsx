/**
 * Layered stage backgrounds (sky, far ridge, near ruins, ground). viewBox 1280×720, ground line at y≈520.
 */
import { useId } from "react";

export type Theme = "ember" | "frost" | "storm";

const THEMES: Record<Theme, { sky: [string, string, string]; far: string; near: string; ground: [string, string]; glow: string; moon: string }> = {
  ember: { sky: ["#2a0f2e", "#7a2a3a", "#f08a4b"], far: "#3d1a2c", near: "#22101c", ground: ["#3a1d1f", "#140a0d"], glow: "#ff8a3d", moon: "#ffd9a0" },
  frost: { sky: ["#0b1a3a", "#244b7a", "#9fd3f0"], far: "#1b3358", near: "#0f2140", ground: ["#2a4466", "#0b1528"], glow: "#9fe3ff", moon: "#e8f6ff" },
  storm: { sky: ["#120b26", "#3a2466", "#8e6bd6"], far: "#2a1d4a", near: "#170f2e", ground: ["#2a2240", "#0d0918"], glow: "#c9a3ff", moon: "#efe3ff" },
};

export function Backdrop({ theme }: { theme: Theme }) {
  const uid = useId().replace(/:/g, "");
  const t = THEMES[theme];
  const id = (n: string) => `${n}-${uid}`;
  return (
    <svg className="backdrop" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.sky[0]} />
          <stop offset="0.55" stopColor={t.sky[1]} />
          <stop offset="1" stopColor={t.sky[2]} />
        </linearGradient>
        <linearGradient id={id("ground")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.ground[0]} />
          <stop offset="1" stopColor={t.ground[1]} />
        </linearGradient>
        <radialGradient id={id("moon")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={t.moon} />
          <stop offset="0.3" stopColor={t.moon} stopOpacity="0.8" />
          <stop offset="1" stopColor={t.moon} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("floor")} cx="0.5" cy="0.2" r="0.6">
          <stop offset="0" stopColor={t.glow} stopOpacity="0.35" />
          <stop offset="1" stopColor={t.glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill={`url(#${id("sky")})`} />
      <circle cx="980" cy="170" r="160" fill={`url(#${id("moon")})`} />
      <circle cx="980" cy="170" r="46" fill={t.moon} opacity="0.9" />
      {theme === "storm" && <path className="bolt" d="M300 40 L270 150 L300 150 L250 290" stroke="#efe3ff" strokeWidth="4" fill="none" />}
      <path d="M0 430 L120 330 L210 390 L330 280 L450 380 L560 300 L700 400 L820 320 L960 410 L1080 330 L1280 420 L1280 720 L0 720 Z" fill={t.far} opacity="0.85" />
      {theme === "frost" ? (
        <g fill={t.near}>
          <path d="M60 520 L110 300 L150 520 Z M160 520 L190 380 L220 520 Z M1080 520 L1130 280 L1180 520 Z M1180 520 L1210 400 L1250 520 Z" />
          <path d="M110 300 L120 340 L100 360 Z M1130 280 L1140 320 L1120 340 Z" fill="#cfefff" opacity="0.6" />
        </g>
      ) : (
        <g fill={t.near}>
          <rect x="70" y="330" width="46" height="190" />
          <rect x="60" y="316" width="66" height="18" />
          <rect x="176" y="390" width="40" height="130" />
          <path d="M1090 520 L1090 300 L1150 300 L1150 360 L1170 360 L1170 520 Z" />
          <rect x="1200" y="410" width="36" height="110" />
        </g>
      )}
      <rect y="500" width="1280" height="220" fill={`url(#${id("ground")})`} />
      <ellipse cx="640" cy="560" rx="620" ry="90" fill={`url(#${id("floor")})`} />
      <path d="M0 500 L1280 500" stroke={t.glow} strokeOpacity="0.35" strokeWidth="2" />
      <g stroke={t.glow} strokeOpacity="0.08">
        {Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${640 + (i - 6) * 70} 500 L${640 + (i - 6) * 260} 720`} />)}
        {[540, 590, 650].map((y) => <path key={y} d={`M0 ${y} L1280 ${y}`} />)}
      </g>
    </svg>
  );
}
