#!/usr/bin/env node
// Builds public-site/src/tools/battle/presets/hsr-equipment.generated.json from the pinned StarRailRes snapshot
// (data/reference/hsr/latest.json -> snapshots/<id>/cht). No dependencies; output is deterministic (no timestamps).
//   node scripts/build-hsr-equipment.mjs
//
// Output shape (all numbers are IEEE doubles, never rounded; StatBonus = {key, op:"flat"|"pct", value, element?}):
// {
//   source:     { snapshotId, version, text },
//   properties: { [hsrType]: { name, key|null, op?, element? } },   // the explicit mapping table below, with cht names
//   lightCones: [{ id, name, rarity, path,
//                  base: {hp, atk, def},                            // Lv80, max ascension: promo[6].base + step * (80 - 1)
//                  ranks: [{ rank: 1..5, desc, bonuses: StatBonus[] }],   // desc has its #N[..] placeholders filled in
//                  conditional: boolean }],                         // true if ANY rank's desc has effects beyond `bonuses`
//   relicSets:  [{ id, name, kind: "cavern"|"planar",
//                  tiers: [{ pieces: 2|4, desc, bonuses, conditional }] }],
//   mainStats:  { [slot]: [{ property, key, op, element?, value }] }, // slot: head|hands|body|feet|sphere|rope; 5-star, +15
//   subStats:   [{ property, key, op, element?, base, step, stepNum }],// 5-star
//   traces:     { [charId]: { bonuses: StatBonus[], abilityNodes: [{ id, name, desc }] } }
// }
//
// Value semantics
// - Main stat at +15: value = base + step * 15 (relic_main_affixes: base is the +0 value, step is per level).
// - Sub stat with n rolls: every roll (including the initial one) has quality s in {0..stepNum}; its value is
//   base + step * s, so n rolls give  base * n + step * (s_1 + ... + s_n)   (s_i = 0 low, 1 mid, 2 high for 5-star).
//   Check: 5-star CRIT Rate base 0.02592, step 0.00324, stepNum 2 -> 2.592% / 2.916% / 3.24% per roll.
// - Light cone `bonuses` and relic set tier `bonuses` come only from the snapshot's unconditional `properties`
//   (properties with an unsupported mapping are dropped from `bonuses` and force conditional = true).
// - `conditional` is a conservative heuristic on the rendered description: true when the description has any number
//   not accounted for by a property value, any trigger/duration/target keyword (see CONDITIONAL_WORDS), or when
//   the properties list is empty / contains an unsupported type. A false positive only means "some text is not
//   modelled"; a false negative is possible only if the text hides a condition with none of those words.
// - Element damage bonus: `{key:"dmgBonus", op:"flat", element}`. APPROXIMATION: our model has one `dmgBonus` stat, so
//   the consumer must fold it into dmgBonus only when `element` equals the wearer's element (preset element ids:
//   physical, fire, ice, thunder, wind, light(=Quantum), shadow(=Imaginary)) and ignore it otherwise. In-game the bonus
//   also applies per damage type to the right element only, so this is exact for single-element wearers.
// - Traces: sum of every stat node's properties (each stat node has one level), grouped by (key, op, element) in
//   ascending node-id order; "unlocked" is assumed for all nodes (max trace). Ability nodes (named, no stat) are
//   listed with their description for display only.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.HSR_EQUIPMENT_OUT ?? join(root, "public-site/src/tools/battle/presets/hsr-equipment.generated.json");

const latest = JSON.parse(readFileSync(join(root, "data/reference/hsr/latest.json"), "utf8"));
const dir = join(root, "data/reference/hsr/snapshots", latest.snapshotId, "cht");
const load = (name) => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
const pack = JSON.parse(readFileSync(join(root, "data/reference/hsr/pack.json"), "utf8"));

const lightCones = load("light_cones");
const lcPromotions = load("light_cone_promotions");
const lcRanks = load("light_cone_ranks");
const relicSets = load("relic_sets");
const relics = load("relics");
const mainAffixes = load("relic_main_affixes");
const subAffixes = load("relic_sub_affixes");
const skillTrees = load("character_skill_trees");
const propMeta = load("properties");

