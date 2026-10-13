import { sourceText } from "./i18n";
/**
 * Sharing rule sets: a link (#rules=… in the URL, nothing is sent to a server) and a JSON file.
 * Everything that comes in is untrusted: it is shape-checked here, then validated by Gacha.validateModel.
 */
import { Gacha } from "@gml/core";

export const SHARE_FORMAT = "ggt-gacha-rules";
const HASH_KEY = "rules";
/** Limits that keep a shared rule set small enough to analyse; real games need far less. */
const LIMITS = { bytes: 200_000, tiers: 12, items: 400, modules: 40, steps: 20, name: 200, text: 4000 };

export interface SharedRules { model: Gacha.GachaModel; target?: Gacha.Target }
export type ParseResult = { ok: true; rules: SharedRules } | { ok: false; error: string };

// ---- shape check ----------------------------------------------------------------------------------------

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
const str = (x: unknown, max: number = LIMITS.name) => typeof x === "string" && x.length <= max;
const strs = (x: unknown, max: number) => Array.isArray(x) && x.length <= max && x.every((s) => str(s));

const MODULE_FIELDS: Record<Gacha.ModuleKind, (m: Record<string, unknown>) => boolean> = {
  softPity: (m) => str(m.tier) && num(m.start) && num(m.step) && (m.max === undefined || num(m.max)),
  hardPity: (m) => str(m.tier) && num(m.at),
  featured: (m) => str(m.tier) && num(m.share) && strs(m.items, LIMITS.items),
  guarantee: (m) => str(m.tier),
  batchFloor: (m) => num(m.slot) && str(m.minTier),
  milestone: (m) => str(m.tier) && Array.isArray(m.steps) && m.steps.length <= LIMITS.steps && m.steps.every((s) => isObj(s) && num(s.at) && num(s.featuredShare)),
  exchange: (m) => num(m.pointsPerPull) && num(m.cost) && strs(m.items, LIMITS.items),
  epitomized: (m) => str(m.tier) && str(m.item) && num(m.points),
};

/** Returns the reason the value is not a gacha 2 model, or null when the shape is right. */
function shapeError(m: unknown): string | null {
  if (!isObj(m) || m.version !== 2) return sourceText("share1");
  if (!str(m.id) || !str(m.name)) return sourceText("share2");
  if (m.description !== undefined && !str(m.description, LIMITS.text)) return sourceText("share3");
  if (m.source !== undefined && !str(m.source, LIMITS.text)) return sourceText("share4");
  const p = m.pull;
  if (!isObj(p) || !num(p.cost) || !str(p.currency) || !num(p.batchSize) || (p.batchCost !== undefined && !num(p.batchCost))) return sourceText("share5");
  if (!Array.isArray(m.tiers) || !m.tiers.length || m.tiers.length > LIMITS.tiers) return sourceText("share6", LIMITS.tiers);
  if (!m.tiers.every((t) => isObj(t) && str(t.id) && str(t.name) && num(t.rate) && strs(t.items, LIMITS.items))) return sourceText("share7");
  if (!Array.isArray(m.items) || m.items.length > LIMITS.items) return sourceText("share8", LIMITS.items);
  if (!m.items.every((i) => isObj(i) && str(i.id) && str(i.name) && (i.kind === "unit" || i.kind === "resource"))) return sourceText("share9");
  if (!Array.isArray(m.modules) || m.modules.length > LIMITS.modules) return sourceText("share10", LIMITS.modules);
  for (const [i, x] of m.modules.entries()) {
    const check = isObj(x) && typeof x.kind === "string" ? MODULE_FIELDS[x.kind as Gacha.ModuleKind] : undefined;
    if (!check || !check(x as Record<string, unknown>)) return sourceText("share11", i + 1);
  }
  return null;
}

function targetOk(t: unknown): t is Gacha.Target {
  return isObj(t) && str(t.tier) && (t.mode === "tier" || t.mode === "featured" || t.mode === "item") && num(t.copies) && (t.itemId === undefined || str(t.itemId));
}

/** Parses a shared payload ({format, model, target?}) or a bare model. */
export function parseRules(text: string): ParseResult {
  if (text.length > LIMITS.bytes) return { ok: false, error: sourceText("share12") };
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, error: sourceText("share13") }; }
  const payload = isObj(data) && data.format === SHARE_FORMAT ? data : { model: data };
  const bad = shapeError(payload.model);
  if (bad) return { ok: false, error: bad };
  const model = payload.model as Gacha.GachaModel;
  const errors = Gacha.validateModel(model).filter((i) => i.level === "error");
  if (errors.length) return { ok: false, error: sourceText("share14", errors.map((e) => e.message).join(sourceText("share15"))) };
  return { ok: true, rules: { model, target: targetOk(payload.target) ? payload.target : undefined } };
}

/** The file / link payload. Only the rules and the goal: no progress, wallet or prices. */
export function serializeRules(r: SharedRules): string {
  return JSON.stringify({ format: SHARE_FORMAT, version: 1, model: r.model, ...(r.target ? { target: r.target } : {}) });
}

// ---- link encoding --------------------------------------------------------------------------------------
// "z" + base64url(deflate-raw(json)) when the browser can compress, otherwise "j" + base64url(json).

const toB64url = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error("too large"); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export async function encodeRules(r: SharedRules): Promise<string> {
  const json = new TextEncoder().encode(serializeRules(r));
  if (typeof CompressionStream === "function") return "z" + toB64url(await pipe(json, new CompressionStream("deflate-raw")));
  return "j" + toB64url(json);
}

export async function decodeRules(code: string): Promise<ParseResult> {
  try {
    const kind = code[0];
    const bytes = fromB64url(code.slice(1));
    let json: Uint8Array;
    if (kind === "z") {
      if (typeof DecompressionStream !== "function") return { ok: false, error: sourceText("share16") };
      json = await pipe(bytes, new DecompressionStream("deflate-raw"), LIMITS.bytes);
    } else if (kind === "j") json = bytes;
    else return { ok: false, error: sourceText("share17") };
    return parseRules(new TextDecoder().decode(json));
  } catch {
    return { ok: false, error: sourceText("share18") };
  }
}

export async function shareLink(r: SharedRules, href = location.href): Promise<string> {
  const url = new URL(href);
  url.hash = `${HASH_KEY}=${await encodeRules(r)}`;
  return url.toString();
}

/** The rules code in the current URL (#rules=…), if any. */
export function rulesInHash(hash = location.hash): string | null {
  const m = /^#?rules=([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? m[1]! : null;
}

export function clearHash() {
  try { history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ }
}

export function downloadRules(r: SharedRules) {
  const blob = new Blob([JSON.stringify(JSON.parse(serializeRules(r)), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${r.model.name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60) || "gacha"}.gacha.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
