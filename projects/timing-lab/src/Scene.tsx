import type { Timing } from "@gml/core";
import { outcomeKind } from "@gml/ui";
import { PHASE_LABEL, attackPhaseAt, type ScheduledAttack } from "./attacks";
import type { PlaybackFx } from "./usePlayback";

const GROUND = 205;
const DEF_X = 150;
const ATK_X = 500;
const KIND_COLOR: Record<string, string> = { perfect: "#ecd099", success: "#6fd08a", fail: "#f0707a", neutral: "#aab9c3" };
const FALLBACK = ["#7c95ff", "#f59e0b", "#2dd4bf", "#c084fc", "#fb7185"];

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
const rad = (d: number) => (d * Math.PI) / 180;

/** Contact point on the defender's body: the strike / projectile reaches it exactly on the impact frame. */
const BODY_X = DEF_X + 4;
const REACH = 66; // shoulder → blade tip
const SHOULDER_Y = GROUND - 62;
const DASH = 6; // frames the attacker needs to close in before a melee hit
const TRAVEL = 18; // frames a projectile is visible before impact
const isRanged = (tags: string[]) => tags.includes("bullet") || tags.includes("energy");
/** Blade angle at contact (0 = down, 90 = forward): sweeps go for the legs, everything else for the chest. */
const contactAngle = (tags: string[]) => (tags.includes("sweep") ? 42 : 90);
const contactY = (tags: string[]) => SHOULDER_Y + Math.cos(rad(contactAngle(tags))) * REACH;
/** Attacker x that puts the blade tip on the body for this hit. */
const strikeX = (tags: string[]) => BODY_X + Math.sin(rad(contactAngle(tags))) * REACH + 2;

function Arm({ sx, sy, angle, len, color, facing }: { sx: number; sy: number; angle: number; len: number; color: string; facing: 1 | -1 }) {
  // angle 0 = hanging down, 90 = pointing forward, 180 = straight up.
  const ex = sx + facing * Math.sin(rad(angle)) * len;
  const ey = sy + Math.cos(rad(angle)) * len;
  return <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={5} strokeLinecap="round" />;
}

