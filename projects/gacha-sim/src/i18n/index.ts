import { getLocale, type Locale } from '@gml/ui/i18n';
import { en } from './en';
import { zhHant } from './zh-Hant';

export { en, zhHant };
export type TextKey = keyof typeof zhHant;
const format = (template: string, values: unknown[]) => template.replace(/\{(\d+)\}/g, (_, i: string) => String(values[Number(i)] ?? ''));

/** Stable source labels for stored rule data. Locale changes never rewrite rules or item IDs. */
export const sourceText = (key: TextKey, ...values: unknown[]) => format(zhHant[key], values);
export const tr = (key: TextKey, ...values: unknown[]) => format(getLocale() === 'en' ? en[key] : zhHant[key], values.map(v => typeof v === 'string' ? displayText(v) : v));

const exact = new Map<string, TextKey>(Object.entries(zhHant).map(([key, value]) => [value, key as TextKey]));
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = Object.entries(zhHant).filter(([, value]) => /\{\d+\}/.test(value)).map(([key, value]) => {
  const slots: number[] = [];
  const parts = value.split(/(\{\d+\})/).map(part => {
    const slot = /^\{(\d+)\}$/.exec(part);
    if (!slot) return escapeRegex(part);
    slots.push(Number(slot[1]));
    return '([\\s\\S]*?)';
  });
  return { key: key as TextKey, pattern: new RegExp(`^${parts.join('')}$`), slots, length: value.length };
}).sort((a, b) => b.length - a.length);
const prefixes = [...exact.keys()].filter(value => value.length > 20 && !/\{\d+\}/.test(value)).sort((a,b) => b.length - a.length);

/** Translate built-in data and validator messages at display time. Unknown user-authored names stay intact. */
export function displayText(value: string | undefined, locale: Locale = getLocale()): string {
  if (!value) return value ?? '';
  if (locale !== 'en') return value;
  const key = exact.get(value);
  if (key) return en[key];
  for (const prefix of prefixes) if (value.startsWith(`${prefix} `)) return `${displayText(prefix, locale)} ${displayText(value.slice(prefix.length + 1), locale)}`;
  for (const template of templates) {
    const match = template.pattern.exec(value);
    if (!match) continue;
    const values: string[] = [];
    template.slots.forEach((slot, i) => { values[slot] = displayText(match[i + 1], locale); });
    return format(en[template.key], values);
  }
  // Catalog titles, generic A/B choices and concatenated source notes retain their structure.
  if (value.includes('・')) return value.split('・').map(part => displayText(part, locale)).join(' · ');
  if (/ [AB]$/.test(value)) return `${displayText(value.slice(0, -2), locale)}${value.slice(-2)}`;
  if (value.startsWith('UP ')) return `Rate-up ${displayText(value.slice(3), locale)}`;
  return value;
}
