import { sourceText } from "./i18n";
/**
 * Simulator state and the derived analysis. All rules and math come from @gml/core's Gacha namespace.
 */
import { Gacha } from "@gml/core";
import { buildModel, gameOf, typeFor, GAMES } from "./catalog/games";
import type { CatalogPick } from "./GameMenu";

export type Model = Gacha.GachaModel;
export type Target = Gacha.Target;

export interface CompareEntry {
  id: string;
  name: string;
  model: Model;
  target: Target;
  start: Gacha.ModelState;
}

export interface SimState {
  model: Model;
  /** Preset the model came from (cleared when the model is edited). Game pools: "game:<game>:<kind>…". */
  presetId: string | null;
  /** Fixed game-rule preset selected by the player. */
  catalog?: CatalogPick;
  target: Target;
  /** Current progress: pity counters, guarantee, points. */
  start: Gacha.ModelState;
  wallet: Gacha.Wallet;
  /** Money the player is willing to spend (TWD). */
  budget: number;
  packs: Gacha.TopUpPack[];
  compare: CompareEntry[];
}

const STORAGE_KEY = "ggt.gacha-sim.v1";

export function fromPreset(id: string, prev?: SimState): SimState {
  const p = structuredClone(Gacha.PRESETS.find((x) => x.model.id === id) ?? Gacha.PRESETS[0]!);
  return {
    model: p.model,
    presetId: p.model.id,
    target: p.target,
    start: Gacha.newState(p.model),
    wallet: prev?.wallet ?? { currency: 0, freePulls: 0 },
    budget: prev?.budget ?? 3000,
    packs: prev?.packs ?? p.packs,
    compare: prev?.compare ?? [],
  };
}

/** A fixed game pool with generic items. */
export function fromCatalog(pick: CatalogPick, prev?: SimState): SimState {
  const g = gameOf(pick.game);
  const t = g.types.find((x) => x.kind === pick.kind && (x.region === undefined || x.region === pick.region)) ?? g.types[0]!;
  const model = buildModel(g, t);
  const top = model.modules.find((x) => x.kind === "featured" && x.tier === "top");
  const epi = model.modules.find((x): x is Extract<Gacha.RuleModule, { kind: "epitomized" }> => x.kind === "epitomized");
  return {
    model,
    presetId: `game:${pick.game}:${pick.kind}:${pick.region ?? ""}`,
    catalog: { game: pick.game, kind: pick.kind, ...(pick.region ? { region: pick.region } : {}) },
    // With an epitomized pick the goal is that item; otherwise any featured item of the top tier.
    target: epi ? { tier: "top", mode: "item", itemId: epi.item, copies: 1 } : { tier: "top", mode: top ? "featured" : "tier", copies: 1 },
    start: Gacha.newState(model),
    wallet: prev?.wallet ?? { currency: 0, freePulls: 0 },
    budget: prev?.budget ?? 3000,
    packs: prev?.packs ?? Gacha.EXAMPLE_PACKS,
    compare: prev?.compare ?? [],
  };
}

/** Rules loaded from a share link or file: a custom model, with the shared goal when it fits. */
export function fromShared(r: { model: Model; target?: Target }, prev: SimState): SimState {
  const model = structuredClone(r.model);
  const top = model.tiers[0]?.id ?? "";
  const featured = model.modules.some((x) => x.kind === "featured" && x.tier === top);
  return {
    ...prev,
    model,
    presetId: `shared:${model.id}`,
    catalog: undefined,
    target: r.target ? { ...r.target } : { tier: top, mode: featured ? "featured" : "tier", copies: 1 },
    start: Gacha.newState(model),
  };
}

export function hasSavedState(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== null; } catch { return false; }
}

export function loadState(): SimState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as SimState;
      if (s?.model?.version === 2 && Array.isArray(s.model.tiers) && s.target && s.start && Array.isArray(s.packs)) return migrateCatalogState(s);
    }
  } catch { /* storage unavailable or corrupt */ }
  return fromCatalog({ game: "hsr", kind: "character" });
}

