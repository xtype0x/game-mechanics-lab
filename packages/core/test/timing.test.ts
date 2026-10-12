import { describe, expect, it } from "vitest";
import { c, op, r, Timing } from "../src";
import { continueFrom, shiftEvent } from "./timing-continuation";

type Cfg = Timing.TimingConfig;
type Inter = Timing.InteractionDef;
type Ev = Timing.TimingEvent;

const {
  TIMING_PRESETS, createTimingState, expandAttack, framesToMs, msToFrames, runTiming, stepTiming, validateTiming,
} = Timing;

// ---- fixtures -------------------------------------------------------------------------------------------------------

/** Parry: startup 2, perfect 3 (strict) + normal 6, success recovery 8, whiff recovery 20, one catch. */
function parry(over: Partial<Inter> = {}): Inter {
  return {
    id: "parry", name: "parry", priority: 1, startup: 2,
    windows: [{ id: "perfect", name: "perfect", frames: 3, strict: true }, { id: "normal", name: "normal", frames: 6 }],
    successRecovery: 8, whiffRecovery: 20, maxCatches: 1,
    table: [{ tag: null, cells: { perfect: "perfect", normal: "normal" } }],
    whiffOutcome: "whiff", cooldown: 0, buffer: 0,
    ...over,
  };
}

/** Dodge: no startup, one 1-frame window, instant recovery; the charges are under test. */
function dodge(over: Partial<Inter> = {}): Inter {
  return {
    id: "dodge", name: "dodge", priority: 2, startup: 0,
    windows: [{ id: "n", name: "n", frames: 1 }],
    successRecovery: 0, whiffRecovery: 0, maxCatches: 0,
    table: [{ tag: null, cells: { n: "normal" } }],
    cooldown: 0, buffer: 0,
    ...over,
  };
}

function cfg(interactions: Inter[], over: Partial<Cfg> = {}): Cfg {
  return {
    version: 1, id: "t", name: "t", fps: 60, inputOffset: 0,
    tags: [{ id: "bullet", name: "bullet" }, { id: "unblockable", name: "unblockable" }],
    resources: [{ id: "hp", name: "hp", max: 3, initial: 3 }, { id: "gauge", name: "gauge", max: 100, initial: 0 }],
    statuses: [{ id: "counter", name: "counter" }],
    outcomes: [
      { id: "hit", name: "hit", kind: "fail", effects: [{ type: "damage", amount: r("attack.damage") }] },
      { id: "perfect", name: "perfect", kind: "perfect", effects: [{ type: "addResource", resource: "gauge", amount: c(25) }] },
      { id: "normal", name: "normal", kind: "success", effects: [{ type: "addResource", resource: "gauge", amount: c(5) }] },
      { id: "whiff", name: "whiff", kind: "fail", effects: [{ type: "cue", cue: "anim:whiff" }] },
      { id: "guardBroken", name: "guardBroken", kind: "fail", effects: [{ type: "damage", amount: r("attack.damage") }, { type: "stun", frames: c(20) }] },
      { id: "skillOn", name: "skillOn", kind: "success", effects: [{ type: "invulnerable", frames: c(240) }] },
    ],
    interactions, hitOutcome: "hit", healthResource: "hp",
    ...over,
  };
}

const press = (frame: number, interaction = "parry") => ({ frame, interaction });
const bullet = (frame: number, id = `a${frame}`, tags: string[] = ["bullet"], damage?: number): Timing.AttackEvent =>
  damage === undefined ? { id, frame, tags } : { id, frame, tags, damage };
const script = (frames: number, presses: { frame: number; interaction: string }[], attacks: Timing.AttackEvent[] = []): Timing.TimingScript => ({ frames, presses, attacks });
const of = (events: Ev[], type: Ev["type"]) => events.filter((e) => e.type === type);
const resolves = (events: Ev[]) => of(events, "resolve") as Extract<Ev, { type: "resolve" }>[];
const drops = (events: Ev[]) => (of(events, "drop") as Extract<Ev, { type: "drop" }>[]).map((e) => `${e.frame}:${e.interaction}:${e.pressFrame}:${e.reason}`);

// ---- conversions / helpers ------------------------------------------------------------------------------------------

describe("timing helpers", () => {
  it("converts ms and frames", () => {
    expect(msToFrames(100, 60)).toBe(6);
    expect(msToFrames(25, 60)).toBe(2); // 1.5 rounds half away from zero
    expect(msToFrames(0, 60)).toBe(0);
    expect(framesToMs(3, 60)).toBe(50);
    expect(framesToMs(1, 60)).toBe(1000 / 60);
  });

  it("expands attack moves (hit frame = start + windup + offset)", () => {
    const evs = expandAttack(
      { id: "combo", name: "combo", windup: 30, telegraph: 10, recovery: 20, hits: [{ offset: 0, damage: 2, tags: ["bullet"] }, { offset: 8, tags: ["thrust"] }] },
      100,
    );
    expect(evs).toEqual([
      { id: "combo#0", frame: 130, tags: ["bullet"], damage: 2 },
      { id: "combo#1", frame: 138, tags: ["thrust"] },
    ]);
  });
});

// ---- parry windows --------------------------------------------------------------------------------------------------

