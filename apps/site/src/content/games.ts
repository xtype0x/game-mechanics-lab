/**
 * Games the lab covers. To add a game: append an entry (order = how much research exists, then popularity).
 * `id` matches the gacha simulator catalog (projects/gacha-sim/src/catalog/games.ts) so `gacha/index.html?game=<id>` works.
 * Tool hrefs are relative to the site root (index.html); routes starting with `#` are in-page hash routes.
 */
export type GameStatus = 'researching' | 'gachaOnly' | 'planned';
export type Accent = 'cyan' | 'gold' | 'violet' | 'rose' | 'green' | 'sky';

export interface GameTool {
  id: string;
  title: string;
  summary: string;
  /** Omitted while the tool is only planned. */
  href?: string;
  status: 'available' | 'planned';
}

export interface Game {
  id: string;
  name: string;
  shortName: string;
  status: GameStatus;
  blurb: string;
  /** Short chips on the home card, e.g. 戰鬥機制・配裝・抽卡. */
  tags: string[];
  accent: Accent;
  tools: GameTool[];
  /** Data-source / disclaimer lines shown on the hub page. */
  notes: string[];
}

export const statusLabel: Record<GameStatus, string> = { researching: '深入研究中', gachaOnly: '抽卡模擬', planned: '排隊中' };

const gachaTool = (id: string, name: string): GameTool => ({
  id: 'gacha', title: '抽卡模擬', status: 'available', href: `gacha/index.html?game=${id}`,
  summary: `${name}的卡池規則已內建：保底、機率、花費一次算清楚，也能自己改規則再試一遍。`,
});
const notOfficial = (company: string) => `本站是玩家自製的非官方研究計畫，與遊戲營運方無關；遊戲名稱與內容著作權屬於 ${company}。`;
const GACHA_NOTE = '抽卡規則依官方公開說明與玩家社群統計整理；軟保底等官方未公布的部分是推估值，數字僅供模擬。';

export const games: Game[] = [
  {
    id: 'hsr', name: '崩壞：星穹鐵道', shortName: '星穹鐵道', status: 'researching', accent: 'cyan',
    tags: ['戰鬥機制', '配裝', '抽卡'],
    blurb: '目前研究得最深的一款：把角色技能拆成一塊塊通用規則模組，再拿來排行動順序、批量模擬勝率，甚至親手打一場。',
    tools: [
      { id: 'battle', title: '戰鬥研究室', status: 'available', href: 'hsr/battle/index.html', summary: '換隊伍、改配裝（光錐＋遺器）、挑敵人，預覽誰先出手、批量模擬勝率，最後親手打一場動畫戰鬥。' },
      gachaTool('hsr', '星穹鐵道'),
      { id: 'coverage', title: '角色機制拆解進度', status: 'available', href: '#/games/hsr/coverage', summary: '98 位角色裡，有幾位已經能在研究室裡開打？還缺哪些規則模組？進度攤開來給你看。' },
      { id: 'conditional', title: '光錐與遺器的條件效果', status: 'planned', summary: '目前配裝只套用「無條件」的數值，「暴擊後加傷」這類條件效果還在排隊。' },
      { id: 'eidolon', title: '星魂', status: 'planned', summary: '命座加成還沒納入角色資料，之後會跟著機制模組一起補上。' },
    ],
    notes: [
      notOfficial('HoYoverse（米哈遊）'),
      '角色、敵人與裝備資料來自社群整理（StarRailRes、KQM 等），未經官方核實，不保證與正式服相符；敵人技能倍率與 AI 多為標示【佔位】的估計值。',
      GACHA_NOTE + '目前卡池內容即時取自公開活動日曆（api.ennead.cc）。',
    ],
  },
];

export const gameById = (id: string) => games.find(g => g.id === id);

/** Cross-game tools (not tied to one game). */
export const crossTools: GameTool[] = [
  { id: 'gacha', title: '抽卡模擬器', status: 'available', href: 'gacha/index.html', summary: '調整保底、限定與天井規則，精確算出抽數分布、花費與機率。內建近期卡池資料，也能自己設定一套卡池。' },
  { id: 'timing-lab', title: '格擋閃避判定研究室', status: 'available', href: 'timing-lab/index.html', summary: '精準格擋、精準閃避到底差幾幀？調整判定窗、防連打與獎勵，逐幀播放並看每次按鍵被怎麼判定，還能自訂新的互動。' },
  { id: 'bullet-parry', title: '子彈格擋試玩', status: 'available', href: 'bullet-parry/index.html', summary: '2D 小遊戲：格擋、閃避、無敵技能撐過越來越刁鑽的彈幕。判定參數可調，也能換上自己的圖片。' },
];
