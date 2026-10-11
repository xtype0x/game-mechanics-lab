import type { UnitDef } from "@gml/core";
import { Hero, type Extra, type HairStyle, type HeroLook, type Weapon } from "./Hero";
import { Bat, Colossus, Golem, Sentinel, Slime } from "./Monsters";

export const ELEMENT_COLORS: Record<string, { main: string; shade: string; glow: string }> = {
  fire: { main: "#ff6b35", shade: "#a8241a", glow: "#ffb347" },
  ice: { main: "#6cc6ff", shade: "#2a5f9e", glow: "#c9f1ff" },
  thunder: { main: "#b57bff", shade: "#4b2a8f", glow: "#e2c6ff" },
  wind: { main: "#4fd18b", shade: "#1f7a4d", glow: "#b9ffd6" },
  light: { main: "#ffd447", shade: "#b8860b", glow: "#fff4b0" },
  shadow: { main: "#7d5ad6", shade: "#2c1d55", glow: "#c3a9ff" },
};

export const elementColor = (el: string) => ELEMENT_COLORS[el] ?? { main: "#9aa4b2", shade: "#4a5260", glow: "#e0e6ee" };

/** Hand-designed looks for the sample roster. */
const LOOKS: Record<string, HeroLook> = {
  homura: { hair: "#e8433a", hairShade: "#8e1a20", style: "spiky", eye: "#ffb020", skin: "#ffe0c8", outfit: "#3b2230", outfitShade: "#24131d", accent: "#d9a441", glow: "#ff8a3d", weapon: "greatsword", extra: "none", cape: "#b8282a" },
  shimo: { hair: "#e7f3ff", hairShade: "#8fb3d9", style: "long", eye: "#3aa0ff", skin: "#fff0e6", outfit: "#e9f4ff", outfitShade: "#9cc0e6", accent: "#3a77c2", glow: "#9fe3ff", weapon: "staff", extra: "tiara" },
  raimei: { hair: "#9d6bff", hairShade: "#4b2a8f", style: "twin", eye: "#ffe14d", skin: "#ffe6d6", outfit: "#2d2448", outfitShade: "#18122b", accent: "#ffd23f", glow: "#c9a3ff", weapon: "spear", extra: "ribbon" },
  aoba: { hair: "#5fd39a", hairShade: "#1f7a4d", style: "ponytail", eye: "#2fbf71", skin: "#ffe6d6", outfit: "#f4fff8", outfitShade: "#a9dcc0", accent: "#2f8f5f", glow: "#b9ffd6", weapon: "fan", extra: "feather" },
  akari: { hair: "#ffe08a", hairShade: "#d19a2a", style: "bob", eye: "#ff9a3d", skin: "#fff0e6", outfit: "#fffaf0", outfitShade: "#e6d3a8", accent: "#d9a441", glow: "#fff2a6", weapon: "wand", extra: "halo" },
  yoru: { hair: "#2b2540", hairShade: "#0f0b1a", style: "short", eye: "#c084ff", skin: "#f6dccd", outfit: "#2a2238", outfitShade: "#15101f", accent: "#8b5cf6", glow: "#c3a9ff", weapon: "scythe", extra: "hood", cape: "#1a1426" },
};

const HAIR: [string, string][] = [["#e8433a", "#8e1a20"], ["#3b3048", "#14101c"], ["#ffe08a", "#d19a2a"], ["#8fd3ff", "#2a5f9e"], ["#f2a6c8", "#a14a7a"], ["#a7794f", "#5a3a1f"]];
const STYLES: HairStyle[] = ["spiky", "long", "twin", "ponytail", "bob", "short"];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0;
  return h;
}

/** Deterministic look for user-created allies: colours from element, weapon from role keywords. */
export function generatedLook(u: UnitDef): HeroLook {
  const h = hash(u.id);
  const el = elementColor(u.element);
  const [hair, hairShade] = HAIR[h % HAIR.length]!;
  const role = u.role ?? "";
  const weapon: Weapon = /治療|療|heal/i.test(role) ? "wand" : /輔助|support/i.test(role) ? "fan" : /控制|持續|法/i.test(role) ? "staff" : /擊破|破/i.test(role) ? "scythe" : (["greatsword", "sword", "spear"] as Weapon[])[h % 3]!;
  const extras: Extra[] = ["none", "ribbon", "tiara", "feather", "none"];
  return {
    hair, hairShade, style: STYLES[(h >>> 3) % STYLES.length]!, eye: el.main, skin: "#ffe6d6",
    outfit: el.shade, outfitShade: "#1d1626", accent: el.main, glow: el.glow, weapon, extra: extras[(h >>> 7) % extras.length]!,
  };
}

/** Relative on-screen size of a unit (bosses are bigger). */
export function spriteScale(u: UnitDef): number {
  if (u.id === "colossus" || u.role === "首領") return 1.55;
  if (u.id === "golem") return 1.15;
  if (u.team === "enemy" && u.role === "精英") return 1.2;
  return 1;
}

export function Sprite({ unit, portrait = false, className }: { unit: UnitDef; portrait?: boolean; className?: string }) {
  if (unit.team === "ally") {
    return <Hero look={LOOKS[unit.id] ?? generatedLook(unit)} className={className} viewBox={portrait ? "26 6 72 72" : undefined} />;
  }
  const vb = portrait ? "20 14 120 120" : undefined;
  switch (unit.id) {
    case "bat": return <Bat className={className} viewBox={vb} />;
    case "golem": return <Golem className={className} viewBox={vb} />;
    case "sentinel": return <Sentinel className={className} viewBox={vb} />;
    case "colossus": return <Colossus className={className} viewBox={vb} />;
    default: {
      const c = elementColor(unit.element);
      return <Slime color={c.main} shade={c.shade} className={className} viewBox={vb} />;
    }
  }
}
