import { describe, expect, it } from "vitest";
import { allPages, listProjects, pageHtml, writePages } from "../build/pages.mjs";
import { games } from "../src/content/games";

describe("site pages", () => {
  it("every project manifest is valid and its generated page is up to date", () => {
    expect(listProjects().length).toBeGreaterThan(0);
    expect(writePages({ check: true })).toEqual([]); // fix: npm run pages -w @gml/site
  });

  it("every project manifest has English fields and its page hands both back labels to the host", () => {
    for (const p of listProjects()) {
      expect(p.en?.title, `${p.id}: en.title`).toBeTruthy();
      expect(p.en?.description, `${p.id}: en.description`).toBeTruthy();
      if (!p.back) continue;
      expect(p.en.backLabel, `${p.id}: en.backLabel`).toBeTruthy();
      const html = pageHtml(p);
      expect(html).toContain(JSON.stringify({ "zh-Hant": p.back.label, en: p.en.backLabel }));
      expect(html).toContain(JSON.stringify(`${p.en.title} — Game Mechanics Lab`));
    }
  });

  it("every tool link on a game hub points at an existing page", () => {
    const pages = new Set(Object.values(allPages()));
    for (const g of games) {
      for (const t of g.tools) {
        if (!t.href || t.href.startsWith("#")) continue;
        expect(pages, `${g.id}/${t.id}: ${t.href}`).toContain(t.href.split(/[?#]/)[0]);
      }
    }
  });
});
