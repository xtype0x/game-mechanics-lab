// Pure helpers for the timing components (no React): ids, config import/export, event descriptions.
import { Timing } from "@gml/core";

type TimingConfig = Timing.TimingConfig;
type TimingEvent = Timing.TimingEvent;
type OutcomeKind = Timing.OutcomeKind;

export const TIMING_CONFIG_FORMAT = "gml-timing-config";

export function uniqueId(prefix: string, existing: Iterable<string>): string {
  const used = new Set(existing);
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

export function exportTimingConfig(config: TimingConfig): string {
  return JSON.stringify({ format: TIMING_CONFIG_FORMAT, version: 1, config }, null, 2);
}

/** Accepts the exported wrapper or a bare config; throws a Chinese message on any problem. */
export function parseTimingConfig(text: string): TimingConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("不是有效的 JSON 檔案。");
  }
  const obj = raw as { format?: unknown; version?: unknown; config?: unknown } | null;
  if (!obj || typeof obj !== "object") throw new Error("檔案內容不是設定物件。");
  let cfg: unknown = obj;
  if (obj.format !== undefined || obj.config !== undefined) {
    if (obj.format !== TIMING_CONFIG_FORMAT) throw new Error(`檔案格式不符（需要 ${TIMING_CONFIG_FORMAT}）。`);
    if (obj.version !== 1) throw new Error(`不支援的檔案版本：${String(obj.version)}。`);
    cfg = obj.config;
  }
  const c = cfg as Partial<TimingConfig> | null;
  if (!c || typeof c !== "object" || c.version !== 1) throw new Error("設定缺少 version: 1。");
  for (const k of ["tags", "resources", "statuses", "outcomes", "interactions"] as const) {
    if (!Array.isArray(c[k])) throw new Error(`設定缺少清單欄位「${k}」。`);
  }
  if (typeof c.fps !== "number" || typeof c.hitOutcome !== "string" || typeof c.healthResource !== "string") {
    throw new Error("設定缺少 fps、hitOutcome 或 healthResource。");
  }
  let issues: Timing.ValidationIssue[];
  try {
    issues = Timing.validateTiming(c as TimingConfig);
  } catch {
    throw new Error("設定內容結構不完整，無法驗證。");
  }
  const first = issues.find((i) => i.level === "error");
  if (first) throw new Error(`設定有錯誤：${first.path} ${first.message}`);
  return c as TimingConfig;
}

/** Variables usable in formulas (spec §5), plus those derived from the config's own ids. */
export function formulaVariables(config: TimingConfig): { name: string; desc: string }[] {
  return [
    { name: "frame", desc: "目前幀" },
    { name: "attack.damage", desc: "被結算攻擊的傷害（無攻擊時 0）" },
    ...config.resources.map((r) => ({ name: `res.${r.id}`, desc: `資源「${r.name}」目前值` })),
    ...[{ id: "invulnerable", name: "無敵" }, ...config.statuses].map((s) => ({ name: `status.${s.id}`, desc: `狀態「${s.name}」剩餘幀數` })),
    ...config.interactions.map((i) => ({ name: `charges.${i.id}`, desc: `「${i.name}」目前充能數` })),
    { name: "catch.index", desc: "這次攔截之前，目前動作已攔截的次數" },
    { name: "action.shrink", desc: "目前動作的嚴格窗縮減量（緩衝為 -1）" },
    { name: "action.buffered", desc: "目前動作是否來自緩衝" },
  ];
}

const DROP_REASONS: Record<Timing.DropReason, string> = {
  busy: "動作槽忙碌",
  cooldown: "冷卻中",
  noCharge: "沒有充能",
  noResource: "資源不足",
  conflict: "同幀有更高優先的按鍵",
  spamLockout: "連打鎖定",
  bufferExpired: "緩衝逾期",
  bufferReplaced: "緩衝被新按鍵取代",
  defeated: "已敗北",
};
export const dropReasonText = (r: Timing.DropReason): string => DROP_REASONS[r] ?? r;

const iName = (c: TimingConfig, id: string) => c.interactions.find((i) => i.id === id)?.name ?? id;
const oName = (c: TimingConfig, id: string | null | undefined) => (id ? (c.outcomes.find((o) => o.id === id)?.name ?? id) : "無");
const rName = (c: TimingConfig, id: string) => c.resources.find((r) => r.id === id)?.name ?? id;
const sName = (c: TimingConfig, id: string) => (id === "invulnerable" ? "無敵" : (c.statuses.find((s) => s.id === id)?.name ?? id));
const wName = (c: TimingConfig, iid: string | undefined, wid: string | undefined) =>
  (iid && wid && c.interactions.find((i) => i.id === iid)?.windows.find((w) => w.id === wid)?.name) || wid || "";
const signed = (n: number) => (n >= 0 ? `+${num(n)}` : num(n));
const num = (n: number) => String(Math.round(n * 1000) / 1000);

export function outcomeKind(config: TimingConfig, id: string | null | undefined): OutcomeKind {
  return config.outcomes.find((o) => o.id === id)?.kind ?? "neutral";
}

