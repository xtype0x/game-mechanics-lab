/**
 * Asset store: owns the user's packs (IndexedDB when available, memory otherwise), the active pack, and applies it to
 * the slot registry (images) and the audio engine (sounds). Framework-free; React subscribes via useSyncExternalStore.
 * Images are decoded to ImageBitmaps (closed when replaced), so no object URLs are created for rendering.
 */
import { AudioEngine } from "../audio/engine";
import { text } from "../i18n";
import { SlotRegistry, type SlotArt } from "../render/slots";
import { dbDeletePack, dbLoadPacks, dbPutPack } from "./db";
import {
  LIMITS, checkUpload, cleanName, emptyPack, exportFileName, formatBytes, newPackId, packBytes, packToFile, parsePackText,
  sanitizeImageOptions, sanitizeVolume, DEFAULT_IMAGE_OPTIONS, type ImageOptions, type Pack,
} from "./pack";

export interface AssetSnapshot {
  version: number;
  packs: { id: string; name: string }[];
  /** null = built-in default art and sounds. */
  activeId: string | null;
  /** Last selected custom pack (target of the quick switch). */
  lastId: string | null;
  active: Pack | null;
  /** False when IndexedDB is unavailable: packs live only for this session. */
  persisted: boolean;
  ready: boolean;
  volume: number;
  muted: boolean;
  error: string | null;
}

export interface AssetInit { activeId: string | null; lastId: string | null; volume: number; muted: boolean }

type Listener = () => void;

export class AssetStore {
  readonly registry = new SlotRegistry();
  readonly audio = new AudioEngine();
  private packs: Pack[] = [];
  private activeId: string | null;
  private lastId: string | null;
  private persisted = true;
  private ready = false;
  private error: string | null = null;
  private version = 0;
  private epoch = 0;
  private started = false;
  private readonly listeners = new Set<Listener>();
  private readonly bitmaps = new Map<string, { bmp: ImageBitmap; blob: Blob }>();
  private snap: AssetSnapshot;

  constructor(init: AssetInit) {
    this.activeId = init.activeId;
    this.lastId = init.lastId;
    this.audio.setVolume(init.volume);
    this.audio.setMuted(init.muted);
    this.snap = this.makeSnapshot();
  }

  // ---- React binding ----------------------------------------------------------------------------------------

  subscribe = (l: Listener): (() => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = (): AssetSnapshot => this.snap;

  private makeSnapshot(): AssetSnapshot {
    return {
      version: this.version,
      packs: this.packs.map((p) => ({ id: p.id, name: p.name })),
      activeId: this.activeId,
      lastId: this.lastId,
      active: this.activeId ? this.packs.find((p) => p.id === this.activeId) ?? null : null,
      persisted: this.persisted,
      ready: this.ready,
      volume: this.audio.volume,
      muted: this.audio.muted,
      error: this.error,
    };
  }

  private emit(): void {
    this.version++;
    this.snap = this.makeSnapshot();
    for (const l of this.listeners) l();
  }

  private fail(msg: string | null): void { this.error = msg; this.emit(); }

  // ---- lifecycle --------------------------------------------------------------------------------------------

  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const loaded = await dbLoadPacks();
    if (loaded === null) this.persisted = false;
    else this.packs = loaded.sort((a, b) => a.createdAt - b.createdAt);
    if (this.activeId && !this.packs.some((p) => p.id === this.activeId)) this.activeId = null;
    if (this.lastId && !this.packs.some((p) => p.id === this.lastId)) this.lastId = null;
    this.lastId ??= this.activeId ?? this.packs[0]?.id ?? null;
    this.ready = true;
    this.emit();
    this.applyActive();
  }

  private async save(pack: Pack): Promise<void> {
    if (!this.persisted) return;
    if (!(await dbPutPack(pack))) { this.persisted = false; this.emit(); }
  }

  // ---- applying the active pack ----------------------------------------------------------------------------

  private clearApplied(): void {
    this.registry.clear();
    this.audio.clearCustom();
    for (const { bmp } of this.bitmaps.values()) bmp.close();
    this.bitmaps.clear();
  }

