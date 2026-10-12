import { Arrow, PageIntro } from '../../pages/shared';

const projectStory = [
  '看著中國大陸的二次元遊戲逐漸受到世界關注，我也一直在想：台灣有這麼多熱愛遊戲、願意為喜歡的作品投入時間與金錢的人，我們還能一起做出什麼？',
  '每次看到「台灣只會做博弈遊戲」這樣的評論，我都覺得不甘心。那份不甘心，也成了我開始這個計畫的動力。',
  '我想先從自己能做的事情開始：蒐集熱門服務型遊戲的機制，把規則拆開、整理，再做成可以自由調整的模擬工具。讓「如果這個機制改一點，會怎麼樣？」有機會被實際試出來。',
  '這個計畫從台灣出發，也向世界各地的朋友開放。無論你來自哪裡，只要喜歡遊戲、對遊戲怎麼運作感到好奇，都歡迎一起玩、一起研究、一起創作。',
  '作為玩家，我最期待的事情很單純：有更多值得期待的作品，也有更多從沒玩過的玩法。',
];

export default function About() {
  return <><PageIntro eyebrow="ABOUT THE PROJECT / 計畫的起點" title="遊戲還可以有更多玩法。" text="遊戲機制研究室（game-mechanics-lab），一個從台灣出發、研究熱門遊戲機制的個人計畫。"/><div className="about-layout"><aside className="about-marginal"><span>PLAYER'S NOTE</span><strong>保持好奇。<br/>試著動手。<br/>讓點子發芽。</strong><small>給喜歡玩遊戲，<br/>也喜歡做遊戲的你。</small></aside><article className="prose project-story"><h2>為什麼做這個計畫？</h2>{projectStory.map(paragraph => <p key={paragraph}>{paragraph}</p>)}<blockquote>有更多值得期待的作品，<br/>也有更多從沒玩過的玩法。</blockquote><h2>工具會怎麼做？</h2><p>每個工具都會說明適用範圍與限制。工具裡的數值是模擬用的假設，不代表任何特定遊戲的官方設定。</p><a className="button primary" href="#/games">進來玩玩規則 <Arrow/></a></article></div></>;
}
