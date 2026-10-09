/**
 * Visual battle. The core engine resolves actions instantly; this component replays the resulting events as
 * animations. Presentation never feeds back into the rules: speed, skipping and reduced motion only change timing.
 */
import {
  battleSetupOf,
  canUltimate,
  createBattle,
  legalActions,
  policyAction,
  submitAction,
  type Action,
  type BattleEvent,
  type BattleSetup,
  type BattleState,
  type Project,
  type SkillDef,
  type UnitDef,
} from "@ggt/core";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Backdrop, type Theme } from "../art/Backdrop";
import { Sprite, elementColor, spriteScale } from "../art/Sprite";
import { Particles, type BurstKind } from "./particles";

export interface BattleOutcome {
  result: "win" | "lose";
  wavesCleared: number;
  turns: number;
  cycles: number;
  damage: Record<string, number>;
}

interface Props {
  project: Project;
  waves: string[][];
  theme: Theme;
  seed: string;
  title: string;
  onFinish: (o: BattleOutcome) => void;
  onQuit: () => void;
  onTweak?: () => void;
  /** Replay a recorded battle from its first event (no input). */
  replay?: { setup: BattleSetup; final: BattleState };
}

interface UnitView {
  hp: number;
  toughness: number;
  energy: number;
  broken: boolean;
  alive: boolean;
  statuses: string[];
}

interface Float { id: number; x: number; y: number; text: string; kind: string }

// Slot 0 stands closest to the enemies; alternate depth so plates never overlap.
const ALLY_POS = [{ x: 480, y: 535 }, { x: 355, y: 575 }, { x: 230, y: 535 }, { x: 105, y: 575 }];
const ENEMY_POS: Record<number, { x: number; y: number }[]> = {
  1: [{ x: 960, y: 580 }],
  2: [{ x: 860, y: 545 }, { x: 1060, y: 575 }],
  3: [{ x: 790, y: 545 }, { x: 950, y: 575 }, { x: 1110, y: 545 }],
  4: [{ x: 760, y: 545 }, { x: 890, y: 575 }, { x: 1020, y: 545 }, { x: 1150, y: 575 }],
  5: [{ x: 740, y: 545 }, { x: 850, y: 575 }, { x: 960, y: 545 }, { x: 1070, y: 575 }, { x: 1180, y: 545 }],
};

const ALLY_W = 132;
const ENEMY_W = 150;

const STATUS_BUFF_COLOR = "#69db7c";
const STATUS_DEBUFF_COLOR = "#ff8787";

let floatId = 0;

function reducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function BattleScene({ project, waves, theme, seed, title, onFinish, onQuit, onTweak, replay }: Props) {
  const [waveIdx, setWaveIdx] = useState(0);
  const setup = useMemo<BattleSetup>(
    () => replay?.setup ?? battleSetupOf({ ...project, battle: { ...project.battle, encounter: { ...project.battle.encounter, enemies: waves[waveIdx]! } } }),
    // The setup is frozen per wave: console tweaks apply from the next battle on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [waveIdx],
  );
  const defOf = useCallback((defId: string) => setup.units.find((u) => u.id === defId)!, [setup]);

  const [battle, setBattle] = useState<BattleState>(() => replay?.final ?? createBattle(setup, `${seed}/w0`));
  // Playback starts from the pre-battle look; events then move it to the real state.
  const [view, setView] = useState<Record<string, UnitView>>(() => freshView(battle, setup));
  const [sp, setSp] = useState(setup.rules.spStart);
  const [cycle, setCycle] = useState(battle.cycle);
  const [actorUid, setActorUid] = useState<string | null>(null);
  const [floats, setFloats] = useState<Float[]>([]);
  const [banner, setBanner] = useState<{ text: string; sub?: string; kind: string } | null>(null);
  const [cutin, setCutin] = useState<{ unit: UnitDef; skill: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [auto, setAuto] = useState(!!replay);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [pendingAlly, setPendingAlly] = useState<Action | null>(null);
  const [ended, setEnded] = useState(false);

  const motion = useRef<Record<string, HTMLDivElement | null>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particles | null>(null);
  const playingRef = useRef(false);
  const playedOnce = useRef(false);
  const skipRef = useRef(false);
  const speedRef = useRef(1);
  const pausedRef = useRef(false);
  const aliveRef = useRef(true);
  const totals = useRef<Record<string, number>>({});
  const turnsTotal = useRef(0);
  const rm = useMemo(reducedMotion, []);

  speedRef.current = speed;
  pausedRef.current = paused;
  useEffect(() => {
    // Re-arm on every mount: StrictMode mounts, unmounts and remounts in development.
    aliveRef.current = true;
    return () => { aliveRef.current = false; particles.current?.clear(); };
  }, []);
  useEffect(() => {
    if (canvasRef.current && !particles.current) particles.current = new Particles(canvasRef.current);
    if (particles.current) { particles.current.speed = speed; particles.current.enabled = !rm; }
  }, [speed, rm]);

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  // Units on stage: everything with a view, except summons that have left (originals stay as fallen).
  // Timeline events (rules §14.4) are not fighters: they only appear in the turn order.
  const onStage = battle.units.filter((u) => view[u.uid] && !u.timelineEvent && (view[u.uid]!.alive || !u.summonedBy));
  const stageKey = onStage.map((u) => u.uid).join();
  const layout = useMemo(() => {
    const enemies = onStage.filter((u) => u.team === "enemy").sort((a, b) => a.slot - b.slot);
    const pos: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const u of onStage) {
      const def = defOf(u.defId);
      if (u.team === "ally") {
        const p = ALLY_POS[u.slot] ?? ALLY_POS[0]!;
        pos[u.uid] = { ...p, w: ALLY_W, h: (ALLY_W * 170) / 120 };
      } else {
        // Summons can push the line past five: extra units squeeze in between.
        const i = enemies.indexOf(u);
        const row = ENEMY_POS[Math.min(5, enemies.length)] ?? ENEMY_POS[5]!;
        const p = row[i] ?? { x: 640 + ((i % 2 ? 1 : -1) * (120 + 40 * i)), y: 600 + (i % 3) * 20 };
        const w = ENEMY_W * spriteScale(def) * (enemies.length > 5 ? 0.85 : 1);
        pos[u.uid] = { ...p, w, h: (w * 170) / 160 };
      }
    }
    return pos;
  }, [stageKey, defOf]); // eslint-disable-line react-hooks/exhaustive-deps
  // Playback callbacks outlive renders; read the latest layout through a ref.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const center = (uid: string) => { const p = layoutRef.current[uid] ?? { x: 900, y: 560, w: 0, h: 120 }; return { x: p.x, y: p.y - p.h * 0.5 }; };

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------
  // Timer-based (not rAF) so playback keeps going when the page is not painting, e.g. a background tab.
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      if (skipRef.current || ms <= 0) return resolve();
      let left = ms / speedRef.current;
      let last = performance.now();
      const step = () => {
        if (!aliveRef.current || skipRef.current) return resolve();
        const now = performance.now();
        if (!pausedRef.current) left -= now - last;
        last = now;
        if (left <= 0) return resolve();
        window.setTimeout(step, Math.min(50, left));
      };
      window.setTimeout(step, Math.min(50, left));
    });

  const animate = (uid: string, keyframes: Keyframe[], ms: number) => {
    const el = motion.current[uid];
    if (!el || skipRef.current || rm) return;
    el.animate(keyframes, { duration: ms / speedRef.current, easing: "ease-out" });
  };

  const addFloat = (uid: string, text: string, kind: string) => {
    if (skipRef.current) return;
    const c = center(uid);
    const id = ++floatId;
    const jitter = (Math.random() - 0.5) * 40;
    setFloats((f) => [...f, { id, x: c.x + jitter, y: c.y - 30, text, kind }]);
    window.setTimeout(() => aliveRef.current && setFloats((f) => f.filter((x) => x.id !== id)), 1100 / speedRef.current + 200);
  };

  const burst = (kind: BurstKind, uid: string, power = 1) => {
    if (skipRef.current) return;
    const c = center(uid);
    particles.current?.burst(kind, c.x, c.y, power);
  };

  const elementBurst = (el: string): BurstKind => (["fire", "ice", "thunder", "wind", "light", "shadow"].includes(el) ? (el as BurstKind) : "hit");

  const playEvents = useCallback(async (events: BattleEvent[], final: BattleState) => {
    playingRef.current = true;
    setPlaying(true);
    skipRef.current = false;
    let lastElement = "hit";
    const unitOf = (uid: string) => final.units.find((u) => u.uid === uid)!;
    const setU = (uid: string, patch: Partial<UnitView>) => setView((v) => ({ ...v, [uid]: { ...v[uid]!, ...patch } }));

    for (const e of events) {
      if (!aliveRef.current) return;
      switch (e.t) {
        case "cycle":
          setCycle(e.cycle);
          if (e.cycle > 1) { setToast(`第 ${e.cycle} 輪`); window.setTimeout(() => aliveRef.current && setToast(null), 1200); }
          break;
        case "turn":
          setActorUid(e.uid);
          turnsTotal.current++;
          await sleep(160);
          break;
        case "recover":
          setU(e.uid, { broken: false, toughness: unitOf(e.uid).maxToughness });
          addFloat(e.uid, "韌性恢復", "info");
          break;
        case "skip":
          addFloat(e.uid, e.reason, "status");
          animate(e.uid, [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], 400);
          await sleep(500);
          break;
        case "charm":
          addFloat(e.uid, `${e.reason}・失控`, "status");
          burst("shadow", e.uid, 0.7);
          await sleep(450);
          break;
        case "trigger":
          setToast(`⚡ ${unitOf(e.uid).name}・${e.passiveName}`);
          window.setTimeout(() => aliveRef.current && setToast(null), 900);
          await sleep(260);
          break;
        case "action": {
          const u = unitOf(e.uid);
          const def = defOf(u.defId);
          const skill = def.skills.find((s) => s.id === e.skillId);
          lastElement = skill?.element ?? u.element;
          setActorUid(e.uid);
          if (u.timelineEvent) {
            // Off-stage timeline event: announce it instead of animating a sprite.
            setToast(`◷ ${u.name}・${e.skillName}`);
            window.setTimeout(() => aliveRef.current && setToast(null), 900);
            await sleep(420);
            break;
          }
          if (e.skillType === "ultimate" && !skipRef.current) {
            setCutin({ unit: def, skill: e.skillName });
            burst("ult", e.uid, 1.2);
            await sleep(1050);
            setCutin(null);
          }
          const damaging = skill?.effects.some((x) => x.kind === "damage");
          const dir = u.team === "ally" ? 1 : -1;
          if (damaging) {
            animate(e.uid, [
              { transform: "translate(0,0)" },
              { transform: `translate(${dir * -18}px, 4px)`, offset: 0.25 },
              { transform: `translate(${dir * 110}px, -6px)`, offset: 0.55 },
              { transform: "translate(0,0)" },
            ], 560);
            await sleep(300);
          } else {
            animate(e.uid, [{ transform: "translateY(0)", filter: "brightness(1)" }, { transform: "translateY(-14px)", filter: "brightness(1.6)" }, { transform: "translateY(0)", filter: "brightness(1)" }], 520);
            burst(elementBurst(lastElement), e.uid, 0.6);
            await sleep(320);
          }
          break;
        }
        case "damage": {
          const src = unitOf(e.src);
          if (src.team === "ally" && !replay) totals.current[src.defId] = (totals.current[src.defId] ?? 0) + e.amount;
          const kind = e.kind === "break" ? "break" : e.kind === "dot" ? "dot" : e.crit ? "crit" : "dmg";
          setU(e.dst, { hp: e.hpAfter });
          addFloat(e.dst, `${e.amount.toLocaleString()}${e.crit ? "!" : ""}`, kind);
          if (e.kind === "hit") burst(elementBurst(lastElement), e.dst, e.crit ? 1.4 : 1);
          else if (e.kind === "dot") burst("shadow", e.dst, 0.6);
          animate(e.dst, [
            { transform: "translateX(0)", filter: "brightness(1)" },
            { transform: `translateX(${unitOf(e.dst).team === "ally" ? -10 : 10}px)`, filter: "brightness(2.6)", offset: 0.2 },
            { transform: "translateX(-4px)", filter: "brightness(1.2)", offset: 0.6 },
            { transform: "translateX(0)", filter: "brightness(1)" },
          ], 320);
          await sleep(e.kind === "dot" ? 380 : 230);
          break;
        }
        case "toughness":
          setU(e.dst, { toughness: e.after });
          break;
        case "break":
          setU(e.dst, { broken: true, toughness: 0 });
          burst("shatter", e.dst, 1.3);
          if (!skipRef.current) {
            setBanner({ text: "BREAK", sub: `${unitOf(e.dst).name} 韌性擊破`, kind: "break" });
            await sleep(650);
            setBanner(null);
          }
          break;
        case "heal":
          setView((v) => ({ ...v, [e.dst]: { ...v[e.dst]!, hp: Math.min(unitOf(e.dst).maxHp, v[e.dst]!.hp + e.amount) } }));
          addFloat(e.dst, `+${e.amount.toLocaleString()}`, "heal");
          burst("heal", e.dst, 0.8);
          await sleep(260);
          break;
        case "status": {
          const def = setup.statuses.find((s) => s.id === e.statusId);
          if (e.result === "applied" || e.result === "refreshed") {
            setView((v) => ({ ...v, [e.dst]: { ...v[e.dst]!, statuses: v[e.dst]!.statuses.includes(e.statusId) ? v[e.dst]!.statuses : [...v[e.dst]!.statuses, e.statusId] } }));
            addFloat(e.dst, def?.name ?? e.statusId, def?.kind === "buff" ? "buff" : "status");
            await sleep(200);
          } else if (e.result === "resisted") {
            addFloat(e.dst, "抵抗", "info");
            await sleep(200);
          } else {
            setView((v) => ({ ...v, [e.dst]: { ...v[e.dst]!, statuses: v[e.dst]!.statuses.filter((x) => x !== e.statusId) } }));
          }
          break;
        }
        case "energy":
          setU(e.uid, { energy: e.after });
          break;
        case "sp":
          setSp(e.after);
          break;
        case "advance":
          break;
        case "death":
          setU(e.uid, { alive: false, hp: 0, statuses: [] });
          await sleep(420);
          break;
        case "summon": {
          const u = unitOf(e.uid);
          setView((v) => ({ ...v, [e.uid]: { hp: u.maxHp, toughness: u.maxToughness, broken: false, alive: true, statuses: [], energy: 0 } }));
          await sleep(60);
          burst("heal", e.uid, 0.9);
          addFloat(e.uid, "登場", "info");
          await sleep(380);
          break;
        }
        case "dismiss":
          setU(e.uid, { alive: false, statuses: [] });
          addFloat(e.uid, "離場", "info");
          await sleep(300);
          break;
        case "revive":
          setU(e.uid, { hp: e.hp });
          burst("heal", e.uid, 1.2);
          addFloat(e.uid, "復活", "heal");
          await sleep(420);
          break;
        case "phase": {
          const u = unitOf(e.uid);
          setU(e.uid, { hp: u.maxHp, toughness: u.maxToughness, broken: false });
          burst("ult", e.uid, 1.1);
          if (!skipRef.current) {
            setBanner({ text: `PHASE ${e.phase}`, sub: `${u.name}・${e.name}`, kind: "break" });
            await sleep(750);
            setBanner(null);
          }
          break;
        }
        case "queue":
          addFloat(e.uid, "蓄力", "status");
          break;
        case "counter":
          break;
        case "end":
          break;
      }
    }
    // Exact final state, regardless of what the animation path showed.
    setView(viewOf(final));
    setSp(final.sp);
    setCycle(final.cycle);
    setActorUid(final.decision?.actorUid ?? null);
    playingRef.current = false;
    skipRef.current = false;
    playedOnce.current = true;
    setPlaying(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, defOf, layout]);

  // Opening events (enemy turns before the first decision), or the whole replay.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void playEvents(battle.events, battle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback((a: Action) => {
    if (playingRef.current || battle.phase !== "await") return;
    let next: BattleState;
    try { next = submitAction(setup, battle, a); } catch { return; }
    const events = next.events.slice(battle.events.length);
    setBattle(next);
    setPendingAlly(null);
    void playEvents(events, next);
  }, [battle, setup, playEvents]);

  // Auto play + wave transitions once playback is idle.
  // `finishing` is a ref, not state: changing it must not cancel the pending transition timer.
  const finishing = useRef(false);
  useEffect(() => {
    // Wait until the opening playback has really run; effects can fire before it flips `playing`.
    if (playing || paused || finishing.current || !playedOnce.current) return;
    if (battle.phase === "ended" || replay) {
      finishing.current = true;
      if (replay) { setBanner({ text: "重播結束", sub: "按 Ⅱ 結束重播", kind: "info" }); setEnded(true); return; }
      const won = battle.result === "win";
      const last = waveIdx === waves.length - 1;
      setEnded(true);
      setBanner({ text: won ? (last ? "VICTORY" : "WAVE CLEAR") : "DEFEAT", sub: won ? (last ? title : `第 ${waveIdx + 2} 波即將來襲`) : battle.result === "timeout" ? "回合數用盡" : "隊伍全滅", kind: won ? "win" : "lose" });
      window.setTimeout(() => {
        if (!aliveRef.current) return;
        if (won && !last) {
          setBanner(null);
          setEnded(false);
          finishing.current = false;
          setWaveIdx((w) => w + 1);
        } else {
          onFinish({ result: won ? "win" : "lose", wavesCleared: waveIdx + (won ? 1 : 0), turns: turnsTotal.current, cycles: battle.cycle, damage: totals.current });
        }
      }, 1800 / speedRef.current);
      return;
    }
    if (auto && !replay && battle.phase === "await") {
      const t = window.setTimeout(() => submit(withTarget(policyAction(setup, battle, project.battle.policy))), 260 / speedRef.current);
      return () => window.clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, paused, battle, auto]);

  // New wave: fresh battle with the same team.
  useEffect(() => {
    if (waveIdx === 0 || replay) return;
    const b = createBattle(setup, `${seed}/w${waveIdx}`);
    setBattle(b);
    setView(freshView(b, setup));
    setSp(setup.rules.spStart);
    setTarget(null);
    void playEvents(b.events, b);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  const legal = useMemo(() => (!playing && battle.phase === "await" ? legalActions(setup, battle) : []), [setup, battle, playing]);
  const decisionActor = battle.decision ? battle.units.find((u) => u.uid === battle.decision!.actorUid) : undefined;
  const aliveEnemies = battle.units.filter((u) => u.team === "enemy" && u.alive);
  const currentTarget = target && aliveEnemies.some((u) => u.uid === target) ? target : null;

  function withTarget(a: Action): Action {
    const l = legalActions(setup, battle).find((x) => x.action.kind === a.kind && x.action.actorUid === a.actorUid && x.action.skillId === a.skillId);
    if (!l || !l.targets.length) return a;
    if (l.skill.targeting === "enemy" && currentTarget && l.targets.includes(currentTarget)) return { ...a, targetUid: currentTarget };
    return a.targetUid && l.targets.includes(a.targetUid) ? a : { ...a, targetUid: policyAction(setup, battle, { ...project.battle.policy, ult: a.kind === "ult" ? "asap" : "never" }).targetUid ?? l.targets[0] };
  }

  const useSkill = (skill: SkillDef, a: Action) => {
    if (skill.targeting === "ally") { setPendingAlly(pendingAlly?.skillId === a.skillId && pendingAlly.kind === a.kind ? null : a); return; }
    submit(withTarget(a));
  };

  const idle = !playing && battle.phase === "await" && !auto && !replay && !paused;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const order = battle.units.filter((u) => u.alive).sort((a, b) => a.av - b.av || (a.team === b.team ? a.slot - b.slot : a.team === "ally" ? -1 : 1));
  const allies = battle.units.filter((u) => u.team === "ally");

  return (
    <div className={`battle theme-${theme} ${rm ? "reduced" : ""}`} style={{ "--spd": speed } as CSSProperties}>
      <Backdrop theme={theme} />

      {onStage.map((u) => {
        const p = layout[u.uid];
        const v = view[u.uid];
        if (!p || !v) return null;
        const def = defOf(u.defId);
        const isTarget = u.uid === currentTarget;
        const choosable = (pendingAlly && u.team === "ally" && v.alive) || (idle && u.team === "enemy" && v.alive);
        return (
          <div
            key={u.uid}
            className={`unit ${u.team} ${v.alive ? "" : "dead"} ${v.broken ? "broken" : ""} ${actorUid === u.uid ? "acting" : ""} ${isTarget ? "targeted" : ""} ${choosable ? "choosable" : ""}`}
            style={{ left: p.x - p.w / 2, top: p.y - p.h, width: p.w, height: p.h, zIndex: Math.round(p.y) }}
            onClick={() => {
              if (!v.alive) return;
              if (pendingAlly && u.team === "ally") submit({ ...pendingAlly, targetUid: u.uid });
              else if (u.team === "enemy" && !replay) setTarget(u.uid);
            }}
          >
            <div className="ground-ring" />
            {isTarget && <div className="reticle" />}
            <div className="motion" ref={(el) => { motion.current[u.uid] = el; }}>
              <div className={`sprite ${v.alive ? "idle" : ""}`} style={{ animationDelay: `${-u.slot * 0.4}s` }}><Sprite unit={def} /></div>
            </div>
            {v.alive && (
              <div className="plate" style={{ bottom: p.h + 6 }}>
                <span className="pname">{u.name}</span>
                <div className="pbar hp"><i style={{ width: `${(v.hp / u.maxHp) * 100}%` }} /></div>
                {u.maxToughness > 0 && <div className={`pbar tough ${v.broken ? "is-broken" : ""}`}><i style={{ width: `${(v.toughness / u.maxToughness) * 100}%` }} /></div>}
                <div className="pstat">
                  {u.team === "enemy" && u.weaknesses.map((w) => <span key={w} className="wk" style={{ background: elementColor(w).main }} title={`弱點：${w}`} />)}
                  {v.statuses.map((s) => {
                    const sd = setup.statuses.find((x) => x.id === s);
                    return <span key={s} className="sticon" style={{ borderColor: sd?.kind === "buff" ? STATUS_BUFF_COLOR : STATUS_DEBUFF_COLOR }}>{sd?.name.slice(0, 1) ?? "?"}</span>;
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <canvas ref={canvasRef} className="fx" width={1280} height={720} />

      {floats.map((f) => <div key={f.id} className={`float ${f.kind}`} style={{ left: f.x, top: f.y }}>{f.text}</div>)}

      {/* top-left: turn order */}
      <div className="hud-order">
        {order.slice(0, 7).map((u, i) => (
          <div key={u.uid} className={`ord ${u.team} ${i === 0 ? "first" : ""} ${u.timelineEvent ? "event" : ""}`} title={`${u.timelineEvent ? "◷ 事件・" : ""}${u.name}（行動值 ${u.av.toFixed(1)}）`}>
            <Sprite unit={defOf(u.defId)} portrait />
          </div>
        ))}
      </div>

      {/* top-center */}
      <div className="hud-title">
        <span>{title}</span>
        <b>{replay ? "重播" : `WAVE ${waveIdx + 1}/${waves.length}`}</b>
        <span>第 {cycle} 輪</span>
      </div>
      {toast && <div className="hud-toast">{toast}</div>}

      {/* top-right */}
      <div className="hud-sys">
        {!replay && <button className={`sysbtn ${auto ? "on" : ""}`} onClick={() => setAuto((a) => !a)}>AUTO</button>}
        <button className="sysbtn" onClick={() => setSpeed((s) => (s >= 3 ? 1 : s + 1))}>{speed}×</button>
        {playing && <button className="sysbtn" onClick={() => { skipRef.current = true; particles.current?.clear(); }}>跳過</button>}
        <button className="sysbtn" aria-label="暫停選單" onClick={() => setPaused(true)}>Ⅱ</button>
      </div>

      {/* bottom-left: party */}
      <div className="hud-party">
        {allies.map((u) => {
          const v = view[u.uid];
          if (!v) return null;
          const def = defOf(u.defId);
          const ult = def.skills.find((s) => s.type === "ultimate");
          const cost = ult ? (ult.energyCost ?? u.maxEnergy) : 0;
          const ready = !!ult && v.alive && v.energy >= cost && cost > 0;
          const canCast = idle && ult && canUltimate(battle, u, ult) && legal.some((l) => l.action.kind === "ult" && l.action.actorUid === u.uid);
          const pct = cost > 0 ? Math.min(1, v.energy / cost) : 0;
          return (
            <button
              key={u.uid}
              className={`pcard ${v.alive ? "" : "dead"} ${ready ? "ready" : ""} ${decisionActor?.uid === u.uid ? "turn" : ""} ${pendingAlly && v.alive ? "choosable" : ""}`}
              disabled={!(canCast || (pendingAlly && v.alive))}
              onClick={() => {
                if (pendingAlly) { submit({ ...pendingAlly, targetUid: u.uid }); return; }
                if (canCast && ult) useSkill(ult, { kind: "ult", actorUid: u.uid, skillId: ult.id });
              }}
              title={ult ? `${ult.name}：能量 ${Math.floor(v.energy)}/${cost}` : ""}
            >
              <div className="pportrait"><Sprite unit={def} portrait /></div>
              <svg className="ering" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" /><circle cx="32" cy="32" r="29" className="fill" style={{ strokeDasharray: `${pct * 182} 182`, stroke: elementColor(u.element).main }} /></svg>
              <div className="pinfo">
                <span>{u.name}</span>
                <div className="pbar hp"><i style={{ width: `${(v.hp / u.maxHp) * 100}%` }} /></div>
                <small>{Math.max(0, Math.round(v.hp)).toLocaleString()}</small>
              </div>
              {ready && <span className="ult-tag">大招</span>}
            </button>
          );
        })}
      </div>

      {/* bottom-right: skills */}
      <div className="hud-skills">
        <div className="sp-row">{Array.from({ length: setup.rules.spMax }, (_, i) => <i key={i} className={i < sp ? "on" : ""} />)}<span>技能點</span></div>
        {decisionActor && !replay && (
          <div className="skill-row">
            {defOf(decisionActor.defId).skills.filter((s) => s.type === "basic" || s.type === "skill").map((s) => {
              const l = legal.find((x) => x.action.kind === "skill" && x.skill.id === s.id);
              const on = pendingAlly?.skillId === s.id && pendingAlly.kind === "skill";
              return (
                <button key={s.id} className={`skbtn ${s.type} ${on ? "on" : ""}`} disabled={!idle || !l} onClick={() => l && useSkill(s, l.action)} title={s.description}>
                  <span className="skicon">{s.type === "basic" ? "⚔" : "✦"}</span>
                  <span className="skname">{s.name}</span>
                  <small>{s.spDelta > 0 ? `+${s.spDelta}` : s.spDelta < 0 ? `${s.spDelta}` : ""}</small>
                </button>
              );
            })}
          </div>
        )}
        <div className="hint">
          {replay ? "重播中" : auto ? "自動戰鬥中" : pendingAlly ? "選擇一名隊友" : idle && decisionActor ? `${decisionActor.name} 的回合・點敵人選擇目標` : playing ? "" : ""}
        </div>
      </div>

      {cutin && (
        <div className="cutin" style={{ "--el": elementColor(cutin.unit.element).main } as CSSProperties}>
          <div className="cutin-band" />
          <div className="cutin-art"><Sprite unit={cutin.unit} /></div>
          <div className="cutin-text"><small>{cutin.unit.name}</small><b>{cutin.skill}</b></div>
        </div>
      )}

      {banner && <div className={`banner ${banner.kind}`}><b>{banner.text}</b>{banner.sub && <span>{banner.sub}</span>}</div>}

      {paused && (
        <div className="pause">
          <div className="pause-box">
            <b>暫停</b>
            <button onClick={() => setPaused(false)}>繼續</button>
            {onTweak && <button onClick={() => { setPaused(false); onTweak(); }}>⚙ 調整數值（主控台）</button>}
            <button onClick={onQuit}>{replay ? "結束重播" : "放棄並返回"}</button>
            <small>種子 {seed}・同種子同操作會得到相同結果</small>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pre-battle look. Summons (present in a replay's final state) appear only when their event plays. */
function freshView(s: BattleState, setup: BattleSetup): Record<string, UnitView> {
  return Object.fromEntries(s.units.filter((u) => !u.summonedBy).map((u) => [u.uid, {
    hp: u.maxHp, toughness: u.maxToughness, broken: false, alive: true, statuses: [],
    energy: Math.min(u.maxEnergy, setup.units.find((d) => d.id === u.defId)?.stats.startEnergy ?? 0),
  }]));
}

function viewOf(s: BattleState): Record<string, UnitView> {
  return Object.fromEntries(s.units.map((u) => [u.uid, { hp: u.hp, toughness: u.toughness, energy: u.energy, broken: u.broken, alive: u.alive, statuses: u.statuses.map((x) => x.statusId) }]));
}
