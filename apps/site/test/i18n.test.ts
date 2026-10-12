import { describe, expect, it } from "vitest";
import { crossTools, games } from "../src/content/games";
import { en, zhHant } from "../src/i18n";

// The leftover-Chinese scan lives in the repo-root test/i18n-guard.test.ts.
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
