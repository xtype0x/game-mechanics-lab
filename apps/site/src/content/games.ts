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
  {
    id: 'genshin', name: '原神', shortName: '原神', status: 'gachaOnly', accent: 'gold', tags: ['抽卡'],
    blurb: '角色與武器活動祈願的保底、捉住五星 UP 的機率，還有定軌，一次幫你算清楚。',
    tools: [gachaTool('genshin', '原神')],
    notes: [notOfficial('HoYoverse（米哈遊）'), GACHA_NOTE + '卡池內容取自公開活動日曆（api.ennead.cc）。'],
  },
  {
    id: 'zzz', name: '絕區零', shortName: '絕區零', status: 'gachaOnly', accent: 'rose', tags: ['抽卡'],
    blurb: '獨家頻段與音擎頻段的保底差很多，要先抽誰比較划算？模擬看看。',
    tools: [gachaTool('zzz', '絕區零')],
    notes: [notOfficial('HoYoverse（米哈遊）'), GACHA_NOTE + '卡池內容取自公開活動日曆（api.ennead.cc）。'],
  },
  {
    id: 'ba', name: '蔚藍檔案', shortName: '蔚藍檔案', status: 'gachaOnly', accent: 'sky', tags: ['抽卡'],
    blurb: '十連保底、日服累計保底與國際服天井兌換，兩套規則並排比較。',
    tools: [gachaTool('ba', '蔚藍檔案')],
    notes: [notOfficial('NEXON Games／Yostar'), GACHA_NOTE + '卡池內容取自 SchaleDB 公開資料，可能比遊戲晚更新。'],
  },
  {
    id: 'wuwa', name: '鳴潮', shortName: '鳴潮', status: 'gachaOnly', accent: 'violet', tags: ['抽卡'],
    blurb: '角色、武器活動喚取各自獨立保底，拿來算算預算最剛好。',
    tools: [gachaTool('wuwa', '鳴潮')],
    notes: [notOfficial('庫洛遊戲（Kuro Games）'), GACHA_NOTE + '目前找不到可直接讀取的公開卡池資料，卡池內容為手動整理，可能比遊戲晚更新。'],
  },
  {
    id: 'endfield', name: '明日方舟：終末地', shortName: '終末地', status: 'gachaOnly', accent: 'green', tags: ['抽卡'],
    blurb: '特許尋訪的保底與兌換規則，抽之前先模擬一下心裡有底。',
    tools: [gachaTool('endfield', '終末地')],
    notes: [notOfficial('鷹角網路（Hypergryph）'), GACHA_NOTE + '卡池內容為手動整理，可能比遊戲晚更新；範例儲值方案不適用此遊戲的貨幣價格。'],
  },
  {
    id: 'nte', name: '異環', shortName: '異環', status: 'gachaOnly', accent: 'gold', tags: ['抽卡'],
    blurb: '新作的抽卡規則先收進來，之後有更多公開資訊再校正。',
    tools: [gachaTool('nte', '異環')],
    notes: [notOfficial('Hotta Studio／完美世界（Perfect World）'), GACHA_NOTE + '卡池內容為手動整理，規則可能隨公開資訊更新而調整。'],
  },
];

export const gameById = (id: string) => games.find(g => g.id === id);

/** Cross-game tools (not tied to one game). */
export const crossTools: GameTool[] = [
  { id: 'gacha', title: '抽卡模擬器', status: 'available', href: 'gacha/index.html', summary: '調整保底、限定與天井規則，精確算出抽數分布、花費與機率。內建近期卡池資料，也能自己設定一套卡池。' },
];
