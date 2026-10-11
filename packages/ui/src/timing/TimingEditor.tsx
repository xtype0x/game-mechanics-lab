import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Timing, c, op, parseExpr, printExpr, r, type Expr } from "@gml/core";
import { Badge, NumberField } from "../base";
import { formulaVariables, uniqueId } from "./helpers";

type Config = Timing.TimingConfig;
type Interaction = Timing.InteractionDef;
type Effect = Timing.EffectDef;
type Update = (fn: (draft: Config) => void) => void;

export type TimingEditorSection = "basic" | "interactions" | "outcomes" | "lists" | "validation";

const KIND_LABEL: Record<Timing.OutcomeKind, string> = { perfect: "完美", success: "成功", fail: "失敗", neutral: "中性" };

const int = (v: number) => Math.max(0, Math.round(v));
const move = <T,>(arr: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  const [x] = arr.splice(i, 1);
  arr.splice(j, 0, x!);
};

/** Full editor of a TimingConfig. Controlled: every edit calls onChange with a fresh copy. */
export function TimingEditor({ config, onChange, sections }: { config: Config; onChange: (c: Config) => void; sections?: TimingEditorSection[] }) {
  const show = (s: TimingEditorSection) => !sections || sections.includes(s);
  const upd: Update = (fn) => {
    const d = structuredClone(config);
    fn(d);
    onChange(d);
  };
  const issues = useMemo(() => {
    try { return Timing.validateTiming(config); } catch { return [{ level: "error" as const, path: "config", message: "結構不完整，無法驗證" }]; }
  }, [config]);
  const errors = issues.filter((i) => i.level === "error").length;

  return (
    <div className="tm-editor">
      {show("basic") && <BasicSection config={config} upd={upd} />}
      {show("interactions") && <InteractionsSection config={config} upd={upd} />}
      {show("outcomes") && <OutcomesSection config={config} upd={upd} />}
      {show("lists") && <ListsSection config={config} upd={upd} />}
      {show("validation") && (
        <Collapsible title="驗證" badge={errors ? <Badge tone="err">{errors} 個錯誤</Badge> : issues.length ? <Badge tone="warn">{issues.length} 個警告</Badge> : <Badge tone="ok">無問題</Badge>} open={errors > 0}>
          {issues.length === 0 ? <p className="tm-muted">設定通過所有檢查。</p> : (
            <ul className="tm-issues">
              {issues.map((i, k) => (
                <li key={k}><Badge tone={i.level === "error" ? "err" : "warn"}>{i.level === "error" ? "錯誤" : "警告"}</Badge> <code>{i.path}</code> {i.message}</li>
              ))}
            </ul>
          )}
        </Collapsible>
      )}
    </div>
  );
}

function Collapsible({ title, badge, actions, open, children }: { title: string; badge?: ReactNode; actions?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details className="tm-sec" open={open}>
      <summary><span className="tm-sec-title">{title}</span>{badge}<span className="tm-sec-actions" onClick={(e) => e.preventDefault()}>{actions}</span></summary>
      <div className="tm-sec-body">{children}</div>
    </details>
  );
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="tm-field" title={hint}><span>{label}</span>{children}</label>;
}

function FrameField({ label, value, onChange, fps, hint }: { label: string; value: number; onChange: (v: number) => void; fps: number; hint?: string }) {
  return (
    <Row label={label} {...(hint ? { hint } : {})}>
      <span className="tm-frames">
        <NumberField value={value} min={0} step={1} width={72} onChange={(v) => onChange(int(v))} ariaLabel={label} />
        <small>{Math.round(Timing.framesToMs(value, fps))}ms</small>
      </span>
    </Row>
  );
}

