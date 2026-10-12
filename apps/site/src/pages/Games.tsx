import { crossTools, gameById, gameText, games, statusLabel, toolText, type Game, type GameId, type GameTool } from '../content/games';
import { useSiteText } from '../i18n';
import { Arrow, PageIntro, toolHref } from './shared';

function GameCard({ game, index }: { game: Game; index: number }) {
  const t = useSiteText();
  const text = gameText(t, game);
  const deep = game.status === 'researching';
  return <a className={`game-card acc-${game.accent}${deep ? ' deepest' : ''}`} href={`#/games/${game.id}`}>
    <div className="card-meta"><span>{t.gamesPage.cardMeta(String(index + 1).padStart(2, '0'))}</span><span className={`pill ${deep ? 'available' : ''}`}>{statusLabel(t, game.status)}</span></div>
    <h3>{text.name}</h3>
    <p>{text.blurb}</p>
    <ul className="tag-row" aria-label={t.gamesPage.tagsLabel}>{text.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
    <span className="card-action">{deep ? t.gamesPage.enterDeep : t.gamesPage.enterOther} <Arrow/></span>
  </a>;
}

export function GameGrid() {
  return <div className="game-grid">{games.map((game, index) => <GameCard key={game.id} game={game} index={index}/>)}</div>;
}

export function CrossToolRow() {
  const t = useSiteText();
  return <div className="cross-row">{crossTools.map(tool => <a className="cross-card" key={tool.id} href={toolHref(tool.href!)}>
    <span className="category">{t.gamesPage.crossCategory}</span>{tool.zhOnly && t.gamesPage.toolZhOnly ? <span className="pill lang-note">{t.gamesPage.toolZhOnly}</span> : null}<strong>{toolText(t, null, tool).title}</strong><span>{toolText(t, null, tool).summary}</span><span className="card-action">{t.gamesPage.open} <Arrow/></span>
  </a>)}</div>;
}

export function GamesIndex() {
  const t = useSiteText();
  return <>
    <PageIntro eyebrow={t.gamesPage.indexEyebrow} title={t.gamesPage.indexTitle} text={t.gamesPage.indexText}/>
    <GameGrid/>
    <p className="page-foot">{t.gamesPage.indexFoot}</p>
  </>;
}

export function ToolCard({ tool, gameId }: { tool: GameTool; gameId: GameId | null }) {
  const t = useSiteText();
  const text = toolText(t, gameId, tool);
  const body = <><span className={`pill ${tool.status === 'available' ? 'available' : ''}`}>{tool.status === 'available' ? t.gamesPage.toolAvailable : t.gamesPage.toolPlanned}</span>{tool.zhOnly && t.gamesPage.toolZhOnly ? <span className="pill lang-note">{t.gamesPage.toolZhOnly}</span> : null}<h3>{text.title}</h3><p>{text.summary}</p></>;
  return tool.status === 'available' && tool.href
    ? <a className="tool-card" href={toolHref(tool.href)}>{body}<span className="card-action">{t.gamesPage.toolOpen} <Arrow/></span></a>
    : <div className="tool-card planned" aria-disabled="true">{body}<span className="card-action muted">{t.gamesPage.toolPlannedAction} <span aria-hidden="true">◷</span></span></div>;
}

export function GameHub({ id }: { id: string }) {
  const t = useSiteText();
  const game = gameById(id);
  if (!game) return <><PageIntro eyebrow="404" title={t.gamesPage.hubNotFoundTitle} text={t.gamesPage.hubNotFoundText}/><a className="button primary" href="#/games">{t.gamesPage.hubNotFoundLink}</a></>;
  const text = gameText(t, game);
  const tools = [...game.tools.filter(x => x.status === 'available'), ...game.tools.filter(x => x.status !== 'available')];
  return <div className={`hub acc-${game.accent}`}>
    <a className="crumb" href="#/games">{t.gamesPage.hubBack}</a>
    <PageIntro eyebrow={`${statusLabel(t, game.status)} / ${text.shortName}`} title={text.name} text={text.blurb}/>
    <div className="tool-grid">{tools.map(tool => <ToolCard key={tool.id} tool={tool} gameId={game.id}/>)}</div>
    <aside className="source-note" aria-label={t.gamesPage.hubSourceLabel}><h2>{t.gamesPage.hubSourceTitle}</h2><ul>{text.notes.map(n => <li key={n}>{n}</li>)}</ul></aside>
  </div>;
}
