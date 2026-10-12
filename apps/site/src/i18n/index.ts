import { useDict } from '@gml/ui/i18n';
import { en } from './en';
import { zhHant, type SiteText } from './zh-Hant';

export type { SiteText };
export { en, zhHant };

/** UI text for the current locale. */
export function useSiteText(): SiteText {
  return useDict({ 'zh-Hant': zhHant, en });
}
