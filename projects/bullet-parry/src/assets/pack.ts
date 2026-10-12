/** Asset pack data model, file format and validation. Pure (Blob/atob/btoa only), no DOM. */
import { text } from "../i18n";

export const PACK_FORMAT = "gml-bullet-parry-pack";
export const PACK_VERSION = 1;

export const LIMITS = {
  /** Decoded bytes of all embedded files in one pack. */
  totalBytes: 30 * 1024 * 1024,
  /** Decoded bytes of one embedded file. */
  fileBytes: 8 * 1024 * 1024,
  /** Raw size of an import file (base64 inflates by 4/3, plus JSON overhead). */
  textBytes: 42 * 1024 * 1024,
  slots: 200,
  nameLength: 40,
} as const;

export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export const IMAGE_RANGE = {
  frames: { min: 1, max: 64 },
  fps: { min: 1, max: 60 },
  scale: { min: 0.1, max: 4 },
  offset: { min: -400, max: 400 },
} as const;

export interface ImageOptions { frames: number; fps: number; scale: number; offsetX: number; offsetY: number }
export interface ImageAsset extends ImageOptions { blob: Blob }
export interface SoundAsset { blob: Blob; volume: number }

export interface Pack {
  id: string;
  name: string;
  createdAt: number;
  images: Record<string, ImageAsset>;
  sounds: Record<string, SoundAsset>;
}

/** On-disk / export shape (`.bppack.json`). */
export interface PackFile {
  format: typeof PACK_FORMAT;
  version: typeof PACK_VERSION;
  name: string;
  images: Record<string, Partial<ImageOptions> & { dataUrl: string }>;
  sounds: Record<string, { dataUrl: string; volume?: number }>;
}

export const DEFAULT_IMAGE_OPTIONS: ImageOptions = { frames: 1, fps: 8, scale: 1, offsetX: 0, offsetY: 0 };

export const isImageMime = (m: string): boolean => (IMAGE_MIMES as readonly string[]).includes(m);
export const isAudioMime = (m: string): boolean => /^audio\/[a-z0-9.+-]+$/i.test(m);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function sanitizeImageOptions(o: Partial<ImageOptions> | undefined): ImageOptions {
  const d = DEFAULT_IMAGE_OPTIONS;
  const r = IMAGE_RANGE;
  return {
    frames: Math.round(clamp(num(o?.frames, d.frames), r.frames.min, r.frames.max)),
    fps: clamp(num(o?.fps, d.fps), r.fps.min, r.fps.max),
    scale: clamp(num(o?.scale, d.scale), r.scale.min, r.scale.max),
    offsetX: clamp(num(o?.offsetX, 0), r.offset.min, r.offset.max),
    offsetY: clamp(num(o?.offsetY, 0), r.offset.min, r.offset.max),
  };
}

export const sanitizeVolume = (v: unknown): number => clamp(num(v, 1), 0, 2);

export function cleanName(name: string): string {
  const n = name.replace(/[\r\n\t]+/g, " ").trim().slice(0, LIMITS.nameLength);
  return n || text().pack.unnamed;
}

export function newPackId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function emptyPack(name: string): Pack {
  return { id: newPackId(), name: cleanName(name), createdAt: Date.now(), images: {}, sounds: {} };
}

export function packBytes(p: Pack): number {
  let n = 0;
  for (const a of Object.values(p.images)) n += a.blob.size;
  for (const a of Object.values(p.sounds)) n += a.blob.size;
  return n;
}

export const formatBytes = (n: number): string => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

/** Check a single file chosen for an upload. Returns an error message in the current language, or null. */
export function checkUpload(kind: "image" | "sound", file: { type: string; size: number }): string | null {
  if (kind === "image" && !isImageMime(file.type)) return text().pack.onlyImages;
  if (kind === "sound" && !isAudioMime(file.type)) return text().pack.onlyAudio;
  if (file.size > LIMITS.fileBytes) return text().pack.fileTooLarge(formatBytes(file.size), formatBytes(LIMITS.fileBytes));
  return null;
}

// ---- data URLs ------------------------------------------------------------------------------------------------

const DATA_URL = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:;[a-z0-9=._-]+)*;base64,([A-Za-z0-9+/]*={0,2})$/i;

export interface ParsedDataUrl { mime: string; base64: string; bytes: number }

