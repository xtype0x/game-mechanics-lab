/**
 * Original monster art, drawn facing left. viewBox 0 0 160 170, feet/ground at y≈160.
 */
import { useId } from "react";

const LINE = "#1b1420";

function useG() {
  const uid = useId().replace(/:/g, "");
  return (n: string) => `${n}-${uid}`;
}

export function Bat({ className, viewBox }: { className?: string; viewBox?: string }) {
  const g = useG();
  return (
    <svg viewBox={viewBox ?? "0 0 160 170"} className={className} overflow="visible" aria-hidden="true">
      <defs>
        <radialGradient id={g("body")} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#8f6bd6" />
          <stop offset="1" stopColor="#3b2566" />
        </radialGradient>
        <linearGradient id={g("wing")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6c4bb0" />
          <stop offset="1" stopColor="#2a1848" />
        </linearGradient>
      </defs>
      <g className="hover" stroke={LINE} strokeWidth="2.2" strokeLinejoin="round">
        <g className="wing wing-l" style={{ transformOrigin: "62px 78px" }}>
          <path d="M62 78 Q34 40 4 50 Q16 62 10 74 Q24 72 26 86 Q40 80 46 94 Q52 84 62 90 Z" fill={`url(#${g("wing")})`} />
          <path d="M62 80 L16 58 M62 84 L26 80 M62 88 L44 92" stroke="#8f6bd6" strokeWidth="1.2" opacity="0.6" fill="none" />
        </g>
        <g className="wing wing-r" style={{ transformOrigin: "98px 78px" }}>
          <path d="M98 78 Q126 40 156 50 Q144 62 150 74 Q136 72 134 86 Q120 80 114 94 Q108 84 98 90 Z" fill={`url(#${g("wing")})`} />
        </g>
        <path d="M60 52 L54 22 L72 44 Z" fill="#4a2f7d" />
        <path d="M100 52 L106 22 L88 44 Z" fill="#4a2f7d" />
        <ellipse cx="80" cy="80" rx="28" ry="32" fill={`url(#${g("body")})`} />
        <path d="M66 112 L62 124 M94 112 L98 124" fill="none" />
      </g>
      <ellipse cx="70" cy="74" rx="6" ry="7" fill="#ff3d6e" className="eye-glow" />
      <ellipse cx="90" cy="74" rx="6" ry="7" fill="#ff3d6e" className="eye-glow" />
      <circle cx="68" cy="72" r="2" fill="#fff" />
      <circle cx="88" cy="72" r="2" fill="#fff" />
      <path d="M72 92 L76 98 L80 92 L84 98 L88 92" fill="#fff" stroke={LINE} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Golem({ className, viewBox }: { className?: string; viewBox?: string }) {
  const g = useG();
  return (
    <svg viewBox={viewBox ?? "0 0 160 170"} className={className} overflow="visible" aria-hidden="true">
      <defs>
        <linearGradient id={g("rock")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a7f78" />
          <stop offset="1" stopColor="#433a36" />
        </linearGradient>
        <linearGradient id={g("ember")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd36b" />
          <stop offset="1" stopColor="#ff5a1f" />
        </linearGradient>
      </defs>
      <g stroke={LINE} strokeWidth="2.4" strokeLinejoin="round">
        <path d="M98 120 L108 160 L132 160 L128 118 Z" fill={`url(#${g("rock")})`} />
        <path d="M50 120 L42 160 L66 160 L72 118 Z" fill={`url(#${g("rock")})`} />
        <path d="M30 84 Q24 40 70 30 Q120 24 138 62 Q150 96 128 126 Q90 138 46 128 Q28 112 30 84 Z" fill={`url(#${g("rock")})`} />
        <path d="M118 70 Q150 82 146 124 L126 132 Q132 104 112 92 Z" fill="#5c524c" />
        <path d="M26 90 Q6 104 12 140 L34 142 Q30 116 44 100 Z" fill="#5c524c" />
        <path d="M54 34 L60 18 L70 32 M92 30 L102 14 L106 34" fill="#6d625b" />
        <path d="M30 82 Q16 76 18 62 Q34 64 42 74 Z" fill="#6d625b" />
      </g>
      <path d="M62 62 L74 80 L66 96 L80 112 M104 52 L96 74 L110 92 M48 102 L60 110" stroke={`url(#${g("ember")})`} strokeWidth="3.5" fill="none" strokeLinecap="round" className="ember" />
      <path d="M30 70 L44 70 L40 76 L30 76 Z" fill="#ffb03a" className="eye-glow" />
    </svg>
  );
}

export function Sentinel({ className, viewBox }: { className?: string; viewBox?: string }) {
  const g = useG();
  return (
    <svg viewBox={viewBox ?? "0 0 160 170"} className={className} overflow="visible" aria-hidden="true">
      <defs>
        <linearGradient id={g("crystal")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e3d4ff" />
          <stop offset="0.5" stopColor="#9b6bff" />
          <stop offset="1" stopColor="#3b1f7a" />
        </linearGradient>
        <radialGradient id={g("core")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.4" stopColor="#7df9ff" />
          <stop offset="1" stopColor="#7df9ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="hover">
        <circle cx="80" cy="78" r="44" fill={`url(#${g("core")})`} opacity="0.5" className="core-pulse" />
        <g stroke={LINE} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M80 18 L112 76 L80 140 L48 76 Z" fill={`url(#${g("crystal")})`} />
          <path d="M80 18 L80 140 M48 76 L112 76" stroke="#c6b0ff" strokeWidth="1.2" fill="none" />
        </g>
        <circle cx="80" cy="76" r="10" fill={`url(#${g("core")})`} />
        <path d="M80 76 L70 60 L76 58 L66 42" stroke="#7df9ff" strokeWidth="2" fill="none" className="spark" />
        <g className="orbit" style={{ transformOrigin: "80px 78px" }}>
          <path d="M18 72 L26 62 L32 74 L24 84 Z" fill="#b48bff" stroke={LINE} strokeWidth="1.8" />
          <path d="M136 82 L144 72 L150 84 L142 94 Z" fill="#b48bff" stroke={LINE} strokeWidth="1.8" />
          <path d="M76 150 L82 142 L88 152 L82 160 Z" fill="#b48bff" stroke={LINE} strokeWidth="1.8" />
        </g>
      </g>
    </svg>
  );
}

export function Colossus({ className, viewBox }: { className?: string; viewBox?: string }) {
  const g = useG();
  return (
    <svg viewBox={viewBox ?? "0 0 160 170"} className={className} overflow="visible" aria-hidden="true">
      <defs>
        <linearGradient id={g("basalt")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a3a3a" />
          <stop offset="1" stopColor="#1e1517" />
        </linearGradient>
        <linearGradient id={g("lava")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3a8" />
          <stop offset="0.4" stopColor="#ff9a1f" />
          <stop offset="1" stopColor="#d6261a" />
        </linearGradient>
        <radialGradient id={g("heart")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.45" stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#ff3d00" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g stroke={LINE} strokeWidth="2.4" strokeLinejoin="round">
        <path d="M54 126 L46 162 L74 162 L78 128 Z" fill={`url(#${g("basalt")})`} />
        <path d="M96 126 L100 162 L128 162 L120 124 Z" fill={`url(#${g("basalt")})`} />
        <path d="M118 66 Q152 74 152 112 Q150 132 136 140 L120 128 Q132 106 112 88 Z" fill={`url(#${g("basalt")})`} />
        <path d="M40 60 Q36 26 80 22 Q126 24 124 62 Q130 110 104 132 Q80 140 56 132 Q30 110 40 60 Z" fill={`url(#${g("basalt")})`} />
        <path d="M44 66 Q8 70 6 110 Q6 136 22 146 L40 136 Q24 116 44 92 Z" fill={`url(#${g("basalt")})`} />
        <circle cx="20" cy="146" r="16" fill="#2b2022" />
        <path d="M54 30 Q40 6 26 4 Q38 18 44 38 Z M104 28 Q116 6 132 2 Q122 18 114 36 Z" fill="#2b2022" />
      </g>
      <circle cx="82" cy="86" r="30" fill={`url(#${g("heart")})`} className="core-pulse" />
      <path d="M58 52 L72 70 L66 92 L82 110 M104 50 L94 72 L104 96 M48 98 L62 108 M28 92 L18 112 L26 130 M128 96 L140 116" stroke={`url(#${g("lava")})`} strokeWidth="3.5" fill="none" strokeLinecap="round" className="ember" />
      <path d="M56 46 L72 50 L70 56 L56 54 Z" fill="#ffd36b" className="eye-glow" />
      <path d="M86 50 L100 46 L100 54 L86 56 Z" fill="#ffd36b" className="eye-glow" />
      <path d="M62 66 Q78 74 94 66" stroke="#ff7a1a" strokeWidth="3" fill="none" />
    </svg>
  );
}

export function Slime({ color, shade, className, viewBox }: { color: string; shade: string; className?: string; viewBox?: string }) {
  const g = useG();
  return (
    <svg viewBox={viewBox ?? "0 0 160 170"} className={className} overflow="visible" aria-hidden="true">
      <defs>
        <radialGradient id={g("slime")} cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="0.25" stopColor={color} />
          <stop offset="1" stopColor={shade} />
        </radialGradient>
      </defs>
      <g className="squish" style={{ transformOrigin: "80px 160px" }}>
        <path d="M24 156 Q14 110 42 82 Q60 58 82 58 Q110 60 126 86 Q148 118 138 156 Q80 166 24 156 Z" fill={`url(#${g("slime")})`} stroke={LINE} strokeWidth="2.4" strokeLinejoin="round" />
        <ellipse cx="64" cy="104" rx="7" ry="10" fill={LINE} />
        <ellipse cx="96" cy="104" rx="7" ry="10" fill={LINE} />
        <circle cx="62" cy="100" r="2.5" fill="#fff" />
        <circle cx="94" cy="100" r="2.5" fill="#fff" />
        <path d="M70 124 Q80 132 90 124" stroke={LINE} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <ellipse cx="52" cy="82" rx="10" ry="5" fill="#fff" opacity="0.5" transform="rotate(-30 52 82)" />
      </g>
    </svg>
  );
}
