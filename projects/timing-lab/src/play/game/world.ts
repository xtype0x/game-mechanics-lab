import { Rng, Timing } from "@gml/core";
import {
  BULLET_KINDS, CEIL_Y, CHEST_Y, GROUND_Y, GUNNER_X, HIT_X, MUZZLE, PRACTICE, SCORE, FPS, feintProfile,
  type BulletKindId,
} from "./config";
import { createDirector, directorStep, speedMultAt, type DirectorState } from "./director";

type Cfg = Timing.TimingConfig;

export type BulletState = "flying" | "pending" | "passed" | "reflected";

export interface Bullet {
  id: number;
  kind: BulletKindId;
  state: BulletState;
  x0: number;
  y0: number;
  targetY: number;
  /** Unfolded vertical target for bouncing bullets (see foldY). */
  yu: number;
  x: number;
  y: number;
  /** Flight progress: 0 at the muzzle, 1 at the player's hit line. */
  p: number;
  age: number;
  speed: number;
}

export type Tone = "perfect" | "success" | "fail" | "info";

export type GameEvent =
  | { type: "fire"; kind: BulletKindId; x: number; y: number }
  | { type: "spark"; x: number; y: number; color: string; big?: boolean }
  | { type: "popup"; text: string; sub?: string; tone: Tone; x: number; y: number; /** The bullet slipped through (dodge-like). */ pass?: boolean }
  | { type: "shake"; amount: number; frames: number }
  | { type: "hurt" }
  | { type: "reflect"; x: number; y: number }
  | { type: "vfx"; name: string }
  | { type: "accept"; interaction: string }
  | { type: "defeated" };

export interface Stats {
  perfects: number;
  successes: number;
  hits: number;
  cancelled: number;
}

export interface World {
  config: Cfg;
  difficulty: number;
  /** Practice run: infinite lives, slower bullets, longer gaps. */
  practice: boolean;
  frame: number;
  timing: Timing.TimingState;
  rng: Rng;
  aimRng: Rng;
  director: DirectorState;
  bullets: Bullet[];
  nextId: number;
  gunner: { lastFire: number };
  player: { hurtUntil: number };
  stats: Stats;
  over: boolean;
}

export interface StepResult {
  events: GameEvent[];
  attacks: Timing.AttackEvent[];
  /** Real frames to freeze the world (host command). */
  hitstop: number;
  /** Slow motion request (host command): `scale` for `frames` real frames. */
  timeScale: { scale: number; frames: number } | null;
  timing: Timing.TimingEvent[];
  /** Bullets that reached the hit line this frame. */
  impacts: { frame: number; kind: BulletKindId }[];
}

export function createWorld(config: Cfg, opts: { seed?: number | string; difficulty?: number; practice?: boolean } = {}): World {
  const seed = opts.seed ?? 1;
  return {
    config,
    difficulty: opts.difficulty ?? 1,
    practice: opts.practice === true,
    frame: 0,
    timing: Timing.createTimingState(config),
    rng: new Rng(seed, "bullet-parry.director"),
    aimRng: new Rng(seed, "bullet-parry.aim"),
    director: createDirector(),
    bullets: [],
    nextId: 1,
    gunner: { lastFire: -999 },
    player: { hurtUntil: 0 },
    stats: { perfects: 0, successes: 0, hits: 0, cancelled: 0 },
    over: false,
  };
}

export const attackId = (b: Bullet) => "b" + b.id;

/** Reflect an unfolded y into [top, bottom] (bouncing off ceiling and floor). */
export function foldY(u: number, top: number, bottom: number): number {
  const h = bottom - top;
  const m = (((u - top) % (2 * h)) + 2 * h) % (2 * h);
  return top + (m <= h ? m : 2 * h - m);
}

const BOUNCE_BOTTOM = GROUND_Y - 18;

