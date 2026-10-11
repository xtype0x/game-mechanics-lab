import { Rng, Timing } from "@gml/core";
import { describe, expect, it } from "vitest";
import {
  BULLET_KINDS, CEIL_Y, CHEST_Y, DIRECTOR, GUNNER_X, PATTERNS, createDirector, createSession, createWorld,
  compressOffsets, directorSeconds, speedMultAt, directorStep, hudOf, intervalAt, pressInteraction, spawnBullet, stepWorld, tickSession, unlockedPatterns,
  bulletParryDefault, buildKeyMap, scoreOf, type BulletKindId, type GameEvent, type World,
} from "../src/game";

const quiet = (w: World) => { w.director.nextPatternAt = Number.POSITIVE_INFINITY; return w; };
const fresh = (over: Partial<{ seed: number; difficulty: number }> = {}) => quiet(createWorld(bulletParryDefault(), over));

interface RunOut { events: GameEvent[]; impact: number | null; hitstop: number; timeScale: { scale: number; frames: number } | null }

/** Step `frames` world frames; `presses[frame]` lists interaction ids pressed at that frame. */
function run(w: World, frames: number, presses: Record<number, string[]> = {}): RunOut {
  const out: RunOut = { events: [], impact: null, hitstop: 0, timeScale: null };
  for (let i = 0; i < frames; i++) {
    const f = w.frame;
    const r = stepWorld(w, presses[f] ?? []);
    out.events.push(...r.events);
    if (r.attacks.length && out.impact === null) out.impact = f;
    out.hitstop = Math.max(out.hitstop, r.hitstop);
    if (r.timeScale) out.timeScale = r.timeScale;
  }
  return out;
}

/** Impact frame of a lone bullet of `kind` (probe run without any input). */
function impactFrame(kind: BulletKindId): number {
  const w = fresh();
  spawnBullet(w, kind);
  const o = run(w, 400);
  expect(o.impact).not.toBeNull();
  return o.impact as number;
}

describe("bullets and attacks", () => {
  it("a straight bullet emits an attack at the expected frame with its tags", () => {
    const w = fresh();
    spawnBullet(w, "normal");
    const seen: { frame: number; tags: string[] }[] = [];
    for (let i = 0; i < 120; i++) {
      const r = stepWorld(w, []);
      for (const a of r.attacks) seen.push({ frame: a.frame, tags: a.tags });
    }
    // 806 -> 196 at 6.6 x 0.82 (opening) = 5.412 px/frame: first step with x <= 196 is the 113th (frame 112).
    expect(seen).toEqual([{ frame: 112, tags: ["bullet"] }]);
  });

  it("uses the tag sets from the kind table", () => {
    expect(BULLET_KINDS.red.tags).toEqual(["bullet", "unblockable"]);
    expect(BULLET_KINDS.low.tags).toEqual(["bullet", "sweep"]);
    expect(BULLET_KINDS.energy.tags).toEqual(["energy"]);
  });

  it("bouncing bullets stay inside the arena and arrive at chest height", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const w = fresh({ seed });
      const b = spawnBullet(w, "bounce");
      let arrived = false;
      for (let i = 0; i < 300 && !arrived; i++) {
        const r = stepWorld(w, []);
        expect(b.y).toBeGreaterThanOrEqual(CEIL_Y - 1e-9);
        if (r.attacks.length) { arrived = true; expect(b.y).toBeCloseTo(CHEST_Y, 6); }
      }
      expect(arrived).toBe(true);
    }
  });

  it("the feint bullet takes longer than a straight one of the same base speed", () => {
    expect(impactFrame("feint")).toBeGreaterThan(Math.ceil(610 / BULLET_KINDS.feint.speed));
  });
});

