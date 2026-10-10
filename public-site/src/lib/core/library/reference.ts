/**
 * Converts entries of a local "reference pack" (research data the user collected, e.g. via
 * scripts/build-*-pack.mjs) into editable UnitDef drafts. The tool never ships reference data; the pack is a
 * file the user opens. Conversion is deliberately conservative: numbers are copied as-is (no rounding), and
 * anything the source does not state (enemy skill multipliers, AI) becomes a clearly marked placeholder.
 */
import type { SkillDef, UnitDef } from "../battle/types";

export const REFERENCE_PACK_KIND = "ggt-reference-pack";

export interface GrowthValue {
  base: number;
  step: number;
}

export interface RefEnemy {
  /** Source-local stable key (never a guessed game ID). */
  key: string;
  name: string;
  variantLabel?: string;
  group?: string;
  /** Level-curve coefficients: stat(level) = coeff × curve[level − 1] (effectRes is additive). */
  coeff: { hp: number; atk: number; def: number; spd: number; effectResBase: number };
  toughness: number;
  /** Source element names. */
  weaknesses: string[];
  elementRes: Record<string, number>;
  /** Source debuff-category names → resistance. */
  statusRes: Record<string, number>;
  skills: { name: string; type: string; desc: string; phases?: number[] | null }[];
}

export interface RefCharacter {
  id: string;
  name: string;
  rarity?: number;
  path?: string;
  element: string;
  maxEnergy: number;
  /** One entry per ascension; each stat grows as base + step × (level − 1). */
  promotions: Record<string, GrowthValue>[];
  skills: { id: string; name: string; type: string; typeText?: string; effect?: string; maxLevel: number; desc: string; params: number[][] }[];
}

export interface RefInteraction {
  id: string;
  enemyKey: string;
  title: string;
  summary: string;
  needs: string[];
  /** How the current rules cover it (written by whoever built the pack). */
  coverage?: { supported: string[]; missing: string[] };
}

export interface ReferencePack {
  kind: typeof REFERENCE_PACK_KIND;
  schemaVersion: 1;
  title: string;
  /** Shown prominently: version/licence/accuracy caveats. */
  caveats: string[];
  sources: { id: string; status: string; version?: string | null; note?: string }[];
  elementNames: string[];
  statusCategoryNames: string[];
  enemyCurves?: { hp: number[]; attack: number[]; defense: number[]; speed: number[]; effHitRate: number[]; effRes: number[] };
  enemies: RefEnemy[];
  characters: RefCharacter[];
  interactions?: RefInteraction[];
}

export interface ImportOptions {
  level: number;
  /** Source element name → project element key. Unmapped elements are dropped (and reported). */
  elementMap: Record<string, string>;
  /** Source debuff category → project status category. */
  statusCategoryMap: Record<string, string>;
  /** Multiplies source toughness (scales differ between sources). */
  toughnessScale: number;
  /** Character skills: level per skill type; clamped to the skill's max level. */
  skillLevels?: { basic: number; skill: number; ultimate: number; talent: number };
}

export interface ImportResult {
  unit: UnitDef;
  warnings: string[];
}

export function validatePack(raw: unknown): string[] {
  const p = raw as Partial<ReferencePack> | null;
  if (!p || typeof p !== "object") return ["檔案內容不是物件"];
  if (p.kind !== REFERENCE_PACK_KIND) return [`不是參考資料包（kind 應為 "${REFERENCE_PACK_KIND}"）`];
  const errs: string[] = [];
  if (p.schemaVersion !== 1) errs.push(`不支援的資料包版本 ${String(p.schemaVersion)}`);
  if (!Array.isArray(p.enemies)) errs.push("缺少 enemies 陣列");
  if (!Array.isArray(p.characters)) errs.push("缺少 characters 陣列");
  if (p.enemies?.length && !p.enemyCurves) errs.push("有敵人資料但缺少 enemyCurves 等級曲線");
  for (const k of ["hp", "attack", "defense", "speed", "effHitRate", "effRes"] as const) {
    if (p.enemyCurves && !(Array.isArray(p.enemyCurves[k]) && p.enemyCurves[k].length > 0)) errs.push(`enemyCurves.${k} 必須是非空陣列`);
  }
  return errs;
}

