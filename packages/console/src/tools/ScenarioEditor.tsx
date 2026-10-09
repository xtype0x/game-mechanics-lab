import type { DamageRules, ModOp, Modifier, Scenario, SkillType } from "@ggt/core";
import { Field, NumberField, Section } from "../ui";
import { ExprField } from "./common";

const SKILL_TYPES: { value: SkillType; label: string }[] = [
  { value: "basic", label: "普攻" },
  { value: "skill", label: "戰技" },
  { value: "ultimate", label: "大招" },
  { value: "followup", label: "追加攻擊" },
];

const OP_LABELS: Record<ModOp, string> = { pct: "百分比（乘基礎）", add: "固定值加算", mul: "獨立乘算", override: "強制覆寫" };

export type ScenarioUpdate = (fn: (s: Scenario) => void) => void;

let modCounter = 0;

export function ScenarioEditor({ scenario: sc, rules, onChange }: { scenario: Scenario; rules: DamageRules; onChange: ScenarioUpdate }) {
  const targets = [
    ...rules.stats.map((s) => ({ value: `stat:${s.side}.${s.key}`, label: `${s.side === "attacker" ? "攻方" : "守方"}・${s.label}`, percent: s.unit === "percent" })),
    ...rules.steps.map((s) => ({ value: `step:${s.id}`, label: `乘區・${s.label}`, percent: false })),
  ];

  return (
    <div className="scenario-editor">
      <Section title="技能">
        <div className="grid-fields">
          <Field label="名稱">
            <input value={sc.skill.name} onChange={(e) => onChange((s) => { s.skill.name = e.target.value; })} />
          </Field>
          <Field label="技能倍率" hint="基礎傷害 = 攻擊力 × 倍率">
            <NumberField percent value={sc.skill.multiplier} onChange={(v) => onChange((s) => { s.skill.multiplier = v; })} />
          </Field>
          <Field label="類型">
            <select value={sc.skill.type} onChange={(e) => onChange((s) => { s.skill.type = e.target.value as SkillType; })}>
              {SKILL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="屬性">
            <input value={sc.skill.element} onChange={(e) => onChange((s) => { s.skill.element = e.target.value; })} />
          </Field>
          <Field label="命中段數與比例" hint="以逗號分隔每段比例，例如 0.3, 0.3, 0.4">
            <HitsInput hits={sc.skill.hits} onChange={(h) => onChange((s) => { s.skill.hits = h; })} />
          </Field>
        </div>
      </Section>

      {(["attacker", "defender"] as const).map((side) => {
        const stats = rules.stats.filter((s) => s.side === side);
        if (!stats.length) return null;
        return (
          <Section key={side} title={side === "attacker" ? "攻擊方" : "防守方"}>
            <div className="grid-fields">
              {stats.map((st) => (
                <Field key={st.key} label={st.label}>
                  <NumberField
                    percent={st.unit === "percent"}
                    value={sc[side][st.key] ?? st.default}
                    min={st.min}
                    max={st.max}
                    onChange={(v) => onChange((s) => { s[side][st.key] = v; })}
                  />
                </Field>
              ))}
            </div>
          </Section>
        );
      })}

      {rules.flags.length > 0 && (
        <Section title="狀態">
          <div className="grid-fields">
            {rules.flags.map((f) => (
              <label key={f.key} className="check">
                <input type="checkbox" checked={sc.flags[f.key] ?? f.default} onChange={(e) => onChange((s) => { s.flags[f.key] = e.target.checked; })} />
                {f.label}
              </label>
            ))}
          </div>
        </Section>
      )}

      <Section
        title={`增益與減益（${sc.modifiers.length}）`}
        actions={
          <button
            className="btn small"
            onClick={() =>
              onChange((s) => {
                s.modifiers.push({ id: `mod-${Date.now().toString(36)}-${modCounter++}`, label: "新效果", target: targets[0]?.value ?? "", op: "pct", value: 0.1 });
              })
            }
          >
            ＋ 新增效果
          </button>
        }
      >
        {sc.modifiers.length === 0 && <p className="muted">還沒有效果。增益（例如「攻擊 +20%」）會依修正值模型套用到指定數值或乘區。</p>}
        <div className="mod-list">
          {sc.modifiers.map((m, i) => (
            <ModifierRow
              key={m.id}
              mod={m}
              targets={targets}
              onChange={(fn) => onChange((s) => { fn(s.modifiers[i]!); })}
              onRemove={() => onChange((s) => { s.modifiers.splice(i, 1); })}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

function ModifierRow({
  mod,
  targets,
  onChange,
  onRemove,
}: {
  mod: Modifier;
  targets: { value: string; label: string; percent: boolean }[];
  onChange: (fn: (m: Modifier) => void) => void;
  onRemove: () => void;
}) {
  const target = targets.find((t) => t.value === mod.target);
  const showPercent = mod.op === "pct" || ((mod.op === "add" || mod.op === "override") && !!target?.percent);
  return (
    <div className={`mod-row ${mod.enabled === false ? "disabled" : ""}`}>
      <input type="checkbox" aria-label="啟用" checked={mod.enabled !== false} onChange={(e) => onChange((m) => { m.enabled = e.target.checked; })} />
      <input className="mod-label" aria-label="效果名稱" value={mod.label} onChange={(e) => onChange((m) => { m.label = e.target.value; })} />
      <select aria-label="作用對象" value={mod.target} onChange={(e) => onChange((m) => { m.target = e.target.value; })}>
        {!target && <option value={mod.target}>（無效）{mod.target}</option>}
        {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <select aria-label="運算方式" value={mod.op} onChange={(e) => onChange((m) => { m.op = e.target.value as ModOp; })}>
        {(Object.keys(OP_LABELS) as ModOp[]).map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
      </select>
      <NumberField ariaLabel="數值" percent={showPercent} value={mod.value} onChange={(v) => onChange((m) => { m.value = v; })} width={96} />
      <ExprField
        ariaLabel="生效條件"
        allowEmpty
        placeholder='條件（選填），如 skill.type == "ultimate"'
        value={mod.condition}
        onChange={(e) => onChange((m) => { if (e) m.condition = e; else delete m.condition; })}
      />
      <button className="btn icon" aria-label="刪除效果" title="刪除" onClick={onRemove}>✕</button>
    </div>
  );
}

function HitsInput({ hits, onChange }: { hits: number[]; onChange: (h: number[]) => void }) {
  const sum = hits.reduce((a, b) => a + b, 0);
  return (
    <span className="hits-input">
      <input
        className="mono"
        defaultValue={hits.join(", ")}
        key={hits.join(",")}
        onBlur={(e) => {
          const parsed = e.target.value.split(/[,，\s]+/).filter(Boolean).map(Number);
          if (parsed.length && parsed.length <= 12 && parsed.every((x) => Number.isFinite(x) && x >= 0)) onChange(parsed);
          else e.target.value = hits.join(", ");
        }}
      />
      {Math.abs(sum - 1) > 1e-9 && <span className="hint-warn">合計 {+(sum * 100).toFixed(2)}%</span>}
    </span>
  );
}