/** Replace obsolete named banners only on unedited catalog presets. Keep wallet, goal and counters. */
export function migrateCatalogState(s: SimState): SimState {
  const compare = s.compare?.map(entry => {
    const [game, kind, region] = entry.model.id.split(':');
    const g = GAMES.find(x => x.id === game);
    if (!g || !typeFor(g, { kind: kind ?? '', region })) return entry;
    const model = genericLegacyNames(entry.model, { game: g.id, kind: kind!, region });
    return { ...entry, model, name: entry.name === entry.model.name ? model.name : entry.name };
  }) ?? [];
  s = { ...s, compare };
  if (!s.catalog) return s;
  const g = GAMES.find(x => x.id === s.catalog!.game);
  if (!g || !typeFor(g, s.catalog)) return s;
  if (!s.presetId?.startsWith("game:")) return { ...s, model: genericLegacyNames(s.model, s.catalog) };
  const next = fromCatalog(s.catalog, s);
  const oldTop = s.model.modules.find(x => x.kind === "featured" && x.tier === "top");
  const index = oldTop?.kind === "featured" ? oldTop.items.indexOf(s.target.itemId ?? "") : -1;
  const newTop = next.model.modules.find(x => x.kind === "featured" && x.tier === "top");
  const itemId = index >= 0 && newTop?.kind === "featured" ? newTop.items[Math.min(index, newTop.items.length - 1)] : s.target.itemId;
  if (itemId) for (const mod of next.model.modules) if (mod.kind === "epitomized") mod.item = itemId;
  return { ...next, target: { ...s.target, ...(itemId ? { itemId } : {}) }, start: s.start };
}

/** Remove source-specific names from legacy items without changing edited rules or item references. */
function genericLegacyNames(model: Model, pick: CatalogPick): Model {
  const g = gameOf(pick.game);
  const t = typeFor(g, pick)!;
  const next = structuredClone(model);
  const prefix = `${g.name}・${t.name}`;
  if (next.name.startsWith(`${prefix}：`)) next.name = prefix; // i18n-ignore: match the title separator in legacy stored data
  let topIndex = 0;
  for (const item of next.items) {
    if (item.id.startsWith('f5:') && !['f5:any', 'f5:other'].includes(item.id)) item.name = t.top.epitomized ? `${t.labels.top} ${topIndex++ === 0 ? 'A' : 'B'}` : t.labels.top;
    if (item.id.startsWith('f4:') && item.id !== 'f4:any') item.name = `UP ${t.mid.name}`;
  }
  if (next.source?.includes('api.ennead.cc') || next.source?.includes('SchaleDB') || next.source?.includes('卡池內容為手動整理')) next.source = `${t.note} ${g.source}`; // i18n-ignore: identify obsolete generated source notes in legacy data
  return next;
}

