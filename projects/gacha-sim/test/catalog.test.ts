import { Gacha } from "@gml/core";
import { describe, expect, it } from "vitest";
import { GAMES, buildModel, typeFor } from "../src/catalog/games";
import { adaptHoyo, adaptSchale, adaptZzz, type LiveData } from "../src/catalog/live";
import { MANUAL, manualBanners, withManual } from "../src/catalog/manual";
import snapshot from "../src/catalog/snapshot.json";

describe("live adapters", () => {
  it("hoyo calendar: characters vs light cones/weapons, mixed banners skipped", () => {
    const out = adaptHoyo("hsr", {
      banners: [
        { id: 1, version: "4.6", characters: [{ id: 1505, name: "A", rarity: 5 }, { id: 1201, name: "B", rarity: 4 }], light_cones: [], start_time: 10, end_time: 20 },
        { id: 2, light_cones: [{ id: 23001, name: "LC", rarity: 5 }, { id: 21000, name: "lc4", rarity: 4 }], start_time: 10, end_time: 20 },
        { id: 3, characters: [{ id: 1, name: "x", rarity: 5 }], light_cones: [{ id: 2, name: "y", rarity: 5 }], start_time: 0, end_time: 0 },
        { id: 4, characters: [{ id: 9, name: "only4", rarity: 4 }], start_time: 0, end_time: 0 },
      ],
    });
    expect(out.map((b) => [b.id, b.kind, b.featured5.map((u) => u.name), b.featured4.map((u) => u.name)])).toEqual([
      ["hsr-1", "character", ["A"], ["B"]],
      ["hsr-2", "weapon", ["LC"], ["lc4"]],
    ]);
  });

  it("SchaleDB: one banner per region and pickup, names from the student list", () => {
    const out = adaptSchale(
      { Regions: [{ Name: "Jp", CurrentGacha: [{ characters: [10151, 20062], start: 5, end: 9 }] }, { Name: "Cn", CurrentGacha: [{ characters: [1], start: 0, end: 0 }] }] },
      { 10151: { Name: "安娜", StarGrade: 3 }, 20062: { Name: "艾莉娜", StarGrade: 3 } },
    );
    expect(out).toEqual([{ id: "ba-jp-5-0", game: "ba", kind: "pickup", region: "jp", featured5: [{ id: "10151", name: "安娜" }, { id: "20062", name: "艾莉娜" }], featured4: [], start: 5, end: 9 }]);
  });

  it("ZZZ: one banner per S-rank channel, sharing the A-ranks; empty names get a placeholder", () => {
    const out = adaptZzz({
      banners: [
        { banner_type: "GACHA_TYPE_CHARACTER_UP", version: "3.2", agents: [{ id: 1, name: "S1", rarity: "S" }, { id: 2, name: "S2", rarity: "S" }, { id: 3, name: "A1", rarity: "A" }], start_time: 5, end_time: 9 },
        { banner_type: "GACHA_TYPE_WEAPON_UP", w_engines: [{ id: 7, name: "", rarity: "S" }, { id: 8, name: "w", rarity: "A" }], start_time: 5, end_time: 9 },
        { banner_type: "GACHA_TYPE_OTHER", agents: [{ id: 9, name: "x", rarity: "S" }], start_time: 0, end_time: 0 },
      ],
    });
    expect(out.map((b) => [b.id, b.kind, b.featured5.map((u) => u.name), b.featured4.map((u) => u.name)])).toEqual([
      ["zzz-character-1", "character", ["S1"], ["A1"]],
      ["zzz-character-2", "character", ["S2"], ["A1"]],
      ["zzz-weapon-7", "weapon", ["（名稱未公開）"], ["w"]],
    ]);
  });

  it("the bundled snapshot has the expected shape", () => {
    const s = snapshot as LiveData;
    expect(typeof s.fetchedAt).toBe("string");
    expect(s.banners.length).toBeGreaterThan(0);
    for (const b of s.banners) expect(GAMES.filter((g) => g.data === "live").map((g) => g.id)).toContain(b.game);
  });
});

