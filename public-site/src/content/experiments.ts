import type { ExperimentManifest } from '../domain/contracts';

export const experiments: ExperimentManifest[] = [
  { id: 'gacha', title: '自己的卡池，自己調', category: '給喜歡抽卡的你', status: 'preview', summary: '保底、UP 與機率都可以調。想看看你理想中的卡池會怎麼跑？', route: '/lab' },
  { id: 'battle', title: '星穹鐵道，拆開來研究', category: '給研究星穹鐵道的你', status: 'preview', summary: '角色、光錐、遺器、敵人都能調整：誰先出手、配裝差多少、勝率又會怎麼變？', route: '/lab' },
];
