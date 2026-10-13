import { ChangelogView, type ChangelogEntry } from '../../pages/Changelog';

// Visitor-facing changes only; keep the same entries and dates as Changelog.zh-Hant.tsx. Newest first.
const entries: ChangelogEntry[] = [
  { date: '2026-10-13', title: 'A personal research site, and tool updates', groups: [
    { heading: 'Site', items: [
      'The site now reads as a personal record of game-mechanics research. Home, About and the research cards were rewritten; navigation is now “Released game studies” and “Experiments”.',
      'The English pages have their own copy instead of following the Chinese line by line.',
      'Added this changelog.',
    ] },
    { heading: 'Star Rail battle lab', items: [
      'Redesigned character panel: a sidebar switches between details, Light Cone, Relics, skills and traces, and team and enemies. Click a portrait to switch characters.',
      'Common stats have quick values and per-stat reset. Light Cones can be picked quickly with Superimposition; Relics have general builds and quick main-stat picks.',
      'Skills are grouped into Basic ATK, Skill, Ultimate and Talent/follow-ups, with multipliers, toughness damage, Skill Points and Energy editable in place.',
      'Taunt, formulas, passive triggers, batch simulation and other advanced tools moved into an “Advanced” dialog.',
      'The original template characters and enemies use trial stats without gear. New one-click Star Rail trial with Himeko, Dan Heng, Serval and Gepard.',
      'On phones, characters sit in a row at the top and sections scroll sideways.',
    ] },
    { heading: 'Parry & dodge timing lab', items: [
      'Every hit of a multi-hit attack can have its own warning sign, on by default.',
      'New reaction analysis: each hit shows the reaction time it demands, rated from “friendly” to “prediction only”.',
      'Built-in attacks warn earlier. The triple combo is easier to learn, and a new “fast triple combo” keeps the hard version.',
      'Parrying a multi-hit combo no longer shrinks the perfect window for the next hit, and preset parries recover faster.',
    ] },
  ] },
  { date: '2026-10-12', title: 'English version', groups: [{ items: [
    'The site, the timing lab and bullet parry switch between Traditional Chinese and English. The gacha simulator and battle lab are still Chinese only.',
    'Bullet parry joined the timing lab as a second mode; the last 6 seconds of a run can be opened frame by frame.',
    'Tools opened from a game page link back to that game.',
    'Battles can be started on phones.',
  ] }] },
  { date: '2026-10-11', title: 'Organised by game', groups: [{ items: [
    'The site is organised by game: each game has its own research page, and cross-game experiments are listed separately.',
    'New parry & dodge timing lab: tune parry, dodge and custom windows and check results frame by frame.',
    'New bullet parry mini-game.',
    'The battle lab gained Star Rail characters, enemy encounters and gear (Light Cones, Relics, Traces), plus a character research progress page.',
    'The project was renamed Game Mechanics Lab.',
  ] }] },
  { date: '2026-10-10', title: 'First version', groups: [{ items: [
    'First version of the site, styled as a homage to anime game websites.',
    'Gacha simulator with banner rules for Honkai: Star Rail, Genshin Impact, Zenless Zone Zero, Blue Archive, Wuthering Waves, Arknights: Endfield and Neverness to Everness. Share links, import and export rules, and watch the pull animation.',
  ] }] },
];

export default function Changelog() {
  return <ChangelogView eyebrow="CHANGELOG" title="Changelog" text="What changed on the site and in each tool, newest first." entries={entries}/>;
}
