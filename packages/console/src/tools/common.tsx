import { DAMAGE_COMPONENTS, DAMAGE_TEMPLATES, checkCompat, composeRules, parseExpr, printExpr, type Expr, type Project } from "@ggt/core";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../ui";

export function useDamageRules(project: Project) {
  const config = project.damage.config;
  return useMemo(
    () => ({ rules: composeRules(config, DAMAGE_COMPONENTS), compat: checkCompat(config, DAMAGE_COMPONENTS, DAMAGE_TEMPLATES) }),
    [config],
  );
}

export function CompatBadge({ status }: { status: "verified" | "experimental" | "incompatible" }) {
  if (status === "verified") return <Badge tone="ok">✓ 已驗證組合</Badge>;
  if (status === "experimental") return <Badge tone="warn">◐ 實驗組合</Badge>;
  return <Badge tone="err">✕ 不相容</Badge>;
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
