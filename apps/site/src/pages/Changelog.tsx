import type { ReactNode } from 'react';
import { PageIntro } from './shared';

export interface ChangelogGroup { heading?: string; items: ReactNode[] }
export interface ChangelogEntry { date: string; title?: string; groups: ChangelogGroup[] }

/** Changelog layout shared by the per-locale pages in ../content/pages/Changelog.*.tsx (newest entry first). */
export function ChangelogView({ eyebrow, title, text, entries }: { eyebrow: string; title: string; text: string; entries: ChangelogEntry[] }) {
  return <><PageIntro eyebrow={eyebrow} title={title} text={text}/><div className="prose changelog">{entries.map(entry => <section key={entry.date} aria-labelledby={`changelog-${entry.date}`}>
    <h2 id={`changelog-${entry.date}`}><time dateTime={entry.date}>{entry.date}</time>{entry.title && <span>{entry.title}</span>}</h2>
    {entry.groups.map((group, i) => <div key={group.heading ?? i}>{group.heading && <h3>{group.heading}</h3>}<ul>{group.items.map((item, j) => <li key={j}>{item}</li>)}</ul></div>)}
  </section>)}</div></>;
}
