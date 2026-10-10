import type { ExperimentManifest } from '../domain/contracts';

export const experiments: ExperimentManifest[] = [
  { id: 'gacha', title: '自己的卡池，自己調', category: '給喜歡抽卡的你', status: 'planned', summary: '保底、UP 與機率都可以調。想看看你理想中的卡池會怎麼跑？' },
  { id: 'battle', title: '速度快一點，會怎樣？', category: '給愛研究戰鬥的你', status: 'planned', summary: '誰先出手、什麼時候能多動一次？戰鬥中的敵方互動也能拿來試。' },
];
