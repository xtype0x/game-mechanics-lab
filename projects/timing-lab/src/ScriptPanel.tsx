import type { Timing } from "@gml/core";
import { NumberField } from "@gml/ui";
import type { PressRec } from "./session";

/** Hand-editable list of the key presses that make up the scenario. */
export function ScriptPanel({ config, presses, onChange, onSeek }: {
  config: Timing.TimingConfig;
  presses: PressRec[];
  onChange: (next: PressRec[]) => void;
  onSeek: (frame: number) => void;
}) {
  const set = (i: number, patch: Partial<PressRec>) => onChange(presses.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <div className="tl-script">
      <div className="tl-row">
        <button type="button" className="tm-btn" onClick={() => onChange([...presses, { frame: presses.length ? presses[presses.length - 1]!.frame + 10 : 40, interaction: config.interactions[0]?.id ?? "" }])} disabled={!config.interactions.length}>＋ 新增按鍵</button>
        <button type="button" className="tm-btn" onClick={() => onChange([])} disabled={!presses.length}>清除按鍵</button>
      </div>
      {presses.length === 0 && <p className="tm-muted tm-note">還沒有按鍵。即時模式下按鍵會記錄在這裡，也可以手動新增，之後用回放重現。</p>}
      <ul className="tl-presses">
        {presses.map((p, i) => (
          <li key={i}>
            <label className="tl-inline">幀<NumberField value={p.frame} min={0} step={1} width={72} onChange={(v) => set(i, { frame: Math.max(0, Math.round(v)) })} ariaLabel="按鍵幀" /></label>
            <select value={p.interaction} aria-label="互動" onChange={(e) => set(i, { interaction: e.target.value })}>
              {config.interactions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              {!config.interactions.some((x) => x.id === p.interaction) && <option value={p.interaction}>{p.interaction}（已不存在）</option>}
            </select>
            <button type="button" className="tm-btn tm-mini" onClick={() => onSeek(p.frame)} title="跳到此幀">▶</button>
            <button type="button" className="tm-btn tm-mini" aria-label="刪除" onClick={() => onChange(presses.filter((_, k) => k !== i))}>✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
