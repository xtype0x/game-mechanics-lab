import {
  DAMAGE_COMPONENTS,
  DAMAGE_TEMPLATES,
  analyzeDamage,
  configFromTemplate,
  parseExpr,
  printExpr,
  type DamageConfig,
  type Project,
  type RoundingMode,
  type StepDef,
} from "@gml/core";
import { useMemo, useState } from "react";
import type { Updater } from "../useProject";
import { Badge, ErrorBox, Field, NumberField, Section, fmt, tryCompute } from "../ui";
import { CompatBadge, ExprField, useDamageRules } from "./common";
import { SummaryCards } from "./DamageBreakdown";

const ROUNDING: { value: RoundingMode; label: string }[] = [
  { value: "none", label: "不取整" },
  { value: "floor", label: "無條件捨去" },
  { value: "ceil", label: "無條件進位" },
  { value: "round", label: "四捨五入" },
];

export function Composer({ project, update }: { project: Project; update: Updater }) {
  const { rules, compat } = useDamageRules(project);
  const config = project.damage.config;
  const setConfig = (fn: (c: DamageConfig) => void) => update((p) => fn(p.damage.config));
  const isCustom = (id: string) => config.customSteps.some((s) => s.id === id);
  const allSteps = useMemo(
    () => [...config.components.flatMap((id) => DAMAGE_COMPONENTS.find((c) => c.id === id)?.steps ?? []), ...config.customSteps],
    [config],
  );
  const disabled = allSteps.filter((s) => config.disabledSteps.includes(s.id));
  const result = useMemo(() => (compat.status === "incompatible" ? null : tryCompute(() => analyzeDamage(rules, project.damage.scenarios.A))), [rules, compat, project.damage.scenarios.A]);

  const editStep = (step: StepDef, patch: Partial<StepDef>) =>
    setConfig((c) => {
      const custom = c.customSteps.find((s) => s.id === step.id);
      if (custom) Object.assign(custom, patch);
      else c.overrides[step.id] = { ...c.overrides[step.id], ...patch };
    });

  return (
    <div className="tool-layout">
      <div className="workspace">
        <Section title="從範本開始">
          <div className="template-list">
            {DAMAGE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                className={`template ${compat.matchedTemplate === t.id ? "on" : ""}`}
                onClick={() => {
                  if (confirm(`套用「${t.name}」？目前的元件選擇、自訂步驟與覆寫會被取代（情境數值保留）。`)) setConfig((c) => Object.assign(c, configFromTemplate(t.id)));
                }}
              >
                <strong>{t.name}</strong>
                <span>{t.description}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="機制元件">
          <div className="component-list">
            {DAMAGE_COMPONENTS.map((comp) => {
              const on = config.components.includes(comp.id);
              const issue = compat.issues.find((i) => i.componentId === comp.id);
              return (
                <label key={comp.id} className={`component ${on ? "on" : ""} ${issue ? "has-issue" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setConfig((c) => {
                      if (e.target.checked) c.components.push(comp.id);
                      else c.components = c.components.filter((x) => x !== comp.id);
                    })}
                  />
                  <div>
                    <strong>{comp.name}</strong>
                    <p>{comp.description}</p>
                    <div className="chips">
                      {comp.provides.map((p) => <span key={p} className="chip provides">提供 {p}</span>)}
                      {comp.requires.map((p) => <span key={p} className="chip requires">需要 {p}</span>)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </Section>

        <CustomVariables config={config} setConfig={setConfig} />

        <Section
          title="計算步驟（依順序執行）"
          actions={
            <button
              className="btn small"
              onClick={() => setConfig((c) => {
                let n = 1;
                while (allSteps.some((s) => s.id === `custom${n}`)) n++;
                c.customSteps.push({ id: `custom${n}`, label: `自訂乘區 ${n}`, apply: "mul", order: 65, base: parseExpr("1") });
              })}
            >
              ＋ 新增自訂乘區
            </button>
          }
        >
          <p className="muted small">「=」設定目前傷害值，「×」乘上。公式可用：攻方／守方數值（如 attacker.atk）、skill.multiplier、hit.ratio、flags.broken、prev（前一步結果）、step.&lt;ID&gt;。</p>
          <div className="step-list">
            {rules.steps.map((s) => {
              const custom = isCustom(s.id);
              const overridden = !custom && !!config.overrides[s.id];
              const stepIssues = compat.issues.filter((i) => i.stepId === s.id);
              return (
                <div key={s.id} className={`step-row ${stepIssues.length ? "has-issue" : ""}`}>
                  <div className="step-top">
                    <NumberField ariaLabel="順序" value={s.order} width={64} onChange={(v) => editStep(s, { order: v })} />
                    {custom ? (
                      <input className="step-label" aria-label="名稱" value={s.label} onChange={(e) => editStep(s, { label: e.target.value })} />
                    ) : (
                      <strong className="step-label">{s.label}</strong>
                    )}
                    <code className="muted">{s.id}</code>
                    {custom ? (
                      <select aria-label="套用方式" value={s.apply} onChange={(e) => editStep(s, { apply: e.target.value as "set" | "mul" })}>
                        <option value="mul">× 乘算</option>
                        <option value="set">= 設定</option>
                      </select>
                    ) : (
                      <Badge tone="muted">{s.apply === "mul" ? "× 乘算" : "= 設定"}</Badge>
                    )}
                    {custom && <Badge tone="info">自訂</Badge>}
                    {overridden && <Badge tone="warn">已修改</Badge>}
                    <span className="spacer" />
                    {overridden && (
                      <button className="btn small ghost" onClick={() => setConfig((c) => { delete c.overrides[s.id]; })}>還原</button>
                    )}
                    {custom ? (
                      <button className="btn small ghost" onClick={() => setConfig((c) => { c.customSteps = c.customSteps.filter((x) => x.id !== s.id); })}>刪除</button>
                    ) : (
                      <button className="btn small ghost" onClick={() => setConfig((c) => { c.disabledSteps.push(s.id); })}>停用</button>
                    )}
                  </div>
                  <ExprField ariaLabel={`${s.label} 公式`} value={s.base} onChange={(e) => e && editStep(s, { base: e })} />
                  <div className="step-opts">
                    <Field label="下限"><OptionalNumber value={s.cap?.min} onChange={(v) => editStep(s, { cap: { ...s.cap, min: v } })} /></Field>
                    <Field label="上限"><OptionalNumber value={s.cap?.max} onChange={(v) => editStep(s, { cap: { ...s.cap, max: v } })} /></Field>
                    <Field label="取整">
                      <select value={s.rounding ?? "none"} onChange={(e) => editStep(s, { rounding: e.target.value as RoundingMode })}>
                        {ROUNDING.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </Field>
                  </div>
                  {stepIssues.map((i, k) => <div key={k} className="issue err">{i.message}</div>)}
                </div>
              );
            })}
          </div>
          {disabled.length > 0 && (
            <div className="disabled-steps">
              已停用：
              {disabled.map((s) => (
                <button key={s.id} className="btn small ghost" onClick={() => setConfig((c) => { c.disabledSteps = c.disabledSteps.filter((x) => x !== s.id); })}>
                  {s.label} ↺
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="最終處理">
          <div className="grid-fields">
            <Field label="每段傷害取整">
              <select value={config.finalRounding} onChange={(e) => setConfig((c) => { c.finalRounding = e.target.value as RoundingMode; })}>
                {ROUNDING.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="每段最低傷害">
              <NumberField value={config.minDamage} onChange={(v) => setConfig((c) => { c.minDamage = v; })} />
            </Field>
          </div>
        </Section>
      </div>

      <div className="results">
        <div className="results-head">
          <h2>組合狀態</h2>
          <CompatBadge status={compat.status} />
        </div>
        <CompatExplain status={compat.status} template={DAMAGE_TEMPLATES.find((t) => t.id === compat.matchedTemplate)?.name} />
        {compat.issues.length > 0 && (
          <Section title={`問題（${compat.issues.length}）`}>
            {compat.issues.map((i, k) => <div key={k} className={`issue ${i.level === "error" ? "err" : "warn"}`}>{i.level === "error" ? "✕" : "!"} {i.message}</div>)}
          </Section>
        )}
        <Section title="每段傷害公式">
          <div className="formula-chain">
            {rules.steps.map((s, i) => (
              <span key={s.id} className={`fchip ${s.apply}`} title={printExpr(s.base)}>
                {i > 0 && <em>{s.apply === "mul" ? "×" : "→"}</em>}
                {s.label}
              </span>
            ))}
          </div>
        </Section>
        <Section title={`即時結果（方案 A：${project.damage.scenarios.A.name}）`}>
          {result === null ? <p className="muted">組合不相容，無法計算。</p> : result.ok ? <SummaryCards a={result.value} /> : <ErrorBox error={result.error} />}
          {result?.ok && <p className="muted small">每段平均期望 {fmt(result.value.expected / Math.max(1, result.value.nonCrit.hits.length), 1)}。到「傷害計算與分項檢視」查看逐乘區細節。</p>}
        </Section>
      </div>
    </div>
  );
}

function CompatExplain({ status, template }: { status: string; template?: string }) {
  if (status === "verified") return <p className="explain ok">與範本「{template}」完全相同，公式與測試向量都已驗證。</p>;
  if (status === "experimental") return <p className="explain warn">可以運作，但這個組合沒有對應的已驗證範本，數值平衡與公式語意請自行確認。這屬於「自訂規則」。</p>;
  return <p className="explain err">組合有衝突或缺少依賴，修正下列問題後才能計算。</p>;
}

const IDENT = /^[A-Za-z_]\w*$/;

function CustomVariables({ config, setConfig }: { config: DamageConfig; setConfig: (fn: (c: DamageConfig) => void) => void }) {
  const stats = config.customStats ?? [];
  const flags = config.customFlags ?? [];
  const nextKey = (prefix: string, taken: string[]) => {
    let n = 1;
    while (taken.includes(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  };
  return (
    <Section
      title="自訂數值與狀態"
      actions={
        <>
          <button className="btn small" onClick={() => setConfig((c) => {
            (c.customStats ??= []).push({ side: "attacker", key: nextKey("custom", stats.map((s) => s.key)), label: "自訂數值", default: 0, unit: "percent" });
          })}>＋ 數值</button>
          <button className="btn small" onClick={() => setConfig((c) => {
            (c.customFlags ??= []).push({ key: nextKey("flag", flags.map((f) => f.key)), label: "自訂狀態", default: false });
          })}>＋ 狀態</button>
        </>
      }
    >
      {stats.length === 0 && flags.length === 0 && (
        <p className="muted small">需要新的變數時在這裡定義，例如攻方「精英增傷」→ 公式中寫 attacker.eliteBonus；狀態「目標是首領」→ flags.isBoss。定義後會出現在情境編輯器中。</p>
      )}
      <div className="var-list">
        {stats.map((s, i) => (
          <div key={i} className="var-row">
            <select aria-label="所屬" value={s.side} onChange={(e) => setConfig((c) => { c.customStats![i]!.side = e.target.value as "attacker" | "defender"; })}>
              <option value="attacker">attacker（攻方）</option>
              <option value="defender">defender（守方）</option>
            </select>
            <IdentInput value={s.key} onChange={(v) => setConfig((c) => { c.customStats![i]!.key = v; })} />
            <input aria-label="顯示名稱" value={s.label} onChange={(e) => setConfig((c) => { c.customStats![i]!.label = e.target.value; })} />
            <select aria-label="單位" value={s.unit} onChange={(e) => setConfig((c) => { c.customStats![i]!.unit = e.target.value as "flat" | "percent"; })}>
              <option value="percent">百分比</option>
              <option value="flat">數值</option>
            </select>
            <NumberField ariaLabel="預設值" percent={s.unit === "percent"} value={s.default} onChange={(v) => setConfig((c) => { c.customStats![i]!.default = v; })} />
            <button className="btn icon" aria-label="刪除" onClick={() => setConfig((c) => { c.customStats!.splice(i, 1); })}>✕</button>
          </div>
        ))}
        {flags.map((f, i) => (
          <div key={`f${i}`} className="var-row">
            <span className="mono muted">flags.</span>
            <IdentInput value={f.key} onChange={(v) => setConfig((c) => { c.customFlags![i]!.key = v; })} />
            <input aria-label="顯示名稱" value={f.label} onChange={(e) => setConfig((c) => { c.customFlags![i]!.label = e.target.value; })} />
            <label className="check small"><input type="checkbox" checked={f.default} onChange={(e) => setConfig((c) => { c.customFlags![i]!.default = e.target.checked; })} />預設開啟</label>
            <span />
            <button className="btn icon" aria-label="刪除" onClick={() => setConfig((c) => { c.customFlags!.splice(i, 1); })}>✕</button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function IdentInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const valid = IDENT.test(text);
  return (
    <input
      aria-label="變數名稱（英文）"
      className={`mono ${valid ? "" : "invalid"}`}
      title={valid ? "公式中使用的名稱" : "只能使用英文字母、數字、底線，且不能以數字開頭"}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (IDENT.test(e.target.value)) onChange(e.target.value);
      }}
    />
  );
}

function OptionalNumber({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  return (
    <input
      className="opt-num mono"
      inputMode="decimal"
      placeholder="無"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim() === "") onChange(undefined);
        else if (Number.isFinite(Number(e.target.value))) onChange(Number(e.target.value));
      }}
    />
  );
}
