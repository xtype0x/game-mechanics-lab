// Site language: detection, storage and a tiny external store (no React). Hooks live in ./react.tsx.
// Priority on first load: URL ?lang= (then saved and removed from the URL) -> localStorage -> browser languages.

export const LOCALES = ["zh-Hant", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh-Hant";
export const LOCALE_STORAGE_KEY = "gml.site.locale.v1";
export const LOCALE_QUERY_PARAM = "lang";
/** Native names for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = { "zh-Hant": "中文", en: "English" };

/** One string per locale. */
export type LocalizedText = Record<Locale, string>;
/** Picks a locale's string from a LocalizedText. */
export const localize = (text: LocalizedText, locale: Locale): string => text[locale];

/** Shape of a translation of `T`: same keys; string leaves may be null in non-source locales meaning "don't show this". Functions keep their signature. */
export type Translation<T> = { [K in keyof T]: T[K] extends string ? string | null : T[K] extends (...args: infer A) => infer R ? (...args: A) => R | null : T[K] extends object ? Translation<T[K]> : T[K] };

/** Value from the URL or storage -> Locale, or null if unrecognised. Case-insensitive; zh variants all map to "zh-Hant" for now. */
export function parseLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const lang = value.trim().toLowerCase().split(/[-_]/)[0];
  if (lang === "en") return "en";
  if (lang === "zh") return "zh-Hant";
  return null;
}

/** Browser language list -> Locale: first entry only; zh* -> "zh-Hant", other -> "en", empty -> default. */
export function localeFromLanguages(languages: readonly string[]): Locale {
  const first = languages[0];
  if (!first) return DEFAULT_LOCALE;
  return parseLocale(first) ?? "en";
}

/** Priority: query (if parseable) -> stored (if parseable) -> languages. */
export function resolveLocale(sources: { query?: string | null; stored?: string | null; languages?: readonly string[] }): Locale {
  return parseLocale(sources.query) ?? parseLocale(sources.stored) ?? localeFromLanguages(sources.languages ?? []);
}

/** BCP 47 tag for <html lang> and Intl. */
export function htmlLang(locale: Locale): string {
  return locale === "zh-Hant" ? "zh-Hant-TW" : "en";
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Locale-aware number formatting; non-finite values fall back to String(value). */
export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) return String(value);
  const key = locale + JSON.stringify(options ?? null);
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(htmlLang(locale), options);
    formatters.set(key, fmt);
  }
  return fmt.format(value);
}

// ---- store ----

let current: Locale = DEFAULT_LOCALE;
let initialized = false;
let storageListening = false;
const listeners = new Set<() => void>();

const hasWindow = () => typeof window !== "undefined";

function applyHtmlLang(locale: Locale): void {
  try {
    if (typeof document !== "undefined") document.documentElement.lang = htmlLang(locale);
  } catch {
    // ignore
  }
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readQuery(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(LOCALE_QUERY_PARAM);
  } catch {
    return null;
  }
}

function notify(): void {
  for (const l of [...listeners]) l();
}

function listenStorage(): void {
  if (storageListening || !hasWindow()) return;
  storageListening = true;
  try {
    window.addEventListener("storage", (e) => {
      if (e.key !== LOCALE_STORAGE_KEY) return;
      const next = parseLocale(e.newValue);
      if (!next || next === current) return;
      current = next;
      applyHtmlLang(next);
      notify();
    });
  } catch {
    // ignore
  }
}

function init(): void {
  if (initialized) return;
  initialized = true;
  if (!hasWindow()) return;
  let languages: readonly string[] = [];
  try {
    const nav = window.navigator;
    languages = nav.languages?.length ? nav.languages : nav.language ? [nav.language] : [];
  } catch {
    // ignore
  }
  const query = readQuery();
  current = resolveLocale({ query, stored: readStored(), languages });
  applyHtmlLang(current);
  // A ?lang= link is a choice too: keep it, so other pages (whose links drop the query) stay in that language.
  if (parseLocale(query)) {
    writeStored(current);
    dropQueryParam();
  }
  listenStorage();
}

function writeStored(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

function dropQueryParam(): void {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has(LOCALE_QUERY_PARAM)) {
      url.searchParams.delete(LOCALE_QUERY_PARAM);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  } catch {
    // ignore
  }
}

/** Current locale; the first call in a browser detects it and sets <html lang>. */
export function getLocale(): Locale {
  init();
  return current;
}

/** Sets the locale: stores it, updates <html lang>, drops ?lang= from the URL, notifies subscribers. No-op if unchanged. */
export function setLocale(locale: Locale): void {
  init();
  if (locale === current) return;
  current = locale;
  if (hasWindow()) {
    writeStored(locale);
    applyHtmlLang(locale);
    dropQueryParam();
  }
  notify();
}

/** Returns an unsubscribe function. */
export function subscribeLocale(listener: () => void): () => void {
  init();
  listenStorage();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