describe("parry windows", () => {
  // Press at p = 0 → accepted at 0. Startup 2 → perfect [2,5), normal [5,11), activeEnd 11.
  const config = cfg([parry()]);
  const at = (frame: number) => resolves(runTiming(config, script(40, [press(0)], [bullet(frame)])).events)[0]!;

  it("resolves by exact frame", () => {
    expect(at(1)).toMatchObject({ via: "hit", outcome: "hit" }); // p+1: still startup
    expect(at(2)).toMatchObject({ via: "interaction", window: "perfect", outcome: "perfect" }); // p+2: first perfect frame
    expect(at(4)).toMatchObject({ via: "interaction", window: "perfect" }); // p+4: last perfect frame
    expect(at(5)).toMatchObject({ via: "interaction", window: "normal", outcome: "normal" }); // p+5: first normal frame
    expect(at(10)).toMatchObject({ via: "interaction", window: "normal" }); // p+10: last normal frame
    expect(at(11)).toMatchObject({ via: "hit", outcome: "hit" }); // p+11: window closed
  });

  it("emits accept with windows and the perfect catch effect", () => {
    const { events, final } = runTiming(config, script(40, [press(0)], [bullet(3)]));
    expect(events.slice(0, 3)).toEqual([
      { frame: 0, type: "press", interaction: "parry" },
      { frame: 0, type: "accept", interaction: "parry", pressFrame: 0, buffered: false, shrink: 0, windows: [{ id: "perfect", from: 2, to: 5 }, { id: "normal", from: 5, to: 11 }] },
      { frame: 3, type: "resolve", attack: "a3", impactFrame: 3, via: "interaction", interaction: "parry", window: "perfect", outcome: "perfect" },
    ]);
    expect(final.resources.gauge).toBe(25);
    expect(final.resources.hp).toBe(3);
  });

  it("whiff: applies whiffOutcome and whiff recovery, then idles", () => {
    // Active ends at 11 → whiff, recovery [11, 11+20=31), idle at 31.
    const { events } = runTiming(config, script(40, [press(0)]));
    expect(events.filter((e) => e.frame >= 11)).toEqual([
      { frame: 11, type: "whiff", interaction: "parry", outcome: "whiff" },
      { frame: 11, type: "effect", outcome: "whiff", effect: "cue", target: "anim:whiff" },
      { frame: 11, type: "phase", interaction: "parry", phase: "recovery" },
      { frame: 31, type: "phase", interaction: "parry", phase: "idle" },
    ]);
  });

  it("catch uses success recovery from the end of the shortened active phase", () => {
    // Catch at 3 → activeEnd = 4 (maxCatches 1), recovery 8 → idle at 12.
    const { events } = runTiming(config, script(20, [press(0)], [bullet(3)]));
    const phases = of(events, "phase");
    expect(phases).toEqual([
      { frame: 4, type: "phase", interaction: "parry", phase: "recovery" },
      { frame: 12, type: "phase", interaction: "parry", phase: "idle" },
    ]);
    expect(of(events, "whiff")).toEqual([]);
  });

  it("startup 0: a press on the impact frame catches", () => {
    const c0 = cfg([parry({ startup: 0 })]);
    // Windows [5,8) and [8,14) when pressed on 5.
    const rs = resolves(runTiming(c0, script(20, [press(5)], [bullet(5)])).events);
    expect(rs).toEqual([{ frame: 5, type: "resolve", attack: "a5", impactFrame: 5, via: "interaction", interaction: "parry", window: "perfect", outcome: "perfect" }]);
  });

  it("maxCatches 1 ends active early; the next attack falls through", () => {
    // First at 2 catches (activeEnd = 3). Second at 3: t >= activeEnd → hit.
    const rs = resolves(runTiming(config, script(20, [press(0)], [bullet(2), bullet(3)])).events);
    expect(rs.map((e) => [e.attack, e.via])).toEqual([["a2", "interaction"], ["a3", "hit"]]);
  });

  it("inputOffset delays resolution", () => {
    // Impact 0 resolves at 3 (perfect [2,5)), not at 0 (startup).
    const delayed = cfg([parry()], { inputOffset: 3 });
    const rs = resolves(runTiming(delayed, script(10, [press(0)], [bullet(0)])).events);
    expect(rs).toEqual([{ frame: 3, type: "resolve", attack: "a0", impactFrame: 0, via: "interaction", interaction: "parry", window: "perfect", outcome: "perfect" }]);
  });
});

// ---- busy / buffer / drops ------------------------------------------------------------------------------------------

describe("busy presses and buffer", () => {
  it("buffer 0 drops busy presses (active and recovery)", () => {
    const { events } = runTiming(cfg([parry()]), script(40, [press(0), press(5), press(15)]));
    expect(drops(events)).toEqual(["5:parry:5:busy", "15:parry:15:busy"]);
  });

  it("buffered press is accepted when the slot frees, with strict windows removed", () => {
    // First action: recovery ends at 31. Press at 25 with buffer 6: 31-25 = 6, not expired → accepted at 31.
    // Buffered: perfect (strict) is removed and its 3 frames move to normal: start 31+2 = 33 → perfect [33,33), normal [33,42).
    const { events } = runTiming(cfg([parry({ buffer: 6 })]), script(60, [press(0), press(25)]));
    expect(of(events, "buffer")).toEqual([{ frame: 25, type: "buffer", interaction: "parry", pressFrame: 25 }]);
    const accepts = of(events, "accept") as Extract<Ev, { type: "accept" }>[];
    expect(accepts[1]).toEqual({
      frame: 31, type: "accept", interaction: "parry", pressFrame: 25, buffered: true, shrink: -1,
      windows: [{ id: "perfect", from: 33, to: 33 }, { id: "normal", from: 33, to: 42 }],
    });
  });

  it("buffered press expires one frame later", () => {
    // Press at 24: at 31, 31-24 = 7 > 6 → bufferExpired (dropped before the slot is evaluated).
    const { events } = runTiming(cfg([parry({ buffer: 6 })]), script(60, [press(0), press(24)]));
    expect(drops(events)).toEqual(["31:parry:24:bufferExpired"]);
    expect(of(events, "accept")).toHaveLength(1);
  });

  it("a newer buffered press replaces the old one; same-frame busy presses conflict", () => {
    const config = cfg([parry({ buffer: 6 }), dodge({ buffer: 6, charges: { max: 2, recharge: 100, mode: "sequential" } })]);
    const a = runTiming(config, script(10, [press(0), press(3, "dodge"), press(4)]));
    expect(drops(a.events)).toEqual(["4:dodge:3:bufferReplaced"]);
    expect(a.final.buffered).toEqual({ interaction: "parry", frame: 4, shrink: -1 });
    // Same frame 3: parry (priority 1) is buffered, dodge loses with "conflict".
    const b = runTiming(config, script(10, [press(0), press(3, "dodge"), press(3)]));
    expect(drops(b.events)).toEqual(["3:dodge:3:conflict"]);
    expect(b.final.buffered?.interaction).toBe("parry");
  });
});

