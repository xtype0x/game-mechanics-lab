import { tr, displayText } from "./i18n";
import { Gacha } from "@gml/core";
import { Card, Field, NumberInput } from "./ui";
import { MODULE_LABELS, defaultModule, nextId, type Model } from "./state";

type Edit = (fn: (m: Model) => void) => void;

const KINDS = Object.keys(MODULE_LABELS) as Gacha.ModuleKind[];

export function ModelEditor({ model, edit, issues }: { model: Model; edit: Edit; issues: Gacha.ModelIssue[] }) {
  const tierName = (id: string) => displayText(model.tiers.find((t) => t.id === id)?.name ?? id);
  return (
    <>
      <Card title={tr("modelEditor1")}>
        <div className="grid">
          <Field label={tr("modelEditor2")}><input value={displayText(model.name)} onChange={(e) => edit((m) => { m.name = e.target.value; })} /></Field>
          <Field label={tr("modelEditor3")}><NumberInput label={tr("modelEditor3")} value={model.pull.cost} min={0} onChange={(v) => edit((m) => { m.pull.cost = v; })} /></Field>
          <Field label={tr("modelEditor4")}><input value={displayText(model.pull.currency)} onChange={(e) => edit((m) => { m.pull.currency = e.target.value; })} /></Field>
          <Field label={tr("modelEditor5")}><NumberInput label={tr("modelEditor6")} value={model.pull.batchSize} min={1} onChange={(v) => edit((m) => { m.pull.batchSize = Math.max(1, Math.round(v)); })} /></Field>
        </div>
      </Card>

      <Card title={tr("modelEditor7")} actions={<button className="btn small" onClick={() => edit((m) => {
        const id = nextId("t", m.tiers.map((t) => t.id));
        const itemId = nextId("item", m.items.map((x) => x.id));
        m.items.push({ id: itemId, name: tr("modelEditor8"), kind: "resource" });
        m.tiers.splice(Math.max(0, m.tiers.length - 1), 0, { id, name: tr("modelEditor9"), rate: 0.05, items: [itemId] });
      })}>{tr("modelEditor10")}</button>}>
        <p className="hint">{tr("modelEditor11")}</p>
        <table className="table">
          <thead><tr><th>{tr("modelEditor12")}</th><th>{tr("modelEditor13")}</th><th>{tr("modelEditor14")}</th><th /></tr></thead>
          <tbody>
            {model.tiers.map((t, i) => {
              const last = i === model.tiers.length - 1;
              return (
                <tr key={t.id}>
                  <td><input className="short" aria-label={tr("modelEditor15")} value={displayText(t.name)} onChange={(e) => edit((m) => { m.tiers[i]!.name = e.target.value; })} /></td>
                  <td>{last ? <span className="muted">{tr("modelEditor16")}</span> : <NumberInput label={tr("modelEditor17", t.name)} percent value={t.rate} min={0} max={1} width={96} onChange={(v) => edit((m) => { m.tiers[i]!.rate = v; })} />}</td>
                  <td>
                    <div className="chips">
                      {t.items.map((id) => {
                        const it = model.items.find((x) => x.id === id);
                        return <input key={id} className="chip-input" aria-label={tr("modelEditor18")} value={displayText(it?.name ?? id)} onChange={(e) => edit((m) => { const x = m.items.find((y) => y.id === id); if (x) x.name = e.target.value; })} />;
                      })}
                      <button className="btn tiny" title={tr("modelEditor19")} onClick={() => edit((m) => { const id = nextId("item", m.items.map((x) => x.id)); m.items.push({ id, name: tr("modelEditor8"), kind: "resource" }); m.tiers[i]!.items.push(id); })}>{tr("modelEditor20")}</button>
                      {t.items.length > 1 && <button className="btn tiny" title={tr("modelEditor21")} onClick={() => edit((m) => { m.tiers[i]!.items.pop(); })}>{tr("modelEditor22")}</button>}
                    </div>
                  </td>
                  <td className="r">{model.tiers.length > 1 && <button className="btn tiny ghost" aria-label={tr("modelEditor23", t.name)} onClick={() => edit((m) => {
                    m.tiers.splice(i, 1);
                    m.modules = m.modules.filter((x) => !("tier" in x && x.tier === t.id) && !(x.kind === "batchFloor" && x.minTier === t.id));
                  })}>✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title={tr("modelEditor24")} actions={
        <select aria-label={tr("modelEditor25")} value="" onChange={(e) => { const k = e.target.value as Gacha.ModuleKind; if (k) edit((m) => { m.modules.push(defaultModule(k, m)); }); }}>
          <option value="">{tr("modelEditor26")}</option>
          {KINDS.map((k) => <option key={k} value={k}>{displayText(MODULE_LABELS[k].name)}</option>)}
        </select>
      }>
        {model.modules.length === 0 && <p className="hint">{tr("modelEditor27")}</p>}
        <div className="modules">
          {model.modules.map((mod, i) => (
            <div key={i} className="module">
              <div className="module-head">
                <b>{displayText(MODULE_LABELS[mod.kind].name)}</b>
                <span className="hint">{displayText(MODULE_LABELS[mod.kind].help)}</span>
                <button className="btn tiny ghost" aria-label={tr("modelEditor28", MODULE_LABELS[mod.kind].name)} onClick={() => edit((m) => { m.modules.splice(i, 1); })}>✕</button>
              </div>
              <ModuleFields model={model} mod={mod} set={(fn) => edit((m) => fn(m.modules[i]!))} tierName={tierName} />
              {issues.filter((x) => x.where.module === i).map((x, k) => <p key={k} className={`issue ${x.level}`}>{displayText(x.message)}</p>)}
            </div>
          ))}
        </div>
        {issues.filter((x) => x.where.module === undefined).map((x, k) => <p key={k} className={`issue ${x.level}`}>{displayText(x.message)}</p>)}
      </Card>
    </>
  );
}

function TierSelect({ model, value, onChange, label }: { model: Model; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {model.tiers.map((t) => <option key={t.id} value={t.id}>{displayText(t.name)}</option>)}
    </select>
  );
}

function ItemPicker({ model, value, onChange }: { model: Model; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {model.items.map((it) => (
        <label key={it.id} className={`chip ${value.includes(it.id) ? "on" : ""}`}>
          <input type="checkbox" checked={value.includes(it.id)} onChange={(e) => onChange(e.target.checked ? [...value, it.id] : value.filter((x) => x !== it.id))} />
          {displayText(it.name)}
        </label>
      ))}
      <span className="hint">{tr("modelEditor29")}</span>
    </div>
  );
}

function ModuleFields({ model, mod, set, tierName }: { model: Model; mod: Gacha.RuleModule; set: (fn: (x: Gacha.RuleModule) => void) => void; tierName: (id: string) => string }) {
  const S = <K extends Gacha.ModuleKind>(fn: (x: Extract<Gacha.RuleModule, { kind: K }>) => void) => set((x) => fn(x as Extract<Gacha.RuleModule, { kind: K }>));
  switch (mod.kind) {
    case "softPity":
      return (
        <div className="grid">
          <Field label={tr("modelEditor12")}><TierSelect label={tr("modelEditor12")} model={model} value={mod.tier} onChange={(v) => S<"softPity">((x) => { x.tier = v; })} /></Field>
          <Field label={tr("modelEditor30")}><NumberInput label={tr("modelEditor31")} value={mod.start} min={1} onChange={(v) => S<"softPity">((x) => { x.start = Math.max(1, Math.round(v)); })} /></Field>
          <Field label={tr("modelEditor32")}><NumberInput label={tr("modelEditor32")} percent value={mod.step} min={0} max={1} onChange={(v) => S<"softPity">((x) => { x.step = v; })} /></Field>
          <Field label={tr("modelEditor33")} hint={tr("modelEditor34")}><NumberInput label={tr("modelEditor33")} percent value={mod.max ?? 1} min={0} max={1} onChange={(v) => S<"softPity">((x) => { if (v >= 1) delete x.max; else x.max = v; })} /></Field>
        </div>
      );
    case "hardPity":
      return (
        <div className="grid">
          <Field label={tr("modelEditor12")}><TierSelect label={tr("modelEditor12")} model={model} value={mod.tier} onChange={(v) => S<"hardPity">((x) => { x.tier = v; })} /></Field>
          <Field label={tr("modelEditor35")}><NumberInput label={tr("modelEditor35")} value={mod.at} min={1} onChange={(v) => S<"hardPity">((x) => { x.at = Math.max(1, Math.round(v)); })} /></Field>
        </div>
      );
    case "featured":
      return (
        <>
          <div className="grid">
            <Field label={tr("modelEditor12")}><TierSelect label={tr("modelEditor12")} model={model} value={mod.tier} onChange={(v) => S<"featured">((x) => { x.tier = v; })} /></Field>
            <Field label={tr("modelEditor36")}><NumberInput label={tr("modelEditor37")} percent value={mod.share} min={0} max={1} onChange={(v) => S<"featured">((x) => { x.share = v; })} /></Field>
          </div>
          <Field label={tr("modelEditor38")}><ItemPicker model={model} value={mod.items} onChange={(v) => S<"featured">((x) => { x.items = v; })} /></Field>
          <p className="hint">{tr("modelEditor39")}{tierName(mod.tier)}{tr("modelEditor40")}{(model.tiers.find((t) => t.id === mod.tier)!.rate * mod.share * 100).toFixed(3)}%</p>
        </>
      );
    case "guarantee":
      return <div className="grid"><Field label={tr("modelEditor12")}><TierSelect label={tr("modelEditor12")} model={model} value={mod.tier} onChange={(v) => S<"guarantee">((x) => { x.tier = v; })} /></Field></div>;
    case "batchFloor":
      return (
        <div className="grid">
          <Field label={tr("modelEditor41")}><NumberInput label={tr("modelEditor42")} value={mod.slot} min={1} max={model.pull.batchSize} onChange={(v) => S<"batchFloor">((x) => { x.slot = Math.round(v); })} /></Field>
          <Field label={tr("modelEditor43")}><TierSelect label={tr("modelEditor44")} model={model} value={mod.minTier} onChange={(v) => S<"batchFloor">((x) => { x.minTier = v; })} /></Field>
        </div>
      );
    case "milestone":
      return (
        <>
          <div className="grid"><Field label={tr("modelEditor12")}><TierSelect label={tr("modelEditor12")} model={model} value={mod.tier} onChange={(v) => S<"milestone">((x) => { x.tier = v; })} /></Field></div>
          <table className="table compact">
            <thead><tr><th>{tr("modelEditor45")}</th><th>{tr("modelEditor46")}</th><th /></tr></thead>
            <tbody>
              {mod.steps.map((st, j) => (
                <tr key={j}>
                  <td><NumberInput label={tr("modelEditor47")} value={st.at} min={1} onChange={(v) => S<"milestone">((x) => { x.steps[j]!.at = Math.max(1, Math.round(v)); })} /></td>
                  <td><NumberInput label={tr("modelEditor37")} percent value={st.featuredShare} min={0} max={1} onChange={(v) => S<"milestone">((x) => { x.steps[j]!.featuredShare = v; })} /></td>
                  <td className="r">{mod.steps.length > 1 && <button className="btn tiny ghost" aria-label={tr("modelEditor48")} onClick={() => S<"milestone">((x) => { x.steps.splice(j, 1); })}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn tiny" onClick={() => S<"milestone">((x) => { x.steps.push({ at: (x.steps.at(-1)?.at ?? 0) + 50, featuredShare: 1 }); })}>{tr("modelEditor49")}</button>
        </>
      );
    case "epitomized": {
      const f = model.modules.find((x) => x.kind === "featured" && x.tier === mod.tier);
      const pool = f && f.kind === "featured" ? f.items : [];
      return (
        <div className="grid">
          <Field label={tr("modelEditor12")}><TierSelect label={tr("modelEditor12")} model={model} value={mod.tier} onChange={(v) => S<"epitomized">((x) => { x.tier = v; })} /></Field>
          <Field label={tr("modelEditor50")}>
            <select aria-label={tr("modelEditor50")} value={mod.item} onChange={(e) => S<"epitomized">((x) => { x.item = e.target.value; })}>
              {pool.map((id) => <option key={id} value={id}>{displayText(model.items.find((x) => x.id === id)?.name ?? id)}</option>)}
            </select>
          </Field>
          <Field label={tr("modelEditor51")}><NumberInput label={tr("modelEditor52")} value={mod.points} min={1} onChange={(v) => S<"epitomized">((x) => { x.points = Math.max(1, Math.round(v)); })} /></Field>
        </div>
      );
    }
    case "exchange":
      return (
        <>
          <div className="grid">
            <Field label={tr("modelEditor53")}><NumberInput label={tr("modelEditor54")} value={mod.pointsPerPull} min={1} onChange={(v) => S<"exchange">((x) => { x.pointsPerPull = Math.max(1, Math.round(v)); })} /></Field>
            <Field label={tr("modelEditor55")}><NumberInput label={tr("modelEditor56")} value={mod.cost} min={1} onChange={(v) => S<"exchange">((x) => { x.cost = Math.max(1, Math.round(v)); })} /></Field>
          </div>
          <Field label={tr("modelEditor57")}><ItemPicker model={model} value={mod.items} onChange={(v) => S<"exchange">((x) => { x.items = v; })} /></Field>
        </>
      );
  }
}