describe("manual banner list", () => {
  it("only covers games without a live source; valid times, ids unique", () => {
    const manualGames = new Set(GAMES.filter((g) => g.data === "manual").map((g) => g.id));
    expect(/^\d{4}-\d{2}-\d{2}$/.test(MANUAL.updated)).toBe(true);
    const list = manualBanners();
    for (const [i, b] of list.entries()) {
      const e = MANUAL.banners[i]!;
      expect(manualGames.has(b.game), b.id).toBe(true);
      expect(Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start, b.id).toBe(true);
      expect(/([+-]\d{2}:\d{2}|Z)$/.test(e.start) && /([+-]\d{2}:\d{2}|Z)$/.test(e.end),`${b.id}: times need an offset`).toBe(true);
      expect(b.featured5.length, b.id).toBeGreaterThan(0);
      expect(e.source.startsWith("https://"), b.id).toBe(true);
      const g = GAMES.find((x) => x.id === b.game)!;
      expect(typeFor(g, b), `${b.id}: no ${b.kind} pool`).toBeDefined();
    }
    expect(new Set(list.map((b) => b.id)).size).toBe(list.length);
  });

  it("is merged over live data and replaces older copies", () => {
    const d = withManual(withManual(snapshot as LiveData));
    expect(d.banners.length).toBe((snapshot as LiveData).banners.length + MANUAL.banners.length);
  });
});

describe("catalog models", () => {
  const live = snapshot as LiveData;
  const worst: Record<string, number | null> = {
    "hsr:character": 180, "hsr:weapon": 160, "hsr:standard": 90,
    "genshin:character": 180, "genshin:weapon": 154, "genshin:standard": 90,
    "zzz:character": 180, "zzz:weapon": 160, "zzz:standard": 90,
    "ba:pickup:global": 200, "ba:pickup:jp": 200,
    "wuwa:character": 160, "wuwa:weapon": 80, "wuwa:standard": 80,
    "endfield:character": 120, "endfield:standard": 80,
    "nte:character": 90, "nte:standard": 90,
  };
  for (const g of GAMES) {
    for (const t of g.types) {
      const key = `${g.id}:${t.kind}${t.region ? `:${t.region}` : ""}`;
      it(`${key}: valid, and the guaranteed maximum matches the rules`, () => {
        const banner = t.kind === "standard" ? undefined : withManual(live).banners.find((b) => b.game === g.id && typeFor(g, b) === t);
        for (const m of [buildModel(g, t), buildModel(g, t, banner)]) {
          expect(Gacha.validateModel(m).filter((i) => i.level === "error")).toEqual([]);
          const epi = m.modules.find((x) => x.kind === "epitomized");
          const target: Gacha.Target = epi && epi.kind === "epitomized"
            ? { tier: "top", mode: "item", itemId: epi.item, copies: 1 }
            : { tier: "top", mode: m.modules.some((x) => x.kind === "featured" && x.tier === "top") ? "featured" : "tier", copies: 1 };
          expect(Gacha.worstCase(m, target)).toBe(worst[key]);
        }
      });
    }
  }

  it("mean pulls match the published consolidated rates where the soft pity was fitted or checked", () => {
    const mean = (game: string, kind: string) => {
      const g = GAMES.find((x) => x.id === game)!;
      const m = buildModel(g, g.types.find((t) => t.kind === kind)!);
      return Gacha.targetDistribution(m, { tier: "top", mode: "tier", copies: 1 }).mean;
    };
    expect(1 / mean("hsr", "character")).toBeCloseTo(0.016, 3);
    expect(1 / mean("zzz", "character")).toBeCloseTo(0.016, 3);
    expect(1 / mean("zzz", "weapon")).toBeCloseTo(0.02, 3);
    expect(1 / mean("wuwa", "character")).toBeCloseTo(0.018, 3);
    expect(1 / mean("nte", "character")).toBeCloseTo(0.0187, 3);
  });

  it("live names fill the featured items; ids keep the source ids", () => {
    const g = GAMES.find((x) => x.id === "hsr")!;
    const t = g.types.find((x) => x.kind === "character")!;
    const m = buildModel(g, t, { id: "hsr-1", game: "hsr", kind: "character", featured5: [{ id: "1505", name: "緋英" }], featured4: [{ id: "1201", name: "青雀" }], start: 0, end: 0 });
    expect(m.name).toBe("崩壞：星穹鐵道・限定角色：緋英");
    expect(m.items.filter((x) => x.id.startsWith("f")).map((x) => [x.id, x.name])).toEqual([["f5:1505", "緋英"], ["f4:1201", "青雀"]]);
  });

  it("Blue Archive: two pickups double the featured share", () => {
    const g = GAMES.find((x) => x.id === "ba")!;
    const t = g.types.find((x) => x.region === "jp")!;
    const m = buildModel(g, t, { id: "b", game: "ba", kind: "pickup", region: "jp", featured5: [{ id: "1", name: "a" }, { id: "2", name: "b" }], featured4: [], start: 0, end: 0 });
    const f = m.modules.find((x) => x.kind === "featured" && x.tier === "top");
    expect(f && f.kind === "featured" ? f.share : 0).toBeCloseTo(1.4 / 3, 12);
  });
});