// ---- spam -----------------------------------------------------------------------------------------------------------

describe("spam penalty", () => {
  const spam = { withinFrames: 20, scope: "self" as const, shrinkPerPress: 1, maxShrink: 2, lockoutAfter: 3, lockoutFrames: 30 };
  const config = cfg([parry({ spam })]);

  it("shrinks strict windows by earlier presses in the window", () => {
    // Presses at 0 (accepted), 12 and 13 (busy drops, still recorded). At 31 the action is over:
    // history frames in (11, 31] = {12, 13} → n = 2 → shrink = min(2×1, 2) = 2.
    // Start 31+2 = 33: perfect 3-2 = 1 → [33,34); normal 6+2 = 8 → [34,42).
    const { events } = runTiming(config, script(50, [press(0), press(12), press(13), press(31)]));
    const accepts = of(events, "accept") as Extract<Ev, { type: "accept" }>[];
    expect(accepts[1]).toMatchObject({ frame: 31, shrink: 2, windows: [{ id: "perfect", from: 33, to: 34 }, { id: "normal", from: 34, to: 42 }] });
  });

  it("shrinks by one press: perfect 2, normal 7", () => {
    // Presses at 0 and 12 → at 31 only 12 is in (11, 31] → n=1 → shrink 1: perfect [33,35), normal [35,42).
    const { events } = runTiming(config, script(50, [press(0), press(12), press(31)]));
    const accepts = of(events, "accept") as Extract<Ev, { type: "accept" }>[];
    expect(accepts[1]).toMatchObject({ shrink: 1, windows: [{ id: "perfect", from: 33, to: 35 }, { id: "normal", from: 35, to: 42 }] });
  });

  it("lockout drops the press and stuns, without cancelling the current action", () => {
    // Press 0 accepted. Presses 1 and 2 are busy drops. At 3, n = presses in (-17, 3] before it = {0,1,2} = 3 ≥ 3 → lockout.
    // stunUntil = 3+30 = 33; the parry action keeps running (recovery at 11).
    const { events, final } = runTiming(config, script(60, [press(0), press(1), press(2), press(3), press(31), press(33)]));
    expect(drops(events)).toEqual(["1:parry:1:busy", "2:parry:2:busy", "3:parry:3:spamLockout", "31:parry:31:busy"]);
    expect(of(events, "phase")).toEqual([
      { frame: 11, type: "phase", interaction: "parry", phase: "recovery" },
      { frame: 31, type: "phase", interaction: "parry", phase: "idle" },
      { frame: 44, type: "phase", interaction: "parry", phase: "recovery" },
    ]);
    // At 31 the slot is stunned (31 < 33) → busy. At 33: history (13, 33] = {31} → n = 1 → shrink 1 → accepted.
    const accepts = of(events, "accept") as Extract<Ev, { type: "accept" }>[];
    expect(accepts).toHaveLength(2);
    expect(accepts[1]).toMatchObject({ frame: 33, shrink: 1, windows: [{ id: "perfect", from: 35, to: 37 }, { id: "normal", from: 37, to: 44 }] });
    expect(final.stunUntil).toBe(33);
  });
});

// ---- same-frame conflicts -------------------------------------------------------------------------------------------

describe("same-frame conflicts", () => {
  const alt = (): Inter => ({ ...parry({ id: "alt", priority: 1 }) });
  const dod = () => dodge({ charges: { max: 2, recharge: 100, mode: "sequential" } });

  it("lower priority number wins", () => {
    const { events } = runTiming(cfg([dod(), parry()]), script(5, [press(0, "dodge"), press(0, "parry")]));
    expect(events.filter((e) => e.frame === 0 && (e.type === "drop" || e.type === "accept")).map((e) => `${e.type}:${(e as { interaction: string }).interaction}`))
      .toEqual(["drop:dodge", "accept:parry"]);
    expect(drops(events)).toEqual(["0:dodge:0:conflict"]);
  });

  it("equal priority → interaction list order", () => {
    const { events } = runTiming(cfg([parry(), alt()]), script(5, [press(0, "alt"), press(0, "parry")]));
    expect((of(events, "accept") as Extract<Ev, { type: "accept" }>[]).map((e) => e.interaction)).toEqual(["parry"]);
    expect(drops(events)).toEqual(["0:alt:0:conflict"]);
  });

  it("fresh press beats buffered press of the same interaction", () => {
    // Buffered press at 25; the slot frees at 31 and a fresh press arrives at 31 → fresh wins, buffered conflicts.
    const { events } = runTiming(cfg([parry({ buffer: 6 })]), script(40, [press(0), press(25), press(31)]));
    expect(events.filter((e) => e.frame === 31).map((e) => e.type)).toEqual(["phase", "press", "drop", "accept"]);
    expect(drops(events)).toEqual(["31:parry:25:conflict"]);
    expect((of(events, "accept") as Extract<Ev, { type: "accept" }>[])[1]).toMatchObject({ pressFrame: 31, buffered: false, shrink: 0 });
  });
});

