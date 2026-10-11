import { Rng, disclosure, newGachaState, pullMany, tierCap, tierChances, validateBanner, type BannerDef, type Disclosure, type GachaIssue, type Project } from "@gml/core";
import { useMemo } from "react";
import type { Updater } from "../../useProject";

/** The banner the gacha tools work on (project.gacha.active), its issues and an editor for it. */
export function useBanner(project: Project, update: Updater) {
  const banners = project.gacha.banners;
  const banner = banners.find((b) => b.id === project.gacha.active) ?? banners[0];
  const unitIds = useMemo(() => new Set(project.battle.units.map((u) => u.id)), [project.battle.units]);
  const issues: GachaIssue[] = useMemo(() => (banner ? validateBanner(banner, unitIds) : []), [banner, unitIds]);
  const edit = (fn: (b: BannerDef) => void) => update((p) => { const b = p.gacha.banners.find((x) => x.id === banner?.id); if (b) fn(b); });
  const select = (id: string) => update((p) => { p.gacha.active = id; });
  return { banners, banner, issues, errors: issues.filter((i) => i.level === "error"), edit, select };
}

export function BannerPicker({ project, update }: { project: Project; update: Updater }) {
  const { banners, banner, select } = useBanner(project, update);
  return (
    <div className="chips">
      {banners.map((b) => <button key={b.id} className={`chip-btn ${b.id === banner?.id ? "on" : ""}`} onClick={() => select(b.id)}>{b.name}</button>)}
    </div>
  );
}

export function GachaIssues({ issues }: { issues: GachaIssue[] }) {
  if (!issues.length) return null;
  return (
    <div className="issue-list">
      {issues.map((x, i) => <div key={i} className={`issue ${x.level === "error" ? "err" : "warn"}`}>{x.message}</div>)}
    </div>
  );
}

export const itemName = (b: BannerDef, id: string) => b.items.find((x) => x.id === id)?.name ?? id;

/**
 * Exact long-run rates solve a chain over every combination of pity counters (gacha.md §3.3). Beyond this many
 * states that takes too long for an editor, so the tools fall back to sampling (docs/m6-extension-check.md).
 */
export const EXACT_STATE_LIMIT = 20000;
export const SAMPLE_PULLS = 200000;

export function pityStates(b: BannerDef): number {
  return b.tiers.slice(0, -1).reduce((a, t) => a * tierCap(t), 1);
}

export type SafeDisclosure = Disclosure & { exact: boolean; states: number };

/** disclosure() when it is fast enough; otherwise base rates exactly and long-run rates by sampling. */
export function safeDisclosure(b: BannerDef, seed: number | string): SafeDisclosure {
  const states = pityStates(b);
  if (states <= EXACT_STATE_LIMIT) return { ...disclosure(b), exact: true, states };
  const base = tierChances(b, b.tiers.map(() => 1));
  const res = pullMany(b, newGachaState(b), new Rng(seed, `gacha.estimate.${b.id}`), SAMPLE_PULLS);
  const freq = new Map<string, number>();
  for (const r of res) freq.set(`${r.tierId}|${r.itemId}|${r.featured}`, (freq.get(`${r.tierId}|${r.itemId}|${r.featured}`) ?? 0) + 1);
  const rows: Disclosure["rows"] = [];
  const tiers = b.tiers.map((t, i) => {
    const f = t.featured?.items.length ? t.featured : undefined;
    const baseShare = f ? (t.items.length ? f.share : 1) : 0;
    const add = (ids: string[], featured: boolean, share: number) => {
      for (const id of ids) rows.push({ tierId: t.id, tierName: t.name, itemId: id, itemName: itemName(b, id), featured, base: (base[i]! * share) / ids.length, consolidated: (freq.get(`${t.id}|${id}|${featured}`) ?? 0) / SAMPLE_PULLS });
    };
    if (f) add(f.items, true, baseShare);
    add(t.items, false, 1 - baseShare);
    const pity: string[] = [];
    if (t.softPityStart && t.softPityStep) pity.push(`第 ${t.softPityStart} 抽起，每抽機率增加 ${(t.softPityStep * 100).toFixed(2)}%`);
    if (t.hardPity) pity.push(`連續 ${t.hardPity - 1} 抽未獲得時，第 ${t.hardPity} 抽必定獲得`);
    if (f && t.items.length) pity.push(`獲得時有 ${(f.share * 100).toFixed(2)}% 為限定${f.guarantee ? "；若不是限定，下一次必定為限定" : ""}`);
    return { id: t.id, name: t.name, base: base[i]!, consolidated: res.filter((r) => r.tierId === t.id).length / SAMPLE_PULLS, pity };
  });
  return { rows, tiers, exact: false, states };
}

export function EstimateNote({ d }: { d: SafeDisclosure }) {
  if (d.exact) return null;
  return <p className="issue warn">保底狀態組合有 {d.states.toLocaleString()} 種，精確計算太慢；綜合機率改用 {SAMPLE_PULLS.toLocaleString()} 抽的抽樣估計（誤差約 ±0.05%）。基礎機率仍為精確值。</p>;
}