/** Create a bullet at the muzzle (exported so tests can spawn exact bullets). */
export function spawnBullet(w: World, kindId: BulletKindId): Bullet {
  const kind = BULLET_KINDS[kindId];
  const jitter = (n: number) => w.aimRng.int(2 * n + 1) - n;
  let y0: number = MUZZLE.y;
  let targetY = CHEST_Y + jitter(14);
  let yu = targetY;
  if (kindId === "low") { y0 = GROUND_Y - 24; targetY = y0; }
  if (kindId === "energy") targetY = CHEST_Y;
  if (kind.motion === "bounce") {
    targetY = CHEST_Y;
    const n = 1 + w.aimRng.int(3);
    const h = BOUNCE_BOTTOM - CEIL_Y;
    yu = n % 2 === 1
      ? BOUNCE_BOTTOM + (n - 1) * h + (BOUNCE_BOTTOM - targetY)
      : BOUNCE_BOTTOM + (n - 1) * h + (targetY - CEIL_Y);
  }
  const b: Bullet = {
    id: w.nextId++, kind: kindId, state: "flying", x0: MUZZLE.x, y0, targetY, yu,
    x: MUZZLE.x, y: y0, p: 0, age: 0, speed: kind.speed * speedMultAt(w.frame, w.difficulty) * (w.practice ? PRACTICE.speedMult : 1),
  };
  w.bullets.push(b);
  return b;
}

function yAt(b: Bullet): number {
  if (BULLET_KINDS[b.kind].motion === "bounce") return foldY(b.y0 + (b.yu - b.y0) * b.p, CEIL_Y, BOUNCE_BOTTOM);
  return b.y0 + (b.targetY - b.y0) * b.p;
}

interface Ctx {
  attack: string;
  via: "interaction" | "invulnerable" | "hit";
  outcome: string | null;
  cues: Set<string>;
  hitstop: boolean;
  damage: boolean;
}

/** Run one world frame (60 Hz). `presses` are interaction ids queued since the previous step. */
export function stepWorld(w: World, presses: string[]): StepResult {
  const res: StepResult = { events: [], attacks: [], hitstop: 0, timeScale: null, timing: [], impacts: [] };
  if (w.over) return res;
  const cfg = w.config;
  const f = w.frame;
  const ev = res.events;

  // Director. The gunner is never affected by the player.
  for (const shot of directorStep(w.director, w.rng, f, w.practice ? w.difficulty * PRACTICE.gapMult : w.difficulty)) {
    const b = spawnBullet(w, shot.kind);
    w.gunner.lastFire = f;
    ev.push({ type: "fire", kind: b.kind, x: MUZZLE.x, y: MUZZLE.y });
  }

  // Move bullets.
  for (const b of w.bullets) {
    b.age++;
    if (b.state === "flying") {
      const kind = BULLET_KINDS[b.kind];
      const prof = kind.motion === "variable" ? feintProfile(b.p) : 1;
      b.x -= b.speed * prof;
      b.p = (b.x0 - b.x) / (b.x0 - HIT_X);
      if (b.x <= HIT_X) {
        b.x = HIT_X;
        b.p = 1;
        b.state = "pending";
        res.attacks.push({ id: attackId(b), frame: f, tags: [...kind.tags], damage: kind.damage });
        res.impacts.push({ frame: f, kind: b.kind });
      }
      b.y = yAt(b);
    } else if (b.state === "passed") {
      b.x -= b.speed;
      b.p = (b.x0 - b.x) / (b.x0 - HIT_X);
      b.y = yAt(b);
    } else if (b.state === "reflected") {
      // Deflected up and away: it flies off screen above the gunner instead of hitting him.
      b.x += 13;
      b.y -= 6;
    }
  }

  // Reflected bullets cancel incoming bullets they touch.
  for (const rb of w.bullets) {
    if (rb.state !== "reflected") continue;
    for (const o of w.bullets) {
      if (o.state !== "flying" || Math.abs(o.x - rb.x) > 20 || Math.abs(o.y - rb.y) > 32) continue;
      ev.push({ type: "spark", x: o.x, y: o.y, color: BULLET_KINDS[o.kind].color });
      o.x = -999;
      w.stats.cancelled++;
    }
    if (rb.y < -60 || rb.x > GUNNER_X + 200) rb.x = 99999;
  }
  w.bullets = w.bullets.filter((b) => b.x < 9999 && b.x > -60);

  // Timing rules.
  const known = new Set(cfg.interactions.map((i) => i.id));
  const out = Timing.stepTiming(cfg, w.timing, { presses: presses.filter((p) => known.has(p)), attacks: res.attacks });
  w.timing = out.state;
  res.timing = out.events;
  if (w.practice) refillLives(w, res);
  handleTimingEvents(w, res);
  w.frame = f + 1;
  return res;
}