export function parseDataUrl(s: string): ParsedDataUrl | null {
  const m = DATA_URL.exec(s);
  if (!m) return null;
  const mime = (m[1] ?? "").toLowerCase();
  const base64 = m[2] ?? "";
  const pad = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return { mime, base64, bytes: Math.floor((base64.length * 3) / 4) - pad };
}

export function dataUrlToBlob(p: ParsedDataUrl): Blob {
  const bin = atob(p.base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: p.mime });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return "data:" + (blob.type || "application/octet-stream") + ";base64," + btoa(bin);
}

// ---- file <-> pack --------------------------------------------------------------------------------------------

export type ParseResult = { ok: true; pack: Pack; bytes: number } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const SLOT_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** Validate a parsed `.bppack.json` and turn it into an in-memory pack (new id). */
export function parsePackFile(json: unknown): ParseResult {
  const fail = (error: string): ParseResult => ({ ok: false, error });
  const tp = text().pack;
  if (!isRecord(json) || json.format !== PACK_FORMAT) return fail(tp.notAPack);
  if (json.version !== PACK_VERSION) return fail(tp.unsupportedVersion(String(json.version)));
  const images = json.images ?? {};
  const sounds = json.sounds ?? {};
  if (!isRecord(images) || !isRecord(sounds)) return fail(tp.badContent);
  if (Object.keys(images).length + Object.keys(sounds).length > LIMITS.slots) return fail(tp.tooManySlots);
  const pack = emptyPack(typeof json.name === "string" ? json.name : tp.imported);
  let total = 0;
  const take = (slot: string, entry: unknown, kind: "image" | "sound"): string | null => {
    if (!SLOT_ID.test(slot)) return tp.badSlotName(slot.slice(0, 20));
    if (!isRecord(entry) || typeof entry.dataUrl !== "string") return tp.missingContent(slot);
    const d = parseDataUrl(entry.dataUrl);
    if (!d) return tp.badDataUrl(slot);
    if (kind === "image" ? !isImageMime(d.mime) : !isAudioMime(d.mime)) return tp.badMime(slot, d.mime);
    if (d.bytes > LIMITS.fileBytes) return tp.slotTooLarge(slot, formatBytes(LIMITS.fileBytes));
    total += d.bytes;
    if (total > LIMITS.totalBytes) return tp.packTooLarge(formatBytes(LIMITS.totalBytes));
    let blob: Blob;
    try { blob = dataUrlToBlob(d); } catch { return tp.undecodableContent(slot); }
    if (kind === "image") pack.images[slot] = { blob, ...sanitizeImageOptions(entry as Partial<ImageOptions>) };
    else pack.sounds[slot] = { blob, volume: sanitizeVolume(entry.volume) };
    return null;
  };
  for (const [slot, entry] of Object.entries(images)) { const e = take(slot, entry, "image"); if (e) return fail(e); }
  for (const [slot, entry] of Object.entries(sounds)) { const e = take(slot, entry, "sound"); if (e) return fail(e); }
  return { ok: true, pack, bytes: total };
}

/** Parse raw file text (size-checked before JSON.parse). */
export function parsePackText(raw: string): ParseResult {
  if (raw.length > LIMITS.textBytes) return { ok: false, error: text().pack.importTooLarge(formatBytes(LIMITS.totalBytes)) };
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return { ok: false, error: text().pack.notJson }; }
  return parsePackFile(json);
}

export async function packToFile(pack: Pack): Promise<PackFile> {
  const images: PackFile["images"] = {};
  const sounds: PackFile["sounds"] = {};
  for (const [slot, a] of Object.entries(pack.images)) {
    images[slot] = { dataUrl: await blobToDataUrl(a.blob), frames: a.frames, fps: a.fps, scale: a.scale, offsetX: a.offsetX, offsetY: a.offsetY };
  }
  for (const [slot, a] of Object.entries(pack.sounds)) sounds[slot] = { dataUrl: await blobToDataUrl(a.blob), volume: a.volume };
  return { format: PACK_FORMAT, version: PACK_VERSION, name: pack.name, images, sounds };
}

/** File name for an exported pack. */
export const exportFileName = (name: string): string => name.replace(/[\\/:*?"<>|]+/g, "_").trim() + ".bppack.json";
