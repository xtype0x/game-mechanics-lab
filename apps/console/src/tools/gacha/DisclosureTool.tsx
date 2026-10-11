import { type BannerDef, type Disclosure, type Project } from "@gml/core";
import { useMemo, useState } from "react";
import type { Updater } from "../../useProject";
import { ErrorBox, Section, Segmented, tryCompute } from "../../ui";
import { BannerPicker, EstimateNote, GachaIssues, safeDisclosure, useBanner } from "./common";

type Digits = "2" | "4";

const asPct = (x: number, digits: number) => `${(x * 100).toFixed(digits)}%`;

/** Plain-text table for pasting into a store page or announcement. */
export function disclosureText(b: BannerDef, d: Disclosure, digits: number): string {
  const lines = [`【${b.name}】機率公示`, "", "稀有度\t基礎機率\t綜合機率（含保底）"];
  for (const t of d.tiers) lines.push(`${t.name}\t${asPct(t.base, digits)}\t${asPct(t.consolidated, digits)}`);
  lines.push("", "物品\t稀有度\t基礎機率\t綜合機率（含保底）");
  for (const r of d.rows) lines.push(`${r.itemName}${r.featured ? "（限定）" : ""}\t${r.tierName}\t${asPct(r.base, digits)}\t${asPct(r.consolidated, digits)}`);
  const rules = d.tiers.flatMap((t) => t.pity.map((x) => `・${t.name}：${x}`));
  if (rules.length) lines.push("", "保底規則", ...rules);
  lines.push("", "基礎機率：沒有任何保底進度時的單抽機率。綜合機率：長期平均每抽的機率，已計入保底。");
  return lines.join("\n");
}

export function DisclosureTool({ project, update }: { project: Project; update: Updater }) {
  const { banner, issues, errors } = useBanner(project, update);
  const [digits, setDigits] = useState<Digits>("2");
  const [copied, setCopied] = useState(false);
  const d = useMemo(() => (banner && !errors.length ? tryCompute(() => safeDisclosure(banner, project.seed)) : null), [banner, errors.length, project.seed]);
  const n = Number(digits);
  const copy = async () => {
    if (!banner || !d?.ok) return;
    try { await navigator.clipboard.writeText(disclosureText(banner, d.value, n)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <div className="tool-layout single">
      <div className="workspace">
        <Section title="卡池" actions={<>
          <Segmented<Digits> value={digits} onChange={setDigits} options={[{ value: "2", label: "小數 2 位" }, { value: "4", label: "小數 4 位" }]} />
          <button className="btn small primary" disabled={!d?.ok} onClick={copy}>{copied ? "已複製" : "複製文字"}</button>
        </>}>
          <BannerPicker project={project} update={update} />
          <GachaIssues issues={issues} />
        </Section>
        {d && !d.ok && <ErrorBox error={d.error} />}
        {d?.ok && banner && (
          <>
            <Section title={`${banner.name}・稀有度`}>
              <EstimateNote d={d.value} />
              <table className="table">
                <thead><tr><th>稀有度</th><th className="r">基礎機率</th><th className="r">綜合機率（含保底）</th><th>保底規則</th></tr></thead>
                <tbody>{d.value.tiers.map((t) => <tr key={t.id}><td>{t.name}</td><td className="r mono">{asPct(t.base, n)}</td><td className="r mono">{asPct(t.consolidated, n)}</td><td className="small">{t.pity.join("；") || "—"}</td></tr>)}</tbody>
              </table>
            </Section>
            <Section title="各物品機率">
              <table className="table">
                <thead><tr><th>物品</th><th>稀有度</th><th className="r">基礎機率</th><th className="r">綜合機率（含保底）</th></tr></thead>
                <tbody>{d.value.rows.map((r) => <tr key={`${r.tierId}-${r.itemId}`}><td>{r.itemName}{r.featured && <span className="tag">限定</span>}</td><td>{r.tierName}</td><td className="r mono">{asPct(r.base, n)}</td><td className="r mono">{asPct(r.consolidated, n)}</td></tr>)}</tbody>
              </table>
              <p className="muted small">基礎機率是沒有保底進度時的單抽機率；綜合機率是長期平均每抽的機率，已計入軟硬保底與大保底（docs/spec/gacha.md §3）。兩欄各自加總為 100%。</p>
            </Section>
            <Section title="法規提醒">
              <p className="small">台灣對付費抽獎型商品有機率揭露的要求（「網路連線遊戲服務定型化契約應記載及不得記載事項」，主管機關為數位發展部）。這張表只是依卡池設定計算出的數字；<b>應揭露的項目、位置與格式請以主管機關最新公告為準</b>，本工具未經法律審查。</p>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
