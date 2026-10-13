/**
 * Games the lab covers. To add a game: append an entry (order = how much research exists, then popularity)
 * and add its text (name, blurb, tags, notes, tool titles/summaries) under `games.<id>` in src/i18n/*.
 * `id` matches the gacha simulator catalog (projects/gacha-sim/src/catalog/games.ts) so `gacha/index.html?game=<id>` works.
 * Tool hrefs are relative to the site root (index.html); routes starting with `#` are in-page hash routes.
 */
import type { SiteText } from '../i18n';

export type GameStatus = 'researching' | 'gachaOnly' | 'planned';
export type Accent = 'cyan' | 'gold' | 'violet' | 'rose' | 'green' | 'sky';

export type GameId = keyof SiteText['games'];
export type GameToolId<G extends GameId> = keyof SiteText['games'][G]['tools'];
export type CrossToolId = keyof SiteText['crossTools'];

export interface GameTool<Id extends string = string> {
  id: Id;
  /** Omitted while the tool is only planned. */
  href?: string;
  status: 'available' | 'planned';
  /** The tool's own interface is still Chinese only (English site shows a notice). Remove once it is translated. */
  zhOnly?: true;
}

export interface Game {
  id: GameId;
  status: GameStatus;
  accent: Accent;
  tools: GameTool[];
}

const gachaTool = (id: GameId): GameTool<'gacha'> => ({ id: 'gacha', status: 'available', href: `gacha/index.html?game=${id}` });

const hsrTools: GameTool<GameToolId<'hsr'>>[] = [
  { id: 'battle', status: 'available', href: 'hsr/battle/index.html', zhOnly: true },
  gachaTool('hsr'),
  { id: 'coverage', status: 'available', href: '#/games/hsr/coverage' },
  { id: 'conditional', status: 'planned' },
  { id: 'eidolon', status: 'planned' },
];

export const games: Game[] = [
  { id: 'hsr', status: 'researching', accent: 'cyan', tools: hsrTools },
];

export const gameById = (id: string) => games.find(g => g.id === id);

/** Cross-game tools (not tied to one game). */
export const crossTools: GameTool<CrossToolId>[] = [
  { id: 'gacha', status: 'available', href: 'gacha/index.html' },
  { id: 'timing-lab', status: 'available', href: 'timing-lab/index.html' },
];

interface ToolText { title: string; summary: string }
interface GameText { name: string; shortName: string; blurb: string; tags: string[]; notes: string[] }

/** Display text of a game. */
export const gameText = (t: SiteText, game: Game): GameText => t.games[game.id];

/** Display text of a tool; `gameId` null means a cross-game tool. */
export const toolText = (t: SiteText, gameId: GameId | null, tool: GameTool): ToolText => {
  const table: Record<string, ToolText> = gameId ? t.games[gameId].tools : t.crossTools;
  return table[tool.id];
};

export const statusLabel = (t: SiteText, status: GameStatus) => t.status[status];