function Select({ value, onChange, options, ariaLabel }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; ariaLabel?: string }) {
  return (
    <select value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ColorInput({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <span className="tm-color">
      <input type="color" value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#888888"} onChange={(e) => onChange(e.target.value)} aria-label="顏色" />
      {value && <button type="button" className="tm-btn tm-mini" onClick={() => onChange(undefined)} title="清除顏色">×</button>}
    </span>
  );
}

function RowTools({ i, n, onMove, onDup, onDel }: { i: number; n: number; onMove: (d: number) => void; onDup?: () => void; onDel: () => void }) {
  return (
    <span className="tm-rowtools" onClick={(e) => e.preventDefault()}>
      <button type="button" className="tm-btn tm-mini" disabled={i === 0} onClick={() => onMove(-1)} title="上移" aria-label="上移">↑</button>
      <button type="button" className="tm-btn tm-mini" disabled={i === n - 1} onClick={() => onMove(1)} title="下移" aria-label="下移">↓</button>
      {onDup && <button type="button" className="tm-btn tm-mini" onClick={onDup} title="複製" aria-label="複製">⧉</button>}
      <button type="button" className="tm-btn tm-mini danger" onClick={onDel} title="刪除" aria-label="刪除">✕</button>
    </span>
  );
}

/** Expr edited as infix text: parsed on blur / Enter, the last valid value is kept while the text is invalid. */
export function ExprInput({ value, onChange, placeholder, ariaLabel }: { value: Expr; onChange: (e: Expr) => void; placeholder?: string; ariaLabel?: string }) {
  const printed = useMemo(() => printExpr(value), [value]);
  const [text, setText] = useState(printed);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setText(printed); setErr(null); }, [printed]);
  const commit = () => {
    try {
      const e = parseExpr(text);
      setErr(null);
      if (printExpr(e) !== printed) onChange(e);
      else setText(printed);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    }
  };
  return (
    <span className="tm-expr">
      <input
        className={err ? "invalid mono" : "mono"} value={text} placeholder={placeholder} aria-label={ariaLabel} spellCheck={false}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      />
      {err && <small className="tm-err">{err}（沿用「{printed}」）</small>}
    </span>
  );
}

/* ---------------------------------- 基本 ---------------------------------- */

function BasicSection({ config, upd }: { config: Config; upd: Update }) {
  return (
    <Collapsible title="基本" open>
      <Row label="名稱"><input value={config.name} onChange={(e) => upd((d) => { d.name = e.target.value; })} /></Row>
      <Row label="說明"><input value={config.description ?? ""} onChange={(e) => upd((d) => { if (e.target.value) d.description = e.target.value; else delete d.description; })} /></Row>
      <Row label="每秒幀數 fps" hint="只用於顯示與毫秒換算"><NumberField value={config.fps} min={1} step={1} width={72} onChange={(v) => upd((d) => { d.fps = Math.max(1, Math.round(v)); })} ariaLabel="fps" /></Row>
      <FrameField label="輸入延遲校正" value={config.inputOffset} fps={config.fps} hint="攻擊在命中幀之後這麼多幀才結算（spec §4.6）" onChange={(v) => upd((d) => { d.inputOffset = v; })} />
      <Row label="未攔截的結果" hint="攻擊沒被攔截、也沒被無敵擋下時套用">
        <Select value={config.hitOutcome} onChange={(v) => upd((d) => { d.hitOutcome = v; })} options={config.outcomes.map((o) => ({ value: o.id, label: o.name }))} />
      </Row>
      <Row label="生命資源" hint="傷害效果扣的資源；歸零即敗北">
        <Select value={config.healthResource} onChange={(v) => upd((d) => { d.healthResource = v; })} options={config.resources.map((o) => ({ value: o.id, label: o.name }))} />
      </Row>
    </Collapsible>
  );
}

/* ---------------------------------- 互動 ---------------------------------- */

function newInteraction(config: Config): Interaction {
  const ok = config.outcomes.find((o) => o.kind === "success")?.id ?? null;
  return {
    id: uniqueId("action", config.interactions.map((i) => i.id)), name: "新互動", key: "", priority: 5, startup: 0,
    windows: [{ id: "w1", name: "判定", frames: 8 }], successRecovery: 8, whiffRecovery: 20, maxCatches: 1,
    table: [{ tag: null, cells: { w1: ok } }], cooldown: 0, buffer: 0,
  };
}