  private applyActive(): void {
    const epoch = ++this.epoch;
    this.clearApplied();
    this.emit();
    const pack = this.snap.active;
    if (!pack) return;
    for (const slot of Object.keys(pack.images)) void this.syncImage(pack, slot, epoch);
    for (const slot of Object.keys(pack.sounds)) void this.syncSound(pack, slot, epoch);
  }

  private place(slot: string, pack: Pack): void {
    const a = pack.images[slot];
    const cached = this.bitmaps.get(slot);
    if (!a || !cached) { this.registry.delete(slot); return; }
    const { bmp } = cached;
    const base = { scale: a.scale, dx: a.offsetX, dy: a.offsetY };
    const art: SlotArt = a.frames > 1 && Math.floor(bmp.width / a.frames) > 0
      ? { kind: "strip", image: bmp, frames: a.frames, frameW: Math.floor(bmp.width / a.frames), frameH: bmp.height, fps: a.fps, ...base }
      : { kind: "image", image: bmp, width: bmp.width, height: bmp.height, ...base };
    this.registry.set(slot, art);
  }

  private async syncImage(pack: Pack, slot: string, epoch: number): Promise<void> {
    const a = pack.images[slot];
    if (!a) {
      this.bitmaps.get(slot)?.bmp.close();
      this.bitmaps.delete(slot);
      this.registry.delete(slot);
      this.emit();
      return;
    }
    if (this.bitmaps.get(slot)?.blob !== a.blob) {
      try {
        const bmp = await createImageBitmap(a.blob);
        if (epoch !== this.epoch) { bmp.close(); return; }
        this.bitmaps.get(slot)?.bmp.close();
        this.bitmaps.set(slot, { bmp, blob: a.blob });
      } catch {
        if (epoch === this.epoch) this.fail(text().store.imageUndecodable(slot));
        return;
      }
    }
    this.place(slot, pack);
    this.emit();
  }

  private async syncSound(pack: Pack, slot: string, epoch: number): Promise<void> {
    const a = pack.sounds[slot];
    if (!a) { this.audio.deleteCustom(slot); this.emit(); return; }
    try {
      const buf = await this.audio.decode(a.blob);
      if (epoch !== this.epoch) return;
      this.audio.setCustom(slot, buf, a.volume);
      this.emit();
    } catch {
      if (epoch === this.epoch) this.fail(text().store.soundUndecodable(slot));
    }
  }

  // ---- selection --------------------------------------------------------------------------------------------

  setActive(id: string | null): void {
    if (id !== null && !this.packs.some((p) => p.id === id)) return;
    if (id === this.activeId) return;
    this.activeId = id;
    if (id) this.lastId = id;
    this.error = null;
    this.applyActive();
  }

  /** Quick switch: default art <-> last chosen custom pack. Returns false when there is no custom pack to switch to. */
  toggleDefault(): boolean {
    if (this.activeId) { this.setActive(null); return true; }
    const target = this.lastId && this.packs.some((p) => p.id === this.lastId) ? this.lastId : this.packs[0]?.id ?? null;
    if (!target) return false;
    this.setActive(target);
    return true;
  }

  // ---- pack management --------------------------------------------------------------------------------------

  createPack(name?: string): Pack {
    const pack = emptyPack(name ?? text().pack.newPackName(this.packs.length + 1));
    this.packs.push(pack);
    void this.save(pack);
    this.setActive(pack.id);
    return pack;
  }

  renamePack(id: string, name: string): void {
    const p = this.packs.find((x) => x.id === id);
    if (!p) return;
    p.name = cleanName(name);
    void this.save(p);
    this.emit();
  }

  duplicatePack(id: string): void {
    const p = this.packs.find((x) => x.id === id);
    if (!p) return;
    const copy: Pack = {
      id: newPackId(), name: cleanName(text().pack.copyName(p.name)), createdAt: Date.now(),
      images: Object.fromEntries(Object.entries(p.images).map(([k, v]) => [k, { ...v }])),
      sounds: Object.fromEntries(Object.entries(p.sounds).map(([k, v]) => [k, { ...v }])),
    };
    this.packs.push(copy);
    void this.save(copy);
    this.setActive(copy.id);
  }

  deletePack(id: string): void {
    if (!this.packs.some((p) => p.id === id)) return;
    this.packs = this.packs.filter((p) => p.id !== id);
    if (this.lastId === id) this.lastId = this.packs[0]?.id ?? null;
    if (this.persisted) void dbDeletePack(id);
    if (this.activeId === id) { this.activeId = null; this.applyActive(); } else this.emit();
  }

