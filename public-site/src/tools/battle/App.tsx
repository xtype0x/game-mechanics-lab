import { useCallback, useEffect, useRef, useState } from "react";
import { Lab } from "./Lab";
import { Play } from "./Play";
import { clearSaved, freshProject, loadSaved, saveProject } from "./state";
import type { Updater } from "./common";
import { useEquip } from "./useEquip";

export function App() {
  const [project, setProject] = useState(loadSaved);
  const [view, setView] = useState<"lab" | "play">("lab");
  const [saved, setSaved] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const equip = useEquip(project);

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

  if (view === "play") return <Play project={equip.compiled.problems.length ? project : equip.compiled.project} onBack={() => setView("lab")} />;

  return (
    <div className="lab">
      <header className="top">
        <a className="back-link" href="../index.html#/lab">← gacha-game-tool 工具遊樂場</a>
        <h1>星穹鐵道戰鬥研究室</h1>
        <p className="tagline">把星穹鐵道的角色、光錐、遺器與敵人拆成可調整的機制：換隊伍、改配裝，看看誰先出手、勝率多少，最後親手打一場。星穹鐵道資料為未核實的社群整理，僅供模擬；另附原創範本角色。</p>
      </header>
      <main>
        <Lab project={project} update={update} saved={saved} equip={equip} onPlay={() => setView("play")} onReset={() => { clearSaved(); equip.resetAll(); setProject(freshProject()); }} />
      </main>
    </div>
  );
}
