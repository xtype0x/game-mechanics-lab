import { useDict, getLocale } from "../../i18n";
import { timingEn } from "./en";
import { timingZhHant, type TimingText } from "./zh-Hant";

export type { TimingText };
export { timingEn, timingZhHant };

const dicts = { "zh-Hant": timingZhHant, en: timingEn };

/** Timing UI text for the current locale (React components; re-renders when the language changes). */
export function useTimingText(): TimingText {
  return useDict(dicts);
}

/** Same text for non-React code (helpers, thrown error messages). Reads the locale at call time. */
export function timingText(): TimingText {
  return dicts[getLocale()];
}
