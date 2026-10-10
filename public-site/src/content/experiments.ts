import type { ExperimentManifest } from '../domain/contracts';

export const experiments: ExperimentManifest[] = [
  { id: 'damage-preview', title: '暴擊多一點，差多少？', category: '給想配裝的你', status: 'preview', summary: '拖拖暴擊率，看看平均傷害怎麼變。先用一個小範例，玩懂數字的關係。', route: '/lab/damage-preview', ruleVersion: 'illustration-1' },
  { id: 'gacha', title: '自己的卡池，自己調', category: '給喜歡抽卡的你', status: 'planned', summary: '如果抽卡規則由你決定，會想怎麼設定？可調規則的模擬器正在製作中。' },
  { id: 'action-order', title: '速度快一點，會怎樣？', category: '給愛研究戰鬥的你', status: 'planned', summary: '想看看誰先出手、什麼時候能多動一次？準備把行動順序工具搬來給大家玩。' },
];
