import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { experiments } from './content/experiments';
import { CritPreview } from './features/crit-preview/CritPreview';
import { projectStory } from './content/project';
import heroImage from './assets/gacha-keyvisual-v3.png';
import './styles.css';

const pages: Record<string, string> = {
  '/': '首頁', '/lab': '工具遊樂場', '/research': '開發筆記',
  '/about': '關於計畫', '/privacy': '資料與使用說明', '/lab/damage-preview': '暴擊小試算',
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
    <div className="card-art" aria-hidden="true">{index === 0 ? <><span className="art-label">CRITICAL!</span><div className="bar-art">{[25, 40, 34, 65, 54, 88, 78].map((height, i) => <i key={i} style={{ height: `${height}%` }}/>)}</div></> : index === 1 ? <div className="pack-art"><i/><i/><i/><span>✦</span></div> : <div className="race-art"><span>SPD</span><div><i/><i/><i/></div></div>}</div>
    <span className="category">{experiment.category}</span><h3>{experiment.title}</h3><p>{experiment.summary}</p>
    {experiment.route ? <a className="card-action" href={`#${experiment.route}`}>來玩一下 <Arrow/></a> : <span className="card-action muted">做好就放上來 <span aria-hidden="true">◷</span></span>}
  </article>)}</div>;
}
function Home() {
  return <>
    <section className="launch-hero" aria-labelledby="launch-title">
      <img className="launch-art" src={heroImage} alt="原創二遊風格插畫：開發者拿著巨大游標卡尺，玩家用手把連接骰子機器人，站在發光的科幻城市中。" fetchPriority="high"/>
      <div className="launch-shade" aria-hidden="true"/>
      <div className="hero-coordinate" aria-hidden="true">GGT / PARAMETER WORLD <span>REWRITE THE RULES</span></div>
      <div className="launch-copy">
        <div className="eyebrow launch-eyebrow"><span/> 個人開發中 · 隨時可加入</div>
        <p className="launch-prelude">傳說中的命運，原來可以拖動滑桿。</p>
        <h1 id="launch-title">大膽改寫<br/>世界的<span>參數。</span></h1>
        <p className="launch-tagline">史詩級冒險，從調整暴擊率開始。</p>
        <p className="launch-description">把熱門遊戲的機制做成能調整、能模擬的工具。<br className="desktop-break"/>給好奇的玩家，也給想做出下一種玩法的開發者。</p>
        <div className="hero-actions"><a className="button primary" href="#/lab">立即開玩工具 <Arrow/></a><a className="text-link" href="#/about">這到底是什麼計畫？ <span>→</span></a></div>
        <p className="launch-fineprint">無須預約，也沒有預約獎勵。好奇心帶來就好。</p>
      </div>
      <div className="hero-aside"><span>MISSION / 001</span><strong>世界等你拯救。<br/>公式等你驗算。</strong><small>原創視覺・二遊官網語彙致敬</small></div>
      <div className="hero-bottom"><span>FROM TAIWAN · OPEN TO EVERYONE</span><a href="#/lab">探索工具 <span aria-hidden="true">↓</span></a><span className="hero-bottom-note">開發規模：一個人。好奇心：未設上限。</span></div>
    </section>
    <div className="launch-strip"><span className="strip-cross" aria-hidden="true">✦</span><strong>本計畫的稀有資源：你的好奇心。</strong><span>玩家 × 開發者 × 各種還沒試過的玩法</span></div>
    <section className="section"><div className="section-header"><div><div className="eyebrow">SELECT YOUR EXPERIMENT / 工具遊樂場</div><h2>選擇你的<span>研究裝備。</span></h2><p>抽卡、戰鬥、成長——那些熟悉的規則，換你來調整。</p></div><a className="text-link" href="#/lab">全部工具 <Arrow/></a></div><ExperimentCards/></section>
    <section className="play-chapter"><div className="chapter-copy"><span className="eyebrow">FIRST CONTACT / 第一個小實驗</span><h2>救世任務先放著。<br/>這次暴擊，<span>你說了算。</span></h2><p>拖動暴擊率，看看平均傷害怎麼變。<br/>這是目前可以玩的簡化範例。</p><a className="text-link" href="#/lab/damage-preview">打開完整小試算 <Arrow/></a><span className="chapter-note">不耗體力，不用抽角色，也不會跳出限時禮包。</span></div><div className="chapter-console"><div className="console-heading"><span>EXPERIMENT TERMINAL</span><span>001 / CRITICAL</span></div><CritPreview/></div></section>
    <section className="manifesto-teaser"><div><span className="eyebrow">BEHIND THE GRAND NARRATIVE / 華麗宣傳背後</span><h2>其實，只是一個玩家<br/>想玩到<span>更多好遊戲。</span></h2></div><div><p>我想把遊戲裡的「為什麼」和「如果」，做成真的能試的工具。從台灣開始，邀請世界各地的玩家與開發者，一起研究、交流、創作。</p><a className="text-link" href="#/about">讀讀這個計畫的起點 <Arrow/></a></div></section>
    <section className="notes-teaser"><div><span className="eyebrow">DEVELOPER LOG / 尚未成為神話的開發紀錄</span><h2>開發筆記，正在努力掉落。</h2><p>機制拆解、試驗心得，以及那些「怎麼又算錯了」的時刻。第一批筆記整理中。</p></div><a className="round-link" href="#/research" aria-label="前往開發筆記">↗</a></section>
  </>;
}
function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="page-intro"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{text}</p></div>;
}
function Research() {
  return <><PageIntro eyebrow="DEV DIARY" title="開發筆記" text="記錄做工具的過程，也分享研究手遊時的小發現。"/><div className="empty-note"><span className="eyebrow">第一批筆記整理中</span><h2>那些「咦，怎麼會這樣？」的時刻。</h2><p>這裡會慢慢放上機制拆解、工具開發紀錄與實驗心得。需要公式時會把推導寫清楚，也會附上遊戲版本、參考來源和目前還沒確認的地方。</p><a className="text-link" href="#/lab">筆記還在寫，先去玩工具 →</a></div><div className="research-topics"><span>打算聊聊</span><strong>傷害到底怎麼算</strong><strong>速度快一點會怎樣</strong><strong>機率與資源的那些事</strong></div></>;
}
function About() {
  return <><PageIntro eyebrow="ABOUT THE PROJECT / 計畫的起點" title="遊戲還可以有更多玩法。" text="gacha-game-tool，一個從台灣出發的個人遊戲機制工具計畫。"/><div className="about-layout"><aside className="about-marginal"><span>PLAYER'S NOTE</span><strong>保持好奇。<br/>試著動手。<br/>讓點子發芽。</strong><small>給喜歡玩遊戲，<br/>也喜歡做遊戲的你。</small></aside><article className="prose project-story"><h2>為什麼做這個計畫？</h2>{projectStory.map(paragraph => <p key={paragraph}>{paragraph}</p>)}<blockquote>有更多值得期待的作品，<br/>也有更多從沒玩過的玩法。</blockquote><h2>工具會怎麼做？</h2><p>先做小範例，再慢慢加進更完整的規則。每個工具會說明適用範圍、版本與限制。目前的暴擊小試算是簡化示範，沒有代表任何特定遊戲。</p><h2>來交流一下</h2><p>正式公開時會補上我的介紹、GitHub 與聯絡方式。現在先把工具與網站做好，之後也想聽聽大家希望玩什麼機制。</p><a className="button primary" href="#/lab">進來玩玩規則 <Arrow/></a></article></div></>;
}
function Privacy() {
  return <><PageIntro eyebrow="YOUR DATA" title="資料與使用說明" text="玩得輕鬆，也知道自己的資料放在哪裡。"/><div className="prose"><h2>目前的網站原型</h2><p>互動參數只存在分頁記憶體，重新整理後重設。本原型沒有帳號、遊玩存檔、分析追蹤或資料上傳功能；沒有嵌入第三方字型與圖片。</p><h2>未來的遊玩存檔</h2><p>計畫先將設定與進度保存在自己的瀏覽器，提供檔案匯出與匯入。瀏覽器資料可能被清除，也不會自動同步到其他裝置。若之後加入雲端儲存或研究資料收集，會另外說明目的、內容與選擇方式。</p><h2>工具的結果怎麼看？</h2><p>模型會標示適用版本、假設與限制。簡化範例用來理解規則，實際遊戲仍可能包含尚未建模的條件。這是一個個人的開發與研究計畫。</p></div></>;
}
function DamagePreview() {
  return <><PageIntro eyebrow="TOOL / 001" title="暴擊多一點，傷害差多少？" text="拖拖看暴擊率，看看平均傷害怎麼變。這是簡化示範，免登入就能玩。"/><div className="demo-layout"><CritPreview/><div className="prose"><h2>先用簡單的數字玩玩。</h2><p>假設基礎傷害是 1,000，暴擊時額外增加 150% 傷害，也就是造成 2,500 傷害。</p><p>期望傷害 = 1,000 ×（1 + 暴擊率 × 1.5）。50% 暴擊率時，平均傷害為 1,750。</p><p>平均值不代表每次都打這個數字，而是大量攻擊的平均。本示範不含防禦、抗性、多段命中或特定遊戲規則，尚未接入正式研究引擎。</p><a className="text-link" href="#/lab">← 回工具遊樂場</a></div></div></>;
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
  return <><a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); main.current?.focus(); }}>跳至內容</a><header className="header"><Logo/><nav aria-label="主要導覽">{['/', '/lab', '/research', '/about'].map(route => <a key={route} href={`#${route}`} aria-current={path === route || (route === '/lab' && path.startsWith('/lab/')) ? 'page' : undefined}>{pages[route]}</a>)}</nav><a className="header-cta" href="#/lab">立即開玩 <Arrow/></a></header><main id="main-content" ref={main} tabIndex={-1} className={path === '/' ? 'home-main' : undefined}>{path === '/' ? <Home/> : path === '/lab' ? <><PageIntro eyebrow="PICK YOUR TOOL" title="工具遊樂場" text="找個好奇的機制，動手玩玩。現在先有小範例，正式工具會陸續放上來！"/><ExperimentCards/><p className="lab-notice">暴擊小試算目前可以玩；抽卡與行動順序工具還在製作中。</p></> : path === '/research' ? <Research/> : path === '/about' ? <About/> : path === '/privacy' ? <Privacy/> : path === '/lab/damage-preview' ? <DamagePreview/> : <><PageIntro eyebrow="404" title="這關還沒做出來！" text="先回首頁找個工具玩玩吧。"/><a className="button primary" href="#/">回首頁 →</a></>}</main><footer><div><Logo/><p>從台灣出發，歡迎全世界的玩家與開發者。</p><p className="footer-homage">玩家自製的工具計畫 · 原創視覺與二遊官網語彙致敬</p></div><div className="footer-links"><a href="#/about">關於計畫</a><a href="#/privacy">資料與使用說明</a><span>持續開發中 · 2026</span></div></footer></>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
