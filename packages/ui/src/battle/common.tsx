import { ELEMENT_LABELS, battleSetupOf, parseExpr, printExpr, validateBattle, type BattleIssue, type DepNode, type Expr, type Project } from "@gml/core";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const elementLabel = (e: string) => ELEMENT_LABELS[e] ?? e;

export type Updater = (fn: (draft: Project) => void) => void;

/**
 * How shared editors render a reference to another piece of content (a unit, skill, status…). Apps with
 * navigation (the console) provide a renderer that jumps there; without a provider the label is plain text.
 */
export type RefLinkRenderer = (node: DepNode, children: ReactNode) => ReactNode;
const RefLinkCtx = createContext<RefLinkRenderer | null>(null);
export const RefLinkProvider = ({ render, children }: { render: RefLinkRenderer; children: ReactNode }) => <RefLinkCtx.Provider value={render}>{children}</RefLinkCtx.Provider>;
export function RefLink({ node, children }: { node: DepNode; children: ReactNode }) {
  const render = useContext(RefLinkCtx);
  return <>{render ? render(node, children) : children}</>;
}
/** True when references can be followed, so editors can hide "go to" links that would do nothing. */
export const useRefLinks = () => useContext(RefLinkCtx) !== null;

/** Battle seed text: digit-only text becomes a number seed, anything else stays a string seed. */
export const parseSeedInput = (text: string): number | string => (/^\d+$/.test(text) ? Number(text) : text);

/** Battle seed input (see parseSeedInput). */
export function SeedField({ project, update }: { project: Project; update: Updater }) {
  return (
    <label className="field seed-field">
      <span className="field-label">種子</span>
      <input className="mono" value={String(project.seed)} onChange={(e) => update((p) => { p.seed = parseSeedInput(e.target.value); })} />
    </label>
  );
}

/**
 * Setup + validation. When content has errors, setup is null and `error` explains why, so simulators never
 * run on half-edited data.
 */
export function useBattleSetup(project: Project) {
  return useMemo(() => {
    try {
      const setup = battleSetupOf(project);
      const issues = validateBattle(project.battle, setup.damage);
      const errors = issues.filter((i) => i.level === "error");
      if (errors.length) {
        const list = errors.slice(0, 4).map((e) => "・" + e.message).join("\n");
        return { setup: null, issues, error: `戰鬥資料有 ${errors.length} 個錯誤，請先修正：\n${list}` };
      }
      return { setup, issues, error: null as string | null };
    } catch (e) {
      return { setup: null, issues: [] as BattleIssue[], error: (e as Error).message };
    }
  }, [project]);
}

export function IssueList({ issues, empty }: { issues: BattleIssue[]; empty?: string }) {
  if (!issues.length) return empty ? <p className="muted small">{empty}</p> : null;
  return (
    <div className="issue-list">
      {issues.map((i, k) => <div key={k} className={`issue ${i.level === "error" ? "err" : "warn"}`}>{i.level === "error" ? "✕" : "!"} {i.message}</div>)}
    </div>
  );
}

/** Formula text input: keeps the typed text locally and only commits trees that parse. */
export function ExprField({
  value,
  onChange,
  placeholder,
  allowEmpty = false,
  ariaLabel,
}: {
  value: Expr | undefined;
  onChange: (e: Expr | undefined) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  ariaLabel?: string;
}) {
  const printed = value ? printExpr(value) : "";
  const [text, setText] = useState(printed);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // External change (reset, load): resync unless the user's text already means the same thing.
    try {
      if (!text.trim() ? printed !== "" : printExpr(parseExpr(text)) !== printed) setText(printed);
    } catch {
      setText(printed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printed]);
  return (
    <span className="expr-field">
      <input
        className={`mono ${error ? "invalid" : ""}`}
        aria-label={ariaLabel}
        value={text}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(ev) => {
          const t = ev.target.value;
          setText(t);
          if (!t.trim()) {
            if (allowEmpty) { setError(null); onChange(undefined); } else setError("公式不能是空的");
            return;
          }
          try {
            const parsed = parseExpr(t);
            setError(null);
            onChange(parsed);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
      {error && <span className="expr-error">{error}</span>}
    </span>
  );
}