// ---- charges / cost / skill -----------------------------------------------------------------------------------------

describe("charges", () => {
  it("sequential: one timer, recharges one at a time", () => {
    const config = cfg([dodge({ charges: { max: 2, recharge: 10, mode: "sequential" } })]);
    // Press 0: count 2→1, pending [10]. Press 2: 1→0, timer already running. Press 4: noCharge.
    // At 10: +1 (count 1), not full → next at 20. At 20: count 2, full → pending [].
    const { events, final } = runTiming(config, script(30, [press(0, "dodge"), press(2, "dodge"), press(4, "dodge")]));
    expect(drops(events)).toEqual(["4:dodge:4:noCharge"]);
    expect(of(events, "recharge")).toEqual([
      { frame: 10, type: "recharge", interaction: "dodge", count: 1 },
      { frame: 20, type: "recharge", interaction: "dodge", count: 2 },
    ]);
    expect(final.charges.dodge).toEqual({ count: 2, pending: [] });
  });

  it("parallel: each spent charge has its own timer", () => {
    const config = cfg([dodge({ charges: { max: 2, recharge: 10, mode: "parallel" } })]);
    // Presses at 0 and 3 → timers 10 and 13.
    const { events, final } = runTiming(config, script(20, [press(0, "dodge"), press(3, "dodge")]));
    expect(of(events, "recharge")).toEqual([
      { frame: 10, type: "recharge", interaction: "dodge", count: 1 },
      { frame: 13, type: "recharge", interaction: "dodge", count: 2 },
    ]);
    expect(final.charges.dodge).toEqual({ count: 2, pending: [] });
  });

  function withRefund(mode: "sequential" | "parallel", before: { count: number; pending: number[] }) {
    const config = cfg(
      [dodge({ windows: [{ id: "n", name: "n", frames: 3 }], table: [{ tag: null, cells: { n: "refund" } }], charges: { max: 3, recharge: 10, mode } })],
      { outcomes: [...cfg([]).outcomes, { id: "refund", name: "refund", kind: "perfect", effects: [{ type: "restoreCharge", interaction: "dodge", amount: c(1) }] }] },
    );
    // Start at frame 5 with a crafted charge state; press on 5, attack at 6 caught in window [5,8).
    const state = createTimingState(config);
    state.frame = 5;
    state.charges.dodge = { count: before.count, pending: before.pending.slice() };
    const a = stepTiming(config, state, { presses: ["dodge"], attacks: [] });
    const b = stepTiming(config, a.state, { presses: [], attacks: [bullet(6)] });
    return b;
  }

  it("restoreCharge sequential: +1, timer kept while not full", () => {
    // count 1 → press → 0 (timer [12] kept) → refund → 1, still not full.
    const { state, events } = withRefund("sequential", { count: 1, pending: [12] });
    expect(state.charges.dodge).toEqual({ count: 1, pending: [12] });
    expect(events.find((e) => e.type === "effect")).toMatchObject({ effect: "restoreCharge", target: "dodge", value: 1 });
  });

  it("restoreCharge sequential: timer cleared when it fills", () => {
    // count 3 → press → 2, timer starts at 5+10 = 15 → refund → 3 = full → pending cleared.
    const { state } = withRefund("sequential", { count: 3, pending: [] });
    expect(state.charges.dodge).toEqual({ count: 3, pending: [] });
  });

  it("restoreCharge parallel: removes the latest-expiring timer", () => {
    // count 1, timers [12,14] → press → 0, timers [12,14,15] → refund → count 1, timers [12,14].
    const { state } = withRefund("parallel", { count: 1, pending: [12, 14] });
    expect(state.charges.dodge).toEqual({ count: 1, pending: [12, 14] });
  });
});

describe("cost, onAccept and invulnerability", () => {
  const skill: Inter = {
    id: "skill", name: "skill", priority: 0, startup: 0, windows: [], successRecovery: 10, whiffRecovery: 0, maxCatches: 0,
    table: [], onAccept: "skillOn", cooldown: 0, cost: { resource: "gauge", amount: 100 }, buffer: 0,
  };
  const withGauge = (n: number) => cfg([skill, parry()], { resources: [{ id: "hp", name: "hp", max: 3, initial: 3 }, { id: "gauge", name: "gauge", max: 100, initial: n }] });

  it("noResource drops the press", () => {
    const { events, final } = runTiming(withGauge(99), script(5, [press(0, "skill")]));
    expect(drops(events)).toEqual(["0:skill:0:noResource"]);
    expect(final.resources.gauge).toBe(99);
  });

  it("skill spends the cost and invulnerability blocks the same-frame attack and later ones until 240", () => {
    // Accepted at 0 → invulnerable until 0+240 = 240 (exclusive). Attacks at 0, 239 blocked; 240 hits.
    const { events, final } = runTiming(withGauge(100), script(250, [press(0, "skill")], [bullet(0), bullet(239), bullet(240)]));
    expect(events.slice(0, 5)).toEqual([
      { frame: 0, type: "press", interaction: "skill" },
      { frame: 0, type: "accept", interaction: "skill", pressFrame: 0, buffered: false, shrink: 0, windows: [] },
      { frame: 0, type: "effect", outcome: "skillOn", effect: "invulnerable", target: "invulnerable", frames: 240 },
      { frame: 0, type: "resolve", attack: "a0", impactFrame: 0, via: "invulnerable", outcome: null },
      { frame: 1, type: "phase", interaction: "skill", phase: "recovery" },
    ]);
    expect(resolves(events).map((e) => [e.attack, e.via])).toEqual([["a0", "invulnerable"], ["a239", "invulnerable"], ["a240", "hit"]]);
    expect(final.resources).toEqual({ hp: 2, gauge: 0 });
    expect(of(events, "whiff")).toEqual([]);
  });
});

