import { tr, displayText } from "./i18n";
import { Gacha } from "@gml/core";
import { useEffect, useRef, useState } from "react";
import { GAMES, type GameId } from "./catalog/games";

export interface CatalogPick {
  game: GameId;
  kind: string;
  region?: string;
}

export function GameMenu({ current, onPick, onPreset }: {
  current: string | null; onPick: (p: CatalogPick) => void; onPreset: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);
  const activeGame = current?.startsWith("game:") ? current.split(":")[1] : "custom";
  return <div className="game-menu" ref={ref}>
    {GAMES.map(g => <div className="game-slot" key={g.id}>
      <button className={`game-btn ${activeGame === g.id ? "on" : ""}`} aria-haspopup="menu" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>{displayText(g.name)} <span aria-hidden>▾</span></button>
      {open === g.id && <div className="menu" role="menu">
        {g.types.map(t => <button key={`${t.kind}:${t.region ?? ""}`} role="menuitem" className="menu-item" onClick={() => { onPick({ game: g.id, kind: t.kind, region: t.region }); setOpen(null); }}>
          <b>{displayText(t.name)}</b>
        </button>)}
        <p className="menu-foot">{displayText(g.source)}</p>
      </div>}
    </div>)}
    <div className="game-slot">
      <button className={`game-btn ${activeGame === "custom" ? "on" : ""}`} aria-haspopup="menu" aria-expanded={open === "custom"} onClick={() => setOpen(open === "custom" ? null : "custom")}>{tr("gameMenu1")}<span aria-hidden>▾</span></button>
      {open === "custom" && <div className="menu" role="menu">
        {Gacha.PRESETS.map(p => <button key={p.model.id} role="menuitem" className="menu-item" onClick={() => { onPreset(p.model.id); setOpen(null); }}><b>{displayText(p.model.name)}</b></button>)}
        <p className="menu-foot">{tr("gameMenu2")}</p>
      </div>}
    </div>
    <span className="data-status">{tr("gameMenu3")}</span>
  </div>;
}
