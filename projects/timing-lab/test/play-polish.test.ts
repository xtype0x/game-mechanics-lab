import { Timing } from "@gml/core";
import { describe, expect, it } from "vitest";
import {
  JUDGE_HISTORY, PRACTICE, Ring, bulletParryDefault, buildKeyMap, cleanOverrides, createJudgeLog, createSession, createWorld,
  framesToImpact, gamePresets, keyConflicts, keyHint, keyLabel, matchPreset, playableConfig, pressInteraction, recordJudge,
  rulesStatus, scoreOf, shouldSaveBest, spawnBullet, startBlocker, stepWorld, tickSession, unlockedPatterns, upcomingImpacts,
  speedMultAt, type World,
} from "../src/play/game";
import { buildLogLines, buildStripModel } from "../src/play/judge/model";
import { defaultSettings, parseSettings } from "../src/play/storage";

const quiet = (w: World) => { w.director.nextPatternAt = Number.POSITIVE_INFINITY; return w; };

describe("Ring", () => {
  it("overwrites the oldest entry and stays bounded", () => {
    const r = new Ring<number>(3);
    for (let i = 1; i <= 5; i++) r.push(i);
    expect(r.size).toBe(3);
    expect(r.toArray()).toEqual([3, 4, 5]);
    expect(r.at(0)).toBe(3);
    expect(r.at(3)).toBeUndefined();
    r.clear();
    expect(r.size).toBe(0);
  });
});

