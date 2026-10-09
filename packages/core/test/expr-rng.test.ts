import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ExprError, Rng, evaluate, objectScope, parseExpr, printExpr, roundHalfAway, validateExpr, type Expr } from "../src";

describe("expr parser", () => {
  const scope = objectScope({ a: 2, b: 3, s: "x", t: true });
  const ev = (src: string) => evaluate(parseExpr(src), scope);

  it("respects precedence and associativity", () => {
    expect(ev("1 + 2 * 3")).toBe(7);
    expect(ev("(1 + 2) * 3")).toBe(9);
    expect(ev("10 - 4 - 3")).toBe(3);
    expect(ev("12 / 3 / 2")).toBe(2);
    expect(ev("-a * b")).toBe(-6);
    expect(ev("1 + 2 > 2 && !false")).toBe(true);
    expect(ev("a > 5 || b == 3")).toBe(true);
  });

  it("supports functions, strings and percent literals", () => {
    expect(ev('if(s == "x", 50%, 0)')).toBe(0.5);
    expect(ev("clamp(a * 10, 0, 15)")).toBe(15);
    expect(ev("max(a, b, 1)")).toBe(3);
    expect(ev("round(-2.5)")).toBe(-3);
  });

  it("rejects bad input with readable errors", () => {
    expect(() => parseExpr("1 +")).toThrow(ExprError);
    expect(() => parseExpr("foo(1)")).toThrow(/不支援的函式/);
    expect(() => parseExpr("clamp(1, 2)")).toThrow(/3 個參數/);
    expect(() => parseExpr("1 # 2")).toThrow(/無法辨識/);
    expect(() => ev("missing + 1")).toThrow(/未定義/);
    expect(() => ev("1 / 0")).toThrow(/除以零/);
  });

  it("validateExpr rejects injected node types", () => {
    expect(validateExpr({ op: "eval", args: [] })).not.toHaveLength(0);
    expect(validateExpr({ ref: "a; b" })).not.toHaveLength(0);
    expect(validateExpr(parseExpr("a + b * 2"))).toEqual([]);
  });

  const arbExpr: fc.Arbitrary<Expr> = fc.letrec<{ e: Expr }>((tie) => ({
    e: fc.oneof(
      { depthSize: "small", withCrossShrink: true },
      fc.integer({ min: 0, max: 100 }).map((v) => ({ const: v }) as Expr),
      fc.constantFrom("a", "b").map((v) => ({ ref: v }) as Expr),
      fc.tuple(fc.constantFrom("add", "sub", "mul"), tie("e"), tie("e")).map(([o, x, y]) => ({ op: o, args: [x, y] }) as Expr),
      tie("e").map((x) => ({ op: "neg", args: [x] }) as Expr),
      fc.tuple(tie("e"), tie("e")).map(([x, y]) => ({ op: "max", args: [x, y] }) as Expr),
    ),
  })).e;

  it("print → parse preserves value (property)", () => {
    fc.assert(
      fc.property(arbExpr, (e) => {
        expect(evaluate(parseExpr(printExpr(e)), scope)).toBe(evaluate(e, scope));
      }),
      { numRuns: 500 },
    );
  });

  it("roundHalfAway is symmetric", () => {
    fc.assert(fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (x) => {
      expect(roundHalfAway(-x)).toBe(-roundHalfAway(x) + 0);
      expect(Object.is(roundHalfAway(x), -0)).toBe(false);
    }));
  });
});

describe("rng", () => {
  it("is reproducible per seed and stream", () => {
    const seq = (seed: number | string, stream?: string) => { const r = new Rng(seed, stream); return Array.from({ length: 8 }, () => r.nextU32()); };
    expect(seq(1)).toEqual(seq(1));
    expect(seq(1)).not.toEqual(seq(2));
    expect(seq(1, "a")).not.toEqual(seq(1, "b"));
    expect(seq("戰鬥")).toEqual(seq("戰鬥"));
  });

  it("snapshot/restore continues the same sequence", () => {
    const r = new Rng(7);
    r.next();
    const snap = r.snapshot();
    const a = [r.next(), r.next()];
    const r2 = Rng.fromState(snap);
    expect([r2.next(), r2.next()]).toEqual(a);
  });

  it("next() stays in [0,1) and is roughly uniform", () => {
    const r = new Rng(99);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100000; i++) {
      const x = r.next();
      expect(x >= 0 && x < 1).toBe(true);
      buckets[Math.floor(x * 10)]++;
    }
    for (const b of buckets) expect(Math.abs(b - 10000)).toBeLessThan(500);
  });

  it("int(n) covers range without bias", () => {
    const r = new Rng(5);
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 60000; i++) counts[r.int(6)]++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(400);
    expect(() => r.int(0)).toThrow(RangeError);
  });
});
