import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { experiments } from './content/experiments';
import { projectStory } from './content/project';
import heroImage from './assets/gacha-keyvisual-v4.png';
import './styles.css';

const pages: Record<string, string> = {
  '/': '首頁', '/lab': '工具遊樂場', '/about': '關於計畫', '/privacy': '資料與使用說明',
};
function Gamepad() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 19h24c8 0 12 7 14 22 1 8-4 12-10 7l-7-6H23l-7 6C10 53 5 49 6 41c2-15 6-22 14-22Z"/><path d="M21 26v12m-6-6h12" className="pad-lines"/><circle cx="43" cy="28" r="3" className="pad-dot"/><circle cx="49" cy="35" r="3" className="pad-dot"/></svg>;
}
function Logo() {
  return <a className="logo" href="#/" aria-label="gacha-game-tool 首頁"><span className="logo-icon"><Gamepad/></span><span>gacha-game-tool<small>個人遊戲機制工具計畫</small></span></a>;
}
function Arrow() { return <span aria-hidden="true">↗</span>; }
function ExperimentCards() {
  return <div className="experiment-grid">{experiments.map((experiment, index) => <article className={`experiment-card card-${index}`} key={experiment.id}>
    <div className="card-meta"><span>工具 0{index + 1}</span><span className={`pill ${experiment.status === 'preview' ? 'available' : ''}`}>{experiment.status === 'preview' ? '可以玩囉' : '製作中'}</span></div>
    <div className="card-art" aria-hidden="true">{index === 0 ? <div className="pack-art"><i/><i/><i/><span>✦</span></div> : <div className="race-art"><span>SPD</span><div><i/><i/><i/></div></div>}</div>
    <span className="category">{experiment.category}</span><h3>{experiment.title}</h3><p>{experiment.summary}</p>
    {experiment.route ? <a className="card-action" href={`#${experiment.route}`}>來玩一下 <Arrow/></a> : <span className="card-action muted">整理中，敬請期待 <span aria-hidden="true">◷</span></span>}
  </article>)}</div>;
}
function Home() {
  return <>
    <section className="launch-hero" aria-labelledby="launch-title">
      <img className="launch-art" src={heroImage} alt="AI 生成的原創星際旅途插畫：玩家與開發者帶著筆記本、手把及骰子研究夥伴，在星空列車旁探索遊戲規則。" fetchPriority="high"/>
      <div className="launch-shade" aria-hidden="true"/>
      <p className="hero-image-credit">主視覺 · AI 生成圖像</p>
      <div className="hero-coordinate" aria-hidden="true">GGT / PARAMETER WORLD <span>REWRITE THE RULES</span></div>
      <div className="launch-copy">
        <div className="eyebrow launch-eyebrow"><span/> 個人開發中 · 持續整理工具</div>
        <p className="launch-prelude">抽卡的命運，原來可以自己調。</p>
        <h1 id="launch-title">大膽改寫<br/>世界的<span>參數。</span></h1>
        <p className="launch-tagline">抽卡機率與戰鬥順序，都能拿來實驗。</p>
        <p className="launch-description">把熱門遊戲的機制做成能調整、能模擬的工具。<br className="desktop-break"/>給好奇的玩家，也給想做出下一種玩法的開發者。</p>
        <div className="hero-actions"><a className="button primary" href="#/lab">看看工具 <Arrow/></a><a className="text-link" href="#/about">這到底是什麼計畫？ <span>→</span></a></div>
        <p className="launch-fineprint">不需要註冊，打開就能玩。</p>
      </div>
      <div className="hero-aside"><span>MISSION / 001</span><strong>世界等你拯救。<br/>公式等你驗算。</strong><small>原創視覺・二遊官網語彙致敬</small></div>
      <div className="hero-bottom"><span>FROM TAIWAN · OPEN TO EVERYONE</span><a href="#/lab">探索工具 <span aria-hidden="true">↓</span></a><span className="hero-bottom-note">開發規模：一個人。好奇心：未設上限。</span></div>
    </section>
    <div className="launch-strip"><span className="strip-cross" aria-hidden="true">✦</span><strong>本計畫的稀有資源：你的好奇心。</strong><span>玩家 × 開發者 × 各種還沒試過的玩法</span></div>
    <section className="section"><div className="section-header"><div><div className="eyebrow">SELECT YOUR EXPERIMENT / 工具遊樂場</div><h2>選擇你的<span>研究裝備。</span></h2><p>抽卡與戰鬥，那些熟悉的規則，換你來調整。</p></div><a className="text-link" href="#/lab">全部工具 <Arrow/></a></div><ExperimentCards/></section>
    <section className="manifesto-teaser"><div><span className="eyebrow">BEHIND THE GRAND NARRATIVE / 華麗宣傳背後</span><h2>其實，只是一個玩家<br/>想玩到<span>更多好遊戲。</span></h2></div><div><p>我想把遊戲裡的「為什麼」和「如果」，做成真的能試的工具。從台灣開始，邀請世界各地的玩家與開發者，一起研究、一起創作。</p><a className="text-link" href="#/about">讀讀這個計畫的起點 <Arrow/></a></div></section>
  </>;
}
function ToolLaunch() {
  return <>
  <a className="tool-launch" href="./gacha/index.html">
    <div className="tool-launch-copy"><span className="category">給喜歡抽卡的你</span><h2>抽卡模擬器</h2><p>調整保底、限定與天井規則，精確算出抽數分布、花費與機率。內建近期卡池資料，也能自己設定一套卡池。</p><span className="button primary">開啟模擬器 <Arrow/></span></div>
    <div className="tool-launch-art" aria-hidden="true"><div className="pack-art"><i/><i/><i/><span>✦</span></div></div>
  </a>
  <a className="tool-launch" href="./battle/index.html">
    <div className="tool-launch-copy"><span className="category">給研究星穹鐵道的你</span><h2>星穹鐵道戰鬥研究室</h2><p>角色、光錐、遺器與敵人都能調整：換隊伍、手動設定詞條，預覽誰先出手、批量模擬勝率，最後親手打一場動畫戰鬥。</p><span className="button primary">進入研究室 <Arrow/></span></div>
    <div className="tool-launch-art" aria-hidden="true"><div className="pack-art"><i/><i/><i/><span>⚔</span></div></div>
  </a>
  </>;
}
function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="page-intro"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{text}</p></div>;
}
function About() {
  return <><PageIntro eyebrow="ABOUT THE PROJECT / 計畫的起點" title="遊戲還可以有更多玩法。" text="gacha-game-tool，一個從台灣出發的個人遊戲機制工具計畫。"/><div className="about-layout"><aside className="about-marginal"><span>PLAYER'S NOTE</span><strong>保持好奇。<br/>試著動手。<br/>讓點子發芽。</strong><small>給喜歡玩遊戲，<br/>也喜歡做遊戲的你。</small></aside><article className="prose project-story"><h2>為什麼做這個計畫？</h2>{projectStory.map(paragraph => <p key={paragraph}>{paragraph}</p>)}<blockquote>有更多值得期待的作品，<br/>也有更多從沒玩過的玩法。</blockquote><h2>工具會怎麼做？</h2><p>每個工具都會說明適用範圍與限制。工具裡的數值是模擬用的假設，不代表任何特定遊戲的官方設定。</p><a className="button primary" href="#/lab">進來玩玩規則 <Arrow/></a></article></div></>;
}
function Privacy() {
  return <><PageIntro eyebrow="YOUR DATA" title="資料與使用說明" text="玩得輕鬆，也知道自己的資料放在哪裡。"/><div className="prose"><h2>網站本身</h2><p>網站沒有帳號、分析追蹤或資料上傳功能。</p><h2>抽卡模擬器</h2><p>模擬設定與分享規則都只存在你的瀏覽器本機（localStorage），網址的分享連結也只在你的瀏覽器中產生與解讀。清除瀏覽器資料就會消失。</p><p>開啟模擬器時，會向公開來源讀取近期卡池資料（api.ennead.cc 與 SchaleDB）。這些請求不含個人資料，但會讓來源看到你的 IP 位址，與一般瀏覽網頁相同。</p><h2>星穹鐵道戰鬥研究室</h2><p>你選的隊伍、敵人、配裝與修改過的角色數值、技能，只存在你的瀏覽器本機（localStorage），不會上傳；按「重設」即可清除並回到範本。這個頁面不會向外部讀取資料。</p><h2>工具的結果怎麼看？</h2><p>工具會標示假設與限制。簡化的範例用來理解規則，實際遊戲仍可能包含尚未建模的條件。這是一個個人的開發與研究計畫。</p></div></>;
}
function App() {
  const [path, setPath] = useState(() => window.location.hash.slice(1) || '/');
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const onHash = () => { setPath(window.location.hash.slice(1) || '/'); window.scrollTo(0, 0); main.current?.focus({ preventScroll: true }); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { document.title = `${pages[path] ?? '找不到頁面'} — gacha-game-tool`; }, [path]);
  return <><a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); main.current?.focus(); }}>跳至內容</a><header className="header"><Logo/><nav aria-label="主要導覽">{['/', '/lab', '/about'].map(route => <a key={route} href={`#${route}`} aria-current={path === route || (route === '/lab' && path.startsWith('/lab')) ? 'page' : undefined}>{pages[route]}</a>)}</nav><a className="header-cta" href="#/lab">立即開玩 <Arrow/></a></header><main id="main-content" ref={main} tabIndex={-1} className={path === '/' ? 'home-main' : undefined}>{path === '/' ? <Home/> : path === '/lab' ? <><PageIntro eyebrow="PICK YOUR TOOL" title="工具遊樂場" text="找個好奇的機制，動手玩玩。"/><ToolLaunch/></> : path === '/about' ? <About/> : path === '/privacy' ? <Privacy/> : <><PageIntro eyebrow="404" title="這關還沒做出來！" text="先回首頁找個工具玩玩吧。"/><a className="button primary" href="#/">回首頁 →</a></>}</main><footer><div><Logo/><p>從台灣出發，歡迎全世界的玩家與開發者。</p><p className="footer-homage">玩家自製的工具計畫 · 原創視覺與二遊官網語彙致敬</p></div><div className="footer-links"><a href="#/about">關於計畫</a><a href="#/privacy">資料與使用說明</a><span>持續開發中 · 2026</span></div></footer></>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
