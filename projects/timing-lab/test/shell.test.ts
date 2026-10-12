import { describe, expect, it } from "vitest";
import { CONFIG_KEY, LEGACY_GAME_SETTINGS_KEY, loadSharedConfig } from "../src/shell/config";
import { GAME_PRESET_ID, bulletParryDefault, gamePresets } from "../src/shell/presets";
import { defaultSettings, parseSettings } from "../src/play/storage";

const store = (items: Record<string, string>) => ({ getItem: (k: string) => items[k] ?? null });
const wrap = (config: unknown) => JSON.stringify({ format: "gml-timing-config", version: 1, config });

/** A recognisably custom config (not equal to any built-in, so it is never relocalized). */
const custom = (id: string) => {
  const c = bulletParryDefault();
  c.id = id;
  c.name = `Custom ${id}`;
  return c;
};

describe("loadSharedConfig", () => {
  it("the lab key wins over the old game settings", () => {
    const s = store({
      [CONFIG_KEY]: wrap(custom("from-lab")),
      [LEGACY_GAME_SETTINGS_KEY]: JSON.stringify({ config: custom("from-game") }),
    });
    expect(loadSharedConfig(s).id).toBe("from-lab");
  });

  it("migrates the config of the old game settings when the lab key is missing", () => {
    const s = store({ [LEGACY_GAME_SETTINGS_KEY]: JSON.stringify({ config: custom("from-game"), difficulty: 2 }) });
    expect(loadSharedConfig(s).id).toBe("from-game");
  });

  it("falls back to the game default when the lab key is corrupt and the game settings have no usable config", () => {
    const s = store({ [CONFIG_KEY]: "{not json", [LEGACY_GAME_SETTINGS_KEY]: JSON.stringify({ config: { version: 1 } }) });
    expect(loadSharedConfig(s).id).toBe(GAME_PRESET_ID);
    expect(GAME_PRESET_ID).toBe("bullet-parry-default");
  });

  it("uses the game default when nothing is stored or storage is unavailable", () => {
    expect(loadSharedConfig(store({})).id).toBe("bullet-parry-default");
    expect(loadSharedConfig(null).id).toBe("bullet-parry-default");
    expect(loadSharedConfig({ getItem: () => { throw new Error("denied"); } }).id).toBe("bullet-parry-default");
  });

  it("a corrupt lab key does not hide a usable game config", () => {
    const s = store({ [CONFIG_KEY]: "garbage", [LEGACY_GAME_SETTINGS_KEY]: JSON.stringify({ config: custom("from-game") }) });
    expect(loadSharedConfig(s).id).toBe("from-game");
  });

  it("an untouched built-in saved in another language comes back in the current one", () => {
    const zh = bulletParryDefault("zh-Hant");
    const loaded = loadSharedConfig(store({ [CONFIG_KEY]: wrap(zh) }));
    expect(loaded).toEqual(bulletParryDefault());
  });

  it("an edited built-in is left alone", () => {
    const edited = bulletParryDefault("zh-Hant");
    edited.fps += 1;
    expect(loadSharedConfig(store({ [CONFIG_KEY]: wrap(edited) })).fps).toBe(edited.fps);
  });
});

describe("shared presets", () => {
  it("the list starts with the game default and has unique ids", () => {
    const ids = gamePresets().map((p) => p.id);
    expect(ids[0]).toBe(GAME_PRESET_ID);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("game settings without the rules", () => {
  it("parse without a config field", () => {
    const s = parseSettings(JSON.stringify({ difficulty: 1.4, practice: true }));
    expect(s).toMatchObject({ difficulty: 1.4, practice: true });
    expect(s).not.toHaveProperty("config");
    expect(defaultSettings()).not.toHaveProperty("config");
  });
});