function InteractionsSection({ config, upd }: { config: Config; upd: Update }) {
  return (
    <Collapsible title="互動" badge={<Badge tone="muted">{config.interactions.length}</Badge>} open
      actions={<button type="button" className="tm-btn" onClick={() => upd((d) => { d.interactions.push(newInteraction(d)); })}>＋ 新增互動</button>}>
      <p className="tm-muted tm-note">格擋、閃避、技能都只是互動資料；可以新增自己的互動。</p>
      {config.interactions.map((it, idx) => (
        <details key={it.id} className="tm-item">
          <summary>
            <i className="tm-dot" style={{ background: it.color ?? "#888" }} />
            <b>{it.name}</b> <code>{it.id}</code>
            <RowTools i={idx} n={config.interactions.length}
              onMove={(dir) => upd((d) => move(d.interactions, idx, dir))}
              onDup={() => upd((d) => {
                const copy = structuredClone(d.interactions[idx]!);
                copy.id = uniqueId(`${copy.id}_`, d.interactions.map((x) => x.id));
                copy.name += " 副本";
                d.interactions.splice(idx + 1, 0, copy);
              })}
              onDel={() => upd((d) => { d.interactions.splice(idx, 1); })} />
          </summary>
          <InteractionBody config={config} idx={idx} upd={upd} />
        </details>
      ))}
    </Collapsible>
  );
}