// ---- result table ---------------------------------------------------------------------------------------------------

describe("result table", () => {
  it("first matching row wins even when its cell is null", () => {
    const config = cfg([parry({
      table: [
        { tag: "unblockable", cells: { perfect: null, normal: null } },
        { tag: null, cells: { perfect: "perfect", normal: "normal" } },
      ],
    })]);
    // Unblockable at 3 → row 1 matches with a null cell → falls through to hit (NOT row 2).
    const a = resolves(runTiming(config, script(10, [press(0)], [bullet(3, "u", ["unblockable"])])).events);
    expect(a).toEqual([{ frame: 3, type: "resolve", attack: "u", impactFrame: 3, via: "hit", outcome: "hit" }]);
    // A plain bullet is caught by the default row.
    const b = resolves(runTiming(config, script(10, [press(0)], [bullet(3)])).events);
    expect(b[0]).toMatchObject({ via: "interaction", outcome: "perfect" });
    // A missing cell behaves like null.
    const missing = cfg([parry({ table: [{ tag: "bullet", cells: {} }, { tag: null, cells: { perfect: "perfect" } }] })]);
    expect(resolves(runTiming(missing, script(10, [press(0)], [bullet(3)])).events)[0]).toMatchObject({ via: "hit" });
  });

  it("unblockable → guardBroken: damage and stun cancel the action", () => {
    const config = cfg([parry({
      table: [
        { tag: "unblockable", cells: { perfect: "guardBroken", normal: "guardBroken" } },
        { tag: null, cells: { perfect: "perfect", normal: "normal" } },
      ],
    })]);
    // Attack (damage 2) at 3 → guardBroken: hp 3-2 = 1, stun 20 → stunUntil 23, action cleared (phase idle at 3).
    const { events, final } = runTiming(config, script(40, [press(0), press(10), press(23)], [bullet(3, "u", ["unblockable"], 2)]));
    expect(events.filter((e) => e.frame === 3)).toEqual([
      { frame: 3, type: "resolve", attack: "u", impactFrame: 3, via: "interaction", interaction: "parry", window: "perfect", outcome: "guardBroken" },
      { frame: 3, type: "effect", outcome: "guardBroken", effect: "damage", target: "hp", value: 2 },
      { frame: 3, type: "effect", outcome: "guardBroken", effect: "stun", frames: 20 },
      { frame: 3, type: "phase", interaction: "parry", phase: "idle" },
    ]);
    // Press at 10 is dropped busy (stunned, buffer 0); press at 23 is accepted (23 !< 23).
    expect(drops(events)).toEqual(["10:parry:10:busy"]);
    expect((of(events, "accept") as Extract<Ev, { type: "accept" }>[]).map((e) => e.frame)).toEqual([0, 23]);
    expect(final.resources.hp).toBe(1);
    // The only whiff is the second action (accepted at 23, windows end at 34); the cancelled first action never whiffs.
    expect(of(events, "whiff").map((e) => e.frame)).toEqual([34]);
  });
});

// ---- catches --------------------------------------------------------------------------------------------------------

describe("maxCatches", () => {
  it("0 catches a barrage; catch.index == 0 pays out once", () => {
    const config = cfg(
      [dodge({ windows: [{ id: "n", name: "n", frames: 10 }], table: [{ tag: null, cells: { n: "barrage" } }] })],
      {
        outcomes: [...cfg([]).outcomes, {
          id: "barrage", name: "barrage", kind: "perfect",
          effects: [
            { type: "addResource", resource: "gauge", amount: c(20), when: op("eq", r("catch.index"), c(0)) },
            { type: "addResource", resource: "gauge", amount: c(1) },
          ],
        }],
      },
    );
    // Window [0,10). Attacks at 2, 4, 6 are all caught. Gauge: 20 (index 0) + 1+1+1 = 23.
    const { events, final } = runTiming(config, script(20, [press(0, "dodge")], [bullet(2), bullet(4), bullet(6)]));
    expect(resolves(events).map((e) => e.via)).toEqual(["interaction", "interaction", "interaction"]);
    expect((of(events, "effect") as Extract<Ev, { type: "effect" }>[]).map((e) => e.value)).toEqual([20, 1, 1, 1]);
    expect(final.resources.gauge).toBe(23);
  });
});

describe("stun and cancelRecovery", () => {
  it("cancelRecovery frees the slot from the next frame", () => {
    const config = cfg([parry({ table: [{ tag: null, cells: { perfect: "cancel", normal: "normal" } }] })], {
      outcomes: [...cfg([]).outcomes, { id: "cancel", name: "cancel", kind: "perfect", effects: [{ type: "cancelRecovery" }] }],
    });
    // Catch at 3 cancels the action immediately. A press on 3 (processed before the attack) is busy; a press on 4 is accepted.
    const { events } = runTiming(config, script(10, [press(0), press(3), press(4)], [bullet(3)]));
    expect(drops(events)).toEqual(["3:parry:3:busy"]);
    expect((of(events, "accept") as Extract<Ev, { type: "accept" }>[]).map((e) => e.frame)).toEqual([0, 4]);
    expect(events.filter((e) => e.type === "phase")[0]).toEqual({ frame: 3, type: "phase", interaction: "parry", phase: "idle" });
  });
});

