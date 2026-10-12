import type { Timing } from "@gml/core";
import { text } from "./i18n";

export interface OutcomeCount {
  outcome: string | null;
  /** "invulnerable" when the attack was blocked by invulnerability (no outcome). */
  label: string;
  kind: Timing.OutcomeKind | "none";
  count: number;
}

export interface InteractionStat {
  interaction: string;
  /** Number of attacks this interaction caught. */
  catches: number;
  /** Mean of (impact frame − press frame) over caught attacks; null when none. Positive = pressed early. */
  meanOffset: number | null;
}

export interface TimingStats {
  total: number;
  perfect: number;
  perfectRate: number;
  outcomes: OutcomeCount[];
  interactions: InteractionStat[];
}

/** Aggregates resolve events: outcome counts, perfect rate, and press-to-impact offsets per interaction. */
export function computeStats(config: Timing.TimingConfig, events: Timing.TimingEvent[]): TimingStats {
  const counts = new Map<string, OutcomeCount>();
  const sums = new Map<string, { n: number; sum: number }>();
  const lastAccept = new Map<string, number>();
  let total = 0;
  let perfect = 0;
  for (const ev of events) {
    if (ev.type === "accept") { lastAccept.set(ev.interaction, ev.pressFrame); continue; }
    if (ev.type !== "resolve") continue;
    total++;
    const o = ev.outcome ? config.outcomes.find((x) => x.id === ev.outcome) : undefined;
    if (o?.kind === "perfect") perfect++;
    const key = ev.outcome ?? "(invulnerable)";
    const row = counts.get(key) ?? { outcome: ev.outcome, label: o?.name ?? (ev.outcome ?? text().stats.invulnerableBlocked), kind: o?.kind ?? "none", count: 0 };
    row.count++;
    counts.set(key, row);
    if (ev.via === "interaction" && ev.interaction) {
      const press = lastAccept.get(ev.interaction);
      if (press !== undefined) {
        const s = sums.get(ev.interaction) ?? { n: 0, sum: 0 };
        s.n++;
        s.sum += ev.impactFrame - press;
        sums.set(ev.interaction, s);
      }
    }
  }
  return {
    total, perfect, perfectRate: total ? perfect / total : 0,
    outcomes: [...counts.values()].sort((a, b) => b.count - a.count),
    interactions: config.interactions.map((i) => {
      const s = sums.get(i.id);
      return { interaction: i.id, catches: s?.n ?? 0, meanOffset: s ? s.sum / s.n : null };
    }),
  };
}
