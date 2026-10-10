import { validateBanner, type BannerDef, type GachaIssue, type Project } from "@ggt/core";
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
