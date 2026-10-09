/**
 * Restricted expression language for rule formulas and conditions.
 *
 * Stored as a JSON tree (portable, no arbitrary code). Edited as infix text via parseExpr/printExpr.
 * See docs/spec/expr.md for the full operator table.
 */

export type Value = number | boolean | string;

export type Expr =
  | { const: Value }
  | { ref: string }
  | { op: OpName; args: Expr[] };

export const OPS = {
  add: { arity: 2, infix: "+", prec: 4 },
  sub: { arity: 2, infix: "-", prec: 4 },
  mul: { arity: 2, infix: "*", prec: 5 },
  div: { arity: 2, infix: "/", prec: 5 },
  neg: { arity: 1, infix: "-", prec: 6 },
  not: { arity: 1, infix: "!", prec: 6 },
  gt: { arity: 2, infix: ">", prec: 3 },
  gte: { arity: 2, infix: ">=", prec: 3 },
  lt: { arity: 2, infix: "<", prec: 3 },
  lte: { arity: 2, infix: "<=", prec: 3 },
  eq: { arity: 2, infix: "==", prec: 3 },
  neq: { arity: 2, infix: "!=", prec: 3 },
  and: { arity: 2, infix: "&&", prec: 2 },
  or: { arity: 2, infix: "||", prec: 1 },
  min: { arity: -1 },
  max: { arity: -1 },
  clamp: { arity: 3 },
  floor: { arity: 1 },
  ceil: { arity: 1 },
  round: { arity: 1 },
  abs: { arity: 1 },
  if: { arity: 3 },
} as const satisfies Record<string, { arity: number; infix?: string; prec?: number }>;

export type OpName = keyof typeof OPS;

export const c = (v: Value): Expr => ({ const: v });
export const r = (path: string): Expr => ({ ref: path });
export const op = (name: OpName, ...args: Expr[]): Expr => ({ op: name, args });

export class ExprError extends Error {}

export type Scope = (path: string) => Value | undefined;

/** Builds a scope from a nested plain object; paths are dot-separated. */
export function objectScope(root: Record<string, unknown>): Scope {
  return (path) => {
    let cur: unknown = root;
    for (const key of path.split(".")) {
      if (cur === null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
    return typeof cur === "number" || typeof cur === "boolean" || typeof cur === "string" ? cur : undefined;
  };
}

function num(v: Value, ctx: string): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  throw new ExprError(`${ctx}: 需要數值，得到字串 "${v}"`);
}

function truthy(v: Value): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v.length > 0;
}

/**
 * Round half away from zero. Defined explicitly (not Math.round, which rounds -0.5 to -0)
 * so other languages can match. See docs/spec/numeric.md.
 */
export function roundHalfAway(x: number): number {
  const r = x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
  // Normalize -0 so results serialize identically in every language.
  return r === 0 ? 0 : r;
}

export function evaluate(e: Expr, scope: Scope): Value {
  if ("const" in e) return e.const;
  if ("ref" in e) {
    const v = scope(e.ref);
    if (v === undefined) throw new ExprError(`未定義的變數：${e.ref}`);
    return v;
  }
  const a = e.args;
  const ev = (i: number) => evaluate(a[i]!, scope);
  const n = (i: number) => num(ev(i), e.op);
  switch (e.op) {
    case "add": return n(0) + n(1);
    case "sub": return n(0) - n(1);
    case "mul": return n(0) * n(1);
    case "div": {
      const d = n(1);
      if (d === 0) throw new ExprError("除以零");
      return n(0) / d;
    }
    case "neg": return -n(0);
    case "not": return !truthy(ev(0));
    case "gt": return n(0) > n(1);
    case "gte": return n(0) >= n(1);
    case "lt": return n(0) < n(1);
    case "lte": return n(0) <= n(1);
    case "eq": return ev(0) === ev(1);
    case "neq": return ev(0) !== ev(1);
    case "and": return truthy(ev(0)) && truthy(ev(1));
    case "or": return truthy(ev(0)) || truthy(ev(1));
    case "min": return Math.min(...a.map((_, i) => n(i)));
    case "max": return Math.max(...a.map((_, i) => n(i)));
    case "clamp": return Math.min(Math.max(n(0), n(1)), n(2));
    case "floor": return Math.floor(n(0));
    case "ceil": return Math.ceil(n(0));
    case "round": return roundHalfAway(n(0));
    case "abs": return Math.abs(n(0));
    case "if": return truthy(ev(0)) ? ev(1) : ev(2);
  }
}

