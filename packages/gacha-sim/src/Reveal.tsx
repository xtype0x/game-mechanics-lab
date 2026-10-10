import { useEffect, useState } from "react";

/** One revealed pull. `rank` 0 = top tier, 1 = second, 2 = everything below. */
export interface RevealCard { key: string; name: string; tierName: string; rank: 0 | 1 | 2; tag: string; featured: boolean }

type Phase = "meteor" | "spot" | "grid";

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Pull reveal in three steps, all drawn with CSS (no game assets):
 * 1. a shooting star whose colour is the best result (gold / purple / blue),
 * 2. a spotlight for each top-tier card,
 * 3. the summary grid.
 * Clicking advances; "略過" jumps to the grid. With reduced motion or `instant`, only the grid is shown.
 */
export function Reveal({ cards, instant, onClose }: { cards: RevealCard[]; instant: boolean; onClose: () => void }) {
  const best = Math.min(...cards.map((c) => c.rank)) as 0 | 1 | 2;
  const spots = cards.filter((c) => c.rank === 0);
  const skipAll = instant || reduced();
  const [phase, setPhase] = useState<Phase>(skipAll ? "grid" : "meteor");
  const [spot, setSpot] = useState(0);

  const next = () => {
    if (phase === "meteor") setPhase(spots.length ? "spot" : "grid");
    else if (phase === "spot") { if (spot + 1 < spots.length) setSpot(spot + 1); else setPhase("grid"); }
    else onClose();
  };
  // The shooting star moves on by itself.
  useEffect(() => {
    if (phase !== "meteor") return;
    const t = setTimeout(next, best === 0 ? 2300 : 1700);
    return () => clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); next(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const c = spots[spot];
  return (
    <div className={`reveal phase-${phase} best-r${best}`} role="dialog" aria-label="抽卡結果" onClick={next}>
      {phase !== "grid" && <button className="skip" onClick={(e) => { e.stopPropagation(); setPhase("grid"); }}>略過 ⏭</button>}

      {phase === "meteor" && (
        <div className="sky" aria-hidden>
          {cards.length > 1 && <><div className={`meteor mini a r${Math.min(2, best + 1)}`} /><div className="meteor mini b r2" /></>}
          <div className={`meteor r${best}`} />
          <div className={`burst r${best}`} />
        </div>
      )}

      {phase === "spot" && c && (
        <div key={spot} className={`spotlight ${c.featured ? "feat" : ""}`}>
          <div className="spot-rays" aria-hidden />
          <div className="spot-card">
            <span className="stars">{c.tierName}</span>
            <b>{c.name}</b>
            <small>{c.tag}</small>
          </div>
          <span className="tap">{spot + 1 < spots.length ? `點擊繼續（${spot + 1}/${spots.length}）` : "點擊看全部結果"}</span>
        </div>
      )}

      {phase === "grid" && (
        <>
          <div className="cards">
            {cards.map((k, i) => (
              <div key={k.key} className={`card-r r${k.rank} ${k.featured ? "feat" : ""}`} style={{ animationDelay: `${i * 0.07}s` }}>
                <span className="stars">{k.tierName}</span>
                <b>{k.name}</b>
                <small>{k.tag}</small>
              </div>
            ))}
          </div>
          <span className="tap">點任意處關閉</span>
        </>
      )}
    </div>
  );
}
