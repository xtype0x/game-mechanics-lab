import { tr } from "./i18n";
/**
 * Small SVG charts. Axes are labelled in text below the plot so they stay readable at any width.
 */
import { fmt, pct } from "./ui";

interface Series { label: string; points: number[]; className?: string }

/** Lines over n = 0..N (index = n). y in [0, yMax]. Optional vertical marker. */
export function LineChart({ series, yMax = 1, marker, markerLabel, xLabel, yFormat = (v) => pct(v, 0), height = 200 }: {
  series: Series[]; yMax?: number; marker?: number; markerLabel?: string; xLabel: string; yFormat?: (v: number) => string; height?: number;
}) {
  const n = Math.max(1, ...series.map((s) => s.points.length - 1));
  const path = (pts: number[]) => pts.map((y, i) => `${i === 0 ? "M" : "L"}${((i / n) * 100).toFixed(3)},${(100 - (Math.min(y, yMax) / yMax) * 100).toFixed(3)}`).join(" ");
  const mx = marker !== undefined ? Math.min(100, (marker / n) * 100) : undefined;
  return (
    <figure className="chart" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={series.map((s) => s.label).join(tr("gachaStage17"))}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={100} y1={100 - f * 100} y2={100 - f * 100} className="grid" vectorEffect="non-scaling-stroke" />)}
        {series.map((s) => <path key={s.label} d={path(s.points)} className={`line ${s.className ?? ""}`} fill="none" vectorEffect="non-scaling-stroke" />)}
        {mx !== undefined && <line x1={mx} x2={mx} y1={0} y2={100} className="marker" vectorEffect="non-scaling-stroke" />}
      </svg>
      <figcaption>
        <span>0</span>
        <span className="axis-mid">{xLabel}{marker !== undefined && markerLabel ? tr("charts1", markerLabel) : ""}{tr("charts2")}{yFormat(yMax)}</span>
        <span>{fmt(n, 0)}</span>
      </figcaption>
      {series.length > 1 && <div className="legend">{series.map((s) => <span key={s.label} className={`key ${s.className ?? ""}`}>{s.label}</span>)}</div>}
    </figure>
  );
}

/** Bars of a pmf grouped into at most `bins` buckets. */
export function PmfBars({ pmf, bins = 40, height = 160 }: { pmf: number[]; bins?: number; height?: number }) {
  const last = pmf.reduce((a, p, i) => (p > 1e-9 ? i : a), 0);
  const width = Math.max(1, Math.ceil(last / bins));
  const groups: { from: number; to: number; p: number }[] = [];
  for (let from = 1; from <= last; from += width) {
    let p = 0;
    for (let n = from; n < from + width && n < pmf.length; n++) p += pmf[n]!;
    groups.push({ from, to: Math.min(last, from + width - 1), p });
  }
  const max = Math.max(1e-12, ...groups.map((g) => g.p));
  const w = 100 / Math.max(1, groups.length);
  return (
    <figure className="chart" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={tr("charts3")}>
        {groups.map((g, i) => (
          <rect key={i} x={i * w + w * 0.1} width={w * 0.8} y={100 - (g.p / max) * 100} height={(g.p / max) * 100} className="bar">
            <title>{tr("charts4", g.from, g.to > g.from ? `–${g.to}` : "", pct(g.p, 2))}</title>
          </rect>
        ))}
      </svg>
      <figcaption><span>1</span><span className="axis-mid">{tr("charts5")}{width}{tr("charts6")}{pct(max, 1)}{tr("gachaStage30")}</span><span>{last}</span></figcaption>
    </figure>
  );
}
