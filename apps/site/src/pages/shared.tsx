export function Arrow() { return <span aria-hidden="true">↗</span>; }
export function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="page-intro"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{text}</p></div>;
}
/** Hash routes (`#/...`) stay in-page; everything else is a page path relative to the site root. */
export const toolHref = (href: string) => (href.startsWith('#') ? href : `./${href}`);
