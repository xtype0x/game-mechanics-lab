import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCALE_STORAGE_KEY } from "../src/i18n";

// The browser paths of the locale store, against a minimal fake window. Each test loads a fresh module.
function fakeBrowser({ href = "https://example.test/gacha/index.html#/", stored = null as string | null, languages = ["zh-TW"] } = {}) {
  const store = new Map<string, string>(stored ? [[LOCALE_STORAGE_KEY, stored]] : []);
  const location = new URL(href);
  const handlers: ((e: { key: string; newValue: string | null }) => void)[] = [];
  const win = {
    location,
    navigator: { languages, language: languages[0] },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => { const next = new URL(url, location.href); location.search = next.search; location.hash = next.hash; } },
    addEventListener: (type: string, h: (typeof handlers)[number]) => { if (type === "storage") handlers.push(h); },
  };
  const doc = { documentElement: { lang: "" } };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  return { store, location, doc, fireStorage: (newValue: string) => handlers.forEach((h) => h({ key: LOCALE_STORAGE_KEY, newValue })) };
}
const load = async () => { vi.resetModules(); return import("../src/i18n/locale"); };

afterEach(() => vi.unstubAllGlobals());

describe("locale store in a browser", () => {
  it("detects from browser languages and sets <html lang>", async () => {
    const b = fakeBrowser({ languages: ["en-US"] });
    const m = await load();
    expect(m.getLocale()).toBe("en");
    expect(b.doc.documentElement.lang).toBe("en");
    expect(b.store.size).toBe(0);
  });
  it("prefers the saved choice over browser languages", async () => {
    fakeBrowser({ stored: "en", languages: ["zh-TW"] });
    expect((await load()).getLocale()).toBe("en");
  });
  it("saves a ?lang= link and removes it from the URL, keeping the hash", async () => {
    const b = fakeBrowser({ href: "https://example.test/index.html?lang=en#/games", stored: "zh-Hant" });
    const m = await load();
    expect(m.getLocale()).toBe("en");
    expect(b.store.get(LOCALE_STORAGE_KEY)).toBe("en");
    expect(b.location.search).toBe("");
    expect(b.location.hash).toBe("#/games");
  });
  it("setLocale saves, updates <html lang> and notifies", async () => {
    const b = fakeBrowser();
    const m = await load();
    const seen: string[] = [];
    m.subscribeLocale(() => seen.push(m.getLocale()));
    m.setLocale("en");
    expect(b.store.get(LOCALE_STORAGE_KEY)).toBe("en");
    expect(b.doc.documentElement.lang).toBe("en");
    expect(seen).toEqual(["en"]);
  });
  it("follows a change made in another tab", async () => {
    const b = fakeBrowser();
    const m = await load();
    const seen: string[] = [];
    m.subscribeLocale(() => seen.push(m.getLocale()));
    b.fireStorage("en");
    b.fireStorage("en");
    b.fireStorage("garbage");
    expect(seen).toEqual(["en"]);
    expect(b.doc.documentElement.lang).toBe("en");
  });
  it("survives storage that throws", async () => {
    fakeBrowser({ languages: ["en"] });
    (window as unknown as { localStorage: unknown }).localStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const m = await load();
    expect(m.getLocale()).toBe("en");
    expect(() => m.setLocale("zh-Hant")).not.toThrow();
    expect(m.getLocale()).toBe("zh-Hant");
  });
});