describe("reactions", () => {
  it("an unreacted bullet costs a life and is destroyed", () => {
    const w = fresh();
    spawnBullet(w, "normal");
    run(w, 120);
    expect(w.timing.resources.hp).toBe(2);
    expect(w.bullets).toHaveLength(0);
    expect(w.stats.hits).toBe(1);
  });

  it("a perfect parry reflects the bullet off screen without affecting the gunner", () => {
    const imp = impactFrame("normal");
    const w = fresh();
    const b = spawnBullet(w, "normal");
    const o = run(w, imp + 1, { [imp - 4]: ["parry"] });
    expect(o.hitstop).toBe(6);
    expect(b.state).toBe("reflected");
    expect(w.stats.perfects).toBe(1);
    expect(w.timing.resources.hp).toBe(3);
    expect(w.timing.resources.gauge).toBe(30);
    expect(o.events.some((e) => e.type === "reflect")).toBe(true);
    const fireBefore = w.director.nextPatternAt;
    run(w, 90);
    expect(w.bullets.includes(b)).toBe(false);
    // the director keeps its schedule: nothing the player does delays the gunner
    expect(w.director.nextPatternAt).toBe(fireBefore);
    expect(scoreOf(w)).toBe(Math.floor((w.frame / 60) * 10) + 50);
  });

  it("a late (normal window) parry destroys the bullet without reflecting", () => {
    const imp = impactFrame("normal");
    const w = fresh();
    spawnBullet(w, "normal");
    // Accepted 14 frames early: the 8-frame perfect window (after 2 startup) is already over at impact.
    const o = run(w, imp + 1, { [imp - 14]: ["parry"] });
    expect(w.stats.successes).toBe(1);
    expect(w.bullets).toHaveLength(0);
    expect(o.events.some((e) => e.type === "reflect")).toBe(false);
    expect(w.timing.resources.hp).toBe(3);
  });

  it("an unblockable bullet beats a parry: the player loses a life", () => {
    const imp = impactFrame("red");
    const w = fresh();
    spawnBullet(w, "red");
    run(w, imp + 5, { [imp - 4]: ["parry"] });
    expect(w.timing.resources.hp).toBe(2);
    expect(w.stats.hits).toBe(1);
    expect(w.stats.perfects).toBe(0);
  });

  it("a dodge lets the bullet pass through, grants gauge and asks for slow motion", () => {
    const imp = impactFrame("red");
    const w = fresh();
    const b = spawnBullet(w, "red");
    const o = run(w, imp + 1, { [imp - 4]: ["dodge"] });
    expect(b.state).toBe("passed");
    expect(w.bullets).toContain(b);
    expect(w.timing.resources.hp).toBe(3);
    expect(w.timing.resources.gauge).toBe(20);
    expect(o.timeScale).toEqual({ scale: 0.5, frames: 30 });
    run(w, 200);
    expect(w.bullets).toHaveLength(0);
    expect(w.timing.resources.hp).toBe(3);
  });

  it("dodge charges drop by one and recharge after 180 frames", () => {
    const w = fresh();
    run(w, 10, { 5: ["dodge"] });
    const ch = () => w.timing.charges.dodge;
    expect(ch()?.count).toBe(1);
    expect(hudOf(w).interactions.find((i) => i.id === "dodge")?.charges?.progress).toBeCloseTo((10 - 5) / 180, 6);
    run(w, 170);
    expect(ch()?.count).toBe(1);
    run(w, 20);
    expect(ch()?.count).toBe(2);
    expect(hudOf(w).interactions.find((i) => i.id === "dodge")?.charges?.progress).toBe(1);
  });

  it("the skill needs a full gauge, then invulnerability shields against hits", () => {
    const w = fresh();
    run(w, 3, { 1: ["skill"] });
    expect(w.timing.resources.gauge).toBe(0);
    expect(hudOf(w).interactions.find((i) => i.id === "skill")?.ready).toBe(false);
    w.timing.resources.gauge = 100;
    expect(hudOf(w).interactions.find((i) => i.id === "skill")?.ready).toBe(true);
    run(w, 1, { [w.frame]: ["skill"] });
    expect(w.timing.resources.gauge).toBe(0);
    expect(hudOf(w).invulnerable).toBeGreaterThan(200);
    spawnBullet(w, "red");
    run(w, 130);
    expect(w.timing.resources.hp).toBe(3);
    expect(w.bullets).toHaveLength(0);
  });

  it("three hits end the run", () => {
    const w = fresh();
    const all: GameEvent[] = [];
    for (let i = 0; i < 3; i++) { spawnBullet(w, "normal"); all.push(...run(w, 130).events); }
    expect(w.over).toBe(true);
    expect(w.timing.defeated).toBe(true);
    expect(all.filter((e) => e.type === "defeated")).toHaveLength(1);
    const f = w.frame;
    stepWorld(w, ["parry"]);
    expect(w.frame).toBe(f);
  });
});

describe("session clock", () => {
  it("hitstop freezes world frames, then resumes; presses wait in the queue", () => {
    const imp = impactFrame("normal");
    const s = createSession(bulletParryDefault(), { seed: 1 });
    quiet(s.world);
    spawnBullet(s.world, "normal");
    for (let i = 0; i < imp - 4; i++) tickSession(s);
    pressInteraction(s, "parry");
    for (let i = 0; i < 5; i++) tickSession(s);
    expect(s.hitstop).toBe(6);
    const frozen = s.world.frame;
    for (let i = 0; i < 6; i++) { tickSession(s); expect(s.world.frame).toBe(frozen); }
    tickSession(s);
    expect(s.world.frame).toBe(frozen + 1);
  });

  it("timeScale advances the world at the requested fraction", () => {
    const imp = impactFrame("normal");
    const s = createSession(bulletParryDefault(), { seed: 1 });
    quiet(s.world);
    spawnBullet(s.world, "normal");
    for (let i = 0; i < imp - 4; i++) tickSession(s);
    pressInteraction(s, "dodge");
    for (let i = 0; i < 5; i++) tickSession(s);
    expect(s.scaleFrames).toBeGreaterThan(0);
    const before = s.world.frame;
    for (let i = 0; i < 20; i++) tickSession(s);
    expect(s.world.frame - before).toBeLessThan(13);
    expect(s.world.frame - before).toBeGreaterThanOrEqual(9);
  });
});

