import { applyLoadout } from "@gml/core";
import { describe, expect, it } from "vitest";
import { applyTemplate, buildLoadout, defaultSel, sanitize } from "../src/equipment";
import { hsrGroup } from "../src/presets";

const himeko = hsrGroup.presets.find((p) => p.id === "hsr-1003")!.apply!;

describe("@gml/data-hsr equipment", () => {
  it("an untouched selection only adds traces", () => {
    const { loadout } = buildLoadout(himeko, defaultSel(himeko));
    expect(loadout.pieces.map((p) => p.id)).toEqual(["traces"]);
  });

  it("the dps template fills six relics and raises ATK", () => {
    const sel = applyTemplate(himeko, defaultSel(himeko), "dps");
    const { loadout } = buildLoadout(himeko, sel);
    expect(loadout.pieces.filter((p) => p.id.startsWith("relic-"))).toHaveLength(6);
    expect(applyLoadout(himeko, loadout).unit.stats.atk!).toBeGreaterThan(himeko.stats.atk!);
  });

  it("sanitize repairs garbage into a valid selection", () => {
    expect(sanitize({ lc: "nope", rank: 9, relics: { head: { setId: 5, subs: "x" } } }, himeko)).toEqual(defaultSel(himeko));
  });
});
