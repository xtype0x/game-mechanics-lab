import type { Project } from "@ggt/core";
import { useState } from "react";
import { applyHsrEncounter, currentHsrEncounter, hsrDefaultLevel, hsrEncounters, hsrEnemySource, hsrLevels, hsrToughnessScale } from "./presets/hsr-enemies";
import type { Updater } from "./common";
import { Field } from "./ui";

const LEVEL_KEY = "ggt.site.battle.hsre-level.v1";
const KINDS = ["普通", "精英", "首領"] as const;

function loadLevel(): number {
  try {
    const n = Number(localStorage.getItem(LEVEL_KEY));
    if (hsrLevels.includes(n)) return n;
  } catch { /* storage unavailable */ }
  return hsrDefaultLevel;
}
function saveLevel(n: number) {
  try { localStorage.setItem(LEVEL_KEY, String(n)); } catch { /* ignore */ }
}

/**
 * The "敵方" picker: template encounters first, then the Star Rail enemy encounters (generated data, fixed levels).
 * Picking a Star Rail encounter copies its enemies (and summons) into the project at the chosen level.
 */
export function EnemyPicker({ project, update }: { project: Project; update: Updater }) {
  const { units, encounter, encounters } = project.battle;
  const nameOf = (id: string) => units.find((u) => u.id === id)?.name ?? id;
  const hsr = currentHsrEncounter(project);
  const [level, setLevel] = useState(() => hsr?.level ?? loadLevel());
  const shownLevel = hsr?.level ?? level;
  const template = encounters.find((p) => p.enemies.join() === encounter.enemies.join())?.id;
  const value = hsr ? `hsre:${hsr.encounter.id}` : template ? `t:${template}` : "custom";

  const pick = (v: string) => {
    if (v.startsWith("hsre:")) {
      const enc = hsrEncounters.find((e) => e.id === v.slice(5));
      if (enc) update((d) => { applyHsrEncounter(d, enc, level); });
    } else if (v.startsWith("t:")) {
      const p = encounters.find((x) => x.id === v.slice(2));
      if (p) update((d) => { d.battle.encounter.enemies = [...p.enemies]; });
    }
  };
  const changeLevel = (n: number) => {
    setLevel(n);
    saveLevel(n);
    if (hsr) update((d) => { applyHsrEncounter(d, hsr.encounter, n); });
  };

  return (
    <>
      <Field label="敵方">
        <select value={value} onChange={(e) => pick(e.target.value)}>
          <optgroup label="範本敵人">
            {encounters.map((p) => <option key={p.id} value={`t:${p.id}`}>{p.name}：{p.enemies.map(nameOf).join("、")}</option>)}
          </optgroup>
          <optgroup label="星穹鐵道敵人（社群資料・佔位技能）">
            {KINDS.flatMap((k) => hsrEncounters.filter((e) => e.kind === k).map((e) => (
              <option key={e.id} value={`hsre:${e.id}`}>{k}・{e.name}</option>
            )))}
          </optgroup>
          {value === "custom" && <option value="custom">自訂：{encounter.enemies.map(nameOf).join("、")}</option>}
        </select>
      </Field>
      <Field label="星穹鐵道敵人等級" hint="只影響「星穹鐵道敵人」。切換後會用新等級重新套用目前的星穹鐵道敵人（你對它們的修改會被覆蓋）。">
        <select value={shownLevel} onChange={(e) => changeLevel(Number(e.target.value))} aria-label="星穹鐵道敵人等級">
          {hsrLevels.map((n) => <option key={n} value={n}>Lv {n}{n === hsrDefaultLevel ? "（預設）" : ""}</option>)}
        </select>
      </Field>
      {hsr && (
        <div className="muted small hsre-note">
          <p><strong>{hsr.encounter.name}</strong>（Lv {hsr.level}）：{hsr.encounter.description}</p>
          <details>
            <summary>資料來源與限制</summary>
            <p>{hsrEnemySource}</p>
            <p>韌性已換算為本站刻度（來源原始值 × {+hsrToughnessScale.toFixed(4)}，換算未核實）。裸裝（沒有光錐、遺器）的角色打這些敵人會偏吃力。</p>
          </details>
        </div>
      )}
    </>
  );
}
