import { StrictMode, Suspense, lazy, useEffect, useRef, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageSwitch, useLocale } from '@gml/ui/i18n';
import { CrossToolRow, GameGrid, GameHub, GamesIndex, ToolCard } from './pages/Games';
import { Arrow, PageIntro } from './pages/shared';
import { crossTools, gameById, gameText } from './content/games';
import { useSiteText, type SiteText } from './i18n';
import AboutZh from './content/pages/About.zh-Hant';
import AboutEn from './content/pages/About.en';
import PrivacyZh from './content/pages/Privacy.zh-Hant';
import PrivacyEn from './content/pages/Privacy.en';
import heroImage from './assets/gacha-keyvisual-v4.png';
import './styles.css';

const Coverage = lazy(() => import('./pages/Coverage'));
const aboutPages: Record<string, ComponentType> = { 'zh-Hant': AboutZh, en: AboutEn };
const privacyPages: Record<string, ComponentType> = { 'zh-Hant': PrivacyZh, en: PrivacyEn };
const pageTitle = (t: SiteText, path: string): string | undefined => ({
  '/': t.pageTitles.home, '/games': t.pageTitles.games, '/tools': t.pageTitles.tools, '/about': t.pageTitles.about, '/privacy': t.pageTitles.privacy,
} as Record<string, string>)[path];
const navRoutes = ['/', '/games', '/tools', '/about'];
/** Hash path with old aliases resolved: #/lab became #/tools when the site was reorganised by game. */
function currentPath() {
  const raw = window.location.hash.slice(1) || '/';
  if (raw === '/lab' || raw.startsWith('/lab/')) { window.history.replaceState(null, '', '#/tools'); return '/tools'; }
  return raw;
}
/** `/games/<id>` -> id (a hub page), anything else -> null. */
const hubId = (path: string) => { const p = path.split('/'); return p.length === 3 && p[1] === 'games' && p[2] ? p[2] : null; };
const titleOf = (t: SiteText, path: string) => {
  const known = pageTitle(t, path);
  if (known) return known;
  if (path === '/games/hsr/coverage') return t.pageTitles.coverage;
  const hub = hubId(path);
  const game = hub ? gameById(hub) : undefined;
  return game ? gameText(t, game).name : t.pageTitles.notFound;
};
function Gamepad() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 19h24c8 0 12 7 14 22 1 8-4 12-10 7l-7-6H23l-7 6C10 53 5 49 6 41c2-15 6-22 14-22Z"/><path d="M21 26v12m-6-6h12" className="pad-lines"/><circle cx="43" cy="28" r="3" className="pad-dot"/><circle cx="49" cy="35" r="3" className="pad-dot"/></svg>;
}
function Logo() {
  const t = useSiteText();
  return <a className="logo" href="#/" aria-label={t.header.logoLabel}><span className="logo-icon"><Gamepad/></span><span>{t.site.name}<small>game-mechanics-lab</small></span></a>;
}
function Home() {
  const t = useSiteText();
  const h = t.home;
  return <>
    <section className="launch-hero" aria-labelledby="launch-title">
      <img className="launch-art" src={heroImage} alt={h.heroAlt} fetchPriority="high"/>
      <div className="launch-shade" aria-hidden="true"/>
      <p className="hero-image-credit">{h.imageCredit}</p>
      <div className="hero-coordinate" aria-hidden="true">GGT / PARAMETER WORLD <span>REWRITE THE RULES</span></div>
      <div className="launch-copy">
        <div className="eyebrow launch-eyebrow"><span/> {h.eyebrow}</div>
        <p className="launch-prelude">{h.prelude}</p>
        <h1 id="launch-title">{h.title}</h1>
        <p className="launch-tagline">{h.tagline}</p>
        <p className="launch-description">{h.description}</p>
        <div className="hero-actions"><a className="button primary" href="#/games">{h.pickGame} <Arrow/></a><a className="text-link" href="#/about">{h.whatIsThis} <span>→</span></a></div>
        <p className="launch-fineprint">{h.fineprint}</p>
      </div>
      <div className="hero-aside"><span>MISSION / 001</span><strong>{h.asideTitle}</strong><small>{h.asideNote}</small></div>
      <div className="hero-bottom"><span>FROM TAIWAN · OPEN TO EVERYONE</span><a href="#/games">{h.explore} <span aria-hidden="true">↓</span></a><span className="hero-bottom-note">{h.bottomNote}</span></div>
    </section>
    <div className="launch-strip"><span className="strip-cross" aria-hidden="true">✦</span><strong>{h.stripStrong}</strong><span>{h.stripText}</span></div>
    <section className="section"><div className="section-header"><div><div className="eyebrow">{h.selectEyebrow}</div><h2>{h.selectTitle}</h2><p>{h.selectText}</p></div><a className="text-link" href="#/games">{h.allGames} <Arrow/></a></div><GameGrid/><div className="section-sub"><div className="eyebrow">{h.crossEyebrow}</div><CrossToolRow/></div></section>
    <section className="manifesto-teaser"><div><span className="eyebrow">{h.manifestoEyebrow}</span><h2>{h.manifestoTitle}</h2></div><div><p>{h.manifestoText}</p><a className="text-link" href="#/about">{h.manifestoLink} <Arrow/></a></div></section>
  </>;
}
function ToolList() {
  return <div className="tool-grid">{crossTools.map(tool => <ToolCard key={tool.id} tool={tool} gameId={null}/>)}</div>;
}
function App() {
  const t = useSiteText();
  const [locale] = useLocale();
  const [path, setPath] = useState(currentPath);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const onHash = () => { setPath(currentPath()); window.scrollTo(0, 0); main.current?.focus({ preventScroll: true }); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { document.title = `${titleOf(t, path)}${t.site.titleSuffix}`; }, [t, path, locale]);
  const About = aboutPages[locale];
  const Privacy = privacyPages[locale];
  return <><a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); main.current?.focus(); }}>{t.site.skipLink}</a><header className="header"><Logo/><nav aria-label={t.header.navLabel}>{navRoutes.map(route => <a key={route} href={`#${route}`} aria-current={path === route || (route === '/games' && path.startsWith('/games/')) ? 'page' : undefined}>{pageTitle(t, route)}</a>)}</nav><LanguageSwitch className="header-lang"/><a className="header-cta" href="#/games/hsr">{t.header.cta} <Arrow/></a></header><main id="main-content" ref={main} tabIndex={-1} className={path === '/' ? 'home-main' : undefined}>{path === '/' ? <Home/> : path === '/games' ? <GamesIndex/> : path === '/games/hsr/coverage' ? <Suspense fallback={<p className="loading" role="status">{t.site.loading}</p>}><Coverage/></Suspense> : hubId(path) ? <GameHub id={hubId(path)!}/> : path === '/tools' ? <><PageIntro eyebrow="CROSS-GAME TOOLS" title={t.gamesPage.toolsPageTitle} text={t.gamesPage.toolsPageText}/><ToolList/></> : path === '/about' ? <About/> : path === '/privacy' ? <Privacy/> : <><PageIntro eyebrow="404" title={t.notFound.title} text={t.notFound.text}/><a className="button primary" href="#/">{t.notFound.link}</a></>}</main><footer><div><Logo/><p>{t.footer.tagline}</p><p className="footer-homage">{t.footer.homage}</p></div><div className="footer-links"><a href="#/about">{t.footer.about}</a><a href="#/privacy">{t.footer.privacy}</a><span>{t.footer.dev}</span></div></footer></>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