function InteractionBody({ config, idx, upd }: { config: Config; idx: number; upd: Update }) {
  const it = config.interactions[idx]!;
  const fps = config.fps;
  const ed = (fn: (i: Interaction) => void) => upd((d) => fn(d.interactions[idx]!));
  const outcomeOpts = [{ value: "", label: "（無）" }, ...config.outcomes.map((o) => ({ value: o.id, label: o.name }))];
  return (
    <div className="tm-item-body">
      <div className="tm-grid">
        <Row label="名稱"><input value={it.name} onChange={(e) => ed((i) => { i.name = e.target.value; })} /></Row>
        <Row label="按鍵提示" hint="只是提示，例如 KeyJ"><input value={it.key ?? ""} placeholder="KeyJ" onChange={(e) => ed((i) => { if (e.target.value) i.key = e.target.value; else delete i.key; })} /></Row>
        <Row label="顏色"><ColorInput value={it.color} onChange={(v) => ed((i) => { if (v) i.color = v; else delete i.color; })} /></Row>
        <Row label="優先度" hint="同幀多個按鍵可接受時，數字小的優先"><NumberField value={it.priority} step={1} width={72} onChange={(v) => ed((i) => { i.priority = Math.round(v); })} ariaLabel="優先度" /></Row>
        <FrameField label="啟動" value={it.startup} fps={fps} hint="接受按鍵後到第一個判定窗之前" onChange={(v) => ed((i) => { i.startup = v; })} />
        <FrameField label="成功收招" value={it.successRecovery} fps={fps} onChange={(v) => ed((i) => { i.successRecovery = v; })} />
        <FrameField label="落空收招" value={it.whiffRecovery} fps={fps} onChange={(v) => ed((i) => { i.whiffRecovery = v; })} />
        <Row label="最多攔截" hint="0 = 不限"><NumberField value={it.maxCatches} min={0} step={1} width={72} onChange={(v) => ed((i) => { i.maxCatches = int(v); })} ariaLabel="最多攔截" /></Row>
        <FrameField label="冷卻" value={it.cooldown} fps={fps} onChange={(v) => ed((i) => { i.cooldown = v; })} />
        <FrameField label="緩衝" value={it.buffer} fps={fps} hint="忙碌時按下的鍵保留幾幀；0 = 丟棄" onChange={(v) => ed((i) => { i.buffer = v; })} />
        <Row label="落空時結果"><Select value={it.whiffOutcome ?? ""} options={outcomeOpts} onChange={(v) => ed((i) => { if (v) i.whiffOutcome = v; else delete i.whiffOutcome; })} /></Row>
        <Row label="接受時結果"><Select value={it.onAccept ?? ""} options={outcomeOpts} onChange={(v) => ed((i) => { if (v) i.onAccept = v; else delete i.onAccept; })} /></Row>
      </div>

      <h4>判定窗 <small className="tm-muted">共 {it.windows.reduce((s, w) => s + w.frames, 0)} 幀</small></h4>
      <div className="tm-list">
        {it.windows.map((w, wi) => (
          <div key={w.id} className="tm-list-row">
            <code title="id（固定）">{w.id}</code>
            <input value={w.name} aria-label="判定窗名稱" onChange={(e) => ed((i) => { i.windows[wi]!.name = e.target.value; })} />
            <FrameField label="幀" value={w.frames} fps={fps} onChange={(v) => ed((i) => { i.windows[wi]!.frames = v; })} />
            <label className="tm-chip" title="嚴格窗會被連打縮減，緩衝的按鍵也會跳過它"><input type="checkbox" checked={!!w.strict} onChange={(e) => ed((i) => { if (e.target.checked) i.windows[wi]!.strict = true; else delete i.windows[wi]!.strict; })} />嚴格</label>
            <RowTools i={wi} n={it.windows.length} onMove={(dir) => ed((i) => move(i.windows, wi, dir))}
              onDel={() => ed((i) => { const [gone] = i.windows.splice(wi, 1); for (const row of i.table) delete row.cells[gone!.id]; })} />
          </div>
        ))}
        <button type="button" className="tm-btn" onClick={() => ed((i) => {
          const id = uniqueId("w", i.windows.map((x) => x.id));
          i.windows.push({ id, name: `判定 ${i.windows.length + 1}`, frames: 6 });
        })}>＋ 判定窗</button>
      </div>

      <h4>結果表</h4>
      <p className="tm-muted tm-note">攻擊落在某個判定窗時，由上往下找第一列符合其標籤的列，只看那一列；格子選「不攔截」就繼續往下結算（無敵或受傷）。</p>
      <ResultMatrix config={config} it={it} ed={ed} />

      <h4>進階</h4>
      <div className="tm-grid">
        <ToggleGroup label="充能" on={!!it.charges} onToggle={(on) => ed((i) => { if (on) i.charges = { max: 2, recharge: 120, mode: "sequential" }; else delete i.charges; })}>
          {it.charges && <>
            <Row label="上限"><NumberField value={it.charges.max} min={1} step={1} width={72} onChange={(v) => ed((i) => { i.charges!.max = Math.max(1, Math.round(v)); })} ariaLabel="充能上限" /></Row>
            <FrameField label="回復時間" value={it.charges.recharge} fps={fps} onChange={(v) => ed((i) => { i.charges!.recharge = Math.max(1, v); })} />
            <Row label="模式"><Select value={it.charges.mode} options={[{ value: "sequential", label: "依序回復" }, { value: "parallel", label: "各自計時" }]} onChange={(v) => ed((i) => { i.charges!.mode = v as "sequential" | "parallel"; })} /></Row>
          </>}
        </ToggleGroup>
        <ToggleGroup label="消耗資源" on={!!it.cost} onToggle={(on) => ed((i) => { if (on) i.cost = { resource: config.resources[0]?.id ?? "", amount: 1 }; else delete i.cost; })}>
          {it.cost && <>
            <Row label="資源"><Select value={it.cost.resource} options={config.resources.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => ed((i) => { i.cost!.resource = v; })} /></Row>
            <Row label="數量"><NumberField value={it.cost.amount} min={0} width={72} onChange={(v) => ed((i) => { i.cost!.amount = Math.max(0, v); })} ariaLabel="消耗數量" /></Row>
          </>}
        </ToggleGroup>
        <ToggleGroup label="防連打" on={!!it.spam} onToggle={(on) => ed((i) => { if (on) i.spam = { withinFrames: 20, scope: "self", shrinkPerPress: 2, maxShrink: 4, lockoutAfter: 0, lockoutFrames: 30 }; else delete i.spam; })}>
          {it.spam && <>
            <FrameField label="統計範圍" value={it.spam.withinFrames} fps={fps} onChange={(v) => ed((i) => { i.spam!.withinFrames = v; })} />
            <Row label="計算對象"><Select value={it.spam.scope} options={[{ value: "self", label: "只算自己" }, { value: "all", label: "所有按鍵" }]} onChange={(v) => ed((i) => { i.spam!.scope = v as "self" | "all"; })} /></Row>
            <Row label="每次縮減（幀）"><NumberField value={it.spam.shrinkPerPress} min={0} step={1} width={72} onChange={(v) => ed((i) => { i.spam!.shrinkPerPress = int(v); })} ariaLabel="每次縮減" /></Row>
            <Row label="縮減上限（幀）"><NumberField value={it.spam.maxShrink} min={0} step={1} width={72} onChange={(v) => ed((i) => { i.spam!.maxShrink = int(v); })} ariaLabel="縮減上限" /></Row>
            <Row label="鎖定門檻" hint="0 = 不鎖定"><NumberField value={it.spam.lockoutAfter} min={0} step={1} width={72} onChange={(v) => ed((i) => { i.spam!.lockoutAfter = int(v); })} ariaLabel="鎖定門檻" /></Row>
            <FrameField label="鎖定時間" value={it.spam.lockoutFrames} fps={fps} onChange={(v) => ed((i) => { i.spam!.lockoutFrames = v; })} />
          </>}
        </ToggleGroup>
      </div>
    </div>
  );
}

