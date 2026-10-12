import { describe, expect, it } from "vitest";
import { Timing } from "@gml/core";
import { attackLibrary, relocalizeAttack, relocalizeAttacks, LEAD_FRAMES, TAIL_FRAMES, attackLength, attackPhaseAt, buildSchedule } from "../src/lab/attacks";
import { buildScript, defaultSession, normalizePresses, parseSession, relocalizeSession } from "../src/lab/session";
import { computeStats } from "../src/lab/stats";
import { fxByFrame } from "../src/lab/usePlayback";

const ATTACKS = attackLibrary("zh-Hant");
const souls = Timing.TIMING_PRESETS.find((p) => p.id === "souls")!;

describe("attack schedule", () => {
  it("lays attacks end to end and expands impact frames", () => {
    // slash: windup 30, one hit, recovery 24 => length 55. thrust starts 55 + gap 10 later.
    const { items, frames } = buildSchedule([{ attack: "slash", gap: 10 }, { attack: "thrust", gap: 0 }], ATTACKS);
    expect(attackLength(ATTACKS[0]!)).toBe(55);
    expect(items[0]!.start).toBe(LEAD_FRAMES);
    expect(items[0]!.events.map((e) => e.frame)).toEqual([LEAD_FRAMES + 30]);
    expect(items[1]!.start).toBe(LEAD_FRAMES + 55 + 10);
    expect(items[1]!.events[0]!.tags).toEqual(["thrust"]);
    expect(frames).toBe(items[1]!.end + TAIL_FRAMES);
  });
  it("gives repeated attacks distinct ids", () => {
    const { items } = buildSchedule([{ attack: "volley", gap: 0 }, { attack: "volley", gap: 0 }], ATTACKS);
    const ids = items.flatMap((i) => i.events.map((e) => e.id));
    expect(new Set(ids).size).toBe(10);
    expect(items[0]!.events.map((e) => e.frame - items[0]!.start)).toEqual([20, 30, 40, 50, 60]);
  });
  it("reports the animation phase from the frame ranges", () => {
    const { items } = buildSchedule([{ attack: "slash", gap: 0 }], ATTACKS);
    const s = LEAD_FRAMES; // windup 30, telegraph 8 => tell from s+22, hit at s+30
    expect(attackPhaseAt(items, s - 1).phase).toBe("idle");
    expect(attackPhaseAt(items, s).phase).toBe("windup");
    expect(attackPhaseAt(items, s + 22).phase).toBe("telegraph");
    expect(attackPhaseAt(items, s + 30).phase).toBe("strike");
    expect(attackPhaseAt(items, s + 40).phase).toBe("recovery");
    expect(attackPhaseAt(items, s + 55).phase).toBe("idle");
  });
});

describe("session storage", () => {
  it("falls back to defaults on corrupt or missing data", () => {
    expect(parseSession(null)).toEqual(defaultSession());
    expect(parseSession("{nope")).toEqual(defaultSession());
    expect(parseSession("[]").sequence).toEqual(defaultSession().sequence);
  });
  it("keeps valid fields and drops bad entries", () => {
    const s = parseSession(JSON.stringify({ sequence: [{ attack: "slash", gap: 5 }, { attack: "ghost", gap: 1 }], loop: true, presses: [{ frame: 3, interaction: "parry" }, { frame: -1, interaction: "x" }, "bad"] }));
    expect(s.sequence).toEqual([{ attack: "slash", gap: 5 }]);
    expect(s.loop).toBe(true);
    expect(s.presses).toEqual([{ frame: 3, interaction: "parry" }]);
    expect(s.attacks.length).toBe(ATTACKS.length);
  });
  it("sorts presses, drops duplicates and unknown interactions", () => {
    expect(normalizePresses([{ frame: 9, interaction: "dodge" }, { frame: 4, interaction: "parry" }, { frame: 4, interaction: "parry" }, { frame: 2, interaction: "zzz" }], souls))
      .toEqual([{ frame: 4, interaction: "parry" }, { frame: 9, interaction: "dodge" }]);
  });
});

describe("stats and host commands", () => {
  it("counts outcomes and press offsets", () => {
    // Parry pressed on 5 catches an impact on 10 in the perfect window: offset 5, one perfect of one.
    const run = Timing.runTiming(souls, { frames: 40, presses: [{ frame: 5, interaction: "parry" }], attacks: [{ id: "a", frame: 10, tags: [] }] });
    const st = computeStats(souls, run.events);
    expect(st.total).toBe(1);
    expect(st.perfectRate).toBe(1);
    expect(st.outcomes[0]).toMatchObject({ outcome: "perfectParry", label: "完美格擋", count: 1 });
    expect(st.interactions.find((i) => i.interaction === "parry")).toEqual({ interaction: "parry", catches: 1, meanOffset: 5 });
    expect(fxByFrame(run.events).get(10)).toEqual({ hitstop: 6 });
  });
  it("counts an unanswered attack as a miss", () => {
    const { script } = buildScript({ ...defaultSession(), sequence: [{ attack: "slash", gap: 0 }], presses: [] }, souls);
    const st = computeStats(souls, Timing.runTiming(souls, script).events);
    expect(st.outcomes[0]).toMatchObject({ outcome: "hit", count: 1, kind: "fail" });
    expect(st.perfectRate).toBe(0);
  });
});

describe("built-in attacks follow the language", () => {
  // Stub library: "en" names get a suffix so a swap is visible while the real en dictionary still equals zh.
  const lib = (l: "zh-Hant" | "en") => attackLibrary("zh-Hant").map((a) => (l === "en" ? { ...a, name: a.name + " (en)" } : a));
  it("swaps an untouched built-in and leaves edited or custom attacks alone", () => {
    const slash = lib("zh-Hant")[0]!;
    expect(relocalizeAttack(slash, "en", lib)!.name).toBe(slash.name + " (en)");
    expect(relocalizeAttack(lib("en")[0]!, "zh-Hant", lib)).toEqual(slash);
    expect(relocalizeAttack({ ...slash, windup: slash.windup + 1 }, "en", lib)).toBeNull();
    expect(relocalizeAttack({ ...slash, id: "custom1" }, "en", lib)).toBeNull();
    const edited = { ...slash, name: "mine" };
    const list = relocalizeAttacks([slash, edited], "en", lib);
    expect(list[0]!.name).toBe(slash.name + " (en)");
    expect(list[1]).toBe(edited);
  });
  it("relocalizeSession keeps the same object when nothing changes", () => {
    const s = defaultSession();
    s.attacks = s.attacks.map((a) => ({ ...a, windup: a.windup + 1 }));
    expect(relocalizeSession(s, "en")).toBe(s);
  });
});
