/** Default sound effects, synthesized with WebAudio (no audio files). Kept short and quiet. */
import type { SoundId } from "./events";

export type Synth = (ctx: BaseAudioContext, out: AudioNode, t: number) => void;

function env(ctx: BaseAudioContext, out: AudioNode, t: number, peak: number, attack: number, dur: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  return g;
}

function tone(ctx: BaseAudioContext, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, peak: number, dur: number, attack = 0.005): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(env(ctx, out, t, peak, attack, dur));
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(ctx: BaseAudioContext, out: AudioNode, t: number, peak: number, dur: number, f0: number, f1: number, q = 1): void {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  src.connect(f);
  f.connect(env(ctx, out, t, peak, 0.01, dur));
  src.start(t);
}

export const DEFAULT_SYNTH: Record<SoundId, Synth> = {
  "sfx.hit": (c, o, t) => { tone(c, o, t, "sine", 190, 55, 0.5, 0.22); noise(c, o, t, 0.25, 0.12, 900, 300); },
  "sfx.parry": (c, o, t) => { tone(c, o, t, "triangle", 1250, 1180, 0.22, 0.16); tone(c, o, t, "square", 1870, 1800, 0.05, 0.1); },
  "sfx.perfect": (c, o, t) => { tone(c, o, t, "sine", 880, 880, 0.28, 0.28); tone(c, o, t + 0.07, "sine", 1320, 1320, 0.26, 0.4); },
  "sfx.dodge": (c, o, t) => { noise(c, o, t, 0.35, 0.2, 500, 2400, 1.2); },
  "sfx.skill": (c, o, t) => { tone(c, o, t, "sawtooth", 220, 880, 0.12, 0.4, 0.04); tone(c, o, t, "sine", 440, 1760, 0.2, 0.4, 0.04); },
  "sfx.fire": (c, o, t) => { noise(c, o, t, 0.22, 0.07, 1800, 600); tone(c, o, t, "square", 160, 70, 0.08, 0.07); },
  "sfx.gameOver": (c, o, t) => { tone(c, o, t, "triangle", 440, 110, 0.3, 0.8, 0.02); tone(c, o, t + 0.12, "sine", 330, 82, 0.18, 0.7, 0.02); },
};
