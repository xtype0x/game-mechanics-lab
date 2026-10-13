import { useCallback, useEffect, useRef, useState } from "react";
import { Lab } from "./Lab";
import { Play } from "./Play";
import { clearSaved, freshProject, loadSaved, saveProject } from "./state";
import type { ProjectHost, Updater } from "@gml/ui";
import { localize, useLocale } from "@gml/ui/i18n";
import { useEquip } from "./useEquip";

export function App({ host = {} }: { host?: ProjectHost }) {
  const [locale] = useLocale();
  const [project, setProject] = useState(loadSaved);
  const [view, setView] = useState<"lab" | "play">("lab");
  const [saved, setSaved] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const equip = useEquip(project);

  // Autosave is a convenience; the page works without storage.
  useEffect(() => {
    window.clearTimeout(timer.current);
    const flush = () => {
      window.clearTimeout(timer.current);
      setSaved(saveProject(project));
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    timer.current = window.setTimeout(flush, 400);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
        {host.back && <a className="back-link" href={host.back.href}>← {localize(host.back.label, locale)}</a>}
        <div className="rail-top-title"><h1>星穹鐵道戰鬥研究室</h1><span>配好角色，試一場戰鬥。</span></div>
        <p className="rail-data-note">鐵道資料為未核實的社群整理，僅供機制研究與模擬。</p>
      </header>
      <main>
        <Lab project={project} update={update} saved={saved} equip={equip} onPlay={() => setView("play")} onReset={() => { clearSaved(); equip.resetAll(); setProject(freshProject()); }} />
      </main>
    </div>
  );
}
