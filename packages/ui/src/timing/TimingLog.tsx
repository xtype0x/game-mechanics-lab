import { useMemo, useState } from "react";
import type { Timing } from "@gml/core";
import { LOG_CATEGORIES, describeEvent, eventCategory, eventTone, type LogCategory } from "./helpers";

/** Readable per-frame log of timing events with category filters. */
export function TimingLog({ config, events, filter, newestFirst, onSeek }: {
  config: Timing.TimingConfig;
  events: Timing.TimingEvent[];
  /** Initially enabled categories (default: all). */
  filter?: LogCategory[];
  newestFirst?: boolean;
  onSeek?: (frame: number) => void;
}) {
  const [on, setOn] = useState<Set<LogCategory>>(() => new Set(filter ?? LOG_CATEGORIES.map((c) => c.id)));
  const groups = useMemo(() => {
    const out: { frame: number; lines: { text: string; tone: string }[] }[] = [];
    for (const ev of events) {
      if (!on.has(eventCategory(ev))) continue;
      let g = out[out.length - 1];
      if (!g || g.frame !== ev.frame) { g = { frame: ev.frame, lines: [] }; out.push(g); }
      g.lines.push({ text: describeEvent(config, ev).replace(/^第 \d+ 幀｜/, ""), tone: eventTone(config, ev) });
    }
    return newestFirst ? out.reverse() : out;
  }, [config, events, on, newestFirst]);

  return (
    <div className="tm-log">
      <div className="tm-log-filters">
        {LOG_CATEGORIES.map((c) => (
          <label key={c.id} className="tm-chip">
            <input
              type="checkbox"
              checked={on.has(c.id)}
              onChange={(e) => setOn((prev) => { const n = new Set(prev); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })}
            />
            {c.label}
          </label>
        ))}
      </div>
      <div className="tm-log-body" role="log">
        {groups.length === 0 && <p className="tm-muted">沒有紀錄。</p>}
        {groups.map((g) => (
          <div key={g.frame} className="tm-log-group">
            <button type="button" className="tm-log-frame" onClick={() => onSeek?.(g.frame)} title="跳到此幀">第 {g.frame} 幀</button>
            <div className="tm-log-lines">
              {g.lines.map((l, i) => <div key={i} className={`tm-log-line tone-${l.tone}`}>{l.text}</div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
