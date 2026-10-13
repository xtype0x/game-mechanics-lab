import { NumberField, fmt } from "@gml/ui";
import type { QuickStat } from "./quickSettings";

export function QuickField({ stat, value, onChange, baseline, min }: {
  stat: QuickStat; value: number; onChange: (value: number) => void; baseline?: () => void; min?: number;
}) {
  const lower = min ?? stat.min ?? 0;
  const upper = stat.max === undefined ? undefined : Math.max(lower, stat.max);
  const inputPrecision = stat.percent ? 6 : 2;
  const inputLower = +lower.toFixed(inputPrecision);
  const inputUpper = upper === undefined ? undefined : +upper.toFixed(inputPrecision);
  const set = (v: number) => onChange(Math.min(upper ?? Infinity, Math.max(lower, v)));
  // Compare at the same precision as the button label, then clamp to the exact gear floor.
  const displayedLower = +(lower * (stat.percent ? 100 : 1)).toFixed(2) / (stat.percent ? 100 : 1);
  return <div className="rail-stat">
    <div className="rail-stat-top">
      <span className="rail-stat-symbol" aria-hidden="true">{stat.icon}</span>
      <span>{stat.label}</span>
      <NumberField ariaLabel={stat.label} value={+value.toFixed(inputPrecision)} percent={stat.percent} min={inputLower} max={inputUpper} normalizeOnBlur onChange={set} />
    </div>
    <div className="rail-quick-values" aria-label={`${stat.label}快速設定`}>
      {stat.values.map((v) => <button type="button" key={v} disabled={v < displayedLower - 1e-9} aria-label={`${stat.label}設為${fmt(stat.percent ? v * 100 : v)}${stat.percent ? "%" : ""}`} onClick={() => set(v)}>{fmt(stat.percent ? v * 100 : v)}{stat.percent ? "%" : ""}</button>)}
      {baseline && <button type="button" className="rail-default" onClick={baseline} aria-label={`恢復${stat.label}預設`}>預設</button>}
    </div>
  </div>;
}
