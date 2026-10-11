#!/usr/bin/env node
// Builds apps/site/src/tools/battle/presets/hsr.generated.json from the local HSR reference pack and the
// kit-coverage catalog. No dependencies; output is deterministic (no timestamps).
//   node scripts/build-hsr-presets.mjs
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pack = JSON.parse(readFileSync(join(root, "data/reference/hsr/pack.json"), "utf8"));
const catalog = JSON.parse(readFileSync(join(root, "docs/research/hsr-kit/catalog.json"), "utf8"));
const KITS_DIR = process.env.HSR_KITS_DIR ?? join(root, "data/reference/hsr/kits"); // env overrides exist for testing the generator
const implemented = new Set(JSON.parse(readFileSync(join(KITS_DIR, "implemented.json"), "utf8")).modules);
const OUT = process.env.HSR_PRESETS_OUT ?? join(root, "apps/site/src/tools/battle/presets/hsr.generated.json");

const LEVEL = 80;
const LV = { basic: 6, skill: 10, ultimate: 10, talent: 10 };
const ELEMENT_MAP = { Physical: "physical", Fire: "fire", Ice: "ice", Lightning: "thunder", Thunder: "thunder", Wind: "wind", Quantum: "light", Imaginary: "shadow" };
const ELEMENT_ZH = { Physical: "物理", Fire: "火", Ice: "冰", Lightning: "雷", Thunder: "雷", Wind: "風", Quantum: "量子", Imaginary: "虛數" };

