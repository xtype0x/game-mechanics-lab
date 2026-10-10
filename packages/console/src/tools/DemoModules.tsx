import { DEMO_MODULES, REQUIRED_CAPABILITIES, defaultModuleSelection, resolveModules, type Capability, type ModuleDef, type Project } from "@ggt/core";
import { openDemo } from "../demo/link";
import type { Updater } from "../useProject";
import { Badge, Section } from "../ui";

export const CAPABILITY_LABELS: Record<Capability, string> = {
  battle: "戰鬥",
  content: "關卡內容",
  roster: "角色來源",
  team: "上場隊伍",
  currency: "貨幣",
  growth: "成長",
  gacha: "抽卡",
};

const KIND_LABEL: Record<ModuleDef["kind"], string> = { core: "骨幹", "slot-default": "預設實作", optional: "可拆" };

export function DemoModules({ project, update }: { project: Project; update: Updater }) {
  const sel = project.demo.modules;
  const r = resolveModules(sel);
  const set = (id: string, on: boolean) => update((p) => { p.demo.modules = { ...p.demo.modules, [id]: on }; });
  const caps = (cs: Capability[]) => (cs.length ? cs.map((c) => CAPABILITY_LABELS[c]).join("、") : "—");
  const blockedOf = (id: string) => r.blocked.find((b) => b.id === id);

  const row = (m: ModuleDef) => {
    const active = r.active.includes(m.id);
    const blocked = blockedOf(m.id);
    return (
      <tr key={m.id} className={active ? "" : "off"}>
        <td>
          {m.kind === "optional"
            ? <label className="check"><input type="checkbox" checked={!!sel[m.id]} onChange={(e) => set(m.id, e.target.checked)} />{m.name}</label>
            : <b>{m.name}</b>}
        </td>
        <td>{active ? <Badge tone="ok">啟用</Badge> : blocked ? <Badge tone="warn">停用：缺少{caps(blocked.missing)}</Badge> : <Badge tone="muted">{m.kind === "slot-default" ? "讓位" : "關閉"}</Badge>}</td>
        <td className="small">{caps(m.provides)}</td>
        <td className="small">{caps(m.requires)}</td>
        <td className="small">{active ? m.summary : m.whenOff}</td>
      </tr>
    );
  };
  const group = (kind: ModuleDef["kind"], title: string, note: string) => (
    <Section title={title}>
      <p className="muted small">{note}</p>
      <table className="table modules-table">
        <thead><tr><th>模組</th><th>狀態</th><th>提供</th><th>需要</th><th>說明</th></tr></thead>
        <tbody>{DEMO_MODULES.filter((m) => m.kind === kind).map(row)}</tbody>
      </table>
    </Section>
  );

  return (
    <div className="tool-layout">
      <div className="workspace">
        {group("optional", "可拆模組", "勾選要放進 DEMO 的機制。需要的能力不足時會自動停用並說明原因。")}
        {group("core", "骨幹（不能拆）", "沒有它們就沒有可玩的內容。")}
        {group("slot-default", "預設實作（自動補位）", "必要能力沒有任何可拆模組提供時，由這些內建實作補上。例如關掉抽卡，角色就改為自由選取。")}
      </div>
      <div className="results">
        <div className="results-head"><h2>組合結果</h2></div>
        <Section title={r.playable ? "可遊玩" : "無法遊玩"}>
          <table className="table">
            <thead><tr><th>必要能力</th><th>由誰提供</th></tr></thead>
            <tbody>{REQUIRED_CAPABILITIES.map((c) => {
              const by = DEMO_MODULES.filter((m) => r.active.includes(m.id) && m.provides.includes(c)).map((m) => m.name);
              return <tr key={c}><td>{CAPABILITY_LABELS[c]}</td><td>{by.length ? by.join("、") : <Badge tone="err">沒有</Badge>}</td></tr>;
            })}</tbody>
          </table>
          {r.fallbacks.length > 0 && <p className="small">預設實作補位：{r.fallbacks.map((id) => DEMO_MODULES.find((m) => m.id === id)!.name).join("、")}</p>}
          {r.blocked.length > 0 && <p className="small">已勾選但無法啟用：{r.blocked.map((b) => `${DEMO_MODULES.find((m) => m.id === b.id)!.name}（缺少${caps(b.missing)}）`).join("、")}</p>}
          <div className="row-gap">
            <button className="btn primary" disabled={!r.playable} onClick={openDemo}>▶ 用這個組合試玩</button>
            <button className="btn" onClick={() => update((p) => { p.demo.modules = defaultModuleSelection(); })}>全部開啟</button>
          </div>
          <p className="muted small">DEMO 的存檔與模組設定無關；重新開啟模組時，之前的進度仍在。分類說明見 docs/demo-modules.md。</p>
        </Section>
      </div>
    </div>
  );
}
