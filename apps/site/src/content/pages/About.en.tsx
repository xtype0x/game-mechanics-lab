// English About page. Baseline translation of About.zh-Hant.tsx; the site owner plans to rewrite it for an international audience.
import { Arrow, PageIntro } from '../../pages/shared';

const projectStory = [
  'I have watched anime-style gacha games from mainland China draw more and more attention worldwide, and I keep wondering: Taiwan has so many people who love games and are willing to put their time and money into the ones they like. What else could we build together?',
  'Every time I see a comment like "Taiwan only makes gambling games" (meaning casino and slot games), I feel unwilling to accept it. That frustration became my motivation for starting this project.',
  'I want to begin with what I can do myself: collect the mechanics of popular live-service games, take the rules apart and organize them, then build simulation tools you can freely adjust. So that "what would happen if this mechanic changed a little?" has a chance to be actually tried out.',
  'This project starts from Taiwan and is open to friends all over the world. Wherever you are from, if you love games and are curious about how they work, you are welcome to play, research and create together.',
  'As a player, what I look forward to is simple: more works worth looking forward to, and more kinds of gameplay I have never tried.',
];

export default function About() {
  return <><PageIntro eyebrow="ABOUT THE PROJECT" title="Games can have more ways to play." text="Game Mechanics Lab (game-mechanics-lab) is a personal project from Taiwan that studies the mechanics of popular games."/><div className="about-layout"><aside className="about-marginal"><span>PLAYER'S NOTE</span><strong>Stay curious.<br/>Try things hands-on.<br/>Let ideas sprout.</strong><small>For anyone who loves playing games,<br/>and making them too.</small></aside><article className="prose project-story"><h2>Why build this project?</h2>{projectStory.map(paragraph => <p key={paragraph}>{paragraph}</p>)}<blockquote>More works worth looking forward to,<br/>and more kinds of gameplay we have never tried.</blockquote><h2>How will the tools work?</h2><p>Each tool explains what it covers and where its limits are. The numbers in the tools are assumptions for simulation and do not represent the official settings of any particular game.</p><a className="button primary" href="#/games">Come play with the rules <Arrow/></a></article></div></>;
}
