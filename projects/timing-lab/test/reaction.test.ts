import { describe, expect, it } from "vitest";
import { Timing } from "@gml/core";
import { stableStringify } from "@gml/ui";
import { attackLibrary, buildSchedule, hitGap, setHitGap, setUniformGap, tellAt, uniformGap } from "../src/lab/attacks";
import { gamePresets } from "../src/shell/presets";
import { REACTION_GRADES, THEORETICAL_MIN_MS, analyzeAttack, analyzeCached, bestOfHit, gradeOf, worstOfAttack } from "../src/lab/reaction";
import { DASH, TRAVEL } from "../src/lab/visuals";

const lib = attackLibrary("zh-Hant");
const def = (id: string) => lib.find((a) => a.id === id)!;
const preset = (id: string) => Timing.TIMING_PRESETS.find((p) => p.id === id)!;
const souls = preset("souls");
const lenient = preset("lenient");
const pick = (a: ReturnType<typeof analyzeAttack>, hit: number, interaction: string) => a.hits[hit]!.results.find((r) => r.interaction === interaction)!;

describe("grades", () => {
  it("uses the thresholds from the table", () => {
    expect(THEORETICAL_MIN_MS).toBe(100);
    expect(REACTION_GRADES.map((g) => g.minMs)).toEqual([350, 250, 180, 100, -Infinity]);
    expect(gradeOf(350)).toBe("friendly");
    expect(gradeOf(349.9)).toBe("normal");
    expect(gradeOf(250)).toBe("normal");
    expect(gradeOf(249.9)).toBe("challenging");
    expect(gradeOf(180)).toBe("challenging");
    expect(gradeOf(179.9)).toBe("harsh");
    expect(gradeOf(100)).toBe("harsh");
    expect(gradeOf(99.9)).toBe("anticipate");
    expect(gradeOf(-50)).toBe("anticipate");
  });
});

describe("built-in move numbers", () => {
  it("has the readable combo and the harder fast combo", () => {
    const c = def("combo"), f = def("fastCombo");
    expect(c.hits.map((h) => h.offset)).toEqual([0, 22, 44]);
    expect([0, 1, 2].map((i) => Timing.hitTelegraph(c, i))).toEqual([18, 14, 14]);
    expect(f.hits.map((h) => h.offset)).toEqual([0, 16, 32]);
    expect([0, 1, 2].map((i) => Timing.hitTelegraph(f, i))).toEqual([10, 9, 9]);
    expect(lib.map((a) => a.id).indexOf("fastCombo")).toBe(lib.map((a) => a.id).indexOf("combo") + 1);
  });
});

