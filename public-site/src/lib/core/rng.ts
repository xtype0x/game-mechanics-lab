/**
 * Deterministic, portable random number generation.
 *
 * Algorithm (see docs/spec/rng.md):
 *   - Stream seeding: FNV-1a 32-bit hash of `${seed}:${stream}` -> splitmix32 x4 -> sfc32 state.
 *   - Generator: sfc32 (Chris Doty-Humphrey), all arithmetic in uint32.
 *   - next(): uint32 / 2^32, in [0, 1).
 * Every step uses only 32-bit integer ops so it can be reproduced bit-for-bit in C#, C++, GDScript, Go, etc.
 */

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  // Hash UTF-8 bytes so non-ASCII stream names are portable.
  const bytes = utf8Bytes(text);
  for (const byte of bytes) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    let cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else {
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
  }
  return out;
}

function splitmix32(state: number): [value: number, next: number] {
  const next = (state + 0x9e3779b9) >>> 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return [z, next];
}

export function seedState(seed: number | string, stream = "main"): RngState {
  let s = fnv1a32(`${seed}:${stream}`);
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [v, n] = splitmix32(s);
    words.push(v);
    s = n;
  }
  const state: RngState = { a: words[0]!, b: words[1]!, c: words[2]!, d: words[3]! };
  // Warm up so that weakly-related seeds diverge.
  for (let i = 0; i < 12; i++) sfc32Step(state);
  return state;
}

/** Advances state in place and returns a uint32. */
export function sfc32Step(s: RngState): number {
  const t = (((s.a + s.b) >>> 0) + s.d) >>> 0;
  s.d = (s.d + 1) >>> 0;
  s.a = (s.b ^ (s.b >>> 9)) >>> 0;
  s.b = (s.c + (s.c << 3)) >>> 0;
  s.c = ((s.c << 21) | (s.c >>> 11)) >>> 0;
  s.c = (s.c + t) >>> 0;
  return t;
}

export class Rng {
  readonly state: RngState;

  constructor(seed: number | string, stream = "main") {
    this.state = seedState(seed, stream);
  }

  static fromState(state: RngState): Rng {
    const r = Object.create(Rng.prototype) as Rng;
    (r as { state: RngState }).state = { ...state };
    return r;
  }

  nextU32(): number {
    return sfc32Step(this.state);
  }

  /** Float in [0, 1) with 32 bits of resolution. */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** True with probability p (p clamped to [0, 1]). Consumes exactly one draw. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Integer in [0, n). Uses unbiased rejection sampling. */
  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > 4294967296) throw new RangeError(`int(n) requires 1..2^32, got ${n}`);
    const limit = 4294967296 - (4294967296 % n);
    for (;;) {
      const x = this.nextU32();
      if (x < limit) return x % n;
    }
  }

  snapshot(): RngState {
    return { ...this.state };
  }
}