// ---- defeat ---------------------------------------------------------------------------------------------------------

describe("defeat", () => {
  it("emits defeated after the damage effect, ignores later attacks and presses", () => {
    const config = cfg([parry()]);
    // Two attacks on frame 0: damage 5 kills (hp clamps to 0); the second is cleared unresolved.
    const { events, final } = runTiming(config, script(5, [press(1)], [bullet(0, "k", ["bullet"], 5), bullet(0, "x")]));
    expect(events).toEqual([
      { frame: 0, type: "resolve", attack: "k", impactFrame: 0, via: "hit", outcome: "hit" },
      { frame: 0, type: "effect", outcome: "hit", effect: "damage", target: "hp", value: 5 },
      { frame: 0, type: "defeated" },
      { frame: 1, type: "drop", interaction: "parry", pressFrame: 1, reason: "defeated" },
    ]);
    expect(final.defeated).toBe(true);
    expect(final.pending).toEqual([]);
    expect(final.resources.hp).toBe(0);
  });

  it("clears pending attacks that were waiting for their resolve frame", () => {
    const config = cfg([parry()], { inputOffset: 5 });
    // Resolve frames 5 and 6; the first kills at 5 (damage 3); at 6 the second is cleared.
    const { events, final } = runTiming(config, script(10, [], [bullet(0, "k", ["bullet"], 3), bullet(1, "x")]));
    expect(resolves(events).map((e) => e.attack)).toEqual(["k"]);
    expect(final.pending).toEqual([]);
  });
});

// ---- purity & trace -------------------------------------------------------------------------------------------------

describe("purity and trace", () => {
  it("stepTiming does not mutate its input state", () => {
    const config = cfg([parry({ buffer: 3, spam: { withinFrames: 20, scope: "self", shrinkPerPress: 1, maxShrink: 2, lockoutAfter: 0, lockoutFrames: 0 } })]);
    let state = createTimingState(config);
    const inputs: Timing.FrameInput[] = [
      { presses: ["parry"], attacks: [bullet(1, "p")] },
      { presses: ["parry"], attacks: [] },
      { presses: [], attacks: [bullet(4, "q")] },
      { presses: [], attacks: [] },
    ];
    for (const input of inputs) {
      const before = JSON.stringify(state);
      const next = stepTiming(config, state, input).state;
      expect(JSON.stringify(state)).toBe(before);
      expect(next).not.toBe(state);
      state = next;
    }
  });

  it("produces a per-frame trace", () => {
    const { trace } = runTiming(cfg([parry()]), script(35, [press(0)]), { trace: true });
    expect(trace).toHaveLength(35);
    const at = (f: number) => trace[f]!;
    expect(at(0)).toMatchObject({ frame: 0, phase: "startup", interaction: "parry", stunned: false, invulnerable: false });
    expect(at(1).phase).toBe("startup");
    expect(at(2)).toMatchObject({ phase: "active", window: "perfect" });
    expect(at(5)).toMatchObject({ phase: "active", window: "normal" });
    expect(at(10)).toMatchObject({ phase: "active", window: "normal" });
    expect(at(11)).toMatchObject({ phase: "recovery" });
    expect(at(11).window).toBeUndefined();
    expect(at(30).phase).toBe("recovery");
    expect(at(31)).toMatchObject({ phase: "idle" });
    expect(at(31).interaction).toBeUndefined();
    expect(at(0).resources).toEqual({ hp: 3, gauge: 0 });
  });

  it("trace shows stun and invulnerability", () => {
    const config = cfg([parry()], {
      outcomes: cfg([]).outcomes.map((o) => (o.id === "hit" ? { ...o, effects: [...o.effects, { type: "stun" as const, frames: c(5) }, { type: "invulnerable" as const, frames: c(8) }] } : o)),
    });
    const { trace } = runTiming(config, script(12, [], [bullet(1)]), { trace: true });
    expect(trace[1]).toMatchObject({ phase: "stun", stunned: true, invulnerable: true });
    expect(trace[5]).toMatchObject({ phase: "stun" }); // stunUntil = 6 → frames 1..5
    expect(trace[6]).toMatchObject({ phase: "idle", stunned: false, invulnerable: true });
    expect(trace[8]).toMatchObject({ invulnerable: true }); // until 1+8 = 9 exclusive
    expect(trace[9]).toMatchObject({ invulnerable: false });
  });
});

// ---- validation -----------------------------------------------------------------------------------------------------

