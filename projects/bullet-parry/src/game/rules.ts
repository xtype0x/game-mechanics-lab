/** Rules-editor helpers: validation gating, preset matching, best-score policy. Pure. */
import { Timing } from "@gml/core";
import { bulletParryDefault } from "./preset";

export interface RulesStatus {
  errors: Timing.ValidationIssue[];
  warnings: Timing.ValidationIssue[];
  ok: boolean;
}

export function rulesStatus(config: Timing.TimingConfig): RulesStatus {
  let issues: Timing.ValidationIssue[];
  try {
    issues = Timing.validateTiming(config);
  } catch {
    issues = [{ level: "error", path: "config", message: "結構不完整，無法驗證" }];
  }
  const errors = issues.filter((i) => i.level === "error");
  return { errors, warnings: issues.filter((i) => i.level !== "error"), ok: errors.length === 0 };
}

/** Message that blocks starting a run, or null when the rules are playable (warnings never block). */
export function startBlocker(config: Timing.TimingConfig): string | null {
  const s = rulesStatus(config);
  if (s.ok) return null;
  const first = s.errors[0]!;
  return `判定規則有 ${s.errors.length} 個錯誤，請先到設定修正：${first.path} ${first.message}`;
}

/** The config the world can safely run: the player's rules when valid, otherwise the game default (title backdrop only). */
export function playableConfig(config: Timing.TimingConfig): Timing.TimingConfig {
  return rulesStatus(config).ok ? config : bulletParryDefault();
}

/** Id of the preset whose content equals `config` exactly, else null (i.e. modified or custom). */
export function matchPreset(config: Timing.TimingConfig, presets: Timing.TimingConfig[]): string | null {
  const key = JSON.stringify(config);
  return presets.find((p) => JSON.stringify(p) === key)?.id ?? null;
}

/** Practice runs never touch the saved best. */
export function shouldSaveBest(practice: boolean, score: number, best: number): boolean {
  return !practice && score > best;
}
