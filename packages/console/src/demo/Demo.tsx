import type { Project, UnitDef } from "@ggt/core";
import { safeDisclosure } from "../tools/gacha/common";
import type { ReplayRequest } from "./link";
import { useEffect, useMemo, useState } from "react";
import type { Updater } from "../useProject";
import { Backdrop } from "./art/Backdrop";
import { Sprite, elementColor } from "./art/Sprite";
import { BattleScene, type BattleOutcome } from "./battle/BattleScene";
import {
  EXP_DUPE, MAX_LEVEL,
  activeBanner, bannerUnits, battleProject, levelCost, levelOf, levelScale, loadSave, modsOf, rosterOf, stagesOf, storeSave, summon, teamOf,
  type DemoSave, type Granted, type Mods, type Stage,
} from "./game";
import "./demo.css";
import "./battle.css";
import "./screens.css";

type Screen =
  | { name: "title" }
  | { name: "hub"; tab: "stages" | "team" | "roster" | "gacha" }
  | { name: "battle"; stage: Stage; seed: string }
  | { name: "result"; stage: Stage; outcome: BattleOutcome; reward: { crystals: number; exp: number; first: boolean } }
  | { name: "replay" };

const ELEMENT_NAMES: Record<string, string> = { fire: "火", ice: "冰", thunder: "雷", wind: "風", light: "光", shadow: "暗" };

