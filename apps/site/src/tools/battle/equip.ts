import { applyLoadout, validateLoadout, type EquipmentPiece, type Loadout, type Project, type SetDef, type StatBonus, type UnitDef } from "@ggt/core";
import raw from "./presets/hsr-equipment.generated.json";
import { hsrGroup } from "./presets/hsr";

/** Pure equipment logic (no React): selections -> core Loadout (docs/spec/loadout.md), templates, storage. */

export interface HsrBonus { key: string; op: "flat" | "pct"; value: number; element?: string }
export interface HsrLightCone { id: string; name: string; rarity: number; path: string; base: { hp: number; atk: number; def: number }; ranks: { rank: number; desc: string; bonuses: HsrBonus[] }[]; conditional: boolean }
export interface HsrSetTier { pieces: number; desc: string; bonuses: HsrBonus[]; conditional: boolean }
export interface HsrRelicSet { id: string; name: string; kind: "cavern" | "planar"; tiers: HsrSetTier[] }
export interface HsrMain { property: string; key: string; op: "flat" | "pct"; element?: string; value: number }
export interface HsrSub { property: string; key: string; op: "flat" | "pct"; element?: string; base: number; step: number; stepNum: number }
export interface HsrTraces { bonuses: HsrBonus[]; abilityNodes: { id: string; name: string; desc: string }[] }
export interface HsrEquipment {
  source: { text: string };
  properties: Record<string, { name: string }>;
  lightCones: HsrLightCone[];
  relicSets: HsrRelicSet[];
  mainStats: Record<string, HsrMain[]>;
  subStats: HsrSub[];
  traces: Record<string, HsrTraces>;
}
export const DATA = raw as unknown as HsrEquipment;

export const SLOTS = ["head", "hands", "body", "feet", "sphere", "rope"] as const;
export type RelicSlot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<RelicSlot, string> = { head: "頭部", hands: "手部", body: "軀幹", feet: "腳部", sphere: "連結球", rope: "連結繩" };
export const slotKind = (s: RelicSlot): "cavern" | "planar" => (s === "sphere" || s === "rope" ? "planar" : "cavern");

export const MAX_SUB_ROLLS_TOTAL = 9;
export const MAX_SUB_ROLLS_EACH = 6;
export const QUALITY_LABEL = ["低", "中", "高"] as const;

/** Light cone path (English id in the data) by the Chinese path names the character presets use. */
export const PATH_BY_NAME: Record<string, string> = { 巡獵: "Rogue", 豐饒: "Priest", 毀滅: "Warrior", 存護: "Knight", 虛無: "Warlock", 同諧: "Shaman", 智識: "Mage", 記憶: "Memory", 歡愉: "Elation" };
export const PATH_NAME: Record<string, string> = Object.fromEntries(Object.entries(PATH_BY_NAME).map(([k, v]) => [v, k]));

export interface SubSel { property: string; rolls: number; quality: number; /** Exact value overriding the roll model. */ manual: number | null }
export interface RelicSel { setId: string | null; main: string | null; subs: SubSel[] }
export interface LoadoutSel { lc: string | null; rank: number; relics: Record<RelicSlot, RelicSel>; traces: boolean }
export type LoadoutStore = Record<string, LoadoutSel>;

const lcById = new Map(DATA.lightCones.map((x) => [x.id, x]));
const setById = new Map(DATA.relicSets.map((x) => [x.id, x]));
export const findLightCone = (id: string | null) => (id ? lcById.get(id) : undefined);
export const findSet = (id: string | null) => (id ? setById.get(id) : undefined);
export const subDef = (property: string) => DATA.subStats.find((s) => s.property === property);
export const mainDef = (slot: RelicSlot, property: string | null) => DATA.mainStats[slot]?.find((m) => m.property === property);

export interface HsrInfo { charId: string; path: string | null; traces: HsrTraces | undefined }
export function hsrInfo(unit: UnitDef): HsrInfo | null {
  const m = /^hsr[-_](\d+)/.exec(unit.id);
  if (!m) return null;
  const charId = m[1]!;
  const preset = hsrGroup.presets.find((p) => p.id === `hsr-${charId}`);
  return { charId, path: PATH_BY_NAME[preset?.facets?.["命途"] ?? ""] ?? null, traces: DATA.traces[charId] };
}