// ---- ported from packages/core/src/library/reference.ts (growth, ascension, text rendering) ----
const ascensionFor = (level) => Math.max(0, Math.ceil((level - 20) / 10));
function statsAt(ch, level) {
  const row = ch.promotions[Math.min(ch.promotions.length - 1, Math.max(0, ascensionFor(level)))];
  const v = (k) => (row[k] ? row[k].base + row[k].step * (level - 1) : undefined);
  const out = {};
  for (const [src, key] of [["hp", "hp"], ["atk", "atk"], ["def", "def"], ["spd", "spd"], ["taunt", "taunt"], ["crit_rate", "critRate"], ["crit_dmg", "critDmg"]]) {
    const x = v(src);
    if (x !== undefined) out[key] = x;
  }
  return out;
}
const renderText = (desc, params) =>
  desc
    .replace(/#(\d+)\[i\]%/g, (_, n) => `${+(params[Number(n) - 1] * 100).toFixed(2)}%`)
    .replace(/#(\d+)\[[if]\d*\]/g, (_, n) => `${+(params[Number(n) - 1] ?? NaN).toFixed(4)}`)
    .replace(/<[^>]+>/g, "");

// ---- names / subtitles ----
const pathCount = new Map();
const pathElCount = new Map();
for (const c of pack.characters) {
  if (c.name !== "{NICKNAME}") continue;
  pathCount.set(c.path, (pathCount.get(c.path) ?? 0) + 1);
  const k = `${c.path}|${c.element}`;
  pathElCount.set(k, (pathElCount.get(k) ?? 0) + 1);
}
function displayName(c) {
  if (c.name !== "{NICKNAME}") return c.name;
  if (pathCount.get(c.path) === 1) return `開拓者（${c.path}）`;
  const withEl = `開拓者（${c.path}・${ELEMENT_ZH[c.element] ?? c.element}）`;
  return pathElCount.get(`${c.path}|${c.element}`) === 1 ? withEl : `${withEl} #${c.id}`;
}

const priority = catalog.priority.map((p) => p.module);
const rank = (m) => { const i = priority.indexOf(m); return i < 0 ? priority.length : i; };
const moduleTitle = new Map(catalog.modules.map((m) => [m.id, m.title]));
const catChar = new Map(catalog.characters.map((c) => [c.id, c]));

/** `missing` = catalog required modules minus the ones implemented in core. */
function unavailableReason(missing) {
  const ordered = [...missing].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  const titles = ordered.slice(0, 4).map((m) => moduleTitle.get(m) ?? m);
  return `尚未支援：${titles.join("、")}${ordered.length > 4 ? `等 ${ordered.length} 項` : ""}`;
}

// ---- kit builders for characters whose required modules are all available ----
const baseStats = (ch) => ({
  level: LEVEL, critRate: 0.05, critDmg: 0.5, ...statsAt(ch, LEVEL), maxEnergy: ch.maxEnergy, startEnergy: 0,
  dmgBonus: 0, defIgnore: 0, res: 0, resPen: 0, vulnerability: 0, dmgReduction: 0, effectHit: 0, effectRes: 0, breakEffect: 0,
});

function skillOf(ch, suffix) {
  const sk = ch.skills.find((s) => s.id === `${ch.id}${suffix}`);
  if (!sk) throw new Error(`${ch.id}: missing skill ${ch.id}${suffix}`);
  return sk;
}
function paramsAt(sk, level) {
  const l = Math.min(sk.maxLevel, level);
  return { level: l, p: sk.params[l - 1] ?? [], text: `Lv${l}：${renderText(sk.desc, sk.params[l - 1] ?? [])}` };
}

/** Trailblazer (Destruction): survey-3 "ready". Two ultimates stand for the two modes; the break talent is an
 *  allyBreak passive that stacks an ATK buff on self (also fires on teammates' breaks: approximation). */
function destructionTrailblazer(ch) {
  const pre = `hsr_${ch.id}_`;
  const basic = paramsAt(skillOf(ch, "01"), LV.basic);
  const skill = paramsAt(skillOf(ch, "02"), LV.skill);
  const ultA = paramsAt(skillOf(ch, "08"), LV.ultimate);
  const ultB = paramsAt(skillOf(ch, "09"), LV.ultimate);
  const talent = paramsAt(skillOf(ch, "04"), LV.talent);
  const statusId = `${pre}talent-atk`;
  const skills = [
    { id: `${pre}basic`, name: skillOf(ch, "01").name, type: "basic", spDelta: 1, energyGain: 20, targeting: "enemy",
      effects: [{ kind: "damage", target: "enemy", multiplier: basic.p[0], toughness: 10 }], description: basic.text },
    { id: `${pre}skill`, name: skillOf(ch, "02").name, type: "skill", spDelta: -1, energyGain: 30, targeting: "enemy",
      effects: [{ kind: "damage", target: "blast", multiplier: skill.p[0], adjMultiplier: skill.p[0], toughness: 20, adjToughness: 10 }], description: skill.text },
    { id: `${pre}ult-single`, name: `${skillOf(ch, "03").name}（${skillOf(ch, "08").name}）`, type: "ultimate", spDelta: 0, energyGain: 5, energyCost: ch.maxEnergy, targeting: "enemy",
      effects: [{ kind: "damage", target: "enemy", multiplier: ultA.p[0], toughness: 20 }], description: `全勝・單體。${ultA.text}` },
    { id: `${pre}ult-blast`, name: `${skillOf(ch, "03").name}（${skillOf(ch, "09").name}）`, type: "ultimate", spDelta: 0, energyGain: 5, energyCost: ch.maxEnergy, targeting: "enemy",
      effects: [{ kind: "damage", target: "blast", multiplier: ultB.p[0], adjMultiplier: ultB.p[1], toughness: 20, adjToughness: 10 }], description: `全勝・擴散。${ultB.text}` },
    { id: `${pre}talent`, name: skillOf(ch, "04").name, type: "followup", spDelta: 0, energyGain: 0, targeting: "none",
      effects: [{ kind: "status", target: "self", statusId, chance: 1 }], description: talent.text },
  ];
  const unit = {
    id: `hsr_${ch.id}`, name: displayName(ch), team: "ally", element: ELEMENT_MAP[ch.element], role: ch.path,
    stats: baseStats(ch), weaknesses: [], skills,
    passives: [{ id: `${pre}talent`, name: skillOf(ch, "04").name, on: "allyBreak", skillId: `${pre}talent`, limitPerTurn: 0,
      description: "擊破敵人弱點後，自身攻擊力疊層提高（上限見狀態）。" }],
    source: { kind: "reference-character", key: ch.id, note: `Lv${LEVEL}` },
    description: "兩種終結技模式以兩個終結技技能表示。未含光錐、遺器、行跡與星魂。",
  };
  const statuses = [{
    id: statusId, name: `${skillOf(ch, "04").name}：攻擊力提高`, kind: "buff", duration: 0, maxStacks: talent.p[1],
    modifiers: [{ target: "stat:atk", op: "pct", value: talent.p[0] }],
    description: `每層攻擊力 +${+(talent.p[0] * 100).toFixed(2)}%，最多 ${talent.p[1]} 層，持續整場戰鬥。`,
  }];
  return { unit, statuses, note: "隊友擊破也會觸發天賦（近似）；兩種終結技模式拆成兩個技能。" };
}

const KITS = { 8001: destructionTrailblazer, 8002: destructionTrailblazer };

// ---- per-character kit files: data/reference/hsr/kits/<charId>.json ----
//   { id, skills: SkillDef[], passives?: PassiveDef[], statuses?: StatusDef[], stats?: {..merged over Lv80 base..}, approximations?: string[] }
// Every skill/passive/status id must start with `hsr_<charId>_`.
const kitErrors = [];
function loadKit(ch) {
  const file = join(KITS_DIR, `${ch.id}.json`);
  if (!existsSync(file)) return null;
  const before = kitErrors.length;
  const fail = (m) => kitErrors.push(`kits/${ch.id}.json: ${m}`);
  let kit;
  try { kit = JSON.parse(readFileSync(file, "utf8")); } catch (e) { fail(`JSON 無法解析（${e.message}）`); return null; }
  if (String(kit.id) !== String(ch.id)) fail(`id「${kit.id}」與檔名不符`);
  if (!Array.isArray(kit.skills) || !kit.skills.length) fail("skills 必須是非空陣列");
  for (const k of ["passives", "statuses", "approximations"]) if (kit[k] !== undefined && !Array.isArray(kit[k])) fail(`${k} 必須是陣列`);
  if (kit.stats !== undefined && (typeof kit.stats !== "object" || kit.stats === null || Array.isArray(kit.stats) || Object.values(kit.stats).some((v) => typeof v !== "number"))) fail("stats 必須是 {名稱: 數字}");
  const pre = `hsr_${ch.id}_`;
  for (const [k, list] of [["skills", kit.skills], ["passives", kit.passives], ["statuses", kit.statuses]]) {
    for (const x of Array.isArray(list) ? list : []) if (typeof x?.id !== "string" || !x.id.startsWith(pre)) fail(`${k} 的 id「${x?.id}」必須以 ${pre} 開頭`);
  }
  return kitErrors.length > before ? null : kit;
}

function buildFromKit(ch, kit) {
  const unit = {
    id: `hsr_${ch.id}`, name: displayName(ch), team: "ally", element: ELEMENT_MAP[ch.element], role: ch.path,
    stats: { ...baseStats(ch), ...(kit.stats ?? {}) }, weaknesses: [], skills: kit.skills, passives: kit.passives ?? [],
    source: { kind: "reference-character", key: ch.id, note: `Lv${LEVEL}` },
    description: "未含光錐、遺器、行跡與星魂。",
  };
  return { unit, statuses: kit.statuses ?? [], note: (kit.approximations ?? []).join(" ") };
}

// ---- assemble ----
const sorted = [...pack.characters].sort((a, b) => b.rarity - a.rarity || Number(a.id) - Number(b.id));
const presets = sorted.map((ch) => {
  const cat = catChar.get(ch.id);
  if (!cat) throw new Error(`character ${ch.id} missing from catalog`);
  const name = displayName(ch);
  const elementZh = ELEMENT_ZH[ch.element] ?? ch.element;
  const facets = { 星級: `${ch.rarity}★`, 屬性: elementZh, 命途: ch.path };
  const base = { id: `hsr-${ch.id}`, name, subtitle: `${ch.rarity}★ ${elementZh}・${ch.path}`, facets };
  const missing = cat.required.filter((m) => !implemented.has(m));
  if (missing.length) {
    return { ...base, available: false, reason: unavailableReason(missing), apply: null };
  }
  const kit = loadKit(ch);
  const built = kit ? buildFromKit(ch, kit) : KITS[ch.id] ? KITS[ch.id](ch) : null;
  if (!built) {
    if (!existsSync(join(KITS_DIR, `${ch.id}.json`))) return { ...base, available: false, reason: "機制模組已具備，角色資料整理中", apply: null };
    return { ...base, available: false, reason: "角色資料檔有誤（見產生器輸出）", apply: null };
  }
  const { unit, statuses, note } = built;
  const approx = [note, cat.approximations].filter(Boolean).join(" ");
  return { ...base, available: true, note: approx, apply: unit, statuses };
});

const rs = pack.sources.find((s) => s.id.startsWith("starrailres"));
const out = {
  source: {
    text:
      `角色資料來自 StarRailRes 快照（${rs.id.slice(0, 20)}，上游標示版本 ${rs.version}，狀態：未核實的社群整理資料，不保證與正式服相符）。` +
      `遊戲內容著作權屬於 HoYoverse，本站與其無關；數值僅供模擬與研究，未含光錐、遺器、行跡與星魂，量子對應「光」、虛數對應「暗」。`,
    version: rs.version,
  },
  presets,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${presets.length} presets (${presets.filter((p) => p.available).length} available) -> ${OUT}`);

// ---- validation: kit file problems first, then the core validator + an auto-battle per available preset ----
if (kitErrors.length) {
  console.error(`\n${kitErrors.length} kit file problem(s):\n  - ${kitErrors.join("\n  - ")}`);
  process.exit(1);
}
const v = spawnSync(process.execPath, [join(root, "scripts/validate-hsr-presets.mjs")], { stdio: "inherit" });
if (v.status !== 0) {
  console.error("preset validation failed");
  process.exit(v.status ?? 1);
}