export function evalNumber(e: Expr, scope: Scope): number {
  return num(evaluate(e, scope), "公式結果");
}

export function evalBool(e: Expr, scope: Scope): boolean {
  return truthy(evaluate(e, scope));
}

/** Structural validation of an untrusted tree (e.g. loaded from a project file). */
export function validateExpr(e: unknown, path = "expr"): string[] {
  if (e === null || typeof e !== "object") return [`${path}: 不是物件`];
  const o = e as Record<string, unknown>;
  if ("const" in o) {
    const t = typeof o.const;
    return t === "number" || t === "boolean" || t === "string" ? [] : [`${path}: const 型別不合法`];
  }
  if ("ref" in o) {
    return typeof o.ref === "string" && /^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/.test(o.ref) ? [] : [`${path}: ref 名稱不合法`];
  }
  if ("op" in o) {
    const spec = OPS[o.op as OpName];
    if (!spec) return [`${path}: 不支援的運算子 ${String(o.op)}`];
    if (!Array.isArray(o.args)) return [`${path}: 缺少 args`];
    const errs: string[] = [];
    if (spec.arity >= 0 && o.args.length !== spec.arity) errs.push(`${path}: ${String(o.op)} 需要 ${spec.arity} 個參數`);
    if (spec.arity < 0 && o.args.length < 1) errs.push(`${path}: ${String(o.op)} 至少需要 1 個參數`);
    o.args.forEach((arg, i) => errs.push(...validateExpr(arg, `${path}.${String(o.op)}[${i}]`)));
    return errs;
  }
  return [`${path}: 無法辨識的節點`];
}

export function collectRefs(e: Expr, out = new Set<string>()): Set<string> {
  if ("ref" in e) out.add(e.ref);
  else if ("op" in e) e.args.forEach((a) => collectRefs(a, out));
  return out;
}

// ---------------------------------------------------------------------------
// Infix parser:  atk * skill.multiplier * (1 + dmgBonus)   if(broken, 1, 0.9)
// ---------------------------------------------------------------------------

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "sym"; v: string };

const SYMBOLS = ["&&", "||", ">=", "<=", "==", "!=", "+", "-", "*", "/", "(", ")", ",", ">", "<", "!"];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?%?/.exec(src.slice(i));
      if (!m) throw new ExprError(`無法解析數字（位置 ${i + 1}）`);
      const text = m[0];
      // "50%" is accepted as 0.5 for designer convenience.
      const v = text.endsWith("%") ? Number(text.slice(0, -1)) / 100 : Number(text);
      if (Number.isNaN(v)) throw new ExprError(`無法解析數字：${text}`);
      out.push({ t: "num", v });
      i += text.length;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1);
      if (end < 0) throw new ExprError("字串缺少結尾引號");
      out.push({ t: "str", v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const idm = /^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*/.exec(src.slice(i));
    if (idm) { out.push({ t: "id", v: idm[0] }); i += idm[0].length; continue; }
    const sym = SYMBOLS.find((s) => src.startsWith(s, i));
    if (sym) { out.push({ t: "sym", v: sym }); i += sym.length; continue; }
    throw new ExprError(`無法辨識的字元「${ch}」（位置 ${i + 1}）`);
  }
  return out;
}

