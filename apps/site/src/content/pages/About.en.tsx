// English editorial version: curiosity, research and creative inspiration, with concise display copy.
import { Arrow, PageIntro } from '../../pages/shared';

const projectStory = [
  'Why does a game make me want to try again? How can one small rule change the choices I make, the pace of a fight, or the feel of a dodge? This project starts with questions I find while playing.',
  'I study released games and familiar mechanics to turn those impressions into ideas I can discuss and test. I hope the work inspires my own creations and gives other people who love games something to build on.',
  'I chose Honkai: Star Rail as a starting point for its popularity and relatively straightforward mechanics. It gives me a place to begin breaking down rules and understanding the design behind them.',
  'My love of action games also led me to study dodging and parrying, exploring how timing windows and input rules shape the feel of play.',
  'Sometimes a question needs a few notes. Sometimes it needs a simulation or a playable experiment. I try different assumptions, ask what happens when a rule changes, and share both the discoveries and the questions still open.',
  'This is a personal journal, growing as I learn. Whether you play games, study their design or have a project in mind, I hope you leave with a question worth following—or an idea you want to try.',
];

export default function About() {
  return <><PageIntro eyebrow="ABOUT THE PROJECT" title="Curiosity sparks ideas." text="Studying games and familiar mechanics to inspire what we might make next."/><div className="about-layout"><aside className="about-marginal"><span>PLAYER'S NOTE</span><strong>Stay curious.<br/>Ask why.<br/>Try it out.</strong><small>For people who love games,<br/>and wonder how they work.</small></aside><article className="prose project-story"><h2>Why I started</h2>{projectStory.map(paragraph => <p key={paragraph}>{paragraph}</p>)}<blockquote>A familiar game.<br/>A new idea to try.</blockquote><h2>Inside the journal</h2><p>Game studies bring together mechanics, sources and research progress for each title. Experiments explore common rules and questions shared across games through hands-on comparisons.</p><p>I distinguish known rules from estimates and open questions. Each simulation or experiment explains its assumptions, simplifications and scope, so you can follow how I reached a finding.</p><a className="button primary" href="#/games">Browse studies <Arrow/></a></article></div></>;
}