describe("validateTiming", () => {
  const errs = (config: Cfg) => validateTiming(config).filter((i) => i.level === "error");
  const warns = (config: Cfg) => validateTiming(config).filter((i) => i.level === "warning");

  it("presets have no errors and no warnings", () => {
    for (const p of TIMING_PRESETS) expect(validateTiming(p), p.id).toEqual([]);
    expect(TIMING_PRESETS.map((p) => p.id)).toEqual(["lenient", "souls", "sekiro", "witch", "showcase"]);
  });

  it("the test fixture is clean", () => {
    expect(validateTiming(cfg([parry()]))).toEqual([]);
  });

  it("catches unknown references", () => {
    const config = cfg([parry({
      whiffOutcome: "nope", onAccept: "nope2", cost: { resource: "zzz", amount: 1 },
      table: [{ tag: "ghost", cells: { perfect: "missing", nowin: "normal", normal: "normal" } }, { tag: null, cells: { perfect: "perfect", normal: "normal" } }],
    })], { hitOutcome: "none", healthResource: "mana" });
    const paths = errs(config).map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining([
      "healthResource", "hitOutcome", "interactions[0].whiffOutcome", "interactions[0].onAccept", "interactions[0].cost.resource",
      "interactions[0].table[0].tag", "interactions[0].table[0].cells.perfect", "interactions[0].table[0].cells.nowin",
    ]));
  });

  it("checks effect targets and Expr references", () => {
    const base = cfg([parry()]);
    const bad: Cfg = {
      ...base,
      outcomes: [
        ...base.outcomes,
        {
          id: "bad", name: "bad", kind: "neutral",
          effects: [
            { type: "addResource", resource: "mana", amount: c(1) },
            { type: "status", status: "ghost", frames: c(1) },
            { type: "restoreCharge", interaction: "ghost", amount: c(1) },
            { type: "damage", amount: r("res.mana") },
            { type: "stun", frames: r("status.ghost") },
            { type: "cue", cue: "x", value: r("charges.ghost") },
            { type: "hitstop", frames: r("foo.bar") },
            { type: "invulnerable", frames: { op: "add", args: [c(1)] } },
            { type: "timeScale", scale: c(0.5), frames: c(1), when: r("res.gauge") },
          ],
        },
      ],
    };
    const e = errs(bad);
    expect(e.map((i) => i.path)).toEqual([
      "outcomes[6].effects[0].resource", "outcomes[6].effects[1].status", "outcomes[6].effects[2].interaction",
      "outcomes[6].effects[3].amount", "outcomes[6].effects[4].frames", "outcomes[6].effects[5].value",
      "outcomes[6].effects[6].frames", "outcomes[6].effects[7].frames",
    ]);
    // Valid references (including the built-in status.invulnerable) pass.
    const ok = cfg([parry()], { outcomes: [...base.outcomes, { id: "ok", name: "ok", kind: "neutral", effects: [{ type: "cue", cue: "x", value: op("add", r("status.invulnerable"), r("charges.parry")), when: r("action.buffered") }] }] });
    expect(errs(ok)).toEqual([]);
  });

  it("catches duplicate ids and bad numbers", () => {
    const config = cfg([parry(), parry({ startup: -1, buffer: 1.5, windows: [{ id: "a", name: "a", frames: 2 }, { id: "a", name: "a", frames: 2 }], charges: { max: 0, recharge: 0, mode: "parallel" } })], {
      fps: 0, inputOffset: -1,
    });
    config.tags.push({ id: "bullet", name: "dup" });
    config.resources.push({ id: "hp", name: "dup", max: 1, initial: 1 });
    const paths = errs(config).map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining([
      "tags[2].id", "resources[2].id", "interactions[1].id", "interactions[1].windows[1].id", "fps", "inputOffset",
      "interactions[1].startup", "interactions[1].buffer", "interactions[1].charges.max", "interactions[1].charges.recharge",
    ]));
  });

  it("emits the spec warnings", () => {
    const config = cfg([
      parry({ table: [{ tag: "bullet", cells: { perfect: "perfect", normal: "normal" } }], spam: { withinFrames: 10, scope: "self", shrinkPerPress: 1, maxShrink: 4, lockoutAfter: 0, lockoutFrames: 0 } }),
      { id: "idle", name: "idle", priority: 3, startup: 0, windows: [], successRecovery: 0, whiffRecovery: 0, maxCatches: 0, table: [], cooldown: 0, buffer: 0 },
    ]);
    const w = warns(config);
    expect(errs(config)).toEqual([]);
    expect(w.map((i) => i.path)).toEqual([
      "interactions[0].spam.maxShrink", // 4 > strict window length 3
      "interactions[0].table", "interactions[0].table", // perfect and normal have no cell in a default row (there is none)
      "interactions[1]", // no windows and no onAccept
    ]);
  });
});

describe("rebaseTimingState and initial", () => {
  const hand = (): Timing.TimingState => ({
    frame: 100,
    resources: { hp: 2, gauge: 40 },
    statuses: { invulnerable: 130, counter: 90 },
    stunUntil: 110,
    action: {
      interaction: "parry", start: 98, buffered: false, shrink: 1, catches: 1,
      windows: [{ id: "perfect", name: "perfect", from: 100, to: 102 } as unknown as Timing.WindowSpan, { id: "normal", from: 102, to: 110 }],
      activeEnd: 110, recoveryEnd: 118,
    },
    charges: { dodge: { count: 1, pending: [105, 120] } },
    readyAt: { parry: 0, dodge: 99 },
    buffered: { interaction: "parry", frame: 97, shrink: -1 },
    presses: [[90, "parry"], [97, "parry"]],
    pending: [{ id: "a", frame: 101, tags: ["bullet"], damage: 2 }],
    defeated: false,
  });

  it("shifts exactly the absolute-frame fields (hand-checked, origin 100)", () => {
    const before = hand();
    const r = Timing.rebaseTimingState(before, 100);
    const w = hand().action!.windows;
    expect(r).toEqual({
      frame: 0,
      resources: { hp: 2, gauge: 40 },
      statuses: { invulnerable: 30, counter: -10 },
      stunUntil: 10,
      action: {
        interaction: "parry", start: -2, buffered: false, shrink: 1, catches: 1,
        windows: [{ ...w[0]!, from: 0, to: 2 }, { id: "normal", from: 2, to: 10 }],
        activeEnd: 10, recoveryEnd: 18,
      },
      charges: { dodge: { count: 1, pending: [5, 20] } },
      readyAt: { parry: -100, dodge: -1 },
      buffered: { interaction: "parry", frame: -3, shrink: -1 },
      presses: [[-10, "parry"], [-3, "parry"]],
      pending: [{ id: "a", frame: 1, tags: ["bullet"], damage: 2 }],
      defeated: false,
    });
    expect(before).toEqual(hand()); // input untouched
    const idle = { ...hand(), action: { ...hand().action!, recoveryEnd: null }, buffered: null };
    const r2 = Timing.rebaseTimingState(idle, 40);
    expect(r2.action!.recoveryEnd).toBeNull();
    expect(r2.buffered).toBeNull();
    expect(r2.frame).toBe(60);
  });

  it("initial must start at frame 0 and is not mutated", () => {
    const c = cfg([parry()]);
    const mid = runTiming(c, script(10, [press(0)], [bullet(5)])).final;
    expect(() => runTiming(c, script(5, []), { initial: mid })).toThrow(Timing.TimingError);
    expect(() => runTiming(c, script(5, []), { initial: mid })).toThrow("rebaseTimingState");
    const init = Timing.rebaseTimingState(mid, 10);
    const copy = structuredClone(init);
    const run = runTiming(c, script(20, [press(3)], [bullet(8)]), { initial: init, trace: true });
    expect(init).toEqual(copy);
    expect(run.trace).toHaveLength(20);
    expect(run.final.frame).toBe(20);
  });
});

