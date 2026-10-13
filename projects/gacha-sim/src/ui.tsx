/**
 * Minimal UI kit for the simulator. Self-contained on purpose: the app must be liftable into another site
 * without the console's components.
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import { getLocale } from '@gml/ui/i18n';
import { displayText } from './i18n';

export const fmt = (n: number, digits = 2) =>
  Number.isFinite(n) ? n.toLocaleString(getLocale(), { maximumFractionDigits: digits }) : "—";
export const pct = (n: number, digits = 1) => (Number.isFinite(n) ? `${(n * 100).toLocaleString(getLocale(), { maximumFractionDigits: digits, minimumFractionDigits: digits })}%` : "—");
export const twd = (n: number) => (Number.isFinite(n) ? `NT$${Math.round(n).toLocaleString(getLocale())}` : "—");

/** Number input that tolerates partial text while typing. `percent` shows 0.5 as 50. */
export function NumberInput({ value, onChange, percent, min, max, step, label, width }: {
  value: number; onChange: (v: number) => void; percent?: boolean; min?: number; max?: number; step?: number; label?: string; width?: number;
}) {
  const shown = percent ? +(value * 100).toFixed(6) : value;
  const [text, setText] = useState(String(shown));
  useEffect(() => { if (Number(text) !== shown) setText(String(shown)); }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className="num" style={width ? { width } : undefined}>
      <input
        type="number" inputMode="decimal" aria-label={label} value={text}
        step={step ?? (percent ? 0.1 : 1)}
        min={min !== undefined ? (percent ? min * 100 : min) : undefined}
        max={max !== undefined ? (percent ? max * 100 : max) : undefined}
        onChange={(e) => {
          setText(e.target.value);
          let v = Number(e.target.value);
          if (e.target.value === "" || !Number.isFinite(v)) return;
          if (percent) v /= 100;
          if (min !== undefined) v = Math.max(min, v);
          if (max !== undefined) v = Math.min(max, v);
          onChange(v);
        }}
      />
      {percent && <span className="unit">%</span>}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{displayText(label)}{hint && <small> {displayText(hint)}</small>}</span>
      {children}
    </label>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ""}`}>
      {(title || actions) && <header className="card-head">{title && <h2>{title}</h2>}{actions && <div className="card-actions">{actions}</div>}</header>}
      {children}
    </section>
  );
}

/** Collapsible block, closed by default (for the advanced math). */
export function Fold({ title, summary, children, open }: { title: string; summary?: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="fold" open={open}>
      <summary><span className="fold-title">{title}</span>{summary && <span className="fold-summary">{summary}</span>}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const name = useId();
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.value} className={o.value === value ? "on" : ""}>
          <input type="radio" name={name} checked={o.value === value} onChange={() => onChange(o.value)} />
          {displayText(o.label)}
        </label>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <b className="stat-value">{value}</b>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