const emptyRelic = (): RelicSel => ({ setId: null, main: null, subs: [] });
export function emptySel(traces: boolean): LoadoutSel {
  return { lc: null, rank: 1, relics: { head: emptyRelic(), hands: emptyRelic(), body: emptyRelic(), feet: emptyRelic(), sphere: emptyRelic(), rope: emptyRelic() }, traces };
}
/** The selection a unit has when the player has not touched it: nothing equipped, traces on for HSR characters. */
export const defaultSel = (unit: UnitDef): LoadoutSel => emptySel(!!hsrInfo(unit)?.traces);

/** Repairs a stored selection (older or hand-edited saves) so it can never break the page. */
export function sanitize(x: unknown, unit: UnitDef): LoadoutSel {
  const out = defaultSel(unit);
  if (!x || typeof x !== "object") return out;
  const s = x as Partial<LoadoutSel>;
  if (typeof s.lc === "string" && lcById.has(s.lc)) out.lc = s.lc;
  if (typeof s.rank === "number" && s.rank >= 1 && s.rank <= 5) out.rank = Math.round(s.rank);
  if (typeof s.traces === "boolean") out.traces = s.traces && !!hsrInfo(unit)?.traces;
  for (const slot of SLOTS) {
    const r = s.relics?.[slot];
    if (!r || typeof r !== "object") continue;
    const o = out.relics[slot];
    if (typeof r.setId === "string" && setById.get(r.setId)?.kind === slotKind(slot)) o.setId = r.setId;
    if (typeof r.main === "string" && mainDef(slot, r.main)) o.main = r.main;
    for (const sub of Array.isArray(r.subs) ? r.subs.slice(0, 4) : []) {
      if (!sub || !subDef(sub.property) || o.subs.some((y) => y.property === sub.property) || sub.property === o.main) continue;
      o.subs.push({
        property: sub.property,
        rolls: Math.max(1, Math.min(MAX_SUB_ROLLS_EACH, Math.round(Number(sub.rolls) || 1))),
        quality: Math.max(0, Math.min(2, Math.round(Number(sub.quality) || 0))),
        manual: typeof sub.manual === "number" && Number.isFinite(sub.manual) ? sub.manual : null,
      });
    }
  }
  return out;
}

export const subValue = (s: SubSel): number => {
  if (s.manual !== null) return s.manual;
  const d = subDef(s.property)!;
  return d.base * s.rolls + d.step * s.quality * s.rolls;
};
export const subRollTotal = (r: RelicSel) => r.subs.reduce((a, s) => a + s.rolls, 0);

export const propLabel = (property: string) => DATA.properties[property]?.name ?? property;
export function statLabel(d: { property: string; key: string; op: "flat" | "pct" }) {
  const n = propLabel(d.property);
  if (d.op === "pct") return `${n}%`;
  return /^(hp|atk|def)$/.test(d.key) ? `${n}（固定值）` : n;
}

/** Percent-style display for stat keys held as fractions. */
export const PERCENT_KEYS = new Set(["critRate", "critDmg", "dmgBonus", "breakEffect", "effectHit", "effectRes", "energyRegen", "healBonus"]);
export const SUMMARY_KEYS: { key: string; label: string }[] = [
  { key: "hp", label: "生命值" }, { key: "atk", label: "攻擊力" }, { key: "def", label: "防禦力" }, { key: "spd", label: "速度" },
  { key: "critRate", label: "暴擊率" }, { key: "critDmg", label: "暴擊傷害" }, { key: "dmgBonus", label: "增傷" }, { key: "breakEffect", label: "擊破特攻" },
  { key: "effectHit", label: "效果命中" }, { key: "effectRes", label: "效果抵抗" }, { key: "energyRegen", label: "能量恢復效率" }, { key: "healBonus", label: "治療加成" },
];

export interface EquipNotes {
  /** Effects that exist in the data but are not simulated. */
  conditional: { source: string; desc: string }[];
  /** Elemental bonuses of another element, left out. */
  ignored: string[];
  /** Pieces counted per set id. */
  counts: Record<string, number>;
}