/** Practice mode: health is topped up after every frame, so the run can never end. */
function refillLives(w: World, res: StepResult): void {
  const h = w.config.healthResource;
  const max = w.config.resources.find((r) => r.id === h)?.max ?? 0;
  if ((w.timing.resources[h] ?? 0) < max) w.timing.resources[h] = max;
  w.timing.defeated = false;
  res.timing = res.timing.filter((e) => e.type !== "defeated");
}

function handleTimingEvents(w: World, res: StepResult): void {
  const cfg = w.config;
  const f = w.frame;
  const ev = res.events;
  const outcomeName = (id: string | null) => cfg.outcomes.find((o) => o.id === id)?.name ?? "";
  const outcomeKind = (id: string | null) => cfg.outcomes.find((o) => o.id === id)?.kind ?? "neutral";
  let ctx: Ctx | null = null;

  const finish = () => {
    if (!ctx) return;
    const c: Ctx = ctx;
    ctx = null;
    const b = w.bullets.find((x) => attackId(x) === c.attack);
    const bx = b?.x ?? HIT_X;
    const by = b?.y ?? CHEST_Y;
    const kind = outcomeKind(c.outcome);
    const color = b ? BULLET_KINDS[b.kind].color : "#fff";
    const remove = () => { if (b) w.bullets = w.bullets.filter((x) => x !== b); };
    if (c.via === "hit") {
      remove();
      w.stats.hits++;
      ev.push({ type: "spark", x: bx, y: by, color: "#ff5a5a", big: true });
      ev.push({ type: "hurt" }, { type: "shake", amount: 9, frames: 16 });
      return;
    }
    if (c.via === "invulnerable") {
      remove();
      ev.push({ type: "spark", x: bx, y: by, color: "#8fe9ff" });
      return;
    }
    const bad = kind === "fail" || c.damage;
    if (kind === "perfect") w.stats.perfects++;
    else if (kind === "success") w.stats.successes++;
    const tone: Tone = kind === "perfect" ? "perfect" : kind === "success" ? "success" : bad ? "fail" : "info";
    ev.push({
      type: "popup", text: kind === "perfect" ? "PERFECT!" : outcomeName(c.outcome), tone,
      ...(kind === "perfect" ? { sub: outcomeName(c.outcome) } : {}), ...(c.cues.has("pass") ? { pass: true } : {}),
      x: HIT_X + 20, y: CHEST_Y - 70,
    });
    if (bad) {
      remove();
      w.stats.hits++;
      ev.push({ type: "spark", x: bx, y: by, color: "#ff5a5a", big: true });
      ev.push({ type: "hurt" }, { type: "shake", amount: 9, frames: 16 });
      return;
    }
    if (c.cues.has("reflect") && b) {
      b.state = "reflected";
      b.y0 = b.y;
      ev.push({ type: "reflect", x: bx, y: by }, { type: "spark", x: bx, y: by, color: "#fff4b0", big: true });
      return;
    }
    // Outcomes with the "pass" cue (spec §3) let the bullet slip through; every other catch consumes it.
    const consumes = !c.cues.has("pass");
    if (consumes) {
      remove();
      ev.push({ type: "spark", x: bx, y: by, color, big: kind === "perfect" });
    } else if (b) {
      b.state = "passed";
      b.speed = Math.max(b.speed, 6);
    }
  };

  for (const e of res.timing) {
    if (e.type === "resolve") {
      finish();
      ctx = { attack: e.attack, via: e.via, outcome: e.outcome, cues: new Set(), hitstop: false, damage: false };
      continue;
    }
    if (e.type === "effect") {
      const cur = ctx as Ctx | null;
      if (cur && e.outcome === cur.outcome) {
        if (e.effect === "cue" && e.target) cur.cues.add(e.target);
        if (e.effect === "hitstop" && (e.frames ?? 0) > 0) cur.hitstop = true;
        if (e.effect === "damage" && (e.value ?? 0) > 0) cur.damage = true;
      } else finish();
      applyHostEffect(w, res, e);
      continue;
    }
    finish();
    if (e.type === "accept") ev.push({ type: "accept", interaction: e.interaction });
    else if (e.type === "whiff") {
      if (e.outcome) ev.push({ type: "popup", text: outcomeName(e.outcome), tone: "fail", x: HIT_X + 20, y: CHEST_Y - 70 });
    } else if (e.type === "defeated") {
      w.over = true;
      ev.push({ type: "defeated" });
    }
  }
  finish();
}