export const DEFAULT_ELEMENT_MAP: Record<string, string> = {
  Physical: "physical", Fire: "fire", Ice: "ice", Lightning: "thunder", Wind: "wind", Quantum: "light", Imaginary: "shadow",
};

export const DEFAULT_STATUS_CATEGORY_MAP: Record<string, string> = {
  Burn: "burn", Frozen: "freeze", Shock: "shock", "Wind Shear": "windShear", Entanglement: "entangle", Imprisonment: "imprison", "Control Effects": "control",
};

/** Level-curve stats, exactly as the source calculator multiplies them (no rounding). */
export function enemyStatsAt(pack: Pick<ReferencePack, "enemyCurves">, e: RefEnemy, level: number) {
  const c = pack.enemyCurves;
  if (!c) throw new Error("資料包缺少敵人等級曲線");
  const i = Math.min(c.hp.length, Math.max(1, Math.round(level))) - 1;
  return {
    hp: e.coeff.hp * c.hp[i]!,
    atk: e.coeff.atk * c.attack[i]!,
    def: e.coeff.def * c.defense[i]!,
    spd: e.coeff.spd * c.speed[i]!,
    effectHit: c.effHitRate[i]!,
    effectRes: e.coeff.effectResBase + c.effRes[i]!,
  };
}

/** Ascension needed to reach a level when each ascension raises the cap by 10 from 20. */
export const ascensionFor = (level: number) => Math.max(0, Math.ceil((level - 20) / 10));

export function characterStatsAt(ch: RefCharacter, level: number, ascension = ascensionFor(level)): Record<string, number> {
  const row = ch.promotions[Math.min(ch.promotions.length - 1, Math.max(0, ascension))];
  if (!row) throw new Error(`「${ch.name}」沒有成長資料`);
  const v = (k: string) => (row[k] ? row[k]!.base + row[k]!.step * (level - 1) : undefined);
  const out: Record<string, number> = {};
  const map: [string, string][] = [["hp", "hp"], ["atk", "atk"], ["def", "def"], ["spd", "spd"], ["taunt", "taunt"], ["crit_rate", "critRate"], ["crit_dmg", "critDmg"]];
  for (const [src, key] of map) {
    const x = v(src);
    if (x !== undefined) out[key] = x;
  }
  return out;
}