function ToggleGroup({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  return (
    <fieldset className="tm-toggle">
      <legend><label><input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} /> {label}</label></legend>
      {children}
    </fieldset>
  );
}

function ResultMatrix({ config, it, ed }: { config: Config; it: Interaction; ed: (fn: (i: Interaction) => void) => void }) {
  const outcomeOpts = [{ value: "", label: "不攔截" }, ...config.outcomes.map((o) => ({ value: o.id, label: o.name }))];
  const tagOpts = [{ value: "", label: "預設（全部）" }, ...config.tags.map((t) => ({ value: t.id, label: t.name }))];
  return (
    <div className="tm-matrix-wrap">
      <table className="tm-matrix">
        <thead>
          <tr>
            <th>#　標籤</th>
            {it.windows.map((w) => <th key={w.id}>{w.name}{w.strict ? "*" : ""}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {it.table.map((row, ri) => (
            <tr key={ri}>
              <td><span className="tm-rownum">{ri + 1}</span><Select ariaLabel="列標籤" value={row.tag ?? ""} options={tagOpts} onChange={(v) => ed((i) => { i.table[ri]!.tag = v || null; })} /></td>
              {it.windows.map((w) => (
                <td key={w.id}>
                  <Select ariaLabel={`${w.name}結果`} value={row.cells[w.id] ?? ""} options={outcomeOpts} onChange={(v) => ed((i) => { i.table[ri]!.cells[w.id] = v || null; })} />
                </td>
              ))}
              <td><RowTools i={ri} n={it.table.length} onMove={(dir) => ed((i) => move(i.table, ri, dir))} onDel={() => ed((i) => { i.table.splice(ri, 1); })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="tm-btn" onClick={() => ed((i) => {
        const used = new Set(i.table.map((x) => x.tag));
        const tag = config.tags.find((t) => !used.has(t.id))?.id ?? null;
        i.table.push({ tag, cells: Object.fromEntries(i.windows.map((w) => [w.id, null])) });
      })}>＋ 列</button>
    </div>
  );
}

/* ---------------------------------- 結果 ---------------------------------- */

const EFFECT_TYPES: { type: Effect["type"]; label: string }[] = [
  { type: "damage", label: "傷害" },
  { type: "addResource", label: "增減資源" },
  { type: "invulnerable", label: "無敵" },
  { type: "stun", label: "硬直（中斷動作）" },
  { type: "status", label: "設定狀態" },
  { type: "restoreCharge", label: "回復充能" },
  { type: "cancelRecovery", label: "取消收招" },
  { type: "hitstop", label: "頓幀" },
  { type: "timeScale", label: "慢動作" },
  { type: "cue", label: "訊號（cue）" },
];

type FieldKind = "expr" | "resource" | "status" | "interaction" | "text";
const EFFECT_FIELDS: Record<Effect["type"], { key: string; label: string; kind: FieldKind; optional?: boolean }[]> = {
  damage: [{ key: "amount", label: "傷害量", kind: "expr" }],
  addResource: [{ key: "resource", label: "資源", kind: "resource" }, { key: "amount", label: "數量", kind: "expr" }],
  invulnerable: [{ key: "frames", label: "幀數", kind: "expr" }],
  stun: [{ key: "frames", label: "幀數", kind: "expr" }],
  status: [{ key: "status", label: "狀態", kind: "status" }, { key: "frames", label: "幀數", kind: "expr" }],
  restoreCharge: [{ key: "interaction", label: "互動", kind: "interaction" }, { key: "amount", label: "數量", kind: "expr" }],
  cancelRecovery: [],
  hitstop: [{ key: "frames", label: "幀數", kind: "expr" }],
  timeScale: [{ key: "scale", label: "倍率", kind: "expr" }, { key: "frames", label: "幀數", kind: "expr" }],
  cue: [{ key: "cue", label: "名稱", kind: "text" }, { key: "value", label: "數值", kind: "expr", optional: true }],
};

function defaultEffect(config: Config, type: Effect["type"]): Effect {
  switch (type) {
    case "damage": return { type, amount: r("attack.damage") };
    case "addResource": return { type, resource: config.resources[0]?.id ?? "", amount: c(10) };
    case "invulnerable": return { type, frames: c(30) };
    case "stun": return { type, frames: c(20) };
    case "status": return { type, status: config.statuses[0]?.id ?? "", frames: c(60) };
    case "restoreCharge": return { type, interaction: (config.interactions.find((i) => i.charges) ?? config.interactions[0])?.id ?? "", amount: c(1) };
    case "cancelRecovery": return { type };
    case "hitstop": return { type, frames: c(4) };
    case "timeScale": return { type, scale: c(0.5), frames: c(20) };
    case "cue": return { type, cue: "vfx:new" };
  }
}

function OutcomesSection({ config, upd }: { config: Config; upd: Update }) {
  const vars = useMemo(() => formulaVariables(config), [config]);
  return (
    <Collapsible title="結果與效果" badge={<Badge tone="muted">{config.outcomes.length}</Badge>}
      actions={<button type="button" className="tm-btn" onClick={() => upd((d) => { d.outcomes.push({ id: uniqueId("outcome", d.outcomes.map((o) => o.id)), name: "新結果", kind: "neutral", effects: [] }); })}>＋ 新增結果</button>}>
      <details className="tm-vars">
        <summary>可用的公式變數</summary>
        <ul>{vars.map((v) => <li key={v.name}><code>{v.name}</code> {v.desc}</li>)}</ul>
        <p className="tm-muted">運算子：+ - * / == != &gt; &gt;= &lt; &lt;= &amp;&amp; || !，函式：min max clamp floor ceil round abs if。</p>
      </details>
      {config.outcomes.map((o, oi) => (
        <details key={o.id} className="tm-item">
          <summary>
            <i className="tm-dot" style={{ background: o.color ?? "#888" }} />
            <b>{o.name}</b> <Badge tone={o.kind === "perfect" ? "warn" : o.kind === "success" ? "ok" : o.kind === "fail" ? "err" : "muted"}>{KIND_LABEL[o.kind]}</Badge> <code>{o.id}</code>
            <RowTools i={oi} n={config.outcomes.length}
              onMove={(dir) => upd((d) => move(d.outcomes, oi, dir))}
              onDup={() => upd((d) => {
                const copy = structuredClone(d.outcomes[oi]!);
                copy.id = uniqueId(`${copy.id}_`, d.outcomes.map((x) => x.id));
                copy.name += " 副本";
                d.outcomes.splice(oi + 1, 0, copy);
              })}
              onDel={() => upd((d) => { d.outcomes.splice(oi, 1); })} />
          </summary>
          <div className="tm-item-body">
            <div className="tm-grid">
              <Row label="名稱"><input value={o.name} onChange={(e) => upd((d) => { d.outcomes[oi]!.name = e.target.value; })} /></Row>
              <Row label="類型" hint="只用於顯示與統計">
                <Select value={o.kind} options={(Object.keys(KIND_LABEL) as Timing.OutcomeKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} onChange={(v) => upd((d) => { d.outcomes[oi]!.kind = v as Timing.OutcomeKind; })} />
              </Row>
              <Row label="顏色"><ColorInput value={o.color} onChange={(v) => upd((d) => { if (v) d.outcomes[oi]!.color = v; else delete d.outcomes[oi]!.color; })} /></Row>
            </div>
            <h4>效果（依序套用）</h4>
            {o.effects.map((e, ei) => (
              <EffectRow key={ei} config={config} effect={e} n={o.effects.length} i={ei}
                patch={(fn) => upd((d) => fn(d.outcomes[oi]!.effects, ei))} />
            ))}
            <div className="tm-addrow">
              <Select value="" ariaLabel="新增效果" options={[{ value: "", label: "＋ 新增效果…" }, ...EFFECT_TYPES.map((t) => ({ value: t.type, label: t.label }))]}
                onChange={(v) => { if (v) upd((d) => { d.outcomes[oi]!.effects.push(defaultEffect(d, v as Effect["type"])); }); }} />
            </div>
          </div>
        </details>
      ))}
    </Collapsible>
  );
}

function EffectRow({ config, effect, i, n, patch }: { config: Config; effect: Effect; i: number; n: number; patch: (fn: (list: Effect[], i: number) => void) => void }) {
  const rec = effect as unknown as Record<string, unknown>;
  const set = (key: string, v: unknown) => patch((list, k) => {
    const e = list[k] as unknown as Record<string, unknown>;
    if (v === undefined) delete e[key]; else e[key] = v;
  });
  return (
    <div className="tm-effect">
      <div className="tm-effect-head">
        <Select ariaLabel="效果類型" value={effect.type} options={EFFECT_TYPES.map((t) => ({ value: t.type, label: t.label }))}
          onChange={(v) => patch((list, k) => { const when = list[k]!.when; const fresh = defaultEffect(config, v as Effect["type"]); if (when) fresh.when = when; list[k] = fresh; })} />
        <RowTools i={i} n={n} onMove={(dir) => patch((list, k) => move(list, k, dir))} onDel={() => patch((list, k) => { list.splice(k, 1); })} />
      </div>
      <div className="tm-effect-fields">
        {EFFECT_FIELDS[effect.type].map((f) => {
          const val = rec[f.key];
          if (f.kind === "expr") {
            if (f.optional && val === undefined) {
              return <button key={f.key} type="button" className="tm-btn tm-mini" onClick={() => set(f.key, c(1))}>＋ {f.label}</button>;
            }
            return (
              <Row key={f.key} label={f.label}>
                <span className="tm-expr-row">
                  <ExprInput value={val as Expr} ariaLabel={f.label} onChange={(e) => set(f.key, e)} />
                  {f.optional && <button type="button" className="tm-btn tm-mini" onClick={() => set(f.key, undefined)} title="移除">✕</button>}
                </span>
              </Row>
            );
          }
          if (f.kind === "text") return <Row key={f.key} label={f.label}><input value={String(val ?? "")} onChange={(e) => set(f.key, e.target.value)} /></Row>;
          const opts = f.kind === "resource" ? config.resources : f.kind === "status" ? config.statuses : config.interactions;
          return <Row key={f.key} label={f.label}><Select value={String(val ?? "")} options={opts.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => set(f.key, v)} /></Row>;
        })}
        {effect.when ? (
          <Row label="條件 when">
            <span className="tm-expr-row">
              <ExprInput value={effect.when} ariaLabel="條件" onChange={(e) => set("when", e)} />
              <button type="button" className="tm-btn tm-mini" onClick={() => set("when", undefined)} title="移除條件">✕</button>
            </span>
          </Row>
        ) : (
          <button type="button" className="tm-btn tm-mini" onClick={() => set("when", op("eq", r("catch.index"), c(0)))}>＋ 條件</button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ 標籤 / 資源 / 狀態 ------------------------------ */

function ListsSection({ config, upd }: { config: Config; upd: Update }) {
  return (
    <Collapsible title="標籤・資源・狀態">
      <h4>攻擊標籤 <button type="button" className="tm-btn tm-mini" onClick={() => upd((d) => { d.tags.push({ id: uniqueId("tag", d.tags.map((t) => t.id)), name: "新標籤", color: "#888888" }); })}>＋</button></h4>
      <div className="tm-list">
        {config.tags.map((t, i) => (
          <div key={t.id} className="tm-list-row">
            <code>{t.id}</code>
            <input value={t.name} aria-label="標籤名稱" onChange={(e) => upd((d) => { d.tags[i]!.name = e.target.value; })} />
            <ColorInput value={t.color} onChange={(v) => upd((d) => { if (v) d.tags[i]!.color = v; else delete d.tags[i]!.color; })} />
            <RowTools i={i} n={config.tags.length} onMove={(dir) => upd((d) => move(d.tags, i, dir))} onDel={() => upd((d) => { d.tags.splice(i, 1); })} />
          </div>
        ))}
      </div>
      <h4>資源 <button type="button" className="tm-btn tm-mini" onClick={() => upd((d) => { d.resources.push({ id: uniqueId("res", d.resources.map((t) => t.id)), name: "新資源", max: 100, initial: 0 }); })}>＋</button></h4>
      <div className="tm-list">
        {config.resources.map((t, i) => (
          <div key={t.id} className="tm-list-row">
            <code>{t.id}</code>
            <input value={t.name} aria-label="資源名稱" onChange={(e) => upd((d) => { d.resources[i]!.name = e.target.value; })} />
            <Row label="上限"><NumberField value={t.max} min={0} width={72} onChange={(v) => upd((d) => { d.resources[i]!.max = Math.max(0, v); })} ariaLabel="上限" /></Row>
            <Row label="初始"><NumberField value={t.initial} min={0} width={72} onChange={(v) => upd((d) => { d.resources[i]!.initial = Math.max(0, v); })} ariaLabel="初始" /></Row>
            <RowTools i={i} n={config.resources.length} onMove={(dir) => upd((d) => move(d.resources, i, dir))} onDel={() => upd((d) => { d.resources.splice(i, 1); })} />
          </div>
        ))}
      </div>
      <h4>狀態 <button type="button" className="tm-btn tm-mini" onClick={() => upd((d) => { d.statuses.push({ id: uniqueId("status", d.statuses.map((t) => t.id)), name: "新狀態" }); })}>＋</button></h4>
      <p className="tm-muted tm-note">「無敵」是內建狀態，不必宣告。</p>
      <div className="tm-list">
        {config.statuses.map((t, i) => (
          <div key={t.id} className="tm-list-row">
            <code>{t.id}</code>
            <input value={t.name} aria-label="狀態名稱" onChange={(e) => upd((d) => { d.statuses[i]!.name = e.target.value; })} />
            <RowTools i={i} n={config.statuses.length} onMove={(dir) => upd((d) => move(d.statuses, i, dir))} onDel={() => upd((d) => { d.statuses.splice(i, 1); })} />
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

/* --------------------------------- 預設 / 匯出 --------------------------------- */

/** Dropdown that loads one of the built-in presets (a fresh copy). */
export function TimingPresetMenu({ onPick }: { onPick: (config: Config) => void }) {
  return (
    <select className="tm-preset" value="" aria-label="載入預設" onChange={(e) => {
      const p = Timing.TIMING_PRESETS.find((x) => x.id === e.target.value);
      if (p) onPick(structuredClone(p));
    }}>
      <option value="">載入預設…</option>
      {Timing.TIMING_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}{p.description ? ` — ${p.description}` : ""}</option>)}
    </select>
  );
}
