import { describe, expect, it } from "vitest";
import { Timing } from "@gml/core";
import { actionSpans, attackSpans, describeEvent, eventCategory, exportTimingConfig, parseTimingConfig, pressMarks, uniqueId, windowChanges } from "../src/timing";

const souls = Timing.TIMING_PRESETS.find((p) => p.id === "souls")!;

// Parry at 5 (startup 2) => perfect window [7,11), normal [11,19); an untagged attack lands on frame 10.
const run = Timing.runTiming(souls, { frames: 40, presses: [{ frame: 5, interaction: "parry" }], attacks: [{ id: "a", frame: 10, tags: [] }] }, { trace: true });

describe("describeEvent", () => {
  it("names presses, resolves and effects with config names", () => {
    const lines = run.events.map((e) => describeEvent(souls, e));
    expect(lines).toContain("第 5 幀｜按下 格擋");
    expect(lines).toContain("第 5 幀｜格擋 接受");
    expect(lines).toContain("第 10 幀｜a 命中 → 格擋・完美窗 → 完美格擋");
    expect(lines).toContain("第 10 幀｜效果：技能量表 +25（完美格擋）");
  });
  it("explains shrunken windows and drops", () => {
    const accept = { frame: 6, type: "accept", interaction: "parry", pressFrame: 6, buffered: false, shrink: 2, windows: [{ id: "perfect", from: 8, to: 10 }, { id: "normal", from: 10, to: 20 }] } as const;
    expect(windowChanges(souls, accept)).toEqual(["完美 4→2", "普通 8→10"]);
    expect(describeEvent(souls, accept)).toBe("第 6 幀｜格擋 接受（縮減 2 幀：完美 4→2、普通 8→10）");
    expect(describeEvent(souls, { frame: 9, type: "drop", interaction: "parry", pressFrame: 9, reason: "spamLockout" })).toBe("第 9 幀｜丟棄 格擋：連打鎖定");
  });
  it("groups events into filter categories", () => {
    expect(eventCategory({ frame: 1, type: "press", interaction: "parry" })).toBe("key");
    expect(eventCategory({ frame: 1, type: "whiff", interaction: "parry", outcome: null })).toBe("judge");
    expect(eventCategory({ frame: 1, type: "defeated" })).toBe("other");
  });
});

describe("frame model", () => {
  it("builds startup, windows and recovery for an accepted press", () => {
    const [a] = actionSpans(souls, run.events, 40);
    expect(a!.startup).toEqual({ from: 5, to: 7 });
    // maxCatches 1: the catch on frame 10 ends the active phase at 11, so the normal window never opens.
    expect(a!.windows.map((w) => [w.id, w.from, w.to, w.strict])).toEqual([["perfect", 7, 11, true]]);
    expect(a!.recovery).toEqual({ from: 11, to: 17 });
  });
  it("marks presses by what happened to them", () => {
    expect(pressMarks(run.events)).toEqual([{ frame: 5, interaction: "parry", status: "accepted" }]);
  });
  it("lays out an attack from its frame ranges", () => {
    const s = attackSpans(souls, { id: "x", name: "x", windup: 20, telegraph: 6, recovery: 10, hits: [{ offset: 0, tags: ["thrust"] }, { offset: 8, tags: [] }] }, 100);
    expect(s.hits).toEqual([120, 128]);
    // both hits fall back to the move's telegraph 6: tells [114,120) and [122,128)
    expect(s.tells).toEqual([{ hit: 0, from: 114, to: 120 }, { hit: 1, from: 122, to: 128 }]);
    expect(s.recovery).toEqual({ from: 129, to: 139 });
  });
  it("gives each hit its own tell, skips 0, and honours hitTells: false", () => {
    const def: Parameters<typeof attackSpans>[1] = {
      id: "y", name: "y", windup: 20, telegraph: 6, recovery: 10,
      hits: [{ offset: 0, tags: [] }, { offset: 8, tags: [], telegraph: 0 }, { offset: 16, tags: [], telegraph: 30 }],
    };
    // hits at 120, 128, 136. Hit 1 has no tell; hit 2's 30-frame tell is clipped to the move start (100).
    expect(attackSpans(souls, def, 100).tells).toEqual([{ hit: 0, from: 114, to: 120 }, { hit: 2, from: 106, to: 136 }]);
    expect(attackSpans(souls, def, 100, { hitTells: false }).tells).toEqual([{ hit: 0, from: 114, to: 120 }]);
  });
});

describe("config import/export", () => {
  it("round-trips a preset", () => {
    expect(parseTimingConfig(exportTimingConfig(souls))).toEqual(souls);
  });
  it("accepts a bare config and rejects bad input in Chinese", () => {
    expect(parseTimingConfig(JSON.stringify(souls)).id).toBe("souls");
    expect(() => parseTimingConfig("{oops")).toThrow("不是有效的 JSON");
    expect(() => parseTimingConfig(JSON.stringify({ format: "other", config: souls }))).toThrow("檔案格式不符");
    const broken = structuredClone(souls);
    broken.hitOutcome = "nope";
    expect(() => parseTimingConfig(exportTimingConfig(broken))).toThrow("設定有錯誤");
  });
  it("makes unique ids", () => {
    expect(uniqueId("w", ["w1", "w2"])).toBe("w3");
  });
});
