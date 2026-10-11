import { useEffect, useMemo, useState } from 'react';
import { PageIntro } from './shared';

interface Row { id: string; name: string; subtitle?: string; available: boolean; reason?: string }
type Kind = 'ready' | 'pending' | 'missing';
type Filter = 'all' | Kind;

const kindOf = (r: Row): Kind => (r.available ? 'ready' : r.reason?.startsWith('機制模組已具備') ? 'pending' : 'missing');
const kindLabel: Record<Kind, string> = { ready: '已可開打', pending: '模組備妥・待整理', missing: '還缺規則模組' };
const cleanReason = (r: Row) => (r.reason ?? '').replace(/^尚未支援：/, '');

export default function Coverage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  // Dynamic import keeps the ~half-megabyte character data out of the home page bundle.
  useEffect(() => { let alive = true; import('../tools/battle/presets/hsr.generated.json').then(m => { if (alive) setRows((m.default as { presets: Row[] }).presets); }); return () => { alive = false; }; }, []);
  const counts = useMemo(() => {
    const c: Record<Kind, number> = { ready: 0, pending: 0, missing: 0 };
    rows?.forEach(r => { c[kindOf(r)]++; });
    return c;
  }, [rows]);
  const shown = useMemo(() => (rows ?? []).filter(r => (filter === 'all' || kindOf(r) === filter) && (!query.trim() || `${r.name}${r.subtitle ?? ''}`.includes(query.trim()))), [rows, filter, query]);
  const tabs: [Filter, string, number][] = [['all', '全部', rows?.length ?? 0], ['ready', kindLabel.ready, counts.ready], ['pending', kindLabel.pending, counts.pending], ['missing', kindLabel.missing, counts.missing]];
  return <div className="coverage acc-cyan">
    <a className="crumb" href="#/games/hsr">← 星穹鐵道</a>
    <PageIntro eyebrow="HSR / 角色機制拆解進度" title="星穹鐵道：角色拆到哪了？" text="每位角色的獨特機制，都要先拆成通用的規則模組，戰鬥研究室才跑得動。這裡列出目前的進度。"/>
    <div className="explain prose"><p>做法是這樣：不為每位角色寫一份專屬程式，而是把「隨機目標」「額外回合」「層數轉移」這類機制拆成可重複使用的規則模組。某位角色需要的模組都備齊了，才能整理成角色資料放進研究室；缺模組的角色，下面會列出還缺哪幾塊。模組越齊全，能開打的角色就越多。想看實際效果，直接去<a className="inline-link" href="./hsr/battle/index.html">戰鬥研究室</a>。</p></div>
    {rows === null ? <p className="loading" role="status">載入角色清單中……</p> : <>
      <div className="stat-row" role="group" aria-label="進度統計">
        <div className="stat ready"><strong>{counts.ready}</strong><span>已可開打</span></div>
        <div className="stat"><strong>{counts.pending}</strong><span>模組備妥・待整理</span></div>
        <div className="stat"><strong>{counts.missing}</strong><span>還缺規則模組</span></div>
        <div className="stat total"><strong>{rows.length}</strong><span>角色總數</span></div>
      </div>
      <div className="filter-bar">
        <div className="filter-tabs" role="group" aria-label="依狀態篩選">{tabs.map(([key, label, n]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <small>{n}</small></button>)}</div>
        <label className="search"><span className="sr-only">依名稱搜尋</span><input type="search" placeholder="搜尋角色名稱" value={query} onChange={e => setQuery(e.target.value)}/></label>
      </div>
      <p className="result-count" role="status">顯示 {shown.length} / {rows.length} 位</p>
      <ul className="char-list">{shown.map(r => { const k = kindOf(r); return <li key={r.id} className={`char ${k}`}>
        <div className="char-head"><strong>{r.name}</strong>{r.subtitle && <span className="char-sub">{r.subtitle}</span>}<span className={`pill ${k === 'ready' ? 'available' : ''}`}>{kindLabel[k]}</span></div>
        {k === 'missing' && <p className="char-reason">還缺：{cleanReason(r)}</p>}
        {k === 'pending' && <p className="char-reason">{r.reason}</p>}
      </li>; })}</ul>
      {shown.length === 0 && <p className="loading">沒有符合的角色。</p>}
      <p className="page-foot">角色資料為未核實的社群整理，著作權屬 HoYoverse；本站為非官方研究計畫。</p>
    </>}
  </div>;
}
