import { getLocale, useDict, type Locale } from "@gml/ui/i18n";
import { en } from "./en";
import { zhHant, type LabText } from "./zh-Hant";

export type { LabText };
export { en, zhHant };

const dicts: Record<Locale, LabText> = { "zh-Hant": zhHant, en };

/** Page text for the current locale (React components). */
export function useText(): LabText {
  return useDict(dicts);
}

/** Page text for the current locale, for non-React modules. Reads the locale at call time. */
export function text(): LabText {
  return dicts[getLocale()];
}

/** Page text for a given locale (e.g. building default data for a chosen language). */
export function textFor(locale: Locale): LabText {
  return dicts[locale];
}
