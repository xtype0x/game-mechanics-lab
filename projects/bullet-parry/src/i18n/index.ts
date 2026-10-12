import { getLocale, useDict, type Locale } from "@gml/ui/i18n";
import { en } from "./en";
import { zhHant, type BulletText } from "./zh-Hant";

export type { BulletText };
export { en, zhHant };

const dicts: Record<Locale, BulletText> = { "zh-Hant": zhHant, en };

/** Page text for the current locale (React components). */
export function useText(): BulletText {
  return useDict(dicts);
}

/** Page text for the current locale, for non-React modules. Reads the locale at call time. */
export function text(): BulletText {
  return dicts[getLocale()];
}

/** Page text for a given locale (e.g. building default data for a chosen language). */
export function textFor(locale: Locale): BulletText {
  return dicts[locale];
}
