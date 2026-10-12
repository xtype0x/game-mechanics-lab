import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, formatNumber, getLocale, htmlLang, localeFromLanguages, parseLocale, resolveLocale, setLocale, subscribeLocale } from "../src/i18n";

beforeEach(() => setLocale(DEFAULT_LOCALE));

describe("parseLocale", () => {
  it("maps English and Chinese tags, case-insensitively", () => {
    for (const v of ["en", "en-US", "en-gb", "EN"]) expect(parseLocale(v)).toBe("en");
    for (const v of ["zh", "zh-Hant", "zh-TW", "zh-HK", "zh-Hant-TW", "ZH-tw", "zh-Hans", "zh-CN", "zh-SG"]) expect(parseLocale(v)).toBe("zh-Hant");
  });
  it("returns null for anything else", () => {
    for (const v of ["", null, undefined, "fr", "english"]) expect(parseLocale(v)).toBeNull();
  });
});

describe("localeFromLanguages", () => {
  it("looks at the first entry only", () => {
    expect(localeFromLanguages(["zh-TW", "en"])).toBe("zh-Hant");
    expect(localeFromLanguages(["en-US", "zh-TW"])).toBe("en");
    expect(localeFromLanguages(["fr"])).toBe("en");
    expect(localeFromLanguages([])).toBe("zh-Hant");
  });
});

describe("resolveLocale", () => {
  it("prefers query, then stored, then languages", () => {
    expect(resolveLocale({ query: "en", stored: "zh-Hant", languages: ["zh-TW"] })).toBe("en");
    expect(resolveLocale({ stored: "en", languages: ["zh-TW"] })).toBe("en");
    expect(resolveLocale({ languages: ["en-US"] })).toBe("en");
    expect(resolveLocale({})).toBe("zh-Hant");
  });
  it("falls through unparseable values", () => {
    expect(resolveLocale({ query: "fr", stored: "en", languages: ["zh-TW"] })).toBe("en");
    expect(resolveLocale({ query: "", stored: "xx", languages: ["en"] })).toBe("en");
  });
});

describe("htmlLang", () => {
  it("returns BCP 47 tags", () => {
    expect(htmlLang("zh-Hant")).toBe("zh-Hant-TW");
    expect(htmlLang("en")).toBe("en");
  });
});

describe("locale store (node)", () => {
  it("defaults to zh-Hant and reflects setLocale", () => {
    expect(getLocale()).toBe("zh-Hant");
    setLocale("en");
    expect(getLocale()).toBe("en");
  });
  it("notifies once per change and not when unchanged", () => {
    let n = 0;
    const off = subscribeLocale(() => n++);
    setLocale("en");
    expect(n).toBe(1);
    setLocale("en");
    expect(n).toBe(1);
    off();
  });
  it("stops notifying after unsubscribe", () => {
    let n = 0;
    const off = subscribeLocale(() => n++);
    off();
    setLocale("en");
    expect(n).toBe(0);
  });
});

describe("formatNumber", () => {
  it("formats with the locale and handles non-finite values", () => {
    expect(formatNumber("en", 1234.5)).toBe("1,234.5");
    expect(formatNumber("en", 0.256, { style: "percent" })).toBe("26%");
    expect(formatNumber("en", Infinity)).toBe("Infinity");
    expect(formatNumber("en", NaN)).toBe("NaN");
  });
});