/** Host-side effects: freeze, slow motion, animation and vfx cues. */
function applyHostEffect(w: World, res: StepResult, e: Extract<Timing.TimingEvent, { type: "effect" }>): void {
  const f = w.frame;
  if (e.effect === "hitstop") res.hitstop = Math.max(res.hitstop, e.frames ?? 0);
  else if (e.effect === "timeScale") {
    const frames = e.frames ?? 0;
    if (frames > 0 && (!res.timeScale || (e.value ?? 1) < res.timeScale.scale)) res.timeScale = { scale: e.value ?? 1, frames };
  } else if (e.effect === "cue" && e.target) {
    if (e.target === "anim:hurt" || e.target === "anim:guardBroken") w.player.hurtUntil = f + 24;
    else if (e.target.startsWith("vfx:")) res.events.push({ type: "vfx", name: e.target.slice(4) });
  }
}

export const scoreOf = (w: World): number =>
  Math.floor((w.frame / FPS) * SCORE.perSecond) + w.stats.perfects * SCORE.perfect;

export type PlayerPhase = "idle" | "startup" | "active" | "recovery";

export interface PlayerView {
  /** Slot suffix: "idle" | "hurt" | interaction id. */
  pose: string;
  phase: PlayerPhase;
  /** 0..1 within the current phase. */
  progress: number;
  /** Remaining invulnerable world frames. */
  invulnerable: number;
}

export function playerView(w: World): PlayerView {
  const t = w.timing;
  const f = w.frame;
  const invulnerable = Math.max(0, (t.statuses.invulnerable ?? 0) - f);
  if (f < w.player.hurtUntil || w.over) return { pose: "hurt", phase: "idle", progress: 0, invulnerable };
  const a = t.action;
  if (!a) return { pose: "idle", phase: "idle", progress: 0, invulnerable };
  const first = a.windows[0]?.from ?? a.activeEnd;
  if (f < first) return { pose: a.interaction, phase: "startup", progress: (f - a.start) / Math.max(1, first - a.start), invulnerable };
  if (f < a.activeEnd) return { pose: a.interaction, phase: "active", progress: (f - first) / Math.max(1, a.activeEnd - first), invulnerable };
  const end = a.recoveryEnd ?? a.activeEnd + 1;
  return { pose: a.interaction, phase: "recovery", progress: (f - a.activeEnd) / Math.max(1, end - a.activeEnd), invulnerable };
}
