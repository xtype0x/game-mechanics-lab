import { useEffect, useMemo, useState } from 'react';
import { useSiteText } from '../i18n';
import { PageIntro } from './shared';

interface Row { id: string; name: string; subtitle?: string; available: boolean; reason?: string }
type Kind = 'ready' | 'pending' | 'missing';
type Filter = 'all' | Kind;

const kindOf = (r: Row): Kind => (r.available ? 'ready' : r.reason?.startsWith('機制模組已具備') ? 'pending' : 'missing'); // i18n-ignore: matches data text
const cleanReason = (r: Row) => (r.reason ?? '').replace(/^尚未支援：/, ''); // i18n-ignore: matches data text

export default function Coverage() {
  const t = useSiteText();
  const kindLabel = t.coverage.kind;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  // Dynamic import keeps the ~half-megabyte character data out of the home page bundle.
  useEffect(() => { let alive = true; import('@gml/data-hsr/generated/presets.generated.json').then(m => { if (alive) setRows((m.default as { presets: Row[] }).presets); }); return () => { alive = false; }; }, []);
  const counts = useMemo(() => {
    const c: Record<Kind, number> = { ready: 0, pending: 0, missing: 0 };
    rows?.forEach(r => { c[kindOf(r)]++; });
    return c;
  }, [rows]);
  const shown = useMemo(() => (rows ?? []).filter(r => (filter === 'all' || kindOf(r) === filter) && (!query.trim() || `${r.name}${r.subtitle ?? ''}`.includes(query.trim()))), [rows, filter, query]);
  const tabs: [Filter, string, number][] = [['all', t.coverage.all, rows?.length ?? 0], ['ready', kindLabel.ready, counts.ready], ['pending', kindLabel.pending, counts.pending], ['missing', kindLabel.missing, counts.missing]];
  return <div className="coverage acc-cyan">
    <a className="crumb" href="#/games/hsr">{t.coverage.crumb}</a>
    <PageIntro eyebrow={t.coverage.eyebrow} title={t.coverage.title} text={t.coverage.text}/>
    <div className="explain prose"><p>{t.coverage.explain}</p></div>
    {rows === null ? <p className="loading" role="status">{t.coverage.loadingList}</p> : <>
      <div className="stat-row" role="group" aria-label={t.coverage.statsLabel}>
        <div className="stat ready"><strong>{counts.ready}</strong><span>{kindLabel.ready}</span></div>
        <div className="stat"><strong>{counts.pending}</strong><span>{kindLabel.pending}</span></div>
        <div className="stat"><strong>{counts.missing}</strong><span>{kindLabel.missing}</span></div>
        <div className="stat total"><strong>{rows.length}</strong><span>{t.coverage.total}</span></div>
      </div>
      <div className="filter-bar">
        <div className="filter-tabs" role="group" aria-label={t.coverage.filterLabel}>{tabs.map(([key, label, n]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <small>{n}</small></button>)}</div>
        <label className="search"><span className="sr-only">{t.coverage.searchLabel}</span><input type="search" placeholder={t.coverage.searchPlaceholder} value={query} onChange={e => setQuery(e.target.value)}/></label>
      </div>
      <p className="result-count" role="status">{t.coverage.shownCount(shown.length, rows.length)}</p>
      <ul className="char-list">{shown.map(r => { const k = kindOf(r); return <li key={r.id} className={`char ${k}`}>
        <div className="char-head"><strong>{r.name}</strong>{r.subtitle && <span className="char-sub">{r.subtitle}</span>}<span className={`pill ${k === 'ready' ? 'available' : ''}`}>{kindLabel[k]}</span></div>
        {k === 'missing' && <p className="char-reason">{t.coverage.missingPrefix}{cleanReason(r)}</p>}
        {k === 'pending' && <p className="char-reason">{r.reason}</p>}
      </li>; })}</ul>
      {shown.length === 0 && <p className="loading">{t.coverage.noMatch}</p>}
      <p className="page-foot">{t.coverage.foot}</p>
    </>}
  </div>;
}
