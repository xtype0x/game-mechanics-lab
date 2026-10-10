/**
 * Static checks for banners. Errors make pulls or analysis unsafe; warnings are legal but suspicious.
 */
import { tierCap } from "./gacha";
import type { BannerDef } from "./types";

export interface GachaIssue {
  level: "error" | "warning";
  message: string;
  where: { bannerId: string; tierId?: string; itemId?: string };
}

export function validateBanner(b: BannerDef, unitIds?: Set<string>): GachaIssue[] {
  const out: GachaIssue[] = [];
  const err = (message: string, where: Partial<GachaIssue["where"]> = {}) => out.push({ level: "error", message, where: { bannerId: b.id, ...where } });
  const warn = (message: string, where: Partial<GachaIssue["where"]> = {}) => out.push({ level: "warning", message, where: { bannerId: b.id, ...where } });

  const itemIds = new Set<string>();
  for (const it of b.items) {
    if (itemIds.has(it.id)) err(`物品 ID「${it.id}」重複`, { itemId: it.id });
    itemIds.add(it.id);
    if (it.kind === "unit") {
      if (!it.unitId) err(`物品「${it.name}」是角色，但沒有指定角色`, { itemId: it.id });
      else if (unitIds && !unitIds.has(it.unitId)) err(`物品「${it.name}」指向不存在的角色「${it.unitId}」`, { itemId: it.id });
    } else if (!(it.amount! > 0)) warn(`物品「${it.name}」的數量不是正數`, { itemId: it.id });
  }
  if (!(b.cost >= 0)) err("每抽花費不能是負數");
  if (!b.tiers.length) { err("卡池至少需要一個稀有度"); return out; }

  const used = new Set<string>();
  let baseSum = 0;
  b.tiers.forEach((t, i) => {
    const w = { tierId: t.id };
    const last = i === b.tiers.length - 1;
    if (!last) {
      if (!(t.rate >= 0 && t.rate <= 1)) err(`「${t.name}」的機率必須在 0 到 100% 之間`, w);
      baseSum += t.rate;
    }
    if (t.hardPity !== undefined && t.hardPity !== 0 && !(Number.isInteger(t.hardPity) && t.hardPity >= 1)) err(`「${t.name}」的硬保底必須是正整數`, w);
    if (t.softPityStart !== undefined && t.softPityStart !== 0) {
      if (!(Number.isInteger(t.softPityStart) && t.softPityStart >= 1)) err(`「${t.name}」的軟保底起點必須是正整數`, w);
      if (!((t.softPityStep ?? 0) >= 0)) err(`「${t.name}」的軟保底每抽增加量不能是負數`, w);
      if (t.hardPity && t.softPityStart >= t.hardPity) warn(`「${t.name}」的軟保底起點不在硬保底之前，不會有作用`, w);
    }
    if (last && (t.hardPity || t.softPityStart)) warn(`「${t.name}」是最低稀有度，機率為剩餘值，保底設定不會有作用`, w);
    if (i === 0 && !last && t.rate <= 0 && !t.hardPity && !((t.softPityStep ?? 0) > 0 && t.softPityStart)) err(`「${t.name}」機率為 0 又沒有保底，永遠不會出現`, w);
    if (!last && tierCap(t) > 5000) warn(`「${t.name}」的保底狀態很多（${tierCap(t)}），精確分析會變慢`, w);
    const f = t.featured;
    if (f) {
      if (!(f.share >= 0 && f.share <= 1)) err(`「${t.name}」的限定比例必須在 0 到 100% 之間`, w);
      if (!f.items.length) warn(`「${t.name}」有限定規則但沒有限定物品`, w);
      if (f.guarantee && !t.items.length) warn(`「${t.name}」沒有非限定物品，大保底不會有作用`, w);
    }
    if (!t.items.length && !f?.items.length) err(`「${t.name}」沒有任何物品`, w);
    for (const id of [...t.items, ...(f?.items ?? [])]) {
      if (!itemIds.has(id)) err(`「${t.name}」使用不存在的物品「${id}」`, { ...w, itemId: id });
      if (used.has(id)) warn(`物品「${id}」出現在多個位置，機率會分散計算`, { ...w, itemId: id });
      used.add(id);
    }
  });
  if (b.tiers.length > 1 && baseSum > 1) warn(`高稀有度的基礎機率合計 ${(baseSum * 100).toFixed(2)}% 超過 100%，最低稀有度不會出現`);
  for (const it of b.items) if (!used.has(it.id)) warn(`物品「${it.name}」沒有放進任何稀有度`, { itemId: it.id });
  return out;
}