describe("judge log", () => {
  it("never grows past its capacity during a long run", () => {
    const s = createSession(bulletParryDefault(), { seed: 7 });
    for (let i = 0; i < 4000 && !s.world.over; i++) tickSession(s);
    expect(s.judge.traces.size).toBeLessThanOrEqual(JUDGE_HISTORY);
    expect(s.judge.events.size).toBeLessThanOrEqual(JUDGE_HISTORY);
    expect(s.judge.impacts.size).toBeLessThanOrEqual(64);
    expect(s.judge.version).toBeGreaterThan(100);
  });

  it("records presses, the impact mark and the resolve result of one parry", () => {
    const s = createSession(bulletParryDefault(), { seed: 1 });
    quiet(s.world);
    const b = spawnBullet(s.world, "normal");
    const impact = Math.ceil((b.x - 196) / b.speed) - 1;
    // press so a window covers the impact; scan a few offsets and take the one that resolves via an interaction
    for (let f = 0; f < impact + 30; f++) {
      if (f === impact - 3) pressInteraction(s, "parry");
      tickSession(s);
      if (s.world.timing.pending.length === 0 && s.judge.impacts.size > 0 && f > impact + 12) break;
    }
    expect(s.judge.impacts.at(0)).toMatchObject({ kind: "normal", frame: impact });
    expect(s.judge.events.toArray().some((e) => e.type === "press" && e.interaction === "parry")).toBe(true);
    expect(s.judge.events.toArray().some((e) => e.type === "resolve")).toBe(true);
    const end = s.world.frame - 1;
    const m = buildStripModel(s.world.config, s.judge, end);
    expect(m.bullets.filter((x) => !x.future).length).toBe(1);
    expect(m.resolves.length).toBe(1);
    expect(m.rows.find((r) => r.id === "parry")!.presses.length).toBe(1);
    expect(m.rows.find((r) => r.id === "parry")!.actions.length).toBe(1);
    const lines = buildLogLines(s.world.config, s.judge, end, 8);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(8);
    // newest first
    expect(lines[0]!.frame).toBeGreaterThanOrEqual(lines[lines.length - 1]!.frame);
  });

  it("predicts the impact frame of a flying bullet", () => {
    const w = quiet(createWorld(bulletParryDefault(), { seed: 3 }));
    spawnBullet(w, "normal");
    spawnBullet(w, "feint");
    const predicted = upcomingImpacts(w).map((m) => ({ kind: m.kind, frame: m.frame }));
    const seen: { kind: string; frame: number }[] = [];
    const kinds = new Map(w.bullets.map((b) => ["b" + b.id, b.kind]));
    for (let i = 0; i < 300; i++) {
      const r = stepWorld(w, []);
      for (const a of r.attacks) seen.push({ kind: kinds.get(a.id)!, frame: a.frame });
    }
    expect(predicted.sort((a, b) => a.frame - b.frame)).toEqual(seen.sort((a, b) => a.frame - b.frame));
    expect(framesToImpact({ ...w.bullets[0]!, state: "passed" })).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("key remap", () => {
  const cfg = bulletParryDefault();
  it("defaults keep the primary key and the alternate", () => {
    const m = buildKeyMap(cfg);
    expect(m.get("KeyJ")).toBe("parry");
    expect(m.get("Space")).toBe("parry");
    expect(keyHint(cfg, "parry", keyLabel)).toBe("J / 空白");
  });
  it("an override replaces the default key and its alternates", () => {
    const m = buildKeyMap(cfg, { parry: "KeyF" });
    expect(m.get("KeyF")).toBe("parry");
    expect(m.has("KeyJ")).toBe(false);
    expect(m.has("Space")).toBe(false);
    expect(m.get("KeyK")).toBe("dodge");
    expect(keyHint(cfg, "parry", keyLabel, { parry: "KeyF" })).toBe("F");
  });
  it("reserved keys are ignored and conflicts are reported (first interaction wins)", () => {
    expect(cleanOverrides({ parry: "Escape", dodge: "KeyZ", skill: 5, x: "" })).toEqual({ dodge: "KeyZ" });
    expect(buildKeyMap(cfg, { parry: "Escape" }).get("KeyJ")).toBe("parry");
    const o = { dodge: "KeyJ" };
    expect(keyConflicts(cfg, o)).toEqual([{ code: "KeyJ", ids: ["parry", "dodge"] }]);
    expect(buildKeyMap(cfg, o).get("KeyJ")).toBe("parry");
  });
  it("a custom interaction takes its key from the config and can be remapped", () => {
    const c = structuredClone(cfg);
    const extra = structuredClone(c.interactions[0]!);
    extra.id = "guard";
    extra.name = "守備";
    extra.key = "KeyU";
    c.interactions.push(extra);
    expect(buildKeyMap(c).get("KeyU")).toBe("guard");
    expect(buildKeyMap(c, { guard: "KeyI" }).get("KeyI")).toBe("guard");
    expect(keyHint(c, "guard", keyLabel)).toBe("U");
  });
});

describe("practice mode", () => {
  it("bullets are slower and the run cannot end", () => {
    const a = quiet(createWorld(bulletParryDefault(), { seed: 1 }));
    const p = quiet(createWorld(bulletParryDefault(), { seed: 1, practice: true }));
    expect(spawnBullet(p, "normal").speed).toBeCloseTo(spawnBullet(a, "normal").speed * PRACTICE.speedMult, 9);
    for (let i = 0; i < 1500 && !p.over; i++) {
      if (i % 60 === 0 && i < 840) spawnBullet(p, "normal");
      stepWorld(p, []);
    }
    expect(p.stats.hits).toBeGreaterThan(3);
    expect(p.over).toBe(false);
    const hp = p.config.healthResource;
    expect(p.timing.resources[hp]).toBe(p.config.resources.find((r) => r.id === hp)!.max);
    expect(p.timing.defeated).toBe(false);
  });
  it("the same hits end a normal run", () => {
    const a = quiet(createWorld(bulletParryDefault(), { seed: 1 }));
    for (let i = 0; i < 1500 && !a.over; i++) {
      if (i % 60 === 0 && i < 840) spawnBullet(a, "normal");
      stepWorld(a, []);
    }
    expect(a.over).toBe(true);
  });
  it("never saves a best score", () => {
    expect(shouldSaveBest(true, 999, 10)).toBe(false);
    expect(shouldSaveBest(false, 999, 10)).toBe(true);
    expect(shouldSaveBest(false, 5, 10)).toBe(false);
    expect(scoreOf(createWorld(bulletParryDefault(), { practice: true }))).toBe(0);
  });
});

describe("opening difficulty", () => {
  it("only single, double and low patterns appear in the first 30 s, with a gentler bullet speed", () => {
    expect(unlockedPatterns(29.9).map((p) => p.id)).toEqual(["single", "double", "low"]);
    expect(speedMultAt(0, 1)).toBeLessThan(speedMultAt(60 * 30, 1));
    expect(speedMultAt(0, 1)).toBeCloseTo(0.82, 9);
  });
});

describe("rules validation gating", () => {
  it("valid rules start; warnings never block; errors block with a message", () => {
    expect(startBlocker(bulletParryDefault())).toBeNull();
    for (const p of gamePresets()) expect(rulesStatus(p).ok).toBe(true);
    const bad = bulletParryDefault();
    bad.interactions[0]!.id = bad.interactions[1]!.id; // duplicate id
    const st = rulesStatus(bad);
    expect(st.ok).toBe(false);
    expect(startBlocker(bad)).toContain("判定規則有");
    expect(playableConfig(bad).id).toBe(bulletParryDefault().id);
    const broken = { version: 1 } as unknown as Timing.TimingConfig;
    expect(rulesStatus(broken).ok).toBe(false);
  });
  it("matchPreset tells presets from modified copies", () => {
    const presets = gamePresets();
    expect(matchPreset(structuredClone(presets[0]!), presets)).toBe(presets[0]!.id);
    const mod = structuredClone(presets[0]!);
    mod.interactions[0]!.name += "!";
    expect(matchPreset(mod, presets)).toBeNull();
  });
});

describe("custom interaction in game", () => {
  it("a newly added interaction is pressable, shows in the HUD and has its own sprite slot", async () => {
    const { hudOf, listSlots } = await import("../src/play/game").then(async (g) => ({ hudOf: g.hudOf, listSlots: (await import("../src/play/render/slots")).listSlots }));
    const cfg = bulletParryDefault();
    const extra = structuredClone(cfg.interactions.find((i) => i.id === "dodge")!);
    extra.id = "slide";
    extra.name = "滑步";
    extra.key = "KeyU";
    delete extra.charges;
    cfg.interactions.push(extra);
    expect(rulesStatus(cfg).ok).toBe(true);
    const s = createSession(cfg, { seed: 2 });
    expect(hudOf(s.world).interactions.map((i) => i.id)).toContain("slide");
    expect(hudOf(s.world).interactions.find((i) => i.id === "slide")!.ready).toBe(true);
    expect(listSlots(cfg).map((x) => x.id)).toContain("player.slide");
    pressInteraction(s, "slide");
    tickSession(s);
    expect(s.world.timing.action?.interaction).toBe("slide");
  });
});

describe("settings storage", () => {
  it("old saves without the new fields load with defaults", () => {
    const old = JSON.stringify({ config: bulletParryDefault(), difficulty: 1.2, showFrameBar: true, volume: 0.3 });
    expect(parseSettings(old)).toMatchObject({ practice: false, judgeFreeze: true, keys: {}, showFrameBar: true, difficulty: 1.2 });
  });
  it("ignores a stored config (the rules live in the shell) and filters bad key remaps", () => {
    const d = defaultSettings();
    const s = parseSettings(JSON.stringify({ ...d, config: { junk: true }, practice: true, keys: { parry: "KeyF", dodge: "Escape" } }));
    expect(s).not.toHaveProperty("config");
    expect(s.practice).toBe(true);
    expect(s.keys).toEqual({ parry: "KeyF" });
  });
  it("recording a step does not mutate the world", () => {
    const w = quiet(createWorld(bulletParryDefault(), { seed: 5 }));
    const log = createJudgeLog();
    const before = JSON.stringify(w.timing);
    recordJudge(log, w, { events: [], attacks: [], hitstop: 0, timeScale: null, timing: [], impacts: [] });
    expect(JSON.stringify(w.timing)).toBe(before);
    expect(log.traces.size).toBe(1);
  });
});
