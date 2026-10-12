// React bindings for the locale store.
import { useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, LOCALES, LOCALE_NAMES, getLocale, htmlLang, setLocale, subscribeLocale, type Locale } from "./locale";

/** [locale, setLocale]; re-renders on change. */
export function useLocale(): [Locale, (locale: Locale) => void] {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => DEFAULT_LOCALE);
  return [locale, setLocale];
}

/** Picks the current locale's entry: useDict({ "zh-Hant": zh, en }) -> zh or en. */
export function useDict<T>(dicts: Record<Locale, T>): T {
  const [locale] = useLocale();
  return dicts[locale];
}

/** Button group for switching language. Styled by the host via the lang-switch classes. */
export function LanguageSwitch({ className }: { className?: string }) {
  const [current, set] = useLocale();
  return (
    <div className={["lang-switch", className].filter(Boolean).join(" ")} role="group" aria-label="Language / 語言">
      {LOCALES.map((l) => (
        <button key={l} type="button" className="lang-switch-option" lang={htmlLang(l)} aria-pressed={l === current} onClick={() => set(l)}>
          {LOCALE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
