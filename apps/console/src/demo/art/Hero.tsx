/**
 * Parametric chibi hero, drawn facing right. viewBox 0 0 120 170, feet at y≈158.
 * Everything is original vector art built from simple shapes.
 */
import { useId } from "react";

export type HairStyle = "spiky" | "long" | "twin" | "ponytail" | "bob" | "short";
export type Weapon = "greatsword" | "staff" | "spear" | "fan" | "wand" | "scythe" | "sword";
export type Extra = "halo" | "feather" | "tiara" | "hood" | "ribbon" | "none";

export interface HeroLook {
  hair: string;
  hairShade: string;
  style: HairStyle;
  eye: string;
  skin: string;
  outfit: string;
  outfitShade: string;
  accent: string;
  glow: string;
  weapon: Weapon;
  extra: Extra;
  cape?: string;
}

const LINE = "#241a2b";

export function Hero({ look, className, viewBox }: { look: HeroLook; className?: string; viewBox?: string }) {
  const uid = useId().replace(/:/g, "");
  const g = (n: string) => `${n}-${uid}`;
  const L = look;
  return (
    <svg viewBox={viewBox ?? "0 0 120 170"} className={className} overflow="visible" aria-hidden="true">
      <defs>
        <linearGradient id={g("hair")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={L.hair} />
          <stop offset="1" stopColor={L.hairShade} />
        </linearGradient>
        <linearGradient id={g("outfit")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={L.outfit} />
          <stop offset="1" stopColor={L.outfitShade} />
        </linearGradient>
        <radialGradient id={g("iris")} cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="0.35" stopColor={L.eye} />
          <stop offset="1" stopColor={LINE} />
        </radialGradient>
        <radialGradient id={g("glow")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.35" stopColor={L.glow} />
          <stop offset="1" stopColor={L.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g("blade")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f6f8ff" />
          <stop offset="0.5" stopColor="#c9d3e6" />
          <stop offset="1" stopColor={L.glow} />
        </linearGradient>
      </defs>

      <g stroke={LINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        {/* cape & back hair */}
        {L.cape && <path d="M42 84 Q30 120 26 152 Q50 146 60 150 Q70 146 92 152 Q88 118 78 84 Z" fill={L.cape} />}
        <BackHair look={L} fill={`url(#${g("hair")})`} />

        {/* back arm */}
        <path d="M45 86 Q36 100 38 114" fill="none" stroke={LINE} strokeWidth="11" />
        <path d="M45 86 Q36 100 38 114" fill="none" stroke={L.outfitShade} strokeWidth="7" />
        <circle cx="38" cy="116" r="4.5" fill={L.skin} />

        {/* legs */}
        <rect x="46" y="120" width="11" height="30" rx="5" fill={L.outfitShade} />
        <rect x="63" y="120" width="11" height="30" rx="5" fill={L.outfitShade} />
        <path d="M44 144 h15 v8 q0 4 -4 4 h-13 q-2 0 -2 -3 z" fill={L.accent} />
        <path d="M61 144 h15 v8 q0 4 -4 4 h-13 q-2 0 -2 -3 z" fill={L.accent} />

        {/* body */}
        <path d="M44 80 Q60 73 76 80 L84 124 Q60 133 36 124 Z" fill={`url(#${g("outfit")})`} />
        <path d="M60 78 L60 128" fill="none" stroke={L.accent} strokeWidth="2.5" />
        <path d="M41 104 Q60 110 79 104 L80 110 Q60 116 40 110 Z" fill={L.accent} />
        <circle cx="60" cy="108" r="3.5" fill={L.glow} />
        <path d="M48 80 L60 92 L72 80" fill="none" stroke={L.accent} strokeWidth="2.5" />

        {/* weapon behind front hand */}
        <WeaponArt weapon={L.weapon} look={L} blade={`url(#${g("blade")})`} glow={`url(#${g("glow")})`} />

        {/* front arm */}
        <path d="M75 86 Q86 96 89 106" fill="none" stroke={LINE} strokeWidth="11" />
        <path d="M75 86 Q86 96 89 106" fill="none" stroke={L.outfit} strokeWidth="7" />
        <circle cx="90" cy="108" r="5" fill={L.skin} />

        {/* head */}
        <rect x="55" y="70" width="10" height="9" rx="3" fill={L.skin} />
        <ellipse cx="61" cy="50" rx="29" ry="27" fill={L.skin} />
        <ellipse cx="34" cy="54" rx="4" ry="6" fill={L.skin} />
      </g>

      {/* face (no outline) */}
      <g>
        <ellipse cx="54" cy="56" rx="5.2" ry="6.6" fill="#fff" />
        <ellipse cx="73" cy="56" rx="5.2" ry="6.6" fill="#fff" />
        <ellipse cx="55" cy="56.5" rx="3.9" ry="5.3" fill={`url(#${g("iris")})`} />
        <ellipse cx="74" cy="56.5" rx="3.9" ry="5.3" fill={`url(#${g("iris")})`} />
        <circle cx="56.3" cy="54" r="1.6" fill="#fff" />
        <circle cx="75.3" cy="54" r="1.6" fill="#fff" />
        <path d="M49 48 q5 -3 10 -1" stroke={LINE} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M69 47 q5 -2 9 1" stroke={LINE} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M61 66 q3 2.5 6 0" stroke={LINE} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <ellipse cx="48" cy="64" rx="4" ry="2" fill="#ff8fa3" opacity="0.45" />
        <ellipse cx="80" cy="64" rx="4" ry="2" fill="#ff8fa3" opacity="0.45" />
      </g>

      <g stroke={LINE} strokeWidth="2" strokeLinejoin="round">
        <FrontHair look={L} fill={`url(#${g("hair")})`} />
        <ExtraArt extra={L.extra} look={L} glow={`url(#${g("glow")})`} />
      </g>
    </svg>
  );
}

function BackHair({ look, fill }: { look: HeroLook; fill: string }) {
  switch (look.style) {
    case "long":
      return <path d="M33 44 Q24 96 34 118 Q46 112 50 116 Q60 110 70 116 Q76 112 88 118 Q98 96 89 44 Z" fill={fill} />;
    case "twin":
      return (
        <>
          <path d="M34 36 Q14 60 18 98 Q22 120 30 128 Q36 104 40 70 Z" fill={fill} />
          <path d="M88 36 Q108 60 104 98 Q100 120 92 128 Q86 104 82 70 Z" fill={fill} />
        </>
      );
    case "ponytail":
      return <path d="M36 34 Q8 40 12 78 Q14 100 6 116 Q30 108 30 82 Q30 60 42 46 Z" fill={fill} />;
    case "bob":
      return <path d="M32 46 Q28 76 38 82 L84 82 Q94 76 90 46 Z" fill={fill} />;
    default:
      return null;
  }
}

function FrontHair({ look, fill }: { look: HeroLook; fill: string }) {
  const crown = "M31 52 Q28 18 61 18 Q94 18 91 52";
  switch (look.style) {
    case "spiky":
      return (
        <path
          d={`${crown} Q86 38 80 44 L76 34 L70 44 L64 30 L58 44 L50 32 L46 46 L38 38 Q34 46 31 52 Z M40 22 L30 8 L50 18 Z M60 18 L66 0 L74 20 Z M78 22 L98 12 L88 30 Z M32 30 L14 22 L30 42 Z`}
          fill={fill}
        />
      );
    case "short":
      return <path d={`${crown} Q88 36 78 40 Q72 30 64 40 Q58 30 50 40 Q42 32 36 44 Q33 46 31 52 Z`} fill={fill} />;
    case "bob":
      return <path d={`${crown} Q92 64 88 70 Q84 50 80 42 Q72 32 64 42 Q56 30 48 42 Q40 34 36 48 Q34 64 30 70 Q28 60 31 52 Z`} fill={fill} />;
    default:
      return <path d={`${crown} Q88 40 80 42 Q74 30 66 42 Q58 28 50 42 Q42 32 37 46 Q34 50 31 52 Z M32 46 Q28 70 34 84 L38 60 Z M90 46 Q94 70 88 84 L84 60 Z`} fill={fill} />;
  }
}

function WeaponArt({ weapon, look, blade, glow }: { weapon: Weapon; look: HeroLook; blade: string; glow: string }) {
  switch (weapon) {
    case "greatsword":
      return (
        <g>
          <circle cx="104" cy="44" r="26" fill={glow} stroke="none" opacity="0.55" className="weapon-glow" />
          <path d="M92 104 L99 102 L118 22 L112 14 L104 24 Z" fill={blade} />
          <path d="M84 102 L104 98" stroke={look.accent} strokeWidth="6" />
          <path d="M90 104 L86 122" stroke={look.outfitShade} strokeWidth="5" />
        </g>
      );
    case "sword":
      return (
        <g>
          <path d="M91 104 L97 103 L114 46 L109 40 L102 48 Z" fill={blade} />
          <path d="M84 103 L102 99" stroke={look.accent} strokeWidth="5" />
        </g>
      );
    case "staff":
      return (
        <g>
          <path d="M84 150 L100 30" stroke="#6b4a2f" strokeWidth="5" />
          <circle cx="101" cy="26" r="22" fill={glow} stroke="none" opacity="0.7" className="weapon-glow" />
          <path d="M101 10 L110 26 L101 42 L92 26 Z" fill={look.glow} />
          <path d="M101 14 L105 26 L101 36" stroke="#fff" strokeWidth="1.5" fill="none" />
        </g>
      );
    case "spear":
      return (
        <g>
          <path d="M80 140 L110 30" stroke="#5a4a6a" strokeWidth="4.5" />
          <path d="M108 34 L118 8 L114 38 Z" fill={blade} />
          <circle cx="113" cy="20" r="16" fill={glow} stroke="none" opacity="0.5" className="weapon-glow" />
          <path d="M104 44 Q100 50 106 54" stroke={look.accent} strokeWidth="3" fill="none" />
        </g>
      );
    case "fan":
      return (
        <g>
          <path d="M90 106 L80 72 A40 40 0 0 1 120 92 Z" fill={look.accent} />
          <path d="M90 106 L86 74 M90 106 L96 74 M90 106 L106 78 M90 106 L114 86" stroke={LINE} strokeWidth="1.2" fill="none" />
          <path d="M80 72 A40 40 0 0 1 120 92" stroke={look.glow} strokeWidth="3" fill="none" />
        </g>
      );
    case "wand":
      return (
        <g>
          <path d="M88 110 L104 70" stroke="#e8d9b5" strokeWidth="4" />
          <circle cx="106" cy="64" r="18" fill={glow} stroke="none" opacity="0.8" className="weapon-glow" />
          <path d="M106 54 L109 61 L116 62 L111 67 L112 74 L106 70 L100 74 L101 67 L96 62 L103 61 Z" fill={look.glow} />
        </g>
      );
    case "scythe":
      return (
        <g>
          <path d="M82 150 L104 22" stroke="#2e2638" strokeWidth="5" />
          <path d="M104 22 Q72 10 54 34 Q78 22 100 32 Z" fill={blade} />
          <circle cx="90" cy="26" r="18" fill={glow} stroke="none" opacity="0.45" className="weapon-glow" />
        </g>
      );
  }
}

function ExtraArt({ extra, look, glow }: { extra: Extra; look: HeroLook; glow: string }) {
  switch (extra) {
    case "halo":
      return (
        <g className="halo">
          <ellipse cx="61" cy="12" rx="22" ry="6" fill="none" stroke={look.glow} strokeWidth="3.5" />
          <ellipse cx="61" cy="12" rx="26" ry="9" fill={glow} stroke="none" opacity="0.4" />
        </g>
      );
    case "feather":
      return (
        <g>
          <path d="M88 30 Q104 10 112 4 Q106 22 92 36 Z" fill={look.glow} />
          <path d="M90 34 L110 6" stroke={look.outfitShade} strokeWidth="1.2" fill="none" />
        </g>
      );
    case "tiara":
      return <path d="M44 24 L50 14 L56 22 L61 10 L66 22 L72 14 L78 24 Q61 18 44 24 Z" fill={look.accent} />;
    case "hood":
      return <path d="M28 54 Q22 10 61 8 Q100 10 94 54 Q90 30 61 26 Q32 30 28 54 Z" fill={look.outfitShade} />;
    case "ribbon":
      return (
        <g>
          <path d="M78 22 L94 12 L92 30 Z" fill={look.accent} />
          <path d="M78 22 L90 34 L72 34 Z" fill={look.accent} />
          <circle cx="79" cy="24" r="3" fill={look.glow} />
        </g>
      );
    default:
      return null;
  }
}
