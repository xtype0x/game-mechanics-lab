import { getLocale, useDict, type Locale } from "@gml/ui/i18n";
import { en } from "./en";
import { zhHant, type ShellText } from "./zh-Hant";

export type { ShellText };
export { en, zhHant };

const dicts: Record<Locale, ShellText> = { "zh-Hant": zhHant, en };

/** Page text for the current locale (React components). */
export function useText(): ShellText {
  return useDict(dicts);
}

/** Page text for the current locale, for non-React modules. Reads the locale at call time. */
export function text(): ShellText {
  return dicts[getLocale()];
}

/** Page text for a given locale (e.g. building default data for a chosen language). */
export function textFor(locale: Locale): ShellText {
  return dicts[locale];
}
