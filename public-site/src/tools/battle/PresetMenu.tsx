import { useState } from "react";
import { presetGroups, type Preset, type PresetGroup } from "./presets";

/**
 * Lists every preset group. Available presets are buttons that call `onPick`; unavailable ones stay visible,
 * disabled, with the reason as tooltip and small text.
 */
export function PresetMenu({ groups = presetGroups, targetName, onPick }: { groups?: PresetGroup[]; targetName?: string; onPick: (p: Preset) => void }) {
  const [last, setLast] = useState<string | null>(null);
  return (
    <div className="preset-menu">
      <p className="muted small">{targetName ? `點選角色，替換「${targetName}」這個隊伍位置（數值、技能與需要的狀態都會一起換）。` : "請先選一個我方隊伍位置。"}</p>
      {groups.map((g) => (
        <details key={g.id} className="preset-group" open={g.presets.length > 0}>
          <summary>
            <strong>{g.title}</strong>
            {g.note && <span className="pill warn">{g.note}</span>}
            <span className="muted small">{g.presets.length ? `${g.presets.length} 位` : ""}</span>
          </summary>
          {g.source && <p className="muted small preset-source">資料來源：{g.source}</p>}
          {g.presets.length === 0 ? (
            <p className="muted small">{g.note ?? "目前沒有內容"}。</p>
          ) : (
            <div className="preset-grid">
              {g.presets.map((p) => {
                const off = !p.available || !p.apply || !targetName;
                const reason = !p.available ? p.reason ?? "目前無法使用" : undefined;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`preset-btn ${last === `${g.id}/${p.id}` ? "on" : ""}`}
                    disabled={off}
                    title={reason ?? p.subtitle}
                    onClick={() => { setLast(`${g.id}/${p.id}`); onPick(p); }}
                  >
                    <strong>{p.name}</strong>
                    {p.subtitle && <small>{p.subtitle}</small>}
                    {reason && <small className="preset-reason">{reason}</small>}
                  </button>
                );
              })}
            </div>
          )}
        </details>
      ))}
    </div>
  );
}
