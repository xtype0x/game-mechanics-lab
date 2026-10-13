import { Arrow, PageIntro } from '../../pages/shared';

const projectStory = [
  '玩遊戲時，我常常會想：這個玩法為什麼讓人想再試一次？一條看似簡單的規則，又是怎麼影響選擇、節奏與手感的？這些遊玩時冒出的疑問，是這個計畫的起點。',
  '我希望透過研究已發行遊戲與常見的遊戲機制，把直覺上的感受整理成能討論、能嘗試的想法。讓這些觀察成為自己的創作養分，也為其他遊戲愛好者帶來一些靈感。',
  '我選擇從《崩壞：星穹鐵道》開始，因為它是當下熱門的遊戲之一，機制也相對單純，適合作為拆解規則與理解設計的起點。',
  '此外，因為自己喜歡動作遊戲，我也開始研究閃避與格擋機制，探索判定時機與操作規則如何影響遊玩的手感。',
  '有些疑問適合用筆記梳理，有些則需要動手試試。我會用模擬或試玩比較不同假設，看看「如果換一種做法，會發生什麼？」；再把過程中的發現與還沒想清楚的問題記錄下來。',
  '這是持續累積中的個人研究計畫。無論你喜歡玩遊戲、研究設計，或正在醞釀自己的作品，都希望你能在這裡找到值得追問的問題，或帶走一個想試試看的點子。',
];

export default function About() {
  return <><PageIntro eyebrow="ABOUT THE PROJECT / 計畫的起點" title="從好奇，走向新的點子。" text="研究已發行遊戲與常見遊戲機制，為自己與其他遊戲愛好者累積創作靈感。"/><div className="about-layout"><aside className="about-marginal"><span>PLAYER'S NOTE</span><strong>保持好奇。<br/>試著動手。<br/>讓點子發芽。</strong><small>給喜歡遊戲，<br/>也對玩法好奇的你。</small></aside><article className="prose project-story"><h2>為什麼做這個計畫？</h2>{projectStory.map(paragraph => <p key={paragraph}>{paragraph}</p>)}<blockquote>從熟悉的玩法裡，<br/>找到下一個想試的點子。</blockquote><h2>研究會怎麼整理？</h2><p>已發行遊戲研究按作品整理機制、資料來源與目前的研究進度；機制實驗則聚焦常見規則與跨遊戲的問題，透過調整與比較繼續探索。</p><p>筆記會區分已知規則、推估與待驗證的部分。模擬與試玩也會說明假設、簡化與適用範圍，讓每個發現都有脈絡可循。</p><a className="button primary" href="#/games">看看已發行遊戲研究 <Arrow/></a></article></div></>;
}
