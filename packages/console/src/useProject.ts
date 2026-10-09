import { PROJECT_TEMPLATES, loadProject, newProject, type Project } from "@ggt/core";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "ggt.project";

function readStored(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? loadProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export type Updater = (fn: (draft: Project) => void) => void;

export function useProject() {
  const [project, setProject] = useState<Project>(() => readStored() ?? newProject());
  const [saveState, setSaveState] = useState<"saved" | "pending" | "unavailable">("saved");
  const timer = useRef<number | undefined>(undefined);

  // Autosave is a convenience only; the project file (export) is the durable copy.
  useEffect(() => {
    setSaveState("pending");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
        setSaveState("saved");
      } catch {
        setSaveState("unavailable");
      }
    }, 400);
    return () => window.clearTimeout(timer.current);
  }, [project]);

  const update: Updater = useCallback((fn) => {
    setProject((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
  }, []);

  const exportFile = useCallback(() => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name || "project"}.ggt.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [project]);

  const importFile = useCallback(async (file: File) => {
    const loaded = loadProject(JSON.parse(await file.text()));
    setProject(loaded);
  }, []);

  const reset = useCallback((templateId = "weakness-break") => {
    const t = PROJECT_TEMPLATES.find((x) => x.id === templateId) ?? PROJECT_TEMPLATES[0]!;
    setProject(t.create(`${t.name} 專案`));
  }, []);

  return { project, update, setProject, exportFile, importFile, reset, saveState };
}
