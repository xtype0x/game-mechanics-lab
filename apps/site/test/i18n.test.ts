import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { crossTools, games } from "../src/content/games";
import { en, zhHant } from "../src/i18n";

const srcDir = join(__dirname, "..", "src");
// CJK ideographs, CJK punctuation, full-width forms.
const CJK = /[一-鿿　-〿＀-￯]/;

describe("site dictionaries", () => {
  for (const [name, dict] of [["zh-Hant", zhHant], ["en", en]] as const) {
    it(`${name} has text for every game and tool`, () => {
      const nonEmpty = (s: unknown) => typeof s === "string" && s.length > 0;
      for (const g of games) {
        const text = dict.games[g.id];
        expect(nonEmpty(text.name) && nonEmpty(text.shortName) && nonEmpty(text.blurb), g.id).toBe(true);
        const tools = text.tools as Record<string, { title: string; summary: string }>;
        for (const t of g.tools) expect(nonEmpty(tools[t.id]?.title) && nonEmpty(tools[t.id]?.summary), `${g.id}/${t.id}`).toBe(true);
      }
      for (const t of crossTools) {
        const text = dict.crossTools[t.id];
        expect(nonEmpty(text?.title) && nonEmpty(text?.summary), t.id).toBe(true);
      }
    });
  }
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("no hard-coded Chinese in components", () => {
  it("only src/i18n and src/content/pages contain Chinese text", () => {
    const hits: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      const rel = relative(srcDir, file).split(sep).join("/");
      if (rel.startsWith("i18n/") || rel.startsWith("content/pages/")) continue;
      let inBlock = false;
      readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
        if (inBlock) { if (line.includes("*/")) inBlock = false; return; }
        if (line.includes("i18n-ignore")) return;
        let code = line;
        const open = code.indexOf("/*");
        if (open >= 0 && !code.includes("*/", open)) { inBlock = true; code = code.slice(0, open); }
        code = code.replace(/\/\*.*?\*\//g, "").replace(/(^|[^:])\/\/.*$/, "$1");
        if (CJK.test(code)) hits.push(`${rel}:${i + 1}`);
      });
    }
    expect(hits, "move text into src/i18n/*").toEqual([]);
  });
});
