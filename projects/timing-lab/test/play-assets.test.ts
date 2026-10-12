import { describe, expect, it } from "vitest";
import {
  LIMITS, PACK_FORMAT, PACK_VERSION, blobToDataUrl, checkUpload, emptyPack, packToFile, parseDataUrl, parsePackFile, parsePackText,
  sanitizeImageOptions,
} from "../src/play/assets/pack";
import { soundsForEvents } from "../src/play/audio/events";
import { defaultSettings, parseSettings } from "../src/play/storage";
import { bulletParryDefault, type GameEvent } from "../src/play/game";

// 1x1 transparent PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

const good = () => ({
  format: PACK_FORMAT, version: PACK_VERSION, name: "測試包",
  images: { "player.idle": { dataUrl: PNG, frames: 4, fps: 12, scale: 1.5, offsetX: 10, offsetY: -5 } },
  sounds: { "sfx.hit": { dataUrl: WAV, volume: 0.5 } },
});

describe("pack file parsing", () => {
  it("parses a good file into blobs with options", () => {
    const r = parsePackFile(good());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.name).toBe("測試包");
    expect(r.pack.images["player.idle"]).toMatchObject({ frames: 4, fps: 12, scale: 1.5, offsetX: 10, offsetY: -5 });
    expect(r.pack.images["player.idle"]?.blob.type).toBe("image/png");
    expect(r.pack.sounds["sfx.hit"]?.volume).toBe(0.5);
    expect(r.bytes).toBeGreaterThan(0);
  });

  it("rejects wrong format and version", () => {
    expect(parsePackFile({ ...good(), format: "other" })).toMatchObject({ ok: false });
    const v = parsePackFile({ ...good(), version: 2 });
    expect(v.ok).toBe(false);
    expect(parsePackFile(null).ok).toBe(false);
    expect(parsePackText("not json")).toMatchObject({ ok: false, error: expect.stringContaining("JSON") });
  });

  it("rejects non-image / non-audio MIME types and bad data URLs", () => {
    const html = "data:text/html;base64,PGI+aGk8L2I+";
    const a = parsePackFile({ ...good(), images: { background: { dataUrl: html } } });
    expect(a).toMatchObject({ ok: false, error: expect.stringContaining("不被接受") });
    const b = parsePackFile({ ...good(), sounds: { "sfx.hit": { dataUrl: PNG } } });
    expect(b.ok).toBe(false);
    const svg = parsePackFile({ ...good(), images: { background: { dataUrl: "data:image/svg+xml;base64,PHN2Zy8+" } } });
    expect(svg.ok).toBe(false);
    expect(parsePackFile({ ...good(), images: { background: { dataUrl: "http://x/y.png" } } }).ok).toBe(false);
  });

  it("enforces per-file and total size limits", () => {
    const big = (bytes: number) => "data:image/png;base64," + "A".repeat(Math.ceil((bytes * 4) / 3 / 4) * 4);
    const one = parsePackFile({ ...good(), images: { background: { dataUrl: big(LIMITS.fileBytes + 1024) } } });
    expect(one).toMatchObject({ ok: false, error: expect.stringContaining("單檔上限") });
    const per = LIMITS.fileBytes - 1024;
    const images = Object.fromEntries(["a", "b", "c", "d"].map((k) => [k, { dataUrl: big(per) }]));
    const total = parsePackFile({ ...good(), images });
    expect(total).toMatchObject({ ok: false, error: expect.stringContaining("總大小") });
    expect(parsePackText(" ".repeat(LIMITS.textBytes + 1)).ok).toBe(false);
  });

  it("round-trips through packToFile", async () => {
    const parsed = parsePackFile(good());
    if (!parsed.ok) throw new Error("setup");
    const file = await packToFile(parsed.pack);
    expect(file.format).toBe(PACK_FORMAT);
    const again = parsePackFile(JSON.parse(JSON.stringify(file)));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.pack.images["player.idle"]?.frames).toBe(4);
    expect(await blobToDataUrl(again.pack.images["player.idle"]!.blob)).toBe(PNG);
  });
});

describe("helpers", () => {
  it("parseDataUrl computes decoded size", () => {
    expect(parseDataUrl("data:image/png;base64,QUJD")).toMatchObject({ mime: "image/png", bytes: 3 });
    expect(parseDataUrl("data:image/png;base64,QUI=")?.bytes).toBe(2);
    expect(parseDataUrl("nope")).toBeNull();
  });
  it("sanitizes image options", () => {
    expect(sanitizeImageOptions({ frames: 999, fps: 0, scale: 100, offsetX: -9999 })).toMatchObject({ frames: 64, fps: 1, scale: 4, offsetX: -400, offsetY: 0 });
    expect(sanitizeImageOptions({ frames: Number.NaN }).frames).toBe(1);
  });
  it("checks uploads", () => {
    expect(checkUpload("image", { type: "image/png", size: 10 })).toBeNull();
    expect(checkUpload("image", { type: "audio/wav", size: 10 })).not.toBeNull();
    expect(checkUpload("sound", { type: "audio/mpeg", size: LIMITS.fileBytes + 1 })).not.toBeNull();
    expect(emptyPack("  ").name).toBe("未命名素材包");
  });
});

describe("sound events", () => {
  const popup = (tone: "perfect" | "success" | "fail" | "info", pass = false): GameEvent => ({ type: "popup", text: "x", tone, x: 0, y: 0, ...(pass ? { pass: true } : {}) });
  it("maps game events to sound ids", () => {
    expect(soundsForEvents([{ type: "fire", kind: "normal", x: 0, y: 0 }])).toEqual(["sfx.fire"]);
    expect(soundsForEvents([popup("success")])).toEqual(["sfx.parry"]);
    expect(soundsForEvents([popup("success", true)])).toEqual(["sfx.dodge"]);
    expect(soundsForEvents([popup("perfect", true)])).toEqual(["sfx.perfect"]);
    expect(soundsForEvents([popup("fail"), { type: "hurt" }])).toEqual(["sfx.hit"]);
    expect(soundsForEvents([popup("info")])).toEqual([]);
    expect(soundsForEvents([{ type: "accept", interaction: "skill" }, { type: "vfx", name: "skill" }])).toEqual(["sfx.skill"]);
    expect(soundsForEvents([{ type: "accept", interaction: "parry" }])).toEqual([]);
    expect(soundsForEvents([{ type: "defeated" }])).toEqual(["sfx.gameOver"]);
  });
  it("dedupes within a batch", () => {
    const f: GameEvent = { type: "fire", kind: "normal", x: 0, y: 0 };
    expect(soundsForEvents([f, f, f])).toEqual(["sfx.fire"]);
  });
});

describe("settings", () => {
  it("old v1 saves without asset fields still load with defaults", () => {
    const old = JSON.stringify({ config: bulletParryDefault(), difficulty: 1.5, showFrameBar: false });
    const s = parseSettings(old);
    expect(s).not.toHaveProperty("config"); // rules moved to the shell; a stored copy is ignored
    expect(s.difficulty).toBe(1.5);
    expect(s).toMatchObject({ packActive: null, packLast: null, volume: 0.7, muted: false });
  });
  it("reads asset fields and clamps volume", () => {
    const d = defaultSettings();
    const s = parseSettings(JSON.stringify({ ...d, packActive: "abc", packLast: "abc", volume: 5, muted: true }));
    expect(s).toMatchObject({ packActive: "abc", packLast: "abc", volume: 1, muted: true });
    expect(parseSettings("garbage")).toEqual(d);
    expect(parseSettings(null)).toEqual(d);
  });
});
