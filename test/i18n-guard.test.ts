// Leftover-Chinese guard: UI source of migrated folders must keep user-facing Chinese in i18n dictionaries.
// Add a folder to GUARDED when its project is migrated (docs/i18n/PLAN.md, phase 2).
// A line may opt out with an `i18n-ignore: <reason>` comment (glyphs, data-matching literals, text owned by @gml/core).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// CJK ideographs, CJK punctuation, full-width forms.
const CJK = /[一-鿿　-〿＀-￯]/;

const GUARDED: { dir: string; allow: string[] }[] = [
  { dir: "apps/site/src", allow: ["/i18n/", "/content/pages/"] },
  { dir: "projects/timing-lab/src", allow: ["/i18n/"] },
  { dir: "projects/bullet-parry/src", allow: ["/i18n/"] },
  { dir: "packages/ui/src/timing", allow: ["/i18n/"] },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("no hard-coded Chinese in migrated UI source", () => {
  for (const { dir, allow } of GUARDED) {
    it(`${dir}: Chinese text lives only in ${allow.join(", ")}`, () => {
      const hits: string[] = [];
      for (const file of sourceFiles(join(root, dir))) {
        const rel = relative(root, file).split(sep).join("/");
        if (allow.some((a) => rel.includes(a))) continue;
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
      expect(hits, "move text into the i18n dictionaries").toEqual([]);
    });
  }
});
