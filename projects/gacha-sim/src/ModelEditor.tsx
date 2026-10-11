import { Gacha } from "@gml/core";
import { Card, Field, NumberInput } from "./ui";
import { MODULE_LABELS, defaultModule, nextId, type Model } from "./state";

type Edit = (fn: (m: Model) => void) => void;

const KINDS = Object.keys(MODULE_LABELS) as Gacha.ModuleKind[];

export function ModelEditor({ model, edit, issues }: { model: Model; edit: Edit; issues: Gacha.ModelIssue[] }) {
  const tierName = (id: string) => model.tiers.find((t) => t.id === id)?.name ?? id;
  return (
    <>
      <Card title="基本設定">
        <div className="grid">
          <Field label="模型名稱"><input value={model.name} onChange={(e) => edit((m) => { m.name = e.target.value; })} /></Field>
          <Field label="每抽花費"><NumberInput label="每抽花費" value={model.pull.cost} min={0} onChange={(v) => edit((m) => { m.pull.cost = v; })} /></Field>
          <Field label="貨幣名稱"><input value={model.pull.currency} onChange={(e) => edit((m) => { m.pull.currency = e.target.value; })} /></Field>
          <Field label="幾抽一組（連抽）"><NumberInput label="連抽數" value={model.pull.batchSize} min={1} onChange={(v) => edit((m) => { m.pull.batchSize = Math.max(1, Math.round(v)); })} /></Field>
        </div>
      </Card>

      <Card title="稀有度與物品" actions={<button className="btn small" onClick={() => edit((m) => {
        const id = nextId("t", m.tiers.map((t) => t.id));
        const itemId = nextId("item", m.items.map((x) => x.id));
        m.items.push({ id: itemId, name: "新物品", kind: "resource" });
        m.tiers.splice(Math.max(0, m.tiers.length - 1), 0, { id, name: "新稀有度", rate: 0.05, items: [itemId] });
      })}>＋ 稀有度</button>}>
        <p className="hint">由高到低排列。每抽只擲一次：從最高稀有度開始累加機率，最低稀有度拿剩下的機率。</p>
        <table className="table">
          <thead><tr><th>稀有度</th><th>基礎機率</th><th>一般物品（非限定）</th><th /></tr></thead>
          <tbody>
            {model.tiers.map((t, i) => {
              const last = i === model.tiers.length - 1;
              return (
                <tr key={t.id}>
                  <td><input className="short" aria-label="稀有度名稱" value={t.name} onChange={(e) => edit((m) => { m.tiers[i]!.name = e.target.value; })} /></td>
                  <td>{last ? <span className="muted">剩餘</span> : <NumberInput label={`${t.name} 機率`} percent value={t.rate} min={0} max={1} width={96} onChange={(v) => edit((m) => { m.tiers[i]!.rate = v; })} />}</td>
                  <td>
                    <div className="chips">
                      {t.items.map((id) => {
                        const it = model.items.find((x) => x.id === id);
                        return <input key={id} className="chip-input" aria-label="物品名稱" value={it?.name ?? id} onChange={(e) => edit((m) => { const x = m.items.find((y) => y.id === id); if (x) x.name = e.target.value; })} />;
                      })}
                      <button className="btn tiny" title="加入物品" onClick={() => edit((m) => { const id = nextId("item", m.items.map((x) => x.id)); m.items.push({ id, name: "新物品", kind: "resource" }); m.tiers[i]!.items.push(id); })}>＋</button>
                      {t.items.length > 1 && <button className="btn tiny" title="移除最後一個物品" onClick={() => edit((m) => { m.tiers[i]!.items.pop(); })}>－</button>}
                    </div>
                  </td>
                  <td className="r">{model.tiers.length > 1 && <button className="btn tiny ghost" aria-label={`刪除 ${t.name}`} onClick={() => edit((m) => {
                    m.tiers.splice(i, 1);
                    m.modules = m.modules.filter((x) => !("tier" in x && x.tier === t.id) && !(x.kind === "batchFloor" && x.minTier === t.id));
                  })}>✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="規則模組" actions={
        <select aria-label="加入規則" value="" onChange={(e) => { const k = e.target.value as Gacha.ModuleKind; if (k) edit((m) => { m.modules.push(defaultModule(k, m)); }); }}>
          <option value="">＋ 加入規則</option>
          {KINDS.map((k) => <option key={k} value={k}>{MODULE_LABELS[k].name}</option>)}
        </select>
      }>
        {model.modules.length === 0 && <p className="hint">沒有任何規則：每抽都是固定機率，沒有保底。</p>}
        <div className="modules">
          {model.modules.map((mod, i) => (
            <div key={i} className="module">
              <div className="module-head">
                <b>{MODULE_LABELS[mod.kind].name}</b>
                <span className="hint">{MODULE_LABELS[mod.kind].help}</span>
                <button className="btn tiny ghost" aria-label={`刪除規則 ${MODULE_LABELS[mod.kind].name}`} onClick={() => edit((m) => { m.modules.splice(i, 1); })}>✕</button>
              </div>
              <ModuleFields model={model} mod={mod} set={(fn) => edit((m) => fn(m.modules[i]!))} tierName={tierName} />
              {issues.filter((x) => x.where.module === i).map((x, k) => <p key={k} className={`issue ${x.level}`}>{x.message}</p>)}
            </div>
          ))}
        </div>
        {issues.filter((x) => x.where.module === undefined).map((x, k) => <p key={k} className={`issue ${x.level}`}>{x.message}</p>)}
      </Card>
    </>
  );
}

function TierSelect({ model, value, onChange, label }: { model: Model; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {model.tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
}

function ItemPicker({ model, value, onChange }: { model: Model; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {model.items.map((it) => (
        <label key={it.id} className={`chip ${value.includes(it.id) ? "on" : ""}`}>
          <input type="checkbox" checked={value.includes(it.id)} onChange={(e) => onChange(e.target.checked ? [...value, it.id] : value.filter((x) => x !== it.id))} />
          {it.name}
        </label>
      ))}
      <span className="hint">（物品在「稀有度與物品」新增）</span>
    </div>
  );
}

function ModuleFields({ model, mod, set, tierName }: { model: Model; mod: Gacha.RuleModule; set: (fn: (x: Gacha.RuleModule) => void) => void; tierName: (id: string) => string }) {
  const S = <K extends Gacha.ModuleKind>(fn: (x: Extract<Gacha.RuleModule, { kind: K }>) => void) => set((x) => fn(x as Extract<Gacha.RuleModule, { kind: K }>));
  switch (mod.kind) {
    case "softPity":
      return (
        <div className="grid">
          <Field label="稀有度"><TierSelect label="稀有度" model={model} value={mod.tier} onChange={(v) => S<"softPity">((x) => { x.tier = v; })} /></Field>
          <Field label="從第幾抽開始"><NumberInput label="起點" value={mod.start} min={1} onChange={(v) => S<"softPity">((x) => { x.start = Math.max(1, Math.round(v)); })} /></Field>
          <Field label="每抽增加"><NumberInput label="每抽增加" percent value={mod.step} min={0} max={1} onChange={(v) => S<"softPity">((x) => { x.step = v; })} /></Field>
          <Field label="機率上限" hint="100% 為不設上限"><NumberInput label="機率上限" percent value={mod.max ?? 1} min={0} max={1} onChange={(v) => S<"softPity">((x) => { if (v >= 1) delete x.max; else x.max = v; })} /></Field>
        </div>
      );
    case "hardPity":
      return (
        <div className="grid">
          <Field label="稀有度"><TierSelect label="稀有度" model={model} value={mod.tier} onChange={(v) => S<"hardPity">((x) => { x.tier = v; })} /></Field>
          <Field label="第幾抽必得"><NumberInput label="第幾抽必得" value={mod.at} min={1} onChange={(v) => S<"hardPity">((x) => { x.at = Math.max(1, Math.round(v)); })} /></Field>
        </div>
      );
    case "featured":
      return (
        <>
          <div className="grid">
            <Field label="稀有度"><TierSelect label="稀有度" model={model} value={mod.tier} onChange={(v) => S<"featured">((x) => { x.tier = v; })} /></Field>
            <Field label="抽中時是限定的機率"><NumberInput label="限定機率" percent value={mod.share} min={0} max={1} onChange={(v) => S<"featured">((x) => { x.share = v; })} /></Field>
          </div>
          <Field label="限定物品"><ItemPicker model={model} value={mod.items} onChange={(v) => S<"featured">((x) => { x.items = v; })} /></Field>
          <p className="hint">每抽獲得「{tierName(mod.tier)}限定」的基礎機率 ≈ {(model.tiers.find((t) => t.id === mod.tier)!.rate * mod.share * 100).toFixed(3)}%</p>
        </>
      );
    case "guarantee":
      return <div className="grid"><Field label="稀有度"><TierSelect label="稀有度" model={model} value={mod.tier} onChange={(v) => S<"guarantee">((x) => { x.tier = v; })} /></Field></div>;
    case "batchFloor":
      return (
        <div className="grid">
          <Field label="每組的第幾抽"><NumberInput label="第幾抽" value={mod.slot} min={1} max={model.pull.batchSize} onChange={(v) => S<"batchFloor">((x) => { x.slot = Math.round(v); })} /></Field>
          <Field label="至少是"><TierSelect label="至少稀有度" model={model} value={mod.minTier} onChange={(v) => S<"batchFloor">((x) => { x.minTier = v; })} /></Field>
        </div>
      );
    case "milestone":
      return (
        <>
          <div className="grid"><Field label="稀有度"><TierSelect label="稀有度" model={model} value={mod.tier} onChange={(v) => S<"milestone">((x) => { x.tier = v; })} /></Field></div>
          <table className="table compact">
            <thead><tr><th>沒抽到限定的累計抽數</th><th>這一抽必得，且限定機率</th><th /></tr></thead>
            <tbody>
              {mod.steps.map((st, j) => (
                <tr key={j}>
                  <td><NumberInput label="門檻" value={st.at} min={1} onChange={(v) => S<"milestone">((x) => { x.steps[j]!.at = Math.max(1, Math.round(v)); })} /></td>
                  <td><NumberInput label="限定機率" percent value={st.featuredShare} min={0} max={1} onChange={(v) => S<"milestone">((x) => { x.steps[j]!.featuredShare = v; })} /></td>
                  <td className="r">{mod.steps.length > 1 && <button className="btn tiny ghost" aria-label="刪除門檻" onClick={() => S<"milestone">((x) => { x.steps.splice(j, 1); })}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn tiny" onClick={() => S<"milestone">((x) => { x.steps.push({ at: (x.steps.at(-1)?.at ?? 0) + 50, featuredShare: 1 }); })}>＋ 門檻</button>
        </>
      );
    case "epitomized": {
      const f = model.modules.find((x) => x.kind === "featured" && x.tier === mod.tier);
      const pool = f && f.kind === "featured" ? f.items : [];
      return (
        <div className="grid">
          <Field label="稀有度"><TierSelect label="稀有度" model={model} value={mod.tier} onChange={(v) => S<"epitomized">((x) => { x.tier = v; })} /></Field>
          <Field label="定軌目標">
            <select aria-label="定軌目標" value={mod.item} onChange={(e) => S<"epitomized">((x) => { x.item = e.target.value; })}>
              {pool.map((id) => <option key={id} value={id}>{model.items.find((x) => x.id === id)?.name ?? id}</option>)}
            </select>
          </Field>
          <Field label="歪幾次後必中"><NumberInput label="定軌點數" value={mod.points} min={1} onChange={(v) => S<"epitomized">((x) => { x.points = Math.max(1, Math.round(v)); })} /></Field>
        </div>
      );
    }
    case "exchange":
      return (
        <>
          <div className="grid">
            <Field label="每抽得到點數"><NumberInput label="每抽點數" value={mod.pointsPerPull} min={1} onChange={(v) => S<"exchange">((x) => { x.pointsPerPull = Math.max(1, Math.round(v)); })} /></Field>
            <Field label="兌換需要點數"><NumberInput label="兌換點數" value={mod.cost} min={1} onChange={(v) => S<"exchange">((x) => { x.cost = Math.max(1, Math.round(v)); })} /></Field>
          </div>
          <Field label="可兌換"><ItemPicker model={model} value={mod.items} onChange={(v) => S<"exchange">((x) => { x.items = v; })} /></Field>
        </>
      );
  }
}