/** Fills "#n[i]" placeholders (1-based param index); "#n[i]%" shows the value as a percentage. */
export function renderSkillText(desc: string, params: number[]): string {
  return desc
    .replace(/#(\d+)\[i\]%/g, (_, n) => `${+(params[Number(n) - 1]! * 100).toFixed(2)}%`)
    .replace(/#(\d+)\[[if]\d*\]/g, (_, n) => `${+(params[Number(n) - 1] ?? NaN).toFixed(4)}`)
    .replace(/<[^>]+>/g, "");
}

function uniqueId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const clean = base.replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "unit";
  let id = clean;
  for (let n = 2; set.has(id); n++) id = `${clean}_${n}`;
  return id;
}

function mapElement(name: string, opts: ImportOptions, warnings: string[]): string | undefined {
  const m = opts.elementMap[name];
  if (!m) warnings.push(`屬性「${name}」沒有對照，已略過`);
  return m;
}

/** Wording-based placeholder multiplier for enemy skills whose source text gives no numbers. */
const INTENSITY: [RegExp, number][] = [[/\bminor\b/i, 1], [/\bmoderate\b/i, 2], [/\b(heavy|massive|great|huge)\b/i, 3]];

export function unitFromEnemy(pack: Pick<ReferencePack, "enemyCurves">, e: RefEnemy, opts: ImportOptions, takenIds: Iterable<string>): ImportResult {
  const warnings: string[] = [];
  const s = enemyStatsAt(pack, e, opts.level);
  const elementRes: Record<string, number> = {};
  for (const [el, v] of Object.entries(e.elementRes)) {
    const k = mapElement(el, opts, warnings);
    if (!k) continue;
    if (k in elementRes && elementRes[k] !== v) warnings.push(`多個來源屬性對照到「${k}」，抗性採用最後一個`);
    elementRes[k] = v;
  }
  const statusRes: Record<string, number> = {};
  for (const [cat, v] of Object.entries(e.statusRes)) {
    const k = opts.statusCategoryMap[cat];
    if (k && v !== 0) statusRes[k] = v;
  }
  const weaknesses = [...new Set(e.weaknesses.map((w) => mapElement(w, opts, warnings)).filter((x): x is string => !!x))];

  const skills: SkillDef[] = [];
  const talents: string[] = [];
  e.skills.forEach((sk, i) => {
    if (sk.type !== "Ability") { talents.push(`${sk.name}：${sk.desc}`); return; }
    const text = sk.desc;
    const elName = Object.keys(opts.elementMap).find((el) => new RegExp(`\\b${el} DMG`, "i").test(text));
    if (!/DMG/i.test(text)) {
      talents.push(`${sk.name}（無傷害的技能，未轉換）：${text}`);
      return;
    }
    const target = /all targets|all allies|all characters/i.test(text) ? "allEnemies" : /adjacent/i.test(text) ? "blast" : "enemy";
    const mult = INTENSITY.find(([re]) => re.test(text))?.[1] ?? 1;
    skills.push({
      id: `s${i + 1}`,
      name: sk.name,
      type: "basic",
      element: elName ? opts.elementMap[elName] : undefined,
      spDelta: 0,
      energyGain: 0,
      targeting: target === "allEnemies" ? "none" : "enemy",
      effects: [{ kind: "damage", target, multiplier: mult, adjMultiplier: target === "blast" ? mult / 2 : undefined, toughness: 0 }],
      description: `【佔位倍率 ${mult * 100}%，依用詞推估，請自行確認】${text}`,
    });
  });
  if (!skills.length) {
    skills.push({ id: "s1", name: "攻擊（佔位）", type: "basic", spDelta: 0, energyGain: 0, targeting: "enemy", effects: [{ kind: "damage", target: "enemy", multiplier: 1, toughness: 0 }], description: "來源沒有可轉換的傷害技能；請自行設定。" });
    warnings.push("沒有可轉換的傷害技能，已建立佔位攻擊");
  }
  for (const sk of skills) if (!sk.element) delete sk.element;
  for (const sk of skills) for (const ef of sk.effects) if (ef.kind === "damage" && ef.adjMultiplier === undefined) delete ef.adjMultiplier;
  warnings.push("敵人技能倍率、AI 權重為佔位值；來源沒有提供");
  if (opts.toughnessScale !== 1) warnings.push(`韌性已乘以 ${opts.toughnessScale}`);

  const unit: UnitDef = {
    id: uniqueId(`ref_${e.key.split(":").slice(1).join("_")}`, takenIds),
    name: e.variantLabel && e.variantLabel !== e.name ? `${e.name}（${e.variantLabel}）` : e.name,
    team: "enemy",
    element: mostCommon(skills.map((sk) => sk.element).filter((x): x is string => !!x)) ?? weaknesses[0] ?? "physical",
    role: e.group ?? "參考匯入",
    stats: {
      level: opts.level, hp: s.hp, atk: s.atk, def: s.def, spd: s.spd, effectHit: s.effectHit, effectRes: s.effectRes,
      toughness: e.toughness * opts.toughnessScale, res: 0, critRate: 0, critDmg: 0, dmgBonus: 0, defIgnore: 0, resPen: 0, vulnerability: 0, dmgReduction: 0, breakEffect: 0, maxEnergy: 0,
    },
    weaknesses,
    elementRes,
    statusRes,
    skills,
    ai: skills.map((sk) => ({ skillId: sk.id, weight: 1 })),
    source: { kind: "reference-enemy", key: e.key, note: `Lv${opts.level}` },
    description: talents.join("\n"),
  };
  return { unit, warnings };
}

/** Most frequent value; ties go to the first seen. */
function mostCommon(xs: string[]): string | undefined {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  let best: string | undefined;
  for (const [x, c] of n) if (best === undefined || c > n.get(best)!) best = x;
  return best;
}

const SKILL_KIND: Record<string, "basic" | "skill" | "ultimate"> = { Normal: "basic", BPSkill: "skill", Ultra: "ultimate" };

export function unitFromCharacter(ch: RefCharacter, opts: ImportOptions, takenIds: Iterable<string>): ImportResult {
  const warnings: string[] = [];
  const lv = opts.skillLevels ?? { basic: 6, skill: 10, ultimate: 10, talent: 10 };
  const element = mapElement(ch.element, opts, warnings) ?? "physical";
  const stats = characterStatsAt(ch, opts.level);
  const skills: SkillDef[] = [];
  const notes: string[] = [];
  for (const sk of ch.skills) {
    const kind = SKILL_KIND[sk.type];
    const level = Math.min(sk.maxLevel, Math.max(1, kind ? lv[kind] : lv.talent));
    const params = sk.params[level - 1] ?? [];
    const text = renderSkillText(sk.desc, params);
    if (!kind) { notes.push(`【${sk.typeText ?? sk.type}】${sk.name}：${text}`); continue; }
    if (skills.some((x) => x.type === kind)) { notes.push(`【${sk.typeText ?? sk.type}・強化版】${sk.name}：${text}`); continue; }
    const attack = sk.effect === "SingleAttack" || sk.effect === "Blast" || sk.effect === "AoEAttack" || sk.effect === "Bounce";
    const target = sk.effect === "Blast" ? "blast" : sk.effect === "AoEAttack" ? "allEnemies" : "enemy";
    const tough = kind === "basic" ? 10 : 20;
    const def: SkillDef = {
      id: kind === "ultimate" ? "ult" : kind,
      name: sk.name,
      type: kind,
      spDelta: kind === "basic" ? 1 : kind === "skill" ? -1 : 0,
      energyGain: kind === "basic" ? 20 : kind === "skill" ? 30 : 5,
      targeting: attack ? (target === "allEnemies" ? "none" : "enemy") : sk.effect === "Defence" || sk.effect === "Restore" || sk.effect === "Support" ? "ally" : "none",
      effects: [],
      description: `Lv${level}：${text}`,
    };
    if (kind === "ultimate") def.energyCost = ch.maxEnergy;
    if (attack && typeof params[0] === "number") {
      def.effects.push({ kind: "damage", target, multiplier: params[0], toughness: tough, ...(target === "blast" && typeof params[1] === "number" ? { adjMultiplier: params[1], adjToughness: tough / 2 } : {}) });
      def.description = `【倍率取參數 1${target === "blast" ? "、相鄰取參數 2" : ""}，請對照說明確認】` + def.description;
    } else {
      warnings.push(`「${sk.name}」的效果需要依說明手動設定`);
    }
    skills.push(def);
  }
  if (!skills.some((s) => s.type === "basic")) warnings.push("沒有找到普攻");
  warnings.push("未含光錐、遺器、行跡與星魂加成；削韌量為預設值");
  const unit: UnitDef = {
    id: uniqueId(`ref_c${ch.id}`, takenIds),
    name: ch.name,
    team: "ally",
    element,
    role: ch.path ?? "參考匯入",
    stats: {
      level: opts.level, critRate: 0.05, critDmg: 0.5, ...stats, maxEnergy: ch.maxEnergy, startEnergy: 0,
      dmgBonus: 0, defIgnore: 0, res: 0, resPen: 0, vulnerability: 0, dmgReduction: 0, effectHit: 0, effectRes: 0, breakEffect: 0,
    },
    weaknesses: [],
    skills,
    source: { kind: "reference-character", key: ch.id, note: `Lv${opts.level}` },
    description: notes.join("\n"),
  };
  return { unit, warnings };
}
