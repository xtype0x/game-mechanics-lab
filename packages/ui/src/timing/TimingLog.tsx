import { useMemo, useState } from "react";
import type { Timing } from "@gml/core";
import { LOG_CATEGORIES, describeEventBody, eventCategory, eventTone, type LogCategory } from "./helpers";
import { useTimingText } from "./i18n";

/** Readable per-frame log of timing events with category filters. */
export function TimingLog({ config, events, filter, newestFirst, onSeek }: {
  config: Timing.TimingConfig;
  events: Timing.TimingEvent[];
  /** Initially enabled categories (default: all). */
  filter?: LogCategory[];
  newestFirst?: boolean;
  onSeek?: (frame: number) => void;
}) {
  const t = useTimingText();
  const [on, setOn] = useState<Set<LogCategory>>(() => new Set(filter ?? LOG_CATEGORIES));
  const groups = useMemo(() => {
    const out: { frame: number; lines: { text: string; tone: string }[] }[] = [];
    for (const ev of events) {
      if (!on.has(eventCategory(ev))) continue;
      let g = out[out.length - 1];
      if (!g || g.frame !== ev.frame) { g = { frame: ev.frame, lines: [] }; out.push(g); }
      g.lines.push({ text: describeEventBody(config, ev), tone: eventTone(config, ev) });
    }
    return newestFirst ? out.reverse() : out;
    // t: the text language is read inside describeEventBody, so re-run when it changes.
  }, [config, events, on, newestFirst, t]);

  return (
    <div className="tm-log">
      <div className="tm-log-filters">
        {LOG_CATEGORIES.map((id) => (
          <label key={id} className="tm-chip">
            <input
              type="checkbox"
              checked={on.has(id)}
              onChange={(e) => setOn((prev) => { const n = new Set(prev); if (e.target.checked) n.add(id); else n.delete(id); return n; })}
            />
            {t.log.categories[id]}
          </label>
        ))}
      </div>
      <div className="tm-log-body" role="log">
        {groups.length === 0 && <p className="tm-muted">{t.log.empty}</p>}
        {groups.map((g) => (
          <div key={g.frame} className="tm-log-group">
            <button type="button" className="tm-log-frame" onClick={() => onSeek?.(g.frame)} title={t.log.seek}>{t.log.frameButton(g.frame)}</button>
            <div className="tm-log-lines">
              {g.lines.map((l, i) => <div key={i} className={`tm-log-line tone-${l.tone}`}>{l.text}</div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