export function Demo({ project, update, onExit, replay }: { project: Project; update?: Updater; onExit?: () => void; replay?: ReplayRequest }) {
  const [save, setSave] = useState<DemoSave>(() => loadSave(project));
  const [screen, setScreen] = useState<Screen>(replay ? { name: "replay" } : { name: "title" });
  const [tweak, setTweak] = useState(false);
  const stages = useMemo(() => stagesOf(project), [project]);
  const mods = useMemo(() => modsOf(project), [project]);
  const team = teamOf(project, save, mods);
  const level = (id: string) => levelOf(save, mods, id);
  useEffect(() => storeSave(save), [save]);

  const mutate = (fn: (s: DemoSave) => void) => setSave((prev) => { const s = JSON.parse(JSON.stringify(prev)) as DemoSave; fn(s); return s; });
  const unit = (id: string) => project.battle.units.find((u) => u.id === id);

  return (
    <div className="demo-root">
      <div className="stage-frame">
        <div className="stage">
          {screen.name === "title" && <Title project={project} onStart={() => setScreen({ name: "hub", tab: "stages" })} onExit={onExit} />}
          {screen.name === "hub" && (
            <Hub
              tab={screen.tab}
              setTab={(tab) => setScreen({ name: "hub", tab })}
              project={project}
              save={save}
              mods={mods}
              team={team}
              level={level}
              mutate={mutate}
              stages={stages}
              onPlay={(stage) => setScreen({ name: "battle", stage, seed: `${stage.id}-${Date.now().toString(36)}` })}
              onExit={onExit}
              onTweak={update ? () => setTweak(true) : undefined}
            />
          )}
          {screen.name === "battle" && (
            <BattleScene
              key={screen.seed}
              project={battleProject(project, team, level, [])}
              waves={screen.stage.waves}
              theme={screen.stage.theme}
              seed={screen.seed}
              title={screen.stage.name}
              onQuit={() => setScreen({ name: "hub", tab: "stages" })}
              onTweak={update ? () => setTweak(true) : undefined}
              onFinish={(outcome) => {
                const stage = screen.stage;
                const first = outcome.result === "win" && !save.cleared[stage.id];
                const k = first ? 1 : 0.2;
                const reward = outcome.result === "win" && mods.economy ? { crystals: Math.round(stage.firstReward.crystals * k), exp: Math.round(stage.firstReward.exp * k), first } : { crystals: 0, exp: 0, first: false };
                mutate((s) => {
                  s.crystals += reward.crystals;
                  s.exp += reward.exp;
                  if (outcome.result === "win") s.cleared[stage.id] = (s.cleared[stage.id] ?? 0) + 1;
                });
                setScreen({ name: "result", stage, outcome, reward });
              }}
            />
          )}
          {screen.name === "replay" && replay && (
            <BattleScene project={project} waves={[[]]} theme="storm" seed="replay" title="主控台戰鬥重播" replay={replay} onFinish={() => onExit?.()} onQuit={() => onExit?.()} />
          )}
          {screen.name === "result" && (
            <Result
              stage={screen.stage}
              outcome={screen.outcome}
              reward={screen.reward}
              mods={mods}
              unit={unit}
              onAgain={() => setScreen({ name: "battle", stage: screen.stage, seed: `${screen.stage.id}-${Date.now().toString(36)}` })}
              onBack={() => setScreen({ name: "hub", tab: "stages" })}
            />
          )}
          {tweak && update && <TweakDrawer project={project} update={update} team={team} onClose={() => setTweak(false)} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

function Title({ project, onStart, onExit }: { project: Project; onStart: () => void; onExit?: () => void }) {
  const heroes = project.battle.units.filter((u) => u.team === "ally").slice(0, 6);
  return (
    <div className="screen title">
      <Backdrop theme="ember" />
      <div className="title-lineup">
        {heroes.map((u, i) => <div key={u.id} className="title-hero" style={{ animationDelay: `${i * 0.12}s` }}><div className="sprite idle" style={{ animationDelay: `${-i * 0.4}s` }}><Sprite unit={u} /></div></div>)}
      </div>
      <div className="logo">
        <b>星火迴響</b>
        <span>Gacha Game Tool ・ 回合制戰鬥試玩 DEMO</span>
      </div>
      <div className="title-actions">
        <button className="big-btn" onClick={onStart}>開始遊戲</button>
        {onExit && <button className="ghost-btn" onClick={onExit}>返回主控台</button>}
      </div>
      <small className="title-foot">所有角色、敵人與數值皆為原創範例，可在主控台自由修改。</small>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

interface HubProps {
  tab: "stages" | "team" | "roster" | "gacha";
  setTab: (t: "stages" | "team" | "roster" | "gacha") => void;
  project: Project;
  save: DemoSave;
  mods: Mods;
  team: string[];
  level: (id: string) => number;
  mutate: (fn: (s: DemoSave) => void) => void;
  stages: Stage[];
  onPlay: (s: Stage) => void;
  onExit?: () => void;
  onTweak?: () => void;
}

const MODULE_NAMES: Record<string, string> = { gacha: "抽卡", economy: "貨幣與獎勵", growth: "升級", progression: "解鎖順序", teamEdit: "編隊", disclosure: "機率公示" };

function Hub(props: HubProps) {
  const { setTab, save, mods } = props;
  const tabs = ([["stages", "關卡"], ["team", "編隊"], ["roster", "角色"], ["gacha", "召喚"]] as const).filter(([k]) => (k !== "team" || mods.teamEdit) && (k !== "gacha" || mods.gacha));
  // A tab whose module was switched off falls back to the stage list.
  const tab = tabs.some(([k]) => k === props.tab) ? props.tab : "stages";
  return (
    <div className="screen hub">
      <Backdrop theme="frost" />
      <div className="hub-shade" />
      <header className="hub-top">
        <b className="hub-logo">星火迴響</b>
        <nav>
          {tabs.map(([k, label]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
        <div className="wallet">
          {mods.removed.length > 0 && <span className="mods-off" title="在主控台「DEMO 模組組合」切換">已拆除：{mods.removed.map((id) => MODULE_NAMES[id] ?? id).join("、")}</span>}
          {mods.economy && <span title="星晶：召喚用">💎 {save.crystals.toLocaleString()}</span>}
          {mods.economy && <span title="經驗：升級用">✦ {save.exp.toLocaleString()}</span>}
          {props.onTweak && <button className="ghost-btn small" onClick={props.onTweak}>⚙ 調整數值</button>}
          {props.onExit && <button className="ghost-btn small" onClick={props.onExit}>返回主控台</button>}
        </div>
      </header>
      <main className="hub-body">
        {tab === "stages" && <Stages {...props} />}
        {tab === "team" && <Team {...props} />}
        {tab === "roster" && <Roster {...props} />}
        {tab === "gacha" && <Gacha {...props} />}
      </main>
    </div>
  );
}

function Stages({ project, save, mods, team, level, stages, onPlay }: HubProps) {
  const unit = (id: string) => project.battle.units.find((u) => u.id === id);
  const teamLevel = Math.round(team.reduce((a, id) => a + level(id), 0) / Math.max(1, team.length));
  return (
    <div className="stage-list">
      {stages.map((s, i) => {
        const locked = mods.progression && i > 0 && !save.cleared[stages[i - 1]!.id];
        const enemies = [...new Set(s.waves.flat())];
        return (
          <div key={s.id} className={`stage-card theme-${s.theme} ${locked ? "locked" : ""}`}>
            <div className="stage-art"><Backdrop theme={s.theme} view="card" /></div>
            <div className="stage-info">
              <b>{s.name}</b>
              <span>{s.subtitle}</span>
              <div className="stage-enemies">
                {enemies.map((id) => { const u = unit(id); return u ? <div key={id} className="mini" title={u.name}><Sprite unit={u} portrait /></div> : null; })}
              </div>
              <div className="stage-meta">
                <span>{s.waves.length} 波</span>
                {mods.growth && <span className={teamLevel < s.recommended ? "warn" : ""}>建議等級 {s.recommended}</span>}
                {save.cleared[s.id] ? <span className="ok">✓ 已通關 ×{save.cleared[s.id]}</span> : mods.economy && <span>首通 💎{s.firstReward.crystals}</span>}
              </div>
              <button className="big-btn" disabled={locked} onClick={() => onPlay(s)}>{locked ? "🔒 先通關前一關" : "出擊"}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Team({ project, save, mods, team, level, mutate }: HubProps) {
  const owned = rosterOf(project, save, mods);
  return (
    <div className="team">
      <div className="team-slots">
        {Array.from({ length: 4 }, (_, i) => {
          const u = project.battle.units.find((x) => x.id === team[i]);
          return (
            <div key={i} className={`slot ${u ? "" : "empty"}`}>
              {u ? <><div className="sprite idle"><Sprite unit={u} /></div><b>{u.name}</b><small>{mods.growth ? `Lv.${level(u.id)}・` : ""}{ELEMENT_NAMES[u.element] ?? u.element}・{u.role}</small></> : <span>空位</span>}
            </div>
          );
        })}
      </div>
      <p className="hub-hint">點選角色加入或移出隊伍（1～4 人，依加入順序站位）。</p>
      <div className="owned-row">
        {owned.map((u) => {
          const idx = team.indexOf(u.id);
          return (
            <button key={u.id} className={`owned ${idx >= 0 ? "in" : ""}`} onClick={() => mutate((s) => {
              // Start from the team actually shown (it may differ from the saved one after module changes).
              s.team = [...team];
              const i = s.team.indexOf(u.id);
              if (i >= 0) { if (s.team.length > 1) s.team.splice(i, 1); } else if (s.team.length < 4) s.team.push(u.id);
            })}>
              <div className="portrait"><Sprite unit={u} portrait /></div>
              <span>{u.name}</span>
              {idx >= 0 && <i>{idx + 1}</i>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Roster({ project, save, mods, level, mutate }: HubProps) {
  const owned = rosterOf(project, save, mods);
  const [sel, setSel] = useState(owned[0]?.id ?? "");
  const u = owned.find((x) => x.id === sel) ?? owned[0];
  if (!u) return null;
  const lv = level(u.id);
  const cost = levelCost(lv);
  const k = levelScale(lv);
  const k2 = levelScale(lv + 1);
  const stat = (key: string, kk = k) => Math.round((u.stats[key] ?? 0) * kk);
  return (
    <div className="roster">
      <div className="roster-list">
        {owned.map((x) => (
          <button key={x.id} className={`owned ${x.id === u.id ? "in" : ""}`} onClick={() => setSel(x.id)}>
            <div className="portrait"><Sprite unit={x} portrait /></div>
            <span>{x.name}</span>
            {mods.growth && <small>Lv.{level(x.id)}</small>}
          </button>
        ))}
      </div>
      <div className="roster-hero" style={{ background: `radial-gradient(circle at 50% 60%, ${elementColor(u.element).main}55, transparent 60%)` }}>
        <div className="sprite idle"><Sprite unit={u} /></div>
      </div>
      <div className="roster-info">
        <b className="rname">{u.name}</b>
        <span className="rsub">{ELEMENT_NAMES[u.element] ?? u.element}屬性・{u.role}{mods.growth ? `・Lv.${lv}/${MAX_LEVEL}` : ""}</span>
        {u.description && <p>{u.description}</p>}
        <table className="rstats">
          <tbody>
            {([["生命", "hp"], ["攻擊", "atk"], ["防禦", "def"]] as const).map(([label, key]) => (
              <tr key={key}><td>{label}</td><td>{stat(key).toLocaleString()}</td><td className="up">{mods.growth && lv < MAX_LEVEL ? `→ ${stat(key, k2).toLocaleString()}` : ""}</td></tr>
            ))}
            <tr><td>速度</td><td>{u.stats.spd}</td><td /></tr>
            <tr><td>暴擊</td><td>{Math.round((u.stats.critRate ?? 0) * 100)}% / {Math.round((u.stats.critDmg ?? 0) * 100)}%</td><td /></tr>
          </tbody>
        </table>
        {mods.growth && <button className="big-btn" disabled={lv >= MAX_LEVEL || save.exp < cost} onClick={() => mutate((s) => { s.exp -= cost; (s.owned[u.id] ??= { level: 1 }).level = lv + 1; })}>
          {lv >= MAX_LEVEL ? "已達等級上限" : `升級（✦ ${cost.toLocaleString()}）`}
        </button>}
        <div className="skills-list">
          {u.skills.filter((s) => s.type !== "followup").map((s) => (
            <div key={s.id}><b>{{ basic: "普攻", skill: "戰技", ultimate: "大招", followup: "追加", dot: "" }[s.type]}・{s.name}</b><span>{s.description ?? describeSkill(s)}</span></div>
          ))}
          {(u.passives ?? []).map((p) => <div key={p.id}><b>被動・{p.name}</b><span>{p.description ?? ""}</span></div>)}
        </div>
      </div>
    </div>
  );
}

function describeSkill(s: UnitDef["skills"][number]): string {
  return s.effects.map((e) => {
    switch (e.kind) {
      case "damage": return `${{ enemy: "單體", blast: "擴散", allEnemies: "全體", self: "自身", ally: "隊友", allAllies: "全隊", victim: "受害者" }[e.target]} ${typeof e.multiplier === "number" ? `${Math.round(e.multiplier * 100)}%` : "依公式"} 傷害`;
      case "heal": return "治療";
      case "status": return "施加狀態";
      case "advance": return "行動提前";
      case "energy": return "回復能量";
    }
  }).join("，");
}

function Gacha({ project, save, mods, mutate }: HubProps) {
  const [results, setResults] = useState<Granted[] | null>(null);
  const [showRates, setShowRates] = useState(false);
  const banner = activeBanner(project);
  const rates = useMemo(() => {
    if (!banner) return null;
    try { return safeDisclosure(banner, project.seed); } catch { return null; }
  }, [banner, project.seed]);
  if (!banner) return <p className="hub-hint">專案沒有卡池。請到主控台「卡池與保底規則編輯器」新增。</p>;
  const top = banner.tiers[0]!;
  const feat = bannerUnits(project, banner);
  const progress = save.gacha.banners[banner.id];
  const sinceTop = progress?.counters[top.id] ?? 0;
  const guaranteed = !!progress?.guaranteed[top.id];
  const doPull = (n: number) => {
    // Pull on a copy outside the state updater: updaters must be pure (StrictMode calls them twice).
    const next = JSON.parse(JSON.stringify(save)) as DemoSave;
    if (next.crystals < banner.cost * n) return;
    next.crystals -= banner.cost * n;
    let out: Granted[];
    try { out = Array.from({ length: n }, () => summon(project, banner, next)); } catch { return; }
    mutate((s) => Object.assign(s, next));
    setResults(out);
  };
  const unit = (id: string) => project.battle.units.find((u) => u.id === id)!;
  const pityLine = [
    top.hardPity ? `第 ${top.hardPity} 抽必定獲得 ${top.name}` : "",
    top.softPityStart && top.softPityStep ? `第 ${top.softPityStart} 抽起機率提升` : "",
  ].filter(Boolean).join("・");
  return (
    <div className="gacha">
      <div className="banner-art">
        <div className="banner-chars">
          {feat.slice(0, 2).map((u, i) => <div key={u.id} className="sprite idle" style={{ animationDelay: `${-i * 0.6}s` }}><Sprite unit={u} /></div>)}
          {feat.length === 0 && <span className="muted">這個卡池的 {top.name} 沒有角色，抽到時會得到資源。</span>}
        </div>
        <div className="banner-text">
          <small>{top.featured?.items.length ? "限定召喚" : "召喚"}</small>
          <b>{banner.name}</b>
          <span>{top.name} 機率 {(top.rate * 100).toFixed(top.rate < 0.01 ? 1 : 0)}%{pityLine ? `・${pityLine}` : ""}</span>
          <span className="pity">{top.hardPity ? `距離保底還有 ${Math.max(0, top.hardPity - sinceTop)} 抽` : `已 ${sinceTop} 抽未出 ${top.name}`}{guaranteed ? "・下一次必定限定" : ""}</span>
        </div>
      </div>
      <div className="gacha-actions">
        <button className="big-btn" disabled={save.crystals < banner.cost} onClick={() => doPull(1)}>召喚 1 次<small>💎 {banner.cost}</small></button>
        <button className="big-btn gold" disabled={save.crystals < banner.cost * 10} onClick={() => doPull(10)}>召喚 10 次<small>💎 {banner.cost * 10}</small></button>
        {mods.disclosure && <button className="ghost-btn" onClick={() => setShowRates((x) => !x)}>機率公示</button>}
      </div>
      {showRates && mods.disclosure && rates && (
        <div className="rates">
          <b>機率公示</b>
          <table>
            <thead><tr><th>稀有度</th><th>內容</th><th>基礎機率</th><th>綜合機率</th></tr></thead>
            <tbody>
              {rates.rows.map((r) => (
                <tr key={`${r.tierId}-${r.itemId}`}><td>{r.tierName}</td><td>{r.itemName}{r.featured ? "（限定）" : ""}</td><td>{(r.base * 100).toFixed(2)}%</td><td>{(r.consolidated * 100).toFixed(2)}%</td></tr>
              ))}
            </tbody>
          </table>
          <p>{rates.tiers.flatMap((t) => t.pity.map((x) => `${t.name}：${x}`)).join("。")}{rates.tiers.some((t) => t.pity.length) ? "。" : ""}綜合機率已計入保底（{rates.exact ? "精確計算" : "抽樣估計"}）。重複獲得角色轉為經驗 {EXP_DUPE}。</p>
          <p className="muted">此為 DEMO 範例。正式上線前，請依最新法規確認公示格式與內容。</p>
        </div>
      )}
      {results && (
        <div className="pull-results" onClick={() => setResults(null)}>
          <div className="cards">
            {results.map((r, i) => {
              const rank = banner.tiers.findIndex((t) => t.id === r.pull.tierId);
              const cls = rank === 0 ? "r5" : rank === 1 && banner.tiers.length > 2 ? "r4" : "r3";
              return (
                <div key={i} className={`pcard-r ${cls}`} style={{ animationDelay: `${i * 0.08}s` }}>
                  {r.unitId ? (
                    <>
                      <div className="art"><Sprite unit={unit(r.unitId)} /></div>
                      <b>{unit(r.unitId).name}</b>
                      <small>{r.dupe ? `重複 → 經驗 ${EXP_DUPE}` : r.pull.featured ? "NEW!・限定" : "NEW!"}</small>
                    </>
                  ) : (
                    <>
                      <div className="gem">{cls === "r5" ? "✷" : cls === "r4" ? "◆" : "◇"}</div>
                      <b>{r.name}</b>
                      <small>{r.exp ? `經驗 +${r.exp}` : ""}</small>
                    </>
                  )}
                  <span className="stars">{r.rarity}</span>
                </div>
              );
            })}
          </div>
          <span className="tap">點擊任意處關閉</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

function Result({ stage, outcome, reward, mods, unit, onAgain, onBack }: {
  stage: Stage; outcome: BattleOutcome; reward: { crystals: number; exp: number; first: boolean }; mods: Mods;
  unit: (id: string) => UnitDef | undefined; onAgain: () => void; onBack: () => void;
}) {
  const ranked = Object.entries(outcome.damage).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((a, [, d]) => a + d, 0) || 1;
  const mvp = ranked[0] ? unit(ranked[0][0]) : undefined;
  const win = outcome.result === "win";
  return (
    <div className={`screen result-screen ${win ? "win" : "lose"}`}>
      <Backdrop theme={stage.theme} />
      <div className="hub-shade" />
      <div className="result-box">
        <b className="result-title">{win ? "勝利" : "敗北"}</b>
        <span>{stage.name}・{outcome.wavesCleared}/{stage.waves.length} 波・{outcome.turns} 個回合</span>
        {mvp && (
          <div className="mvp">
            <div className="sprite idle"><Sprite unit={mvp} /></div>
            <div><small>MVP</small><b>{mvp.name}</b></div>
          </div>
        )}
        <div className="dmg-list">
          {ranked.map(([id, d]) => (
            <div key={id}><span>{unit(id)?.name ?? id}</span><i style={{ width: `${(d / total) * 100}%`, background: elementColor(unit(id)?.element ?? "").main }} /><em>{d.toLocaleString()}</em></div>
          ))}
        </div>
        {win && mods.economy && <div className="rewards">{reward.first && <span className="first">首次通關</span>}<span>💎 +{reward.crystals}</span><span>✦ +{reward.exp}</span></div>}
        {!win && <p className="tip">{loseTip(mods)}</p>}
        <div className="result-actions">
          <button className="big-btn" onClick={onAgain}>{win ? "再戰一次" : "重新挑戰"}</button>
          <button className="ghost-btn" onClick={onBack}>返回關卡</button>
        </div>
      </div>
    </div>
  );
}

function loseTip(mods: Mods): string {
  const ways = [mods.growth && "到「角色」升級隊伍", mods.gacha && "在「召喚」取得新角色", mods.teamEdit && "在「編隊」換人"].filter(Boolean);
  return ways.length ? `提示：${ways.join("、")}後再挑戰。` : "提示：可在主控台「⚙ 調整數值」或開啟更多 DEMO 模組後再挑戰。";
}

// ---------------------------------------------------------------------------
// Console link: tweak numbers while playing
// ---------------------------------------------------------------------------

function TweakDrawer({ project, update, team: teamIds, onClose }: { project: Project; update: Updater; team: string[]; onClose: () => void }) {
  const team = teamIds.map((id) => project.battle.units.find((u) => u.id === id)).filter((u): u is UnitDef => !!u);
  const enemies = project.battle.units.filter((u) => u.team === "enemy");
  const set = (id: string, key: string, v: number) => {
    if (!Number.isFinite(v) || v < 0) return;
    update((p) => { const u = p.battle.units.find((x) => x.id === id); if (u) u.stats[key] = v; });
  };
  const row = (u: UnitDef, keys: [string, string, boolean?][]) => (
    <tr key={u.id}>
      <td>{u.name}</td>
      {keys.map(([k, , pct]) => (
        <td key={k}>
          <input type="number" value={pct ? Math.round((u.stats[k] ?? 0) * 1000) / 10 : u.stats[k] ?? 0} onChange={(e) => set(u.id, k, pct ? Number(e.target.value) / 100 : Number(e.target.value))} />
        </td>
      ))}
    </tr>
  );
  const allyKeys: [string, string, boolean?][] = [["hp", "生命"], ["atk", "攻擊"], ["spd", "速度"], ["critRate", "暴擊率%", true], ["critDmg", "暴傷%", true]];
  const enemyKeys: [string, string, boolean?][] = [["hp", "生命"], ["atk", "攻擊"], ["spd", "速度"], ["toughness", "韌性"]];
  return (
    <div className="tweak" role="dialog" aria-label="調整數值">
      <div className="tweak-box">
        <header><b>⚙ 調整數值</b><span>直接寫入主控台專案，下一場戰鬥（或下一波）生效。數值為 1 級基礎值。</span><button onClick={onClose}>完成</button></header>
        <table>
          <thead><tr><th>我方</th>{allyKeys.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
          <tbody>{team.map((u) => row(u, allyKeys))}</tbody>
        </table>
        <table>
          <thead><tr><th>敵方</th>{enemyKeys.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
          <tbody>{enemies.map((u) => row(u, enemyKeys))}</tbody>
        </table>
      </div>
    </div>
  );
}
