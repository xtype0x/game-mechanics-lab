import { describe, expect, it } from "vitest";
import { Timing } from "@gml/core";
import type { Locale } from "../src/i18n";
import { relocalizeTimingConfig, timingPresets } from "../src/timing";

/** The config with every user-facing text field blanked, so two translations of one preset compare equal. */
function structure(cfg: Timing.TimingConfig) {
  const c = structuredClone(cfg) as Timing.TimingConfig;
  c.name = "";
  delete c.description;
  for (const list of [c.tags, c.resources, c.statuses, c.outcomes, c.interactions]) for (const x of list) x.name = "";
  for (const i of c.interactions) for (const w of i.windows) w.name = "";
  return c;
}

describe("timingPresets", () => {
  it("zh-Hant is the core text unchanged", () => {
    expect(timingPresets("zh-Hant")).toEqual(Timing.TIMING_PRESETS);
  });

  it("en keeps ids and structure; only names / descriptions may differ", () => {
    const zh = timingPresets("zh-Hant");
    const en = timingPresets("en");
    expect(en.map((p) => p.id)).toEqual(zh.map((p) => p.id));
    en.forEach((p, k) => expect(structure(p), p.id).toEqual(structure(zh[k]!)));
    // Every translated preset still validates.
    for (const p of en) expect(Timing.validateTiming(p), p.id).toEqual([]);
  });

  it("returns fresh clones each call and never touches the core presets", () => {
    const before = JSON.stringify(Timing.TIMING_PRESETS);
    for (const locale of ["zh-Hant", "en"] as const) {
      const a = timingPresets(locale);
      const b = timingPresets(locale);
      expect(a[0]).not.toBe(b[0]);
      expect(a[0]!.interactions).not.toBe(b[0]!.interactions);
      a[0]!.name = "edited";
      expect(timingPresets(locale)[0]!.name).not.toBe("edited");
    }
    expect(JSON.stringify(Timing.TIMING_PRESETS)).toBe(before);
    expect(timingPresets("zh-Hant")[0]).not.toBe(Timing.TIMING_PRESETS[0]);
  });
});

describe("relocalizeTimingConfig", () => {
  // Stub provider: "en" presets get a visible name suffix, so a swap can be seen while the real en table equals zh.
  const stub = (locale: Locale) => timingPresets("zh-Hant").map((p) => (locale === "en" ? { ...p, name: p.name + " (en)", interactions: p.interactions.map((i) => ({ ...i, name: i.name + " (en)" })) } : p));
  const souls = () => stub("zh-Hant").find((p) => p.id === "souls")!;

  it("swaps an untouched built-in to the target language, in either direction", () => {
    const en = relocalizeTimingConfig(souls(), "en", stub)!;
    expect(en.name).toBe(souls().name + " (en)");
    expect(en.interactions[0]!.name).toContain("(en)");
    expect(relocalizeTimingConfig(en, "zh-Hant", stub)).toEqual(souls());
  });

  it("matches whatever key order the saved JSON had, and returns a fresh clone", () => {
    const reverseKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(reverseKeys) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)])) : v;
    const saved = reverseKeys(souls()) as Timing.TimingConfig;
    expect(JSON.stringify(saved)).not.toBe(JSON.stringify(souls()));
    const a = relocalizeTimingConfig(saved, "en", stub)!;
    const b = relocalizeTimingConfig(saved, "en", stub)!;
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.interactions).not.toBe(b.interactions);
  });

  it("returns null for an edited config", () => {
    const edited = souls();
    edited.interactions.find((i) => i.id === "parry")!.windows[0]!.frames += 1;
    expect(relocalizeTimingConfig(edited, "en", stub)).toBeNull();
    const renamed = souls();
    renamed.name = "my own";
    expect(relocalizeTimingConfig(renamed, "en", stub)).toBeNull();
  });

  it("returns null for a config that is not a built-in", () => {
    const custom = souls();
    custom.id = "mine";
    expect(relocalizeTimingConfig(custom, "en", stub)).toBeNull();
  });

  it("works with the default (core) presets", () => {
    const p = timingPresets("zh-Hant")[1]!;
    expect(relocalizeTimingConfig(p, "en")).toEqual(timingPresets("en")[1]);
  });
});