/** Compiles a selection into a core Loadout for this unit (element bonuses folded by the wearer's element). */
export function buildLoadout(unit: UnitDef, sel: LoadoutSel): { loadout: Loadout; notes: EquipNotes } {
  const notes: EquipNotes = { conditional: [], ignored: [], counts: {} };
  const fold = (src: string, list: HsrBonus[]): StatBonus[] => {
    const out: StatBonus[] = [];
    for (const b of list) {
      if (b.element !== undefined && b.element !== unit.element) { notes.ignored.push(`${src}：${b.element}屬性增傷 ${(b.value * 100).toFixed(1)}%`); continue; }
      out.push({ key: b.key, op: b.op, value: b.value });
    }
    return out;
  };
  const pieces: EquipmentPiece[] = [];
  const lc = findLightCone(sel.lc);
  if (lc) {
    const rank = lc.ranks.find((r) => r.rank === sel.rank) ?? lc.ranks[0]!;
    pieces.push({ id: `lc-${lc.id}`, name: lc.name, slot: "weapon", base: { ...lc.base }, bonuses: fold(`光錐「${lc.name}」`, rank.bonuses) });
    if (lc.conditional) notes.conditional.push({ source: `光錐「${lc.name}」（疊影 ${rank.rank}）`, desc: rank.desc });
  }
  const sets = new Map<string, HsrRelicSet>();
  for (const slot of SLOTS) {
    const r = sel.relics[slot];
    const set = findSet(r.setId);
    const bonuses: StatBonus[] = [];
    const main = mainDef(slot, r.main);
    if (main) bonuses.push(...fold(`${SLOT_LABEL[slot]}主詞條`, [{ key: main.key, op: main.op, value: main.value, element: main.element }]));
    for (const s of r.subs) {
      const d = subDef(s.property);
      if (d) bonuses.push({ key: d.key, op: d.op, value: subValue(s) });
    }
    if (!set && !main && !bonuses.length) continue;
    if (set) { sets.set(set.id, set); notes.counts[set.id] = (notes.counts[set.id] ?? 0) + 1; }
    pieces.push({ id: `relic-${slot}`, name: `${SLOT_LABEL[slot]}${set ? `（${set.name}）` : ""}`, slot, ...(set ? { setId: set.id } : {}), bonuses });
  }
  const setDefs: SetDef[] = [];
  for (const set of sets.values()) {
    const n = notes.counts[set.id] ?? 0;
    setDefs.push({ id: set.id, name: set.name, tiers: set.tiers.map((t) => ({ pieces: t.pieces, bonuses: fold(`${set.name} ${t.pieces} 件`, t.bonuses) })) });
    for (const t of set.tiers) if (n >= t.pieces && t.conditional) notes.conditional.push({ source: `${set.name} ${t.pieces} 件`, desc: t.desc });
  }
  const info = hsrInfo(unit);
  if (sel.traces && info?.traces) pieces.push({ id: "traces", name: "行跡數值", slot: "trace", bonuses: fold("行跡", info.traces.bonuses) });
  return { loadout: { pieces, sets: setDefs }, notes };
}

export interface CompiledUnit { unit: UnitDef; errors: string[]; warnings: string[]; notes: EquipNotes; loadout: Loadout }
export function compileUnit(unit: UnitDef, sel: LoadoutSel, project: Project): CompiledUnit {
  const { loadout, notes } = buildLoadout(unit, sel);
  const issues = validateLoadout(unit, loadout, project.battle.statuses);
  const errors = issues.filter((i) => i.level === "error").map((i) => i.message);
  const warnings = issues.filter((i) => i.level === "warning").map((i) => i.message);
  for (const slot of SLOTS) {
    const r = sel.relics[slot];
    if (subRollTotal(r) > MAX_SUB_ROLLS_TOTAL && r.subs.every((s) => s.manual === null)) warnings.push(`${SLOT_LABEL[slot]}副詞條共 ${subRollTotal(r)} 次強化，超過遊戲內 +15 的上限 ${MAX_SUB_ROLLS_TOTAL}`);
  }
  if (errors.length || !loadout.pieces.length) return { unit, errors, warnings, notes, loadout };
  return { unit: applyLoadout(unit, loadout).unit, errors, warnings, notes, loadout };
}