describe("continuation property", () => {
  const withOffset = (p: Cfg): Cfg => ({ ...structuredClone(p), id: `${p.id}-offset3`, inputOffset: 3 });
  const fullGauge = (p: Cfg): Cfg => {
    const q = structuredClone(p);
    q.id = `${p.id}-fullgauge`;
    for (const r of q.resources) if (r.id === "gauge") r.initial = r.max;
    return q;
  };
  const configs: Cfg[] = [...TIMING_PRESETS, withOffset(TIMING_PRESETS[0]!), withOffset(TIMING_PRESETS[2]!), fullGauge(TIMING_PRESETS[0]!)];
  const tagSets = [["bullet"], ["unblockable"], ["thrust"], ["sweep"], ["energy"], [], ["bullet", "thrust"]];

  /** Deterministic scripts: a dense one (a press every 9 frames, an attack every 13) and a sparse one with a burst. */
  function scriptsFor(c: Cfg): Timing.TimingScript[] {
    const ids = c.interactions.map((i) => i.id);
    const dense = script(300, [], []);
    for (let i = 0; i < 33; i++) dense.presses.push(press(i * 9 + (i % 3), ids[i % ids.length]!));
    for (let i = 0; i < 23; i++) dense.attacks.push(bullet(i * 13 + 2, `d${i}`, tagSets[i % tagSets.length]!.slice(), i % 5 === 0 ? 2 : undefined));
    const sparse = script(300, [press(0, ids[0]!), press(1, ids[1]!), press(2, ids[0]!), press(3, ids[0]!), press(4, ids[1]!), press(50, ids[ids.length - 1]!), press(51, ids[0]!), press(140, ids[1]!), press(141, ids[1]!)], [
      bullet(4, "s0"), bullet(5, "s1", ["thrust"]), bullet(40, "s2", ["unblockable"], 2), bullet(52, "s3"), bullet(143, "s4", ["bullet"]), bullet(200, "s5", []), bullet(201, "s6", ["energy"]),
    ]);
    return [dense, sparse];
  }

  it("runTiming(rebase(mid)) equals the tail of the full run, for every cut", () => {
    const seen = { action: 0, buffered: 0, pending: 0, chargePending: 0, stun: 0, status: 0, recovery: 0 };
    for (const c of configs) {
      for (const s of scriptsFor(c)) {
        const full = runTiming(c, s);
        for (let cut = 1; cut < s.frames; cut += cut < 120 ? 1 : 7) {
          const k = continueFrom(c, s, cut);
          const label = `${c.id} cut ${cut}`;
          expect(k.rebased.frame, label).toBe(0);
          expect(k.run.events, label).toEqual(full.events.filter((e) => e.frame >= cut).map((e) => shiftEvent(e, cut)));
          expect(k.run.final, label).toEqual(Timing.rebaseTimingState(full.final, cut));
          if (k.mid.action) seen.action++;
          if (k.mid.action?.recoveryEnd != null) seen.recovery++;
          if (k.mid.buffered) seen.buffered++;
          if (k.mid.pending.length) seen.pending++;
          if (Object.values(k.mid.charges).some((ch) => ch.pending.length)) seen.chargePending++;
          if (k.mid.stunUntil > cut) seen.stun++;
          if (Object.keys(k.mid.statuses).length) seen.status++;
        }
      }
    }
    // The cuts really did land in the interesting states.
    for (const [k, n] of Object.entries(seen)) expect(n, k).toBeGreaterThan(0);
  });

  it("no built-in preset reads the absolute `frame` variable", () => {
    for (const p of TIMING_PRESETS) expect(JSON.stringify(p), p.id).not.toContain('{"ref":"frame"}');
  });
});

describe("presets run", () => {
  it("every preset survives a mixed script deterministically", () => {
    for (const p of TIMING_PRESETS) {
      const s = script(
        400,
        [press(0, "parry"), press(30, "dodge"), press(60, "parry"), press(62, "dodge"), press(100, "parry"), press(101, "parry"), press(102, "parry"), press(150, "skill")],
        [bullet(3), bullet(34, "b2", ["unblockable"]), bullet(66, "b3", ["bullet"], 1), bullet(200, "b4", ["thrust"])],
      );
      const a = runTiming(p, s);
      const b = runTiming(p, s);
      expect(a).toEqual(b);
      expect(a.final.frame).toBe(400);
    }
  });
});