/** Procedural stick-figure scene: attacker animation follows the attack frame ranges, defender pose follows the trace. */
export function Scene({ config, frame, trace, events, items, fx }: {
  config: Timing.TimingConfig;
  frame: number;
  trace: Timing.FrameTrace | undefined;
  events: Timing.TimingEvent[];
  items: ScheduledAttack[];
  fx: PlaybackFx;
}) {
  const ap = attackPhaseAt(items, frame);
  const idx = trace?.interaction ? config.interactions.findIndex((i) => i.id === trace.interaction) : -1;
  const it = idx >= 0 ? config.interactions[idx] : undefined;
  const icolor = it ? (it.color ?? FALLBACK[idx % FALLBACK.length]!) : "#aab9c3";
  const phase = trace?.phase ?? "idle";
  const winName = trace?.window ? it?.windows.find((w) => w.id === trace.window)?.name : undefined;
  const strictWin = trace?.window ? !!it?.windows.find((w) => w.id === trace.window)?.strict : false;
  const defeated = !!trace && (trace.resources[config.healthResource] ?? 1) <= 0;

  // Defender pose
  let lean = 0, armA = 15, aura = 0, auraDash = false, rot = 0;
  if (phase === "startup") { lean = -5; armA = 70; aura = 0.35; auraDash = true; }
  else if (phase === "active") { lean = 4; armA = 110; aura = 1; }
  else if (phase === "recovery") { lean = 0; armA = 30; aura = 0.2; }
  else if (phase === "stun") { lean = -8; armA = 10; rot = -12; }
  const recentHit = events.some((e) => e.type === "resolve" && e.via === "hit" && frame - e.frame >= 0 && frame - e.frame < 10);
  const hurt = recentHit || phase === "stun";

  // Attacker pose. Melee hits: dash in during the last DASH frames, blade lands on the body on the impact frame.
  let atkArm = 40, tell = 0, atkLean = 0, atkX = ATK_X;
  if (ap.phase === "windup") atkArm = lerp(40, 150, ap.progress);
  else if (ap.phase === "telegraph") { atkArm = 155; tell = 1 - Math.abs(ap.progress * 2 - 1) * 0.3; atkLean = 4; }
  else if (ap.phase === "strike") atkArm = 60;
  else if (ap.phase === "recovery") atkArm = lerp(60, 40, ap.progress);
  if (ap.item) {
    const melee = ap.item.events.filter((e) => !isRanged(e.tags));
    const next = melee.find((e) => e.frame >= frame);
    const prev = [...melee].reverse().find((e) => e.frame < frame);
    if (next && next.frame - frame <= DASH) {
      // closing in: from home, or from the previous hit's position in a combo
      const chained = !!prev && next.frame - prev.frame <= DASH + 8;
      const k = 1 - (next.frame - frame) / DASH;
      atkX = lerp(chained ? strikeX(prev!.tags) : ATK_X, strikeX(next.tags), k);
      atkArm = lerp(chained ? contactAngle(prev!.tags) : 155, contactAngle(next.tags), k * k);
      atkLean = -6;
    } else if (prev && frame - prev.frame <= 12) {
      // follow-through, then step back home
      const k = (frame - prev.frame) / 12;
      atkX = lerp(strikeX(prev.tags), ATK_X, k < 0.25 ? 0 : (k - 0.25) / 0.75);
      atkArm = lerp(contactAngle(prev.tags), 40, k);
      atkLean = k < 0.25 ? -6 : 0;
    }
  }
  const tipX = atkX - Math.sin(rad(atkArm)) * 60 - 4;
  const tipY = GROUND - 62 + Math.cos(rad(atkArm)) * 60;

  // Moving strikes and impact bursts
  const strikes: { x: number; y: number; color: string; key: string }[] = [];
  const bursts: { age: number; y: number; key: string }[] = [];
  for (const sch of items) {
    for (const e of sch.events) {
      const dt = e.frame - frame;
      const tagColor = config.tags.find((t) => t.id === e.tags[0])?.color ?? "#ecd099";
      if (isRanged(e.tags) && dt >= 0 && dt <= TRAVEL) strikes.push({ x: lerp(BODY_X, ATK_X - 44, dt / TRAVEL), y: contactY(e.tags), color: tagColor, key: e.id });
      if (dt <= 0 && dt > -6) bursts.push({ age: -dt, y: contactY(e.tags), key: e.id });
    }
  }

  // Floating texts
  const floats: { text: string; age: number; color: string; key: string; size: number; slot: number }[] = [];
  const slots = new Map<number, number>();
  const slotFor = (f: number) => { const n = slots.get(f) ?? 0; slots.set(f, n + 1); return n; };
  events.forEach((e, i) => {
    const age = frame - e.frame;
    if (age < 0 || age > 45) return;
    if (e.type === "resolve") {
      const k = e.outcome ? outcomeKind(config, e.outcome) : "neutral";
      const text = e.outcome ? (config.outcomes.find((o) => o.id === e.outcome)?.name ?? e.outcome) : "無敵";
      floats.push({ text, age, color: KIND_COLOR[k]!, key: `r${i}`, size: 20, slot: slotFor(e.frame) });
    } else if (e.type === "whiff" && e.outcome) {
      floats.push({ text: config.outcomes.find((o) => o.id === e.outcome)?.name ?? "揮空", age, color: KIND_COLOR.fail!, key: `w${i}`, size: 16, slot: slotFor(e.frame) });
    } else if (e.type === "effect" && e.effect === "cue" && e.target) {
      floats.push({ text: e.target, age, color: "#80d7d8", key: `c${i}`, size: 12, slot: slotFor(e.frame) });
    }
  });

  const shake = fx.freeze > 0 ? (frame % 2 ? 2 : -2) : 0;
  return (
    <div className="tl-scene">
      <svg viewBox="0 0 640 260" role="img" aria-label="動作場景" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="tl-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#10222c" /><stop offset="1" stopColor="#0b141b" /></linearGradient>
        </defs>
        <rect width="640" height="260" fill="url(#tl-sky)" />
        {tell > 0 && <rect width="640" height="260" fill="#ecd099" opacity={0.06} />}
        <line x1="0" x2="640" y1={GROUND} y2={GROUND} stroke="#2b3d49" strokeWidth={2} />

        <g transform={`translate(${shake} 0)`}>
          {/* defender */}
          <g transform={`translate(${DEF_X + lean} 0) rotate(${rot} 0 ${GROUND})`} opacity={hurt && frame % 4 < 2 ? 0.55 : 1}>
            {trace?.invulnerable && <circle cx={0} cy={GROUND - 50} r={54 + Math.sin(frame / 3) * 3} fill="none" stroke="#80d7d8" strokeDasharray="5 5" opacity={0.6} />}
            {aura > 0 && <circle cx={0} cy={GROUND - 50} r={46} fill="none" stroke={icolor} strokeWidth={phase === "active" ? 4 : 2} strokeDasharray={auraDash ? "6 6" : undefined} opacity={aura} />}
            {phase === "active" && strictWin && <circle cx={0} cy={GROUND - 50} r={54} fill="none" stroke="#ecd099" strokeWidth={2} />}
            <line x1={-8} y1={GROUND - 28} x2={-12} y2={GROUND} stroke={hurt ? "#f0707a" : "#edf3f4"} strokeWidth={5} strokeLinecap="round" />
            <line x1={8} y1={GROUND - 28} x2={14} y2={GROUND} stroke={hurt ? "#f0707a" : "#edf3f4"} strokeWidth={5} strokeLinecap="round" />
            <line x1={0} y1={GROUND - 70} x2={0} y2={GROUND - 26} stroke={hurt ? "#f0707a" : "#edf3f4"} strokeWidth={7} strokeLinecap="round" />
            <circle cx={0} cy={GROUND - 86} r={14} fill="#17282f" stroke={hurt ? "#f0707a" : "#edf3f4"} strokeWidth={3} />
            <Arm sx={0} sy={GROUND - 62} angle={armA} len={34} color={it ? icolor : "#edf3f4"} facing={1} />
          </g>
          {defeated && <text x={DEF_X} y={GROUND - 120} textAnchor="middle" fill="#f0707a" fontSize={16} fontWeight={700}>敗北</text>}

          {/* attacker */}
          <g transform={`translate(${atkX + atkLean} 0)`}>
            <line x1={-8} y1={GROUND - 28} x2={-14} y2={GROUND} stroke="#c9d3da" strokeWidth={5} strokeLinecap="round" />
            <line x1={8} y1={GROUND - 28} x2={12} y2={GROUND} stroke="#c9d3da" strokeWidth={5} strokeLinecap="round" />
            <line x1={0} y1={GROUND - 70} x2={0} y2={GROUND - 26} stroke="#c9d3da" strokeWidth={7} strokeLinecap="round" />
            <circle cx={0} cy={GROUND - 86} r={14} fill="#2a1d24" stroke="#f0707a" strokeWidth={3} />
            <Arm sx={0} sy={GROUND - 62} angle={atkArm} len={34} color="#f0707a" facing={-1} />
            <line x1={-Math.sin(rad(atkArm)) * 34} y1={GROUND - 62 + Math.cos(rad(atkArm)) * 34} x2={-Math.sin(rad(atkArm)) * 66} y2={GROUND - 62 + Math.cos(rad(atkArm)) * 66} stroke="#edf3f4" strokeWidth={3} strokeLinecap="round" />
            {tell > 0 && (
              <g transform={`translate(${tipX - atkX} ${tipY})`}>
                <path d="M0 -14 L3 -3 L14 0 L3 3 L0 14 L-3 3 L-14 0 L-3 -3 Z" fill="#fff" opacity={tell} transform={`scale(${0.8 + tell * 0.7})`} />
              </g>
            )}
            {tell > 0 && <text x={0} y={GROUND - 118} textAnchor="middle" fill="#ecd099" fontSize={26} fontWeight={800}>!</text>}
          </g>

          {strikes.map((s) => (
            <g key={s.key}>
              <line x1={s.x} x2={s.x + 34} y1={s.y} y2={s.y} stroke={s.color} strokeWidth={3} strokeLinecap="round" opacity={0.45} />
              <circle cx={s.x} cy={s.y} r={6} fill={s.color} />
            </g>
          ))}
          {bursts.map((b) => (
            <g key={b.key} transform={`translate(${BODY_X} ${b.y})`} opacity={1 - b.age / 6}>
              <circle r={6 + b.age * 6} fill="none" stroke="#ecd099" strokeWidth={3} />
              {b.age === 0 && <circle r={5} fill="#fff" />}
            </g>
          ))}
        </g>

        {floats.map((f) => (
          <text key={f.key} x={DEF_X + 70} y={GROUND - 130 - f.age * 1.2 + f.slot * 15} fill={f.color} fontSize={f.size} fontWeight={800} opacity={1 - f.age / 45} stroke="#0b141b" strokeWidth={0.6} paintOrder="stroke">{f.text}</text>
        ))}

        {/* HUD */}
        {config.resources.map((r, i) => {
          const v = trace?.resources[r.id] ?? r.initial;
          const w = 150;
          return (
            <g key={r.id} transform={`translate(12 ${12 + i * 20})`}>
              <text x={0} y={10} fill="#aab9c3" fontSize={11}>{r.name}</text>
              <rect x={52} y={1} width={w} height={11} rx={3} fill="#17282f" stroke="#2b3d49" />
              <rect x={52} y={1} width={w * (r.max ? v / r.max : 0)} height={11} rx={3} fill={r.id === config.healthResource ? "#f0707a" : "#80d7d8"} />
              <text x={52 + w + 6} y={10} fill="#edf3f4" fontSize={11}>{Math.round(v * 10) / 10}/{r.max}</text>
            </g>
          );
        })}
        {it && (phase === "active" || phase === "startup" || phase === "recovery") && (
          <text x={DEF_X} y={GROUND + 22} textAnchor="middle" fill={icolor} fontSize={13} fontWeight={700}>
            {it.name}・{phase === "startup" ? "啟動" : phase === "active" ? `判定${winName ? `：${winName}` : ""}` : "收招"}
          </text>
        )}
        {phase === "stun" && <text x={DEF_X} y={GROUND + 22} textAnchor="middle" fill="#f0707a" fontSize={13} fontWeight={700}>硬直</text>}
        {fx.freeze > 0 && <text x={320} y={26} textAnchor="middle" fill="#ecd099" fontSize={14} fontWeight={700}>頓幀</text>}
        {fx.slow < 1 && <text x={320} y={26} textAnchor="middle" fill="#80d7d8" fontSize={14} fontWeight={700}>慢動作 ×{fx.slow}</text>}
      </svg>
      <div className="tl-scene-info">
        <span>第 <b>{frame}</b> 幀</span>
        <span>攻擊動畫：<b>{PHASE_LABEL[ap.phase]}</b>{ap.item ? `（${ap.item.def.name}）` : ""}</span>
        <span>玩家：<b>{phase === "idle" ? "待機" : phase === "startup" ? "啟動" : phase === "active" ? "判定中" : phase === "recovery" ? "收招" : "硬直"}</b>{it ? `（${it.name}）` : ""}{trace?.invulnerable ? "・無敵" : ""}</span>
      </div>
    </div>
  );
}
