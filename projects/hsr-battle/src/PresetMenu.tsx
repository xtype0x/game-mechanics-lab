import { useMemo, useState } from "react";
import { presetGroups, type Preset, type PresetGroup } from "./presets";

/** Groups with more presets than this get a search box, facet dropdowns and an "only usable" toggle. */
const FILTER_FROM = 16;

/**
 * Lists every preset group. Available presets are buttons that call `onPick`; unavailable ones stay visible,
 * disabled, with the reason as tooltip and small text. Large groups can be filtered; usable presets come first.
 */
export function PresetMenu({ groups = presetGroups, targetName, onPick }: { groups?: PresetGroup[]; targetName?: string; onPick: (p: Preset) => void }) {
  const [last, setLast] = useState<string | null>(null);
  return (
    <div className="preset-menu">
      <p className="muted small">{targetName ? `點選角色，替換「${targetName}」這個隊伍位置（數值、技能與需要的狀態都會一起換）。` : "請先選一個我方隊伍位置。"}</p>
      {groups.map((g) => (
        <GroupView key={g.id} group={g} canApply={!!targetName} last={last} onPick={(p) => { setLast(`${g.id}/${p.id}`); onPick(p); }} />
      ))}
    </div>
  );
}

function GroupView({ group: g, canApply, last, onPick }: { group: PresetGroup; canApply: boolean; last: string | null; onPick: (p: Preset) => void }) {
  const [query, setQuery] = useState("");
  const [onlyUsable, setOnlyUsable] = useState(true);
  const [facetSel, setFacetSel] = useState<Record<string, string>>({});
  const big = g.presets.length >= FILTER_FROM;

  const facetValues = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of g.presets) for (const [k, v] of Object.entries(p.facets ?? {})) {
      const list = m.get(k) ?? [];
      if (!list.includes(v)) list.push(v);
      m.set(k, list);
    }
    return [...m.entries()];
  }, [g.presets]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = g.presets.filter((p) => {
      if (onlyUsable && !p.available) return false;
      if (q && !`${p.name} ${p.subtitle ?? ""}`.toLowerCase().includes(q)) return false;
      return Object.entries(facetSel).every(([k, v]) => !v || p.facets?.[k] === v);
    });
    // Usable first; otherwise keep the generated order.
    return [...list.filter((p) => p.available), ...list.filter((p) => !p.available)];
  }, [g.presets, query, onlyUsable, facetSel]);

  const usable = g.presets.filter((p) => p.available).length;
  return (
    <details className="preset-group" open={g.presets.length > 0}>
      <summary>
        <strong>{g.title}</strong>
        {g.note && <span className="pill warn">{g.note}</span>}
        <span className="muted small">{g.presets.length ? (big ? `${g.presets.length} 位（可用 ${usable}）` : `${g.presets.length} 位`) : ""}</span>
      </summary>
      {g.source && <details className="small preset-source"><summary>資料來源與限制</summary><p className="muted">{g.source}</p></details>}
      {g.presets.length === 0 ? (
        <p className="muted small">{g.note ?? "目前沒有內容"}。</p>
      ) : (
        <>
          {big && (
            <div className="preset-filters">
              <input type="search" placeholder="搜尋名稱" aria-label="搜尋角色名稱" value={query} onChange={(e) => setQuery(e.target.value)} />
              {facetValues.map(([k, values]) => (
                <select key={k} aria-label={`依${k}篩選`} value={facetSel[k] ?? ""} onChange={(e) => setFacetSel((s) => ({ ...s, [k]: e.target.value }))}>
                  <option value="">{k}：全部</option>
                  {values.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ))}
              <label className="small"><input type="checkbox" checked={onlyUsable} onChange={(e) => setOnlyUsable(e.target.checked)} /> 只看可用</label>
              <span className="muted small">顯示 {shown.length} 位</span>
            </div>
          )}
          {shown.length === 0 && <p className="muted small">沒有符合條件的角色。</p>}
          <div className={`preset-grid ${big ? "compact" : ""}`}>
            {shown.map((p) => {
              const off = !p.available || !p.apply || !canApply;
              const reason = !p.available ? p.reason ?? "目前無法使用" : undefined;
              const tip = [p.name, p.subtitle, reason, p.note && `近似與限制：${p.note}`].filter(Boolean).join("\n");
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`preset-btn ${last === `${g.id}/${p.id}` ? "on" : ""}`}
                  disabled={off}
                  title={tip}
                  onClick={() => onPick(p)}
                >
                  <strong>{p.name}</strong>
                  {p.subtitle && <small>{p.subtitle}</small>}
                  {reason && <small className="preset-reason">{reason}</small>}
                  {p.available && p.note && <small className="preset-approx">含近似，見提示</small>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </details>
  );
}
