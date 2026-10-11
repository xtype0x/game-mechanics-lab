/** WebAudio playback: synthesized defaults, uploaded buffers per slot, master volume/mute, per-sound throttle. */
import { SOUND_THROTTLE_MS } from "./events";
import { DEFAULT_SYNTH, type Synth } from "./synth";

interface Custom { buffer: AudioBuffer; volume: number }

type WinAudio = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext; OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext };

const win = (): WinAudio => window as unknown as WinAudio;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private offline: OfflineAudioContext | null = null;
  private readonly custom = new Map<string, Custom>();
  private readonly last = new Map<string, number>();
  volume = 0.7;
  muted = false;

  get available(): boolean { return typeof window !== "undefined" && !!(win().AudioContext ?? win().webkitAudioContext); }

  /** Create or resume the AudioContext. Call from a user gesture (autoplay policy). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = win().AudioContext ?? win().webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.applyGain();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
    } catch { /* audio unavailable */ }
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setVolume(v: number): void { this.volume = Math.min(1, Math.max(0, v)); this.applyGain(); }
  setMuted(m: boolean): void { this.muted = m; this.applyGain(); }

  /** Decode an uploaded file. An offline context is used so no running AudioContext is needed before a gesture. */
  async decode(blob: Blob): Promise<AudioBuffer> {
    const Off = win().OfflineAudioContext ?? win().webkitOfflineAudioContext;
    if (!Off) throw new Error("此瀏覽器不支援音訊解碼");
    this.offline ??= new Off(2, 1, 44100);
    return this.offline.decodeAudioData(await blob.arrayBuffer());
  }

  setCustom(id: string, buffer: AudioBuffer, volume: number): void { this.custom.set(id, { buffer, volume }); }
  setCustomVolume(id: string, volume: number): void { const c = this.custom.get(id); if (c) c.volume = volume; }
  deleteCustom(id: string): void { this.custom.delete(id); }
  clearCustom(): void { this.custom.clear(); }

  /** Play a slot now. `force` skips the throttle (preview buttons). */
  play(id: string, force = false): void {
    if (this.muted || this.volume <= 0) return;
    this.unlock();
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== "running") return;
    const now = performance.now();
    const gap = (SOUND_THROTTLE_MS as Record<string, number>)[id] ?? 50;
    if (!force && now - (this.last.get(id) ?? -1e9) < gap) return;
    this.last.set(id, now);
    try {
      const c = this.custom.get(id);
      if (c) {
        const src = ctx.createBufferSource();
        src.buffer = c.buffer;
        const g = ctx.createGain();
        g.gain.value = c.volume;
        src.connect(g);
        g.connect(master);
        src.start();
      } else {
        (DEFAULT_SYNTH as Record<string, Synth | undefined>)[id]?.(ctx, master, ctx.currentTime);
      }
    } catch { /* ignore playback errors */ }
  }

  playAll(ids: readonly string[]): void { for (const id of ids) this.play(id); }
}