  async importPack(file: File): Promise<boolean> {
    if (file.size > LIMITS.textBytes) { this.fail(text().pack.importTooLarge(formatBytes(LIMITS.totalBytes))); return false; }
    let raw: string;
    try { raw = await file.text(); } catch { this.fail(text().store.readFailed); return false; }
    const r = parsePackText(raw);
    if (!r.ok) { this.fail(r.error); return false; }
    this.packs.push(r.pack);
    void this.save(r.pack);
    this.error = null;
    this.setActive(r.pack.id);
    return true;
  }

  async exportPack(id: string): Promise<void> {
    const p = this.packs.find((x) => x.id === id);
    if (!p) return;
    try {
      const json = JSON.stringify(await packToFile(p));
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(p.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch { this.fail(text().store.exportFailed); }
  }

  // ---- slot editing (always on the active pack; creates one when the default is active) ---------------------

  private editable(): Pack {
    return this.snap.active ?? this.createPack(text().pack.myPack);
  }

  async setImage(slot: string, file: File): Promise<void> {
    const err = checkUpload("image", file);
    if (err) { this.fail(err); return; }
    const pack = this.editable();
    if (packBytes(pack) - (pack.images[slot]?.blob.size ?? 0) + file.size > LIMITS.totalBytes) {
      this.fail(text().store.wouldExceed(formatBytes(LIMITS.totalBytes)));
      return;
    }
    try { (await createImageBitmap(file)).close(); } catch { this.fail(text().store.imageFileUndecodable); return; }
    const prev = pack.images[slot];
    pack.images[slot] = { blob: file, ...(prev ? sanitizeImageOptions(prev) : DEFAULT_IMAGE_OPTIONS) };
    this.error = null;
    void this.save(pack);
    await this.syncImage(pack, slot, this.epoch);
  }

  clearImage(slot: string): void {
    const pack = this.snap.active;
    if (!pack || !pack.images[slot]) return;
    delete pack.images[slot];
    void this.save(pack);
    void this.syncImage(pack, slot, this.epoch);
  }

  setImageOptions(slot: string, o: Partial<ImageOptions>): void {
    const pack = this.snap.active;
    const a = pack?.images[slot];
    if (!pack || !a) return;
    Object.assign(a, sanitizeImageOptions({ ...a, ...o }));
    this.place(slot, pack);
    void this.save(pack);
    this.emit();
  }

  async setSound(slot: string, file: File): Promise<void> {
    const err = checkUpload("sound", file);
    if (err) { this.fail(err); return; }
    const pack = this.editable();
    if (packBytes(pack) - (pack.sounds[slot]?.blob.size ?? 0) + file.size > LIMITS.totalBytes) {
      this.fail(text().store.wouldExceed(formatBytes(LIMITS.totalBytes)));
      return;
    }
    let buf: AudioBuffer;
    try { buf = await this.audio.decode(file); } catch { this.fail(text().store.soundFileUndecodable); return; }
    pack.sounds[slot] = { blob: file, volume: pack.sounds[slot]?.volume ?? 1 };
    this.audio.setCustom(slot, buf, pack.sounds[slot].volume);
    this.error = null;
    void this.save(pack);
    this.emit();
  }

  clearSound(slot: string): void {
    const pack = this.snap.active;
    if (!pack || !pack.sounds[slot]) return;
    delete pack.sounds[slot];
    this.audio.deleteCustom(slot);
    void this.save(pack);
    this.emit();
  }

  setSoundVolume(slot: string, v: number): void {
    const pack = this.snap.active;
    const a = pack?.sounds[slot];
    if (!pack || !a) return;
    a.volume = sanitizeVolume(v);
    this.audio.setCustomVolume(slot, a.volume);
    void this.save(pack);
    this.emit();
  }

  // ---- audio settings ---------------------------------------------------------------------------------------

  setVolume(v: number): void { this.audio.setVolume(v); this.emit(); }
  setMuted(m: boolean): void { this.audio.setMuted(m); this.emit(); }
  dismissError(): void { if (this.error) this.fail(null); }
}