// ---- property mapping table: HSR property type -> our stat key/op (null = unsupported, kept listed) ----
const E = (element) => ({ key: "dmgBonus", op: "flat", element });
const PROPERTY_MAP = {
  // hp / atk / def: *Delta = flat, *AddedRatio = percent of the base pool
  HPDelta: { key: "hp", op: "flat" },
  HPAddedRatio: { key: "hp", op: "pct" },
  AttackDelta: { key: "atk", op: "flat" },
  AttackAddedRatio: { key: "atk", op: "pct" },
  DefenceDelta: { key: "def", op: "flat" },
  DefenceAddedRatio: { key: "def", op: "pct" },
  // speed: Delta / BaseSpeed = flat, AddedRatio = percent
  SpeedDelta: { key: "spd", op: "flat" },
  BaseSpeed: { key: "spd", op: "flat" },
  SpeedAddedRatio: { key: "spd", op: "pct" },
  // *Base ratios are plain additive amounts of a ratio stat -> flat
  CriticalChanceBase: { key: "critRate", op: "flat" },
  CriticalDamageBase: { key: "critDmg", op: "flat" },
  StatusProbabilityBase: { key: "effectHit", op: "flat" },
  StatusResistanceBase: { key: "effectRes", op: "flat" },
  BreakDamageAddedRatioBase: { key: "breakEffect", op: "flat" },
  HealRatioBase: { key: "healBonus", op: "flat" },
  HealTakenRatio: { key: "healTaken", op: "flat" },
  SPRatioBase: { key: "energyRegen", op: "flat" },
  AllDamageTypeAddedRatio: { key: "dmgBonus", op: "flat" },
  // elemental damage bonus: dmgBonus tagged with an element (consumer folds it only for a matching wearer)
  PhysicalAddedRatio: E("physical"),
  FireAddedRatio: E("fire"),
  IceAddedRatio: E("ice"),
  ThunderAddedRatio: E("thunder"),
  WindAddedRatio: E("wind"),
  QuantumAddedRatio: E("light"),
  ImaginaryAddedRatio: E("shadow"),
  // no equivalent stat in the battle model
  ElationDamageAddedRatioBase: null,
};

const mapOf = (type) => {
  if (!(type in PROPERTY_MAP)) throw new Error(`unmapped HSR property type: ${type} (add it to PROPERTY_MAP)`);
  return PROPERTY_MAP[type];
};
const bonusOf = (type, value) => {
  const m = mapOf(type);
  if (!m) return null;
  const b = { key: m.key, op: m.op, value };
  if (m.element) b.element = m.element;
  return b;
};
// Split a snapshot properties list into supported bonuses + whether anything unsupported was dropped.
const convert = (props) => {
  const bonuses = [];
  let dropped = false;
  for (const p of props) {
    const b = bonusOf(p.type, p.value);
    if (b) bonuses.push(b);
    else dropped = true;
  }
  return { bonuses, dropped };
};

