/**
 * Static checks for timing configs (docs/spec/timing.md §8). Messages are UI text (Traditional Chinese);
 * `path` points at the offending field.
 */
import { collectRefs, validateExpr, type Expr } from "../expr";
import type { TimingConfig, ValidationIssue } from "./types";

const FIXED_REFS = ["frame", "attack.damage", "catch.index", "action.shrink", "action.buffered"];

export function validateTiming(config: TimingConfig): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const err = (path: string, message: string) => out.push({ level: "error", path, message });
  const warn = (path: string, message: string) => out.push({ level: "warning", path, message });
  const isFrames = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
  const frameField = (path: string, label: string, v: unknown) => {
    if (!isFrames(v)) err(path, `${label}必須是非負整數幀數`);
  };

  const tagIds = new Set(config.tags.map((x) => x.id));
  const resIds = new Set(config.resources.map((x) => x.id));
  const statusIds = new Set(config.statuses.map((x) => x.id));
  const outcomeIds = new Set(config.outcomes.map((x) => x.id));
  const interIds = new Set(config.interactions.map((x) => x.id));

  const dupes = (items: { id: string }[], base: string, label: string) => {
    const seen = new Set<string>();
    items.forEach((x, i) => {
      if (seen.has(x.id)) err(`${base}[${i}].id`, `${label} ID「${x.id}」重複`);
      seen.add(x.id);
    });
  };
  dupes(config.tags, "tags", "標籤");
  dupes(config.resources, "resources", "資源");
  dupes(config.statuses, "statuses", "狀態");
  dupes(config.outcomes, "outcomes", "結果");
  dupes(config.interactions, "interactions", "互動");
  config.statuses.forEach((s, i) => {
    if (s.id === "invulnerable") err(`statuses[${i}].id`, "「invulnerable」是內建狀態，不必宣告");
  });

  if (!(config.fps > 0)) err("fps", "fps 必須大於 0");
  frameField("inputOffset", "延遲校正 inputOffset", config.inputOffset);
  if (!resIds.has(config.healthResource)) err("healthResource", `生命資源「${config.healthResource}」不存在`);
  if (!outcomeIds.has(config.hitOutcome)) err("hitOutcome", `命中結果「${config.hitOutcome}」不存在`);
  config.resources.forEach((r, i) => {
    if (!(r.max >= 0)) err(`resources[${i}].max`, `資源「${r.id}」的上限不可為負`);
    if (!(r.initial >= 0 && r.initial <= r.max)) err(`resources[${i}].initial`, `資源「${r.id}」的初始值必須在 0 到上限之間`);
  });

  const refProblem = (ref: string): string | null => {
    if (FIXED_REFS.includes(ref)) return null;
    if (ref.startsWith("res.")) return resIds.has(ref.slice(4)) ? null : `資源「${ref.slice(4)}」不存在`;
    if (ref.startsWith("status.")) {
      const id = ref.slice(7);
      return id === "invulnerable" || statusIds.has(id) ? null : `狀態「${id}」不存在`;
    }
    if (ref.startsWith("charges.")) return interIds.has(ref.slice(8)) ? null : `互動「${ref.slice(8)}」不存在`;
    return `未定義的變數「${ref}」`;
  };
  const checkExpr = (e: unknown, path: string) => {
    const bad = validateExpr(e, path);
    if (bad.length) { err(path, bad[0]!); return; }
    for (const ref of collectRefs(e as Expr)) {
      const why = refProblem(ref);
      if (why) err(path, why);
    }
  };

  config.outcomes.forEach((o, oi) => {
    o.effects.forEach((ef, ei) => {
      const p = `outcomes[${oi}].effects[${ei}]`;
      if (ef.when !== undefined) checkExpr(ef.when, `${p}.when`);
      switch (ef.type) {
        case "damage": checkExpr(ef.amount, `${p}.amount`); break;
        case "addResource":
          if (!resIds.has(ef.resource)) err(`${p}.resource`, `資源「${ef.resource}」不存在`);
          checkExpr(ef.amount, `${p}.amount`);
          break;
        case "invulnerable": case "stun": case "hitstop": checkExpr(ef.frames, `${p}.frames`); break;
        case "status":
          if (!statusIds.has(ef.status)) err(`${p}.status`, `狀態「${ef.status}」不存在`);
          checkExpr(ef.frames, `${p}.frames`);
          break;
        case "restoreCharge":
          if (!interIds.has(ef.interaction)) err(`${p}.interaction`, `互動「${ef.interaction}」不存在`);
          checkExpr(ef.amount, `${p}.amount`);
          break;
        case "timeScale": checkExpr(ef.scale, `${p}.scale`); checkExpr(ef.frames, `${p}.frames`); break;
        case "cue": if (ef.value !== undefined) checkExpr(ef.value, `${p}.value`); break;
        case "cancelRecovery": break;
      }
    });
  });

  config.interactions.forEach((it, ii) => {
    const p = `interactions[${ii}]`;
    frameField(`${p}.startup`, "啟動幀數", it.startup);
    frameField(`${p}.successRecovery`, "成功收招", it.successRecovery);
    frameField(`${p}.whiffRecovery`, "揮空收招", it.whiffRecovery);
    frameField(`${p}.maxCatches`, "攔截上限", it.maxCatches);
    frameField(`${p}.cooldown`, "冷卻", it.cooldown);
    frameField(`${p}.buffer`, "緩衝", it.buffer);

    const winIds = new Set<string>();
    it.windows.forEach((w, wi) => {
      if (winIds.has(w.id)) err(`${p}.windows[${wi}].id`, `判定窗 ID「${w.id}」重複`);
      winIds.add(w.id);
      frameField(`${p}.windows[${wi}].frames`, `判定窗「${w.name}」的幀數`, w.frames);
    });

    if (it.whiffOutcome !== undefined && !outcomeIds.has(it.whiffOutcome)) err(`${p}.whiffOutcome`, `結果「${it.whiffOutcome}」不存在`);
    if (it.onAccept !== undefined && !outcomeIds.has(it.onAccept)) err(`${p}.onAccept`, `結果「${it.onAccept}」不存在`);
    if (it.charges) {
      if (!(Number.isInteger(it.charges.max) && it.charges.max >= 1)) err(`${p}.charges.max`, "充能上限必須是 1 以上的整數");
      if (!(Number.isInteger(it.charges.recharge) && it.charges.recharge >= 1)) err(`${p}.charges.recharge`, "充能回復幀數必須是 1 以上的整數");
    }
    if (it.cost) {
      if (!resIds.has(it.cost.resource)) err(`${p}.cost.resource`, `資源「${it.cost.resource}」不存在`);
      if (!(it.cost.amount >= 0)) err(`${p}.cost.amount`, "消耗不可為負");
    }
    if (it.spam) {
      const sp = it.spam;
      frameField(`${p}.spam.withinFrames`, "防連打範圍", sp.withinFrames);
      frameField(`${p}.spam.shrinkPerPress`, "每次縮減", sp.shrinkPerPress);
      frameField(`${p}.spam.maxShrink`, "縮減上限", sp.maxShrink);
      frameField(`${p}.spam.lockoutAfter`, "鎖定門檻", sp.lockoutAfter);
      frameField(`${p}.spam.lockoutFrames`, "鎖定幀數", sp.lockoutFrames);
      if (sp.forgiveCaught !== undefined && typeof sp.forgiveCaught !== "boolean") err(`${p}.spam.forgiveCaught`, "成功攔截不算連打必須是 true 或 false");
      const strictMax = Math.max(0, ...it.windows.filter((w) => w.strict).map((w) => w.frames));
      if (sp.maxShrink > strictMax) warn(`${p}.spam.maxShrink`, `縮減上限 ${sp.maxShrink} 大於所有嚴格判定窗的長度（最長 ${strictMax}），多出的部分沒有作用`);
    }

    it.table.forEach((row, ri) => {
      const rp = `${p}.table[${ri}]`;
      if (row.tag !== null && !tagIds.has(row.tag)) err(`${rp}.tag`, `標籤「${row.tag}」不存在`);
      for (const [wid, oid] of Object.entries(row.cells)) {
        if (!winIds.has(wid)) err(`${rp}.cells.${wid}`, `判定窗「${wid}」不存在`);
        if (oid !== null && !outcomeIds.has(oid)) err(`${rp}.cells.${wid}`, `結果「${oid}」不存在`);
      }
    });

    const defaults = it.table.filter((r) => r.tag === null);
    for (const w of it.windows) {
      if (!defaults.some((r) => w.id in r.cells)) warn(`${p}.table`, `判定窗「${w.name}」在預設列沒有格子，沒有符合標籤的攻擊會穿透`);
    }
    if (it.windows.length === 0 && it.onAccept === undefined) warn(p, `互動「${it.name}」沒有任何判定窗也沒有 onAccept，按下去什麼也不會發生`);
  });

  return out;
}
