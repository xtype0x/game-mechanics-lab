import { Gacha } from "@ggt/core";
import { describe, expect, it } from "vitest";
import { GAMES, buildModel } from "../../src/tools/gacha/catalog/games";
import { decodeRules, encodeRules, parseRules, rulesInHash, serializeRules } from "../../src/tools/gacha/share";

const hsr = () => { const g = GAMES.find((x) => x.id === "hsr")!; return buildModel(g, g.types[0]!); };
const target: Gacha.Target = { tier: "top", mode: "featured", copies: 2 };

describe("share: parse", () => {
  it("round-trips rules and goal through the file format", () => {
    const r = parseRules(serializeRules({ model: hsr(), target }));
    expect(r.ok && r.rules).toEqual({ model: hsr(), target });
  });

  it("accepts a bare model (no wrapper) and every preset", () => {
    for (const p of Gacha.PRESETS) expect(parseRules(JSON.stringify(p.model)).ok).toBe(true);
  });

  it("rejects junk with a readable reason, never throws", () => {
    const bad = (x: unknown) => { const r = parseRules(typeof x === "string" ? x : JSON.stringify(x)); return r.ok ? "ok" : r.error; };
    expect(bad("{not json")).toBe("不是有效的 JSON");
    expect(bad({ version: 1 })).toBe("不是抽卡規則 2.x 的模型");
    expect(bad({ ...hsr(), tiers: "x" })).toBe("稀有度必須有 1 到 12 個");
    expect(bad({ ...hsr(), modules: [{ kind: "softPity", tier: "top", start: "74", step: 0.06 }] })).toBe("第 1 條規則格式不正確或不認得");
    expect(bad({ ...hsr(), modules: [{ kind: "script", code: "alert(1)" }] })).toBe("第 1 條規則格式不正確或不認得");
    expect(bad({ ...hsr(), items: [{ id: "a", name: 3, kind: "unit" }] })).toBe("物品格式不正確");
    expect(bad("x".repeat(300_000))).toBe("檔案太大");
    // Shape is fine but the rules are not: the model validator's message comes through.
    expect(bad({ ...hsr(), modules: [{ kind: "hardPity", tier: "nope", at: 10 }] })).toMatch(/^規則有錯誤：/);
  });

  it("drops a malformed goal but keeps the rules", () => {
    const r = parseRules(JSON.stringify({ format: "ggt-gacha-rules", model: hsr(), target: { tier: "top", mode: "everything" } }));
    expect(r.ok && r.rules.target).toBeUndefined();
  });
});

describe("share: link", () => {
  it("compressed link round-trips and stays short", async () => {
    const code = await encodeRules({ model: hsr(), target });
    expect(code[0]).toBe("z");
    expect(code.length).toBeLessThan(serializeRules({ model: hsr(), target }).length);
    const r = await decodeRules(code);
    expect(r.ok && r.rules.model).toEqual(hsr());
  });

  it("uncompressed form and broken codes", async () => {
    const plain = "j" + Buffer.from(serializeRules({ model: hsr() })).toString("base64url");
    expect((await decodeRules(plain)).ok).toBe(true);
    expect(await decodeRules("zAAAA")).toEqual({ ok: false, error: "分享連結已損壞或不完整" });
    expect(await decodeRules("q123")).toEqual({ ok: false, error: "分享連結格式不正確" });
  });

  it("reads the code from the hash only in the exact form", () => {
    expect(rulesInHash("#rules=zAb_-9")).toBe("zAb_-9");
    expect(rulesInHash("#other=1")).toBeNull();
    expect(rulesInHash("#rules=a b")).toBeNull();
  });
});