// ---- description rendering and the conditional heuristic ----
const trim = (n, digits) => String(Number(n.toFixed(digits)));
function render(desc, params) {
  return desc
    .replace(/#(\d+)\[i\]%/g, (_, n) => `${trim(params[Number(n) - 1] * 100, 2)}%`)
    .replace(/#(\d+)\[f(\d)\]%/g, (_, n, d) => `${trim(params[Number(n) - 1] * 100, Number(d))}%`)
    .replace(/#(\d+)\[f(\d)\]/g, (_, n, d) => trim(params[Number(n) - 1], Number(d)))
    .replace(/#(\d+)\[i\]/g, (_, n) => trim(params[Number(n) - 1], 2))
    .replace(/<[^>]+>/g, "");
}
const CONDITIONAL_WORDS =
  /當|若|如果|時|之後|後|每|持續|回合|施放|發動|進入|受到|普通攻擊|戰技|終結技|追加攻擊|擊破(?!特攻)|最多|疊加|超過|低於|高於|消滅|立即|額外|敵方|我方|隊友|目標|戰鬥開始|恢復|提供/;
function isConditional(text, props, dropped) {
  if (dropped || props.length === 0) return true;
  if (CONDITIONAL_WORDS.test(text)) return true;
  // every number in the text must be one of the property values (as percent or raw, within float tolerance)
  const values = props.map((p) => p.value);
  const matches = (tok) => {
    const isPct = tok.endsWith("%");
    const n = parseFloat(tok);
    return values.some((v) => Math.abs((isPct ? v * 100 : v) - n) < 1e-6 * Math.max(1, Math.abs(n)) + 5e-3);
  };
  return (text.match(/\d+(?:\.\d+)?%?/g) ?? []).some((t) => !matches(t));
}

// ---- properties table (every type that appears anywhere in the inputs) ----
const seen = new Set();
const note = (t) => seen.add(t);
for (const r of Object.values(lcRanks)) for (const lvl of r.properties) for (const p of lvl) note(p.type);
for (const s of Object.values(relicSets)) for (const tier of s.properties) for (const p of tier) note(p.type);
for (const m of Object.values(mainAffixes)) for (const a of Object.values(m.affixes)) note(a.property);
for (const m of Object.values(subAffixes)) for (const a of Object.values(m.affixes)) note(a.property);
for (const n of Object.values(skillTrees)) for (const l of n.levels) for (const p of l.properties) note(p.type);
const properties = {};
for (const t of [...seen].sort()) {
  const m = mapOf(t);
  properties[t] = { name: propMeta[t]?.name ?? t, key: m ? m.key : null, ...(m ? { op: m.op } : {}), ...(m?.element ? { element: m.element } : {}) };
}

// ---- light cones ----
const byId = (a, b) => Number(a.id) - Number(b.id);
const LC_LEVEL = 80;
const lcOut = [];
let lcRankCount = 0;
for (const lc of Object.values(lightCones).sort(byId)) {
  const rk = lcRanks[lc.id];
  const promo = lcPromotions[lc.id];
  if (!rk || !promo) continue;
  const row = promo.values[promo.values.length - 1]; // max ascension (Lv80)
  const base = {};
  for (const k of ["hp", "atk", "def"]) base[k] = row[k].base + row[k].step * (LC_LEVEL - 1);
  let conditional = false;
  const ranks = rk.params.map((params, i) => {
    const desc = render(rk.desc, params);
    const { bonuses, dropped } = convert(rk.properties[i] ?? []);
    const c = isConditional(desc, rk.properties[i] ?? [], dropped);
    conditional ||= c;
    lcRankCount++;
    return { rank: i + 1, desc, bonuses, conditional: c };
  });
  lcOut.push({ id: lc.id, name: lc.name, rarity: lc.rarity, path: lc.path, base, ranks, conditional });
}
// per-rank flag is kept internally for the report; strip it from the output shape (lc-level flag is the contract)
const lcRankStats = { unconditional: 0, conditional: 0 };
for (const lc of lcOut) for (const r of lc.ranks) { r.conditional ? lcRankStats.conditional++ : lcRankStats.unconditional++; delete r.conditional; }

// ---- relic sets ----
const setKind = {};
for (const r of Object.values(relics)) setKind[r.set_id] ??= r.type === "NECK" || r.type === "OBJECT" ? "planar" : "cavern";
const setOut = [];
const tierStats = { unconditional: 0, conditional: 0 };
for (const s of Object.values(relicSets).sort(byId)) {
  const kind = setKind[s.id];
  if (!kind) continue;
  const pieces = kind === "cavern" ? [2, 4] : [2];
  const tiers = s.desc.map((d, i) => {
    const props = s.properties[i] ?? [];
    const { bonuses, dropped } = convert(props);
    const desc = render(d, []);
    const conditional = isConditional(desc, props, dropped);
    conditional ? tierStats.conditional++ : tierStats.unconditional++;
    return { pieces: pieces[i], desc, bonuses, conditional };
  });
  setOut.push({ id: s.id, name: s.name, kind, tiers });
}

// ---- relic main stats (5-star, +15) and sub stats (5-star) ----
const SLOT_OF = { HEAD: "head", HAND: "hands", BODY: "body", FOOT: "feet", NECK: "sphere", OBJECT: "rope" };
const mainStats = {};
const rep = {}; // slot -> main_affix_id for 5-star pieces
for (const r of Object.values(relics)) {
  if (r.rarity !== 5) continue;
  const slot = SLOT_OF[r.type];
  if (rep[slot] && rep[slot] !== r.main_affix_id) throw new Error(`slot ${slot} has two 5-star main affix ids`);
  rep[slot] = r.main_affix_id;
}
for (const slot of ["head", "hands", "body", "feet", "sphere", "rope"]) {
  const aff = mainAffixes[rep[slot]].affixes;
  mainStats[slot] = Object.values(aff)
    .sort((a, b) => Number(a.affix_id) - Number(b.affix_id))
    .map((a) => {
      const m = mapOf(a.property);
      if (!m) throw new Error(`unsupported main stat ${a.property}`);
      return { property: a.property, key: m.key, op: m.op, ...(m.element ? { element: m.element } : {}), value: a.base + a.step * 15 };
    });
}
const subRep = new Set(Object.values(relics).filter((r) => r.rarity === 5).map((r) => r.sub_affix_id));
if (subRep.size !== 1) throw new Error("5-star relics use more than one sub affix table");
const subStats = Object.values(subAffixes[[...subRep][0]].affixes)
  .sort((a, b) => Number(a.affix_id) - Number(b.affix_id))
  .map((a) => {
    const m = mapOf(a.property);
    if (!m) throw new Error(`unsupported sub stat ${a.property}`);
    return { property: a.property, key: m.key, op: m.op, ...(m.element ? { element: m.element } : {}), base: a.base, step: a.step, stepNum: a.step_num };
  });

// ---- traces ----
const charIds = new Set(pack.characters.map((c) => c.id));
const traces = {};
for (const node of Object.values(skillTrees).sort(byId)) {
  const charId = node.id.slice(0, -3);
  if (!charIds.has(charId)) continue;
  const t = (traces[charId] ??= { bonuses: [], abilityNodes: [] });
  const props = node.levels.flatMap((l) => l.properties).length ? node.levels[node.levels.length - 1].properties : [];
  if (props.length) {
    for (const p of props) {
      const b = bonusOf(p.type, p.value);
      if (!b) continue;
      const hit = t.bonuses.find((x) => x.key === b.key && x.op === b.op && x.element === b.element);
      if (hit) hit.value += b.value;
      else t.bonuses.push(b);
    }
  } else if (node.name) {
    t.abilityNodes.push({ id: node.id, name: node.name, desc: render(node.desc, node.params?.[0] ?? node.params ?? []) });
  }
}
const sortedTraces = {};
for (const id of Object.keys(traces).sort((a, b) => Number(a) - Number(b))) {
  traces[id].bonuses.sort((a, b) => (a.key + a.op + (a.element ?? "")).localeCompare(b.key + b.op + (b.element ?? "")));
  sortedTraces[id] = traces[id];
}

const out = {
  source: {
    snapshotId: latest.snapshotId,
    version: latest.upstreamVersion,
    text: `裝備資料來自 StarRailRes 快照（${latest.snapshotId.slice(0, 20)}，上游標示版本 ${latest.upstreamVersion}，狀態：${latest.contentStatus}，未核實為正式服版本）。遊戲內容著作權屬於 HoYoverse，本站與其無關；數值僅供模擬與研究。光錐／遺器只套用無條件的數值加成，條件效果需另行建模。`,
  },
  properties,
  lightCones: lcOut,
  relicSets: setOut,
  mainStats,
  subStats,
  traces: sortedTraces,
};
writeFileSync(OUT, JSON.stringify(out) + "\n");

const unsupported = Object.entries(properties).filter(([, v]) => v.key === null).map(([k]) => k);
console.log(
  JSON.stringify({
    lightCones: lcOut.length,
    lcRanks: lcRankCount,
    lcRankStats,
    relicSets: setOut.length,
    setTiers: tierStats,
    subStats: subStats.length,
    traceChars: Object.keys(sortedTraces).length,
    unsupported,
  }),
);
