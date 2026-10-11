import type { Project } from "@ggt/core";
import { useMemo, useState } from "react";
import type { Theme } from "./art/Backdrop";
import { BattleScene, type BattleOutcome } from "./scene/BattleScene";

const THEMES: Theme[] = ["ember", "frost", "storm"];

/** The animated battle on the fixed 1280x720 stage, with a result card and a way back to the lab. */
export function Play({ project, onBack }: { project: Project; onBack: () => void }) {
  const [round, setRound] = useState(0);
  const [outcome, setOutcome] = useState<BattleOutcome | null>(null);
  // Frozen when the battle starts: the lab is not editable while playing.
  const frozen = useMemo(() => structuredClone(project), []); // eslint-disable-line react-hooks/exhaustive-deps
  const seed = useMemo(() => `lab-${Date.now().toString(36)}-${round}`, [round]);
  const enc = frozen.battle.encounter;
  const theme = THEMES[Math.max(0, frozen.battle.encounters.findIndex((e) => e.enemies.join() === enc.enemies.join())) % THEMES.length]!;
  const nameOf = (id: string) => frozen.battle.units.find((u) => u.id === id)?.name ?? id;

  return (
    <div className="demo-root">
      <div className="stage-frame">
        <div className="stage">
          <BattleScene
            key={seed}
            project={frozen}
            waves={[enc.enemies]}
            theme={theme}
            seed={seed}
            title={enc.enemies.map(nameOf).join("、")}
            onQuit={onBack}
            onFinish={setOutcome}
          />
          {outcome && (
            <div className={`play-result ${outcome.result}`} role="dialog" aria-label="戰鬥結果">
              <div className="play-result-box">
                <b>{outcome.result === "win" ? "勝利" : "失敗"}</b>
                <span>{outcome.cycles} 輪・{outcome.turns} 次行動</span>
                <ul>
                  {Object.entries(outcome.damage).map(([defId, dmg]) => <li key={defId}>{nameOf(defId)}<span>{Math.round(dmg).toLocaleString()}</span></li>)}
                </ul>
                <div className="play-result-actions">
                  <button type="button" onClick={() => { setOutcome(null); setRound((r) => r + 1); }}>再打一次</button>
                  <button type="button" onClick={onBack}>返回研究室</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <button type="button" className="play-back" onClick={onBack}>← 返回研究室</button>
    </div>
  );
}