describe("director", () => {
  const simulate = (seed: number, seconds: number, difficulty = 1) => {
    const d = createDirector();
    const rng = new Rng(seed, "bullet-parry.director");
    const starts: { id: string; sec: number }[] = [];
    for (let f = 0; f < seconds * 60; f++) {
      const n = d.fired.length;
      directorStep(d, rng, f, difficulty);
      if (d.fired.length > n) starts.push({ id: d.fired[d.fired.length - 1] as string, sec: f / 60 });
    }
    return starts;
  };

  it("is deterministic for a fixed seed", () => {
    expect(simulate(7, 200)).toEqual(simulate(7, 200));
    expect(simulate(7, 200)).not.toEqual(simulate(8, 200));
  });

  it("only uses unlocked patterns and eventually uses all of them", () => {
    const starts = simulate(7, 400);
    for (const s of starts) expect(PATTERNS.find((p) => p.id === s.id)?.unlock ?? Infinity).toBeLessThanOrEqual(s.sec);
    expect(starts.filter((s) => s.sec < 12).every((s) => s.id === "single")).toBe(true);
    expect(new Set(starts.map((s) => s.id))).toEqual(new Set(PATTERNS.filter((p) => !p.minDifficulty).map((p) => p.id)));
  });

  it("unlock list grows over time and the interval shrinks to its floor", () => {
    expect(unlockedPatterns(0).map((p) => p.id)).toEqual(["single"]);
    expect(unlockedPatterns(100).length).toBe(PATTERNS.length - 1);
    expect(unlockedPatterns(100, 3).length).toBe(PATTERNS.length);
    expect(intervalAt(0, 1)).toBe(DIRECTOR.startInterval);
    expect(intervalAt(60 * 600, 1)).toBe(DIRECTOR.minInterval);
    expect(intervalAt(0, 2)).toBe(Math.round(DIRECTOR.startInterval / 2));
  });

  it("bursts are 5-8 quick bullets", () => {
    const rng = new Rng(3, "t");
    const burst = PATTERNS.find((p) => p.id === "burst");
    for (let i = 0; i < 20; i++) {
      const shots = burst?.build(rng, 1) ?? [];
      expect(shots.length).toBeGreaterThanOrEqual(5);
      expect(shots.length).toBeLessThanOrEqual(8);
      expect(shots[1]!.offset - shots[0]!.offset).toBeLessThanOrEqual(14);
    }
  });

  it("difficulty is tempo: earlier unlocks, denser shots, same bullet speed", () => {
    // director clock runs d× faster: red (unlock 30) is available at 15 world-seconds on ×2
    expect(directorSeconds(15 * 60, 2)).toBe(30);
    expect(speedMultAt(60 * 60, 1)).toBe(speedMultAt(60 * 60, 3));
    // gaps shrink by 1/√d but never below MIN_SHOT_GAP; a 12-frame burst gap stays ≥ 10
    const c = compressOffsets([{ offset: 0, kind: "normal" }, { offset: 40, kind: "normal" }, { offset: 52, kind: "normal" }], 4);
    expect(c.map((s) => s.offset)).toEqual([0, 20, 30]);
    expect(compressOffsets([{ offset: 0, kind: "normal" }, { offset: 40, kind: "normal" }], 1)[1]!.offset).toBe(40);
    // ×3 bursts carry 4 extra bullets; the switch pattern only exists from 2.6
    const burst = PATTERNS.find((p) => p.id === "burst")!;
    const rng = new Rng(3, "t");
    for (let i = 0; i < 10; i++) expect(burst.build(rng, 3).length).toBeGreaterThanOrEqual(9);
    expect(unlockedPatterns(200, 2.5).some((p) => p.id === "switch")).toBe(false);
    expect(unlockedPatterns(200, 2.6).some((p) => p.id === "switch")).toBe(true);
    expect(intervalAt(60 * 600, 3)).toBe(DIRECTOR.floorInterval);
  });

  it("the first shot waits for its telegraph", () => {
    const w = createWorld(bulletParryDefault(), { seed: 2 });
    let firstFire = -1;
    for (let i = 0; i < 400 && firstFire < 0; i++) {
      if (stepWorld(w, []).events.some((e) => e.type === "fire")) firstFire = i;
    }
    expect(firstFire).toBeGreaterThanOrEqual(DIRECTOR.firstDelay + BULLET_KINDS.normal.telegraph);
  });
});

describe("config", () => {
  it("the game preset validates and maps keys", () => {
    const cfg = bulletParryDefault();
    expect(Timing.validateTiming(cfg).filter((i) => i.level === "error")).toEqual([]);
    const m = buildKeyMap(cfg);
    expect(m.get("KeyJ")).toBe("parry");
    expect(m.get("Space")).toBe("parry");
    expect(m.get("KeyK")).toBe("dodge");
    expect(m.get("ShiftLeft")).toBe("dodge");
    expect(m.get("KeyL")).toBe("skill");
  });

  it("every core preset can run a game step", () => {
    for (const p of Timing.TIMING_PRESETS) {
      const w = quiet(createWorld(p));
      spawnBullet(w, "energy");
      expect(() => run(w, 200)).not.toThrow();
    }
  });
});
