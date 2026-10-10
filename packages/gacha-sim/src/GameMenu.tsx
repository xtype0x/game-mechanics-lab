import { Gacha } from "@ggt/core";
import { useEffect, useRef, useState } from "react";
import { GAMES, type GameDef } from "./catalog/games";
import type { LiveBanner, LiveData } from "./catalog/live";
import type { LiveStatus } from "./catalog/useLive";

export interface CatalogPick {
  game: GameDef["id"];
  kind: string;
  region?: string;
  /** Live banner id; absent for pools without live data (standard pools). */
  bannerId?: string;
}

const day = (t: number) => new Date(t * 1000).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });

export function bannerStatus(b: Pick<LiveBanner, "start" | "end">, now = Date.now() / 1000): { label: string; tone: "on" | "soon" | "ended" } {
  if (b.start > now) return { label: `${day(b.start)} 開始`, tone: "soon" };
  if (b.end && b.end < now) return { label: `已於 ${day(b.end)} 結束`, tone: "ended" };
  const days = Math.max(0, Math.ceil((b.end - now) / 86400));
  return { label: b.end ? `剩 ${days} 天（${day(b.end)}）` : "進行中", tone: "on" };
}

/** Banners to offer per game type: current and upcoming; the latest ended one only when nothing else exists. */
function bannersFor(g: GameDef, live: LiveData, kind: string, region?: string): LiveBanner[] {
  const now = Date.now() / 1000;
  const all = live.banners.filter((b) => b.game === g.id && b.kind === kind && (region === undefined || b.region === region));
  const open = all.filter((b) => !b.end || b.end >= now);
  if (open.length) return open.sort((a, b) => a.start - b.start);
  const last = all.sort((a, b) => b.end - a.end)[0];
  return last ? [last] : [];
}

export function GameMenu({ live, status, current, onPick, onPreset, onRefresh }: {
  live: LiveData; status: LiveStatus; current: string | null;
  onPick: (p: CatalogPick) => void; onPreset: (id: string) => void; onRefresh: () => void;
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
  const pick = (p: CatalogPick) => { onPick(p); setOpen(null); };
  const activeGame = current?.startsWith("game:") ? current.split(":")[1] : current ? "custom" : null;

  return (
    <div className="game-menu" ref={ref}>
      {GAMES.map((g) => (
        <div key={g.id} className="game-slot">
          <button className={`game-btn ${activeGame === g.id ? "on" : ""}`} aria-haspopup="menu" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>
            {g.name} <span aria-hidden>▾</span>
          </button>
          {open === g.id && (
            <div className="menu" role="menu">
              {g.types.map((t) => {
                const list = t.kind === "standard" ? [] : bannersFor(g, live, t.kind, t.region);
                return (
                  <div key={`${t.kind}${t.region ?? ""}`} className="menu-group">
                    <div className="menu-title">{t.name}</div>
                    {t.kind === "standard" && <button role="menuitem" className="menu-item" onClick={() => pick({ game: g.id, kind: t.kind })}>常駐卡池</button>}
                    {list.map((b) => {
                      const st = bannerStatus(b);
                      return (
                        <button key={b.id} role="menuitem" className="menu-item" onClick={() => pick({ game: g.id, kind: t.kind, region: t.region, bannerId: b.id })}>
                          <b>{b.featured5.map((u) => u.name).join("・") || "（無資料）"}</b>
                          <span className={`chip-${st.tone}`}>{st.label}</span>
                        </button>
                      );
                    })}
                    {t.kind !== "standard" && !list.length && (
                      <button role="menuitem" className="menu-item" onClick={() => pick({ game: g.id, kind: t.kind, region: t.region })}>
                        <b>規則試算</b><span className="chip-ended">目前沒有卡池資料，使用通用名稱</span>
                      </button>
                    )}
                  </div>
                );
              })}
              <p className="menu-foot">{g.source}</p>
            </div>
          )}
        </div>
      ))}
      <div className="game-slot">
        <button className={`game-btn ${activeGame === "custom" ? "on" : ""}`} aria-haspopup="menu" aria-expanded={open === "custom"} onClick={() => setOpen(open === "custom" ? null : "custom")}>通用模型 <span aria-hidden>▾</span></button>
        {open === "custom" && (
          <div className="menu" role="menu">
            {Gacha.PRESETS.map((p) => <button key={p.model.id} role="menuitem" className="menu-item" onClick={() => { onPreset(p.model.id); setOpen(null); }}><b>{p.model.name}</b></button>)}
            <p className="menu-foot">不對應特定遊戲的規則範本，可在「設定與分析」自由修改。</p>
          </div>
        )}
      </div>
      <span className={`data-status ${status}`} title={Object.entries(live.sources).map(([k, v]) => `${k}: ${v}`).join("\n")}>
        {status === "live" ? "卡池資料：即時" : status === "loading" ? "卡池資料：更新中…" : status === "offline" ? "卡池資料：無法連線，使用快照" : "卡池資料：快照"}
        ・{new Date(live.fetchedAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        {status !== "loading" && <button className="link" onClick={onRefresh}>重新整理</button>}
      </span>
    </div>
  );
}