describe("reaction analysis (souls: parry startup 2, perfect 4, normal 8)", () => {
  // The parry becomes active 2 frames after the press, so the latest press that still covers an impact is impact-2.
  // Valid presses = perfect 4 + normal 8 frames = 12 (impact-13 .. impact-2); the 4 latest are perfect.
  const combo = analyzeAttack(def("combo"), souls);
  it("combo: the last hit's latest valid parry press is H-2, with the 14-frame tell as the cue", () => {
    const r = pick(combo, 2, "parry");
    expect(r.latest).toBe(-2);
    expect(r.earliest).toBe(-13);
    expect(r.validFrames).toBe(12);
    expect(r.perfectFrames).toBe(4);
    expect(r.cueFrame).toBe(-14); // tell 14 beats the 6-frame dash
    expect(r.reactionFrames).toBe(12);
    expect(r.reactionMs).toBeCloseTo(200, 6);
    expect(r.grade).toBe("challenging");
    expect(pick(combo, 0, "parry").reactionMs).toBeCloseTo((16 * 1000) / 60, 6); // tell 18, latest -2
  });
  it("combo: dodge for hit 1 only works if hit 0 is dodged earlier (needsEarlier); hit 2 has no dodge answer", () => {
    // After the latest-perfect dodge at H0-2 the dodge is still recovering at hit 1 (22 frames later). Dodging hit 0 earlier
    // frees it in time: 4 valid presses (-5..-2) for hit 1, and the reaction is 14-frame tell + (-2) = 12 frames.
    const r = pick(combo, 1, "dodge");
    expect(r.needsEarlier).toBe(true);
    expect(r.validFrames).toBe(4);
    expect(r.latest).toBe(-2);
    expect(r.grade).toBe("challenging");
    expect(pick(combo, 2, "dodge").grade).toBe("impossible");
    expect(pick(combo, 0, "dodge").needsEarlier).toBe(false);
    expect(bestOfHit(combo.hits[1]!.results)!.interaction).toBe("parry");
  });
  it("combo: worst = the weakest hit's best option; not impossible", () => {
    expect(combo.impossible).toBe(false);
    expect(combo.worst!.reactionFrames).toBe(12);
    expect(combo.worst!.grade).toBe("challenging");
    expect(worstOfAttack(combo.hits)).toBe(combo.worst);
  });
  it("fastCombo: 9-frame follow-up tells, latest press H-2, so 7 frames = 116.7 ms (harsh, still reactable)", () => {
    const f = analyzeAttack(def("fastCombo"), souls);
    const r = pick(f, 2, "parry");
    expect(r.latest).toBe(-2);
    expect(r.cueFrame).toBe(-9); // tell 9 beats the 6-frame dash
    expect(r.reactionFrames).toBe(7);
    expect(r.reactionMs).toBeCloseTo(116.667, 2);
    expect(r.grade).toBe("harsh");
    expect(pick(f, 0, "parry").reactionFrames).toBe(8); // tell 10, latest -2
    expect(f.impossible).toBe(false);
    expect(f.worst!.grade).toBe("harsh");
  });
  it("hitTells=false removes the follow-up tells of the readable combo", () => {
    const off = analyzeAttack(def("combo"), souls, false);
    expect(pick(off, 2, "parry").cueFrame).toBe(-DASH);
    expect(pick(off, 2, "parry").reactionFrames).toBe(4);
    expect(pick(off, 0, "parry").cueFrame).toBe(-18); // the first hit keeps its tell
  });
  it("projectiles are visible TRAVEL frames before impact", () => {
    const v = analyzeAttack(def("volley"), souls);
    expect(pick(v, 3, "parry").cueFrame).toBe(-Math.max(12, TRAVEL));
  });
  it("does not modify the config it analyses", () => {
    const before = stableStringify(souls);
    analyzeAttack(def("combo"), souls);
    expect(stableStringify(souls)).toBe(before);
  });
  it("memoizes by config object, move contents and hitTells", () => {
    const a = analyzeCached(def("slash"), souls, true);
    expect(analyzeCached(structuredClone(def("slash")), souls, true)).toBe(a);
    expect(analyzeCached(def("slash"), souls, false)).not.toBe(a);
    expect(analyzeCached({ ...def("slash"), windup: 31 }, souls, true)).not.toBe(a);
    expect(analyzeCached(def("slash"), structuredClone(souls), true)).not.toBe(a);
  });
});

describe("reaction analysis (lenient)", () => {
  it("combo is reactable by parry on every hit; fastCombo is harsh", () => {
    const c = analyzeAttack(def("combo"), lenient);
    expect([0, 1, 2].map((i) => pick(c, i, "parry").latest)).toEqual([-2, -2, -2]);
    expect(pick(c, 0, "parry").validFrames).toBe(22); // perfect 8 + normal 14
    expect(c.worst!.reactionMs).toBeCloseTo(200, 6);
    const f = analyzeAttack(def("fastCombo"), lenient);
    expect(f.worst!.grade).toBe("harsh");
    expect(pick(f, 2, "parry").reactionMs).toBeCloseTo(116.667, 2);
  });
});

