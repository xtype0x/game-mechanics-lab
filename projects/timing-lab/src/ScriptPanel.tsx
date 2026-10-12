import type { Timing } from "@gml/core";
import { NumberField } from "@gml/ui";
import { useText } from "./i18n";
import type { PressRec } from "./session";

/** Hand-editable list of the key presses that make up the scenario. */
export function ScriptPanel({ config, presses, onChange, onSeek }: {
  config: Timing.TimingConfig;
  presses: PressRec[];
  onChange: (next: PressRec[]) => void;
  onSeek: (frame: number) => void;
}) {
  const t = useText().script;
  const set = (i: number, patch: Partial<PressRec>) => onChange(presses.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <div className="tl-script">
      <div className="tl-row">
        <button type="button" className="tm-btn" onClick={() => onChange([...presses, { frame: presses.length ? presses[presses.length - 1]!.frame + 10 : 40, interaction: config.interactions[0]?.id ?? "" }])} disabled={!config.interactions.length}>{t.addPress}</button>
        <button type="button" className="tm-btn" onClick={() => onChange([])} disabled={!presses.length}>{t.clearPresses}</button>
      </div>
      {presses.length === 0 && <p className="tm-muted tm-note">{t.empty}</p>}
      <ul className="tl-presses">
        {presses.map((p, i) => (
          <li key={i}>
            <label className="tl-inline">{t.frame}<NumberField value={p.frame} min={0} step={1} width={72} onChange={(v) => set(i, { frame: Math.max(0, Math.round(v)) })} ariaLabel={t.pressFrameLabel} /></label>
            <select value={p.interaction} aria-label={t.interactionLabel} onChange={(e) => set(i, { interaction: e.target.value })}>
              {config.interactions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              {!config.interactions.some((x) => x.id === p.interaction) && <option value={p.interaction}>{t.missing(p.interaction)}</option>}
            </select>
            <button type="button" className="tm-btn tm-mini" onClick={() => onSeek(p.frame)} title={t.seek}>▶</button>
            <button type="button" className="tm-btn tm-mini" aria-label={t.delete} onClick={() => onChange(presses.filter((_, k) => k !== i))}>✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