export function saveState(s: SimState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Keep target and progress consistent with the (possibly edited) model. */
export function normalize(s: SimState): SimState {
  const m = s.model;
  const tierIds = m.tiers.map((t) => t.id);
  const target = { ...s.target };
  if (!tierIds.includes(target.tier)) target.tier = tierIds[0] ?? "";
  const feat = m.modules.find((x) => x.kind === "featured" && x.tier === target.tier);
  if (target.mode !== "tier" && !feat) target.mode = "tier";
  if (target.mode === "item") {
    const pool = [...(feat && feat.kind === "featured" ? feat.items : []), ...(m.tiers.find((t) => t.id === target.tier)?.items ?? [])];
    if (!pool.includes(target.itemId ?? "")) target.itemId = pool[0];
  }
  const vars = Object.fromEntries(Gacha.stateVars(m).filter((v) => v !== "batch").map((v) => [v, s.start.vars[v] ?? 0]));
  if (Gacha.stateVars(m).includes("batch")) vars.batch = 0;
  return { ...s, target, start: { vars, pulls: 0 } };
}

export interface Analysis {
  issues: Gacha.ModelIssue[];
  errors: Gacha.ModelIssue[];
  dist?: Gacha.Distribution;
  summary?: Gacha.Summary;
  worst?: number | null;
  spend?: Gacha.SpendSummary;
  /** Pulls the budget (money + currency + free pulls) buys. */
  budgetPulls?: number;
  /** P(target complete within budgetPulls). */
  budgetChance?: number;
  /** P(k copies within budgetPulls). */
  budgetCopies?: number[];
  longRun?: Gacha.LongRun;
  longRunError?: string;
  error?: string;
  ms: number;
}

export function analyze(s: SimState): Analysis {
  const t0 = performance.now();
  const issues = Gacha.validateModel(s.model);
  const errors = issues.filter((i) => i.level === "error");
  const out: Analysis = { issues, errors, ms: 0 };
  if (errors.length) return { ...out, ms: performance.now() - t0 };
  try {
    const dist = Gacha.targetDistribution(s.model, s.target, s.start);
    out.dist = dist;
    out.summary = Gacha.summarize(dist);
    out.worst = Gacha.worstCase(s.model, s.target, s.start);
    out.spend = Gacha.spend(s.model, dist, s.packs, s.wallet);
    // The most currency the budget could ever buy bounds the table (and the pull count).
    const bestRate = Math.max(0, ...s.packs.filter((p) => p.price > 0).map((p) => (p.amount + (p.firstBonus ?? 0)) / p.price));
    const capCurrency = Math.max(0, s.budget) * bestRate;
    const table = Gacha.topUpTable(s.packs, capCurrency + s.model.pull.cost * s.model.pull.batchSize);
    let n = 0;
    while (n < 20000 && Gacha.currencyFor(s.model, n + 1, s.wallet) <= capCurrency && Gacha.priceFor(s.model, table, n + 1, s.wallet) <= s.budget) n++;
    out.budgetPulls = n;
    out.budgetChance = n === 0 ? 0 : dist.cdf[Math.min(n, dist.cdf.length - 1)];
    out.budgetCopies = Gacha.copiesAfter(s.model, s.target, n, 5, s.start);
  } catch (e) {
    out.error = (e as Error).message;
  }
  try { out.longRun = Gacha.longRun(s.model); } catch (e) { out.longRunError = (e as Error).message; }
  out.ms = performance.now() - t0;
  return out;
}

export const MODULE_LABELS: Record<Gacha.ModuleKind, { name: string; help: string }> = {
  softPity: { name: sourceText("state1"), help: sourceText("state2") },
  hardPity: { name: sourceText("state3"), help: sourceText("state4") },
  featured: { name: sourceText("state5"), help: sourceText("state6") },
  guarantee: { name: sourceText("state7"), help: sourceText("state8") },
  batchFloor: { name: sourceText("gachaStage5"), help: sourceText("state9") },
  milestone: { name: sourceText("state10"), help: sourceText("state11") },
  exchange: { name: sourceText("state12"), help: sourceText("state13") },
  epitomized: { name: sourceText("state14"), help: sourceText("state15") },
};

export function defaultModule(kind: Gacha.ModuleKind, m: Model): Gacha.RuleModule {
  const tier = m.tiers[0]?.id ?? "";
  const feat = m.modules.find((x) => x.kind === "featured");
  const featItems = feat && feat.kind === "featured" ? feat.items : m.tiers[0]?.items.slice(0, 1) ?? [];
  switch (kind) {
    case "softPity": return { kind, tier, start: 74, step: 0.06 };
    case "hardPity": return { kind, tier, at: 90 };
    case "featured": return { kind, tier, share: 0.5, items: m.items.slice(0, 1).map((x) => x.id) };
    case "guarantee": return { kind, tier };
    case "batchFloor": return { kind, slot: m.pull.batchSize, minTier: m.tiers[1]?.id ?? tier };
    case "milestone": return { kind, tier, steps: [{ at: 100, featuredShare: 0.5 }, { at: 200, featuredShare: 1 }] };
    case "exchange": return { kind, pointsPerPull: 1, cost: 200, items: [...featItems] };
    case "epitomized": return { kind, tier: feat && feat.kind === "featured" ? feat.tier : tier, item: featItems[0] ?? "", points: 1 };
  }
}

export const nextId = (prefix: string, taken: string[]) => { let n = 1; while (taken.includes(`${prefix}${n}`)) n++; return `${prefix}${n}`; };