describe("impossible moves", () => {
  it("a config where nothing catches the hit reports impossible", () => {
    const cfg = structuredClone(souls);
    for (const it of cfg.interactions) it.table = [];
    const a = analyzeAttack(def("slash"), cfg);
    expect(a.impossible).toBe(true);
    expect(a.worst).toBeNull();
    expect(analyzeAttack({ ...def("slash"), hits: [] }, souls)).toMatchObject({ hits: [], worst: null, impossible: false });
  });
});

describe("tellAt", () => {
  it("follows each hit's own tell window and the hitTells switch", () => {
    const { items } = buildSchedule([{ attack: "combo", gap: 0 }], lib);
    const s = items[0]!.start; // hits at s+24, s+46, s+68; tells 18 / 14 / 14 frames long
    expect(tellAt(items, s + 5, true)).toBeNull();
    expect(tellAt(items, s + 6, true)).toMatchObject({ hit: 0, progress: 0 });
    expect(tellAt(items, s + 23, true)!.hit).toBe(0);
    expect(tellAt(items, s + 24, true)).toBeNull(); // hit 0 landed; hit 1's tell starts at s+32
    expect(tellAt(items, s + 32, true)).toMatchObject({ hit: 1, progress: 0 });
    expect(tellAt(items, s + 45, true)!.hit).toBe(1);
    expect(tellAt(items, s + 60, true)!.hit).toBe(2);
    expect(tellAt(items, s + 32, false)).toBeNull();
    expect(tellAt(items, s + 10, false)!.hit).toBe(0);
    const fast = buildSchedule([{ attack: "fastCombo", gap: 0 }], lib).items;
    expect(tellAt(fast, fast[0]!.start + 24 + 16 - 10, true)).toBeNull(); // hit 1's 9-frame tell starts at +31
    expect(tellAt(fast, fast[0]!.start + 24 + 16 - 9, true)!.hit).toBe(1);
  });
});

describe("needsEarlier", () => {
  it("lenient combo: dodge for hit 2 (index 1) works when hit 1 is dodged earlier; parry never needs it", () => {
    const c = analyzeAttack(def("combo"), lenient);
    const r = pick(c, 1, "dodge");
    expect(r.needsEarlier).toBe(true);
    expect(r.covered).toBe(false);
    expect(r.validFrames).toBe(7);
    expect(r.latest).toBe(-1);
    expect(r.grade).toBe("challenging"); // (14 + -1) frames = 216.7 ms
    expect(pick(c, 0, "dodge").needsEarlier).toBe(false);
    expect(pick(c, 0, "dodge").latest).toBe(-1); // hit 0 itself still reports the latest-perfect press
    expect(c.hits.every((h) => !pick(c, h.hit, "parry").needsEarlier)).toBe(true);
  });
});

describe("built-in defaults", () => {
  it("no built-in move is anticipation-only under any built-in rules", () => {
    for (const cfg of gamePresets("zh-Hant")) for (const d of lib) {
      const a = analyzeAttack(d, cfg);
      for (const h of a.hits) {
        const best = bestOfHit(h.results);
        if (best) expect.soft(best.grade, `${cfg.id} / ${d.id}`).not.toBe("anticipate");
      }
    }
  }, 30_000);
});

describe("hit spacing helpers", () => {
  it("reads, sets one gap (later hits follow) and sets a uniform gap", () => {
    const d = structuredClone(def("combo"));
    expect(hitGap(d, 0)).toBeNull();
    expect(hitGap(d, 2)).toBe(22);
    expect(uniformGap(d)).toBe(22);
    setHitGap(d, 1, 30);
    expect(d.hits.map((h) => h.offset)).toEqual([0, 30, 52]);
    expect(uniformGap(d)).toBeNull();
    setUniformGap(d, 18);
    expect(d.hits.map((h) => h.offset)).toEqual([0, 18, 36]);
    setHitGap(d, 2, -5);
    expect(d.hits.map((h) => h.offset)).toEqual([0, 18, 18]);
    expect(uniformGap(def("slash"))).toBeNull();
  });
});
