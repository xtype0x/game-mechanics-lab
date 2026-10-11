import { useCallback, useEffect, useRef, useState } from "react";
import { Lab } from "./Lab";
import { Play } from "./Play";
import { clearSaved, freshProject, loadSaved, saveProject } from "./state";
import type { Updater } from "./common";

export function App() {
  const [project, setProject] = useState(loadSaved);
  const [view, setView] = useState<"lab" | "play">("lab");
  const [saved, setSaved] = useState(true);
  const timer = useRef<number | undefined>(undefined);

  // Autosave is a convenience; the page works without storage.
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(saveProject(project)), 400);
    return () => window.clearTimeout(timer.current);
  }, [project]);

  const update: Updater = useCallback((fn) => {
    setProject((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
  }, []);

  if (view === "play") return <Play project={project} onBack={() => setView("lab")} />;

  return (
    <div className="lab">
      <header className="top">
        <a className="back-link" href="../index.html#/lab">← gacha-game-tool 工具遊樂場</a>
        <h1>戰鬥實驗室</h1>
        <p className="tagline">挑隊伍和敵人、改數值與技能，看看誰先出手、勝率多少，最後親手打一場。範本角色與數字是原創範例；「星穹鐵道」角色為未核實的社群資料，僅供模擬。</p>
      </header>
      <main>
        <Lab project={project} update={update} saved={saved} onPlay={() => setView("play")} onReset={() => { clearSaved(); setProject(freshProject()); }} />
      </main>
    </div>
  );
}
