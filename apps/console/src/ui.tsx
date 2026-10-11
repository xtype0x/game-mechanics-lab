import { useEffect, useState, type ReactNode } from "react";

export const fmt = (n: number, digits = 2) =>
  Number.isFinite(n) ? n.toLocaleString("zh-TW", { maximumFractionDigits: digits }) : String(n);

export const pct = (n: number, digits = 1) => `${fmt(n * 100, digits)}%`;

/** Number input that tolerates intermediate text ("", "-", "1.") while typing. */
export function NumberField({
  value,
  onChange,
  percent = false,
  step,
  min,
  max,
  width,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  percent?: boolean;
  step?: number;
  min?: number;
  max?: number;
  width?: number;
  ariaLabel?: string;
}) {
  const shown = percent ? +(value * 100).toFixed(6) : value;
  const [text, setText] = useState(String(shown));
  useEffect(() => {
    if (Number(text) !== shown) setText(String(shown));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  return (
    <span className="num-field" style={width ? { width } : undefined}>
      <input
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        step={step ?? (percent ? 1 : "any")}
        min={min !== undefined ? (percent ? min * 100 : min) : undefined}
        max={max !== undefined ? (percent ? max * 100 : max) : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(v)) onChange(percent ? v / 100 : v);
        }}
      />
      {percent && <span className="unit">%</span>}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field" title={hint}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function Section({ title, actions, children, className }: { title: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`section ${className ?? ""}`}>
      <header className="section-head">
        <h3>{title}</h3>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Badge({ tone, children }: { tone: "ok" | "warn" | "err" | "muted" | "info"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface Bar {
  label: string;
  value: number;
  /** Optional second series, drawn as an outlined marker (e.g. sampled frequency). */
  compare?: number;
}

export function BarChart({ bars, height = 180, formatValue = pct }: { bars: Bar[]; height?: number; formatValue?: (v: number) => string }) {
  const max = Math.max(1e-12, ...bars.flatMap((b) => [b.value, b.compare ?? 0]));
  const n = bars.length;
  const slot = 100 / Math.max(n, 1);
  return (
    <div className="barchart" style={{ height }}>
      <svg viewBox={`0 0 100 100`} preserveAspectRatio="none" role="img" aria-label="分布圖">
        {bars.map((b, i) => {
          const h = (b.value / max) * 92;
          const x = i * slot + slot * 0.15;
          const w = slot * 0.7;
          return (
            <g key={i}>
              <rect x={x} y={100 - h} width={w} height={h} className="bar" rx={0.6}>
                <title>{`${b.label}：${formatValue(b.value)}${b.compare !== undefined ? `（抽樣 ${formatValue(b.compare)}）` : ""}`}</title>
              </rect>
              {b.compare !== undefined && (
                <line x1={x - slot * 0.05} x2={x + w + slot * 0.05} y1={100 - (b.compare / max) * 92} y2={100 - (b.compare / max) * 92} className="bar-compare" vectorEffect="non-scaling-stroke" />
              )}
            </g>
          );
        })}
      </svg>
      {n <= 12 && (
        <div className="bar-labels">
          {bars.map((b, i) => (
            <span key={i} style={{ width: `${slot}%` }}>
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return <div className="error-box">⚠ {error instanceof Error ? error.message : String(error)}</div>;
}

export function tryCompute<T>(fn: () => T): { ok: true; value: T } | { ok: false; error: unknown } {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error };
  }
}
