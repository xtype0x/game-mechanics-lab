import { crossTools, gameById, games, statusLabel, type Game, type GameTool } from '../content/games';
import { Arrow, PageIntro, toolHref } from './shared';

function GameCard({ game, index }: { game: Game; index: number }) {
  const deep = game.status === 'researching';
  return <a className={`game-card acc-${game.accent}${deep ? ' deepest' : ''}`} href={`#/games/${game.id}`}>
    <div className="card-meta"><span>GAME {String(index + 1).padStart(2, '0')}</span><span className={`pill ${deep ? 'available' : ''}`}>{statusLabel[game.status]}</span></div>
    <h3>{game.name}</h3>
    <p>{game.blurb}</p>
    <ul className="tag-row" aria-label="可用的研究工具">{game.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
    <span className="card-action">{deep ? '進入研究基地' : '看看有什麼'} <Arrow/></span>
  </a>;
}

export function GameGrid() {
  return <div className="game-grid">{games.map((game, index) => <GameCard key={game.id} game={game} index={index}/>)}</div>;
}

export function CrossToolRow() {
  return <div className="cross-row">{crossTools.map(tool => <a className="cross-card" key={tool.id} href={toolHref(tool.href!)}>
    <span className="category">跨遊戲工具</span><strong>{tool.title}</strong><span>{tool.summary}</span><span className="card-action">開啟 <Arrow/></span>
  </a>)}</div>;
}

export function GamesIndex() {
  return <>
    <PageIntro eyebrow="ALL GAMES / 遊戲一覽" title="選一款遊戲開始研究。" text="排在越前面，研究得越深。其他遊戲先從抽卡規則做起，之後再慢慢往機制深處挖。"/>
    <GameGrid/>
    <p className="page-foot">想看的遊戲不在名單？目前依熱門程度與資料取得難度排隊，之後會陸續擴充。</p>
  </>;
}

function ToolCard({ tool }: { tool: GameTool }) {
  const body = <><span className={`pill ${tool.status === 'available' ? 'available' : ''}`}>{tool.status === 'available' ? '可以玩囉' : '研究中'}</span><h3>{tool.title}</h3><p>{tool.summary}</p></>;
  return tool.status === 'available' && tool.href
    ? <a className="tool-card" href={toolHref(tool.href)}>{body}<span className="card-action">打開 <Arrow/></span></a>
    : <div className="tool-card planned" aria-disabled="true">{body}<span className="card-action muted">整理中，敬請期待 <span aria-hidden="true">◷</span></span></div>;
}

export function GameHub({ id }: { id: string }) {
  const game = gameById(id);
  if (!game) return <><PageIntro eyebrow="404" title="這款遊戲還沒收錄！" text="先看看目前有哪些遊戲吧。"/><a className="button primary" href="#/games">遊戲一覽 →</a></>;
  const tools = [...game.tools.filter(t => t.status === 'available'), ...game.tools.filter(t => t.status !== 'available')];
  return <div className={`hub acc-${game.accent}`}>
    <a className="crumb" href="#/games">← 遊戲一覽</a>
    <PageIntro eyebrow={`${statusLabel[game.status]} / ${game.shortName}`} title={game.name} text={game.blurb}/>
    <div className="tool-grid">{tools.map(tool => <ToolCard key={tool.id} tool={tool}/>)}</div>
    <aside className="source-note" aria-label="資料來源與免責聲明"><h2>資料來源與聲明</h2><ul>{game.notes.map(n => <li key={n}>{n}</li>)}</ul></aside>
  </div>;
}
