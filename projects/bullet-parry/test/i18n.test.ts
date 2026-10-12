import { LOCALES } from "@gml/ui/i18n";
import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { zhHant } from "../src/i18n/zh-Hant";
import { bulletParryDefault, gamePresets, relocalizeGameConfig } from "../src/game";

/** Shape of a value: object keys recursively, "fn" for functions, "str" for strings, "node" for JSX/others. */
function shape(v: unknown): unknown {
  if (typeof v === "string") return "str";
  if (typeof v === "function") return "fn";
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === "object" && !("$$typeof" in v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return "node";
}

/** Deep copy with the display text (name / description / label) blanked, so only structure and numbers are compared. */
const blank = (v: unknown): unknown => JSON.parse(JSON.stringify(v), (k, x) => (k === "name" || k === "description" || k === "label" ? "" : x));

describe("dictionaries", () => {
  it("en has the same keys and value kinds as zh-Hant", () => {
    expect(shape(en)).toEqual(shape(zhHant));
  });
});

describe("built-in data per locale", () => {
  it("the game default has the same structure in both locales, differing only in text", () => {
    const [a, b] = LOCALES.map((l) => bulletParryDefault(l));
    expect(blank(a)).toEqual(blank(b));
    expect(a!.name).not.toBe("");
    expect(b!.name).not.toBe("");
    expect(a!.id).toBe("bullet-parry-default");
  });

  it("the preset list has the same ids in both locales", () => {
    const [a, b] = LOCALES.map((l) => gamePresets(l).map((p) => p.id));
    expect(a).toEqual(b);
  });

  it("an untouched built-in follows the language and an edited one is left alone", () => {
    for (const to of LOCALES) {
      const fresh = relocalizeGameConfig(bulletParryDefault("zh-Hant"), to);
      expect(fresh).toEqual(bulletParryDefault(to));
    }
    const edited = bulletParryDefault("zh-Hant");
    edited.fps += 1;
    expect(relocalizeGameConfig(edited, "en")).toBeNull();
  });
});