const BINARY: Record<string, { op: OpName; prec: number }> = {
  "||": { op: "or", prec: 1 },
  "&&": { op: "and", prec: 2 },
  "==": { op: "eq", prec: 3 }, "!=": { op: "neq", prec: 3 },
  ">": { op: "gt", prec: 3 }, ">=": { op: "gte", prec: 3 },
  "<": { op: "lt", prec: 3 }, "<=": { op: "lte", prec: 3 },
  "+": { op: "add", prec: 4 }, "-": { op: "sub", prec: 4 },
  "*": { op: "mul", prec: 5 }, "/": { op: "div", prec: 5 },
};

const FUNCS = new Set<OpName>(["min", "max", "clamp", "floor", "ceil", "round", "abs", "if"]);

export function parseExpr(src: string): Expr {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isSym = (v: string) => { const t = peek(); return t?.t === "sym" && t.v === v; };
  const expect = (v: string) => {
    if (!isSym(v)) throw new ExprError(`預期「${v}」`);
    p++;
  };

  function primary(): Expr {
    const t = peek();
    if (!t) throw new ExprError("公式不完整");
    if (t.t === "num") { p++; return c(t.v); }
    if (t.t === "str") { p++; return c(t.v); }
    if (t.t === "id") {
      p++;
      if (t.v === "true") return c(true);
      if (t.v === "false") return c(false);
      if (isSym("(")) {
        if (!FUNCS.has(t.v as OpName)) throw new ExprError(`不支援的函式：${t.v}`);
        p++;
        const args: Expr[] = [];
        if (!isSym(")")) {
          args.push(expr(0));
          while (isSym(",")) { p++; args.push(expr(0)); }
        }
        expect(")");
        const node = op(t.v as OpName, ...args);
        const errs = validateExpr(node);
        if (errs.length) throw new ExprError(errs[0]!);
        return node;
      }
      return r(t.v);
    }
    if (t.v === "(") { p++; const e = expr(0); expect(")"); return e; }
    if (t.v === "-") { p++; const inner = primary(); return "const" in inner && typeof inner.const === "number" ? c(-inner.const) : op("neg", inner); }
    if (t.v === "!") { p++; return op("not", primary()); }
    throw new ExprError(`非預期的符號「${t.v}」`);
  }

  function expr(minPrec: number): Expr {
    let left = primary();
    for (;;) {
      const t = peek();
      if (!t || t.t !== "sym") break;
      const b = BINARY[t.v];
      if (!b || b.prec < minPrec) break;
      p++;
      const right = expr(b.prec + 1);
      left = op(b.op, left, right);
    }
    return left;
  }

  if (toks.length === 0) throw new ExprError("公式是空的");
  const result = expr(0);
  if (p < toks.length) throw new ExprError(`多餘的內容：「${tokenText(toks[p]!)}」`);
  return result;
}

function tokenText(t: Tok): string {
  return t.t === "str" ? `"${t.v}"` : String(t.v);
}

export function printExpr(e: Expr, parentPrec = 0): string {
  if ("const" in e) {
    if (typeof e.const === "string") return JSON.stringify(e.const);
    if (typeof e.const === "number" && e.const < 0) return parentPrec > 0 ? `(${e.const})` : String(e.const);
    return String(e.const);
  }
  if ("ref" in e) return e.ref;
  const spec = OPS[e.op];
  if ("infix" in spec) {
    const prec = spec.prec;
    let s: string;
    if (spec.arity === 1) s = `${spec.infix}${printExpr(e.args[0]!, 7)}`;
    // Right operand gets prec+1 so non-associative ops (a - (b - c)) keep their parentheses.
    else s = `${printExpr(e.args[0]!, prec)} ${spec.infix} ${printExpr(e.args[1]!, prec + 1)}`;
    return prec < parentPrec ? `(${s})` : s;
  }
  return `${e.op}(${e.args.map((a) => printExpr(a, 0)).join(", ")})`;
}