export interface CompiledProject { project: Project; units: Record<string, CompiledUnit>; problems: string[] }
/** Every ally of the project with its loadout applied. Units whose loadout has errors stay bare (and are reported). */
export function compileProject(project: Project, store: LoadoutStore): CompiledProject {
  const out = structuredClone(project);
  const units: Record<string, CompiledUnit> = {};
  const problems: string[] = [];
  out.battle.units = out.battle.units.map((u) => {
    if (u.team !== "ally") return u;
    const c = compileUnit(u, sanitize(store[u.id], u), project);
    units[u.id] = c;
    for (const e of c.errors) problems.push(`${u.name}：${e}`);
    return c.unit;
  });
  return { project: out, units, problems };
}

export function loadStore(): LoadoutStore {
  try {
    const raw0 = localStorage.getItem(STORE_KEY);
    const x = raw0 ? (JSON.parse(raw0) as unknown) : null;
    if (x && typeof x === "object") return x as LoadoutStore;
  } catch { /* storage unavailable or corrupt */ }
  return {};
}
const STORE_KEY = "ggt.site.battle.loadouts.v1";
export function saveStore(s: LoadoutStore): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
export function clearStore(): void {
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
}

// ---------- generic templates ----------

export type TemplateId = "dps" | "support" | "tank";
export const TEMPLATE_LABEL: Record<TemplateId, string> = { dps: "輸出", support: "輔助", tank: "生存" };

interface Template {
  cavern: string; planar: string;
  mains: Record<RelicSlot, string>;
  /** Preferred substats in order with roll counts (total 9 per piece), quality "mid". */
  subs: [string, number][];
}
const TEMPLATES: Record<TemplateId, Template> = {
  dps: {
    cavern: "120", planar: "309",
    mains: { head: "HPDelta", hands: "AttackDelta", body: "CriticalDamageBase", feet: "AttackAddedRatio", sphere: "ELEMENT", rope: "AttackAddedRatio" },
    subs: [["CriticalChanceBase", 3], ["CriticalDamageBase", 3], ["AttackAddedRatio", 2], ["SpeedDelta", 1], ["BreakDamageAddedRatioBase", 1], ["StatusProbabilityBase", 1]],
  },
  support: {
    cavern: "114", planar: "308",
    mains: { head: "HPDelta", hands: "AttackDelta", body: "HPAddedRatio", feet: "SpeedDelta", sphere: "HPAddedRatio", rope: "SPRatioBase" },
    subs: [["SpeedDelta", 3], ["HPAddedRatio", 2], ["StatusProbabilityBase", 2], ["StatusResistanceBase", 2], ["DefenceAddedRatio", 1]],
  },
  tank: {
    cavern: "113", planar: "304",
    mains: { head: "HPDelta", hands: "AttackDelta", body: "DefenceAddedRatio", feet: "SpeedDelta", sphere: "DefenceAddedRatio", rope: "DefenceAddedRatio" },
    subs: [["DefenceAddedRatio", 3], ["HPAddedRatio", 2], ["StatusResistanceBase", 2], ["SpeedDelta", 2], ["HPDelta", 1]],
  },
};

/** Generic 5-star +15 template (keeps the current light cone). Not a recommendation for any specific character. */
export function applyTemplate(unit: UnitDef, sel: LoadoutSel, id: TemplateId): LoadoutSel {
  const t = TEMPLATES[id];
  const out = structuredClone(sel);
  for (const slot of SLOTS) {
    let main = t.mains[slot];
    if (main === "ELEMENT") main = DATA.mainStats.sphere!.find((m) => m.element === unit.element)?.property ?? "AttackAddedRatio";
    const r = out.relics[slot];
    r.setId = slotKind(slot) === "cavern" ? t.cavern : t.planar;
    r.main = main;
    r.subs = [];
    let left = MAX_SUB_ROLLS_TOTAL;
    for (const [property, rolls] of t.subs) {
      if (r.subs.length >= 4 || left <= 0 || property === main) continue;
      const n = Math.min(rolls, left);
      r.subs.push({ property, rolls: n, quality: 1, manual: null });
      left -= n;
    }
    // Spend whatever is left on the first substat so each piece has the full 9 upgrades.
    if (left > 0 && r.subs.length) r.subs[0]!.rolls = Math.min(MAX_SUB_ROLLS_EACH, r.subs[0]!.rolls + left);
  }
  return out;
}
