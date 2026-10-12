import { Timing } from "@gml/core";
import { describe, expect, it } from "vitest";
import { REPLAY_TAIL, bulletParryDefault, buildReplay, createSession, pressInteraction, tickSession, type Session } from "../src/play/game";
import { ReplayMismatch, assertReplayFits, buildScript, defaultSession, parseSession, replayItems, type Session as LabSession } from "../src/lab/session";
import { parseReplay } from "../src/shell/replay";

/** Default rules with lots of health, so a scripted run survives long enough. */
function sturdy(): Timing.TimingConfig {
  const c = bulletParryDefault();
  const hp = c.resources.find((r) => r.id === c.healthResource)!;
  hp.max = 99;
  hp.initial = 99;
  return c;
}

/** Tick until `frames` world frames were stepped; presses every 37 frames, alternating interactions. */
function drive(s: Session, frames: number): Map<number, Timing.TimingEvent[]> {
  const byFrame = new Map<number, Timing.TimingEvent[]>();
  const ids = s.world.config.interactions.map((i) => i.id);
  let k = 0;
  let guard = 0;
  while (s.world.frame < frames && !s.world.over && guard++ < frames * 20) {
    const f = s.world.frame;
    if (f % 37 === 5 && s.queue.length === 0) pressInteraction(s, ids[k++ % ids.length]!);
    tickSession(s);
    if (s.world.frame !== f) byFrame.set(f, s.judge.events.toArray().filter((e) => e.frame === f));
  }
  return byFrame;
}

const key = (e: Timing.TimingEvent, shift: number) =>
  e.type === "resolve" ? `${e.frame - shift}|resolve|${e.attack}|${e.via}|${e.outcome}`
    : e.type === "accept" ? `${e.frame - shift}|accept|${e.interaction}|${e.buffered}`
      : null;

describe("replay recording", () => {
  it("re-running the recorded window reproduces the game's own timing events", () => {
    const config = sturdy();
    const s = createSession(config, { seed: 7, difficulty: 2 });
    const byFrame = drive(s, 900);
    expect(s.world.frame).toBeGreaterThanOrEqual(900);
    const r = buildReplay(s)!;
    expect(r).not.toBeNull();
    expect(r.practice).toBe(false);
    expect(r.configName).toBe(config.name);
    const origin = s.world.frame - (r.frames - REPLAY_TAIL);
    expect(s.world.frame - origin).toBeGreaterThanOrEqual(330);
    expect(s.world.frame - origin).toBeLessThanOrEqual(360);
    expect(origin % 30).toBe(0);
    expect(r.initial.frame).toBe(0);
    expect(parseReplay(JSON.parse(JSON.stringify(r)))).not.toBeNull();

    const expected: string[] = [];
    for (let f = origin; f < s.world.frame; f++) for (const e of byFrame.get(f) ?? []) { const k = key(e, origin); if (k) expected.push(k); }
    expect(expected.some((k) => k.includes("|resolve|"))).toBe(true);

    const run = Timing.runTiming(config, { frames: r.frames, presses: r.presses, attacks: r.attacks }, { initial: r.initial });
    const got = run.events.filter((e) => e.frame < s.world.frame - origin).map((e) => key(e, 0)).filter((k): k is string => k !== null);
    expect(got).toEqual(expected);

    // Bullet metadata lines up with the recorded attacks.
    expect(r.bullets.length).toBeGreaterThan(0);
    for (const b of r.bullets) {
      expect(b.impact).toBeGreaterThanOrEqual(0);
      expect(b.fire).toBeLessThanOrEqual(b.impact);
      expect(r.attacks.find((a) => a.id === b.id)?.frame).toBe(b.impact);
    }
    expect(r.originalPresses).toEqual(r.presses);
  });

  it("a short run replays from frame 0", () => {
    const s = createSession(sturdy(), { seed: 3 });
    drive(s, 200);
    const r = buildReplay(s)!;
    expect(r.frames).toBe(s.world.frame + REPLAY_TAIL);
    expect(r.initial).toEqual(Timing.createTimingState(s.world.config));
  });

  it("names follow the language: bullets always, rules only for an untouched built-in", () => {
    const s = createSession(bulletParryDefault(), { seed: 7, difficulty: 2 });
    drive(s, 500);
    const r = buildReplay(s)!;
    expect(r.configNames?.en).toBe(bulletParryDefault("en").name);
    expect(r.configNames?.["zh-Hant"]).toBe(bulletParryDefault("zh-Hant").name);
    expect(r.bullets.length).toBeGreaterThan(0);
    for (const b of r.bullets) expect(Object.keys(b.names ?? {}).sort()).toEqual(["en", "zh-Hant"]);
    expect(replayItems(r, "en")[0]!.def.name).toBe(r.bullets[0]!.names!.en);
    // Edited rules keep their own text.
    const edited = createSession(sturdy(), { seed: 3 });
    drive(edited, 200);
    expect(buildReplay(edited)!.configNames).toBeUndefined();
  });

  it("an incompatible replay reports the missing ids", () => {
    const config = sturdy();
    const s = createSession(config, { seed: 3 });
    drive(s, 200);
    const r = buildReplay(s)!;
    const noSkill = { ...config, interactions: config.interactions.filter((i) => i.id !== "skill") };
    try {
      assertReplayFits(r, noSkill);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ReplayMismatch);
      expect((e as ReplayMismatch).ids).toEqual(["skill"]);
    }
  });

  it("returns null when nothing was recorded", () => {
    const s = createSession(sturdy(), { seed: 1 });
    expect(buildReplay(s)).toBeNull();
  });

  it("the lab session stores the replay, runs it, and drops invalid data", () => {
    const config = sturdy();
    const s = createSession(config, { seed: 7, difficulty: 2 });
    drive(s, 500);
    const r = buildReplay(s)!;
    const session: LabSession = { ...defaultSession(), source: "replay", replay: r };
    const back = parseSession(JSON.stringify(session));
    expect(back.source).toBe("replay");
    expect(back.replay?.frames).toBe(r.frames);
    const { script, items, initial } = buildScript(back, config);
    expect(script.frames).toBe(r.frames);
    expect(items.length).toBe(r.bullets.length);
    expect(initial).toEqual(r.initial);
    expect(() => assertReplayFits(r, config)).not.toThrow();
    const noHp = { ...config, resources: config.resources.filter((x) => x.id !== config.healthResource) };
    expect(() => assertReplayFits(r, noHp)).toThrow();
    const bad = parseSession(JSON.stringify({ ...session, replay: { ...r, version: 9 } }));
    expect(bad.source).toBe("sequence");
    expect(bad.replay).toBeUndefined();
    expect(parseSession(JSON.stringify({ attacks: [], sequence: [] })).source).toBe("sequence");
  });

  it("parseReplay rejects malformed data", () => {
    const s = createSession(sturdy(), { seed: 3 });
    drive(s, 100);
    const r = buildReplay(s)!;
    expect(parseReplay(r)).not.toBeNull();
    expect(parseReplay({ ...r, version: 2 })).toBeNull();
    expect(parseReplay({ ...r, initial: { ...r.initial, frame: 5 } })).toBeNull();
    expect(parseReplay({ ...r, presses: [{ frame: "x", interaction: "a" }] })).toBeNull();
    expect(parseReplay(null)).toBeNull();
  });
});