export function describeEffect(config: TimingConfig, e: Extract<TimingEvent, { type: "effect" }>): string {
  const v = e.value ?? 0;
  switch (e.effect) {
    case "damage": return `${rName(config, config.healthResource)} -${num(v)}`;
    case "addResource": return `${rName(config, e.target ?? "")} ${signed(v)}`;
    case "invulnerable": return `無敵 ${e.frames ?? 0} 幀`;
    case "status": return `${sName(config, e.target ?? "")} ${e.frames ?? 0} 幀`;
    case "stun": return `硬直 ${e.frames ?? 0} 幀`;
    case "restoreCharge": return `${iName(config, e.target ?? "")} 充能 +${num(v)}`;
    case "cancelRecovery": return "取消收招";
    case "hitstop": return `頓幀 ${e.frames ?? 0} 幀`;
    case "timeScale": return `慢動作 ×${num(v)}，${e.frames ?? 0} 幀`;
    case "cue": return `訊號 ${e.target ?? ""}${e.value !== undefined ? `（${num(v)}）` : ""}`;
  }
}

/** Window length changes caused by spam shrink, e.g. ["完美 3→1", "普通 6→8"]. */
export function windowChanges(config: TimingConfig, ev: Extract<TimingEvent, { type: "accept" }>): string[] {
  const def = config.interactions.find((i) => i.id === ev.interaction);
  const out: string[] = [];
  def?.windows.forEach((w) => {
    const span = ev.windows.find((s) => s.id === w.id);
    if (span && span.to - span.from !== w.frames) out.push(`${w.name} ${w.frames}→${span.to - span.from}`);
  });
  return out;
}

/** One readable Chinese line per event, using names from the config. */
export function describeEvent(config: TimingConfig, ev: TimingEvent): string {
  const head = `第 ${ev.frame} 幀｜`;
  switch (ev.type) {
    case "press": return `${head}按下 ${iName(config, ev.interaction)}`;
    case "buffer": return `${head}緩衝 ${iName(config, ev.interaction)}（第 ${ev.pressFrame} 幀按下）`;
    case "accept": {
      const notes: string[] = [];
      if (ev.buffered) notes.push("來自緩衝");
      const ch = windowChanges(config, ev);
      if (ch.length) notes.push(`${ev.shrink >= 0 ? `縮減 ${ev.shrink} 幀` : "嚴格窗移除"}：${ch.join("、")}`);
      return `${head}${iName(config, ev.interaction)} 接受${notes.length ? `（${notes.join("；")}）` : ""}`;
    }
    case "drop": return `${head}丟棄 ${iName(config, ev.interaction)}：${dropReasonText(ev.reason)}`;
    case "phase": return `${head}${iName(config, ev.interaction)} ${ev.phase === "recovery" ? "進入收招" : "回到閒置"}`;
    case "resolve": {
      const late = ev.impactFrame !== ev.frame ? `（命中幀 ${ev.impactFrame}）` : "";
      if (ev.via === "interaction") {
        return `${head}${ev.attack} 命中${late} → ${iName(config, ev.interaction ?? "")}・${wName(config, ev.interaction, ev.window)}窗 → ${oName(config, ev.outcome)}`;
      }
      if (ev.via === "invulnerable") return `${head}${ev.attack} 命中${late} → 無敵，未受傷`;
      return `${head}${ev.attack} 命中${late} → 未攔截 → ${oName(config, ev.outcome)}`;
    }
    case "whiff": return `${head}${iName(config, ev.interaction)} 揮空${ev.outcome ? ` → ${oName(config, ev.outcome)}` : ""}`;
    case "effect": return `${head}效果：${describeEffect(config, ev)}（${oName(config, ev.outcome)}）`;
    case "recharge": return `${head}${iName(config, ev.interaction)} 充能回復（現有 ${ev.count}）`;
    case "defeated": return `${head}敗北`;
  }
}

export type LogCategory = "key" | "judge" | "effect" | "other";
export const LOG_CATEGORIES: { id: LogCategory; label: string }[] = [
  { id: "key", label: "按鍵" },
  { id: "judge", label: "判定" },
  { id: "effect", label: "效果" },
  { id: "other", label: "其他" },
];

export function eventCategory(ev: TimingEvent): LogCategory {
  switch (ev.type) {
    case "press": case "buffer": case "accept": case "drop": return "key";
    case "resolve": case "whiff": return "judge";
    case "effect": return "effect";
    default: return "other";
  }
}

/** Colour class for a log line / marker: outcome kind, or "warn" for dropped keys. */
export function eventTone(config: TimingConfig, ev: TimingEvent): OutcomeKind | "warn" {
  switch (ev.type) {
    case "resolve": return ev.outcome ? outcomeKind(config, ev.outcome) : "neutral";
    case "whiff": case "effect": return ev.outcome ? outcomeKind(config, ev.outcome) : "neutral";
    case "drop": return "warn";
    case "defeated": return "fail";
    default: return "neutral";
  }
}
