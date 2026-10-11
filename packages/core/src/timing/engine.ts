/**
 * Timing rules 1.0 engine (docs/spec/timing.md). Pure: `stepTiming` never mutates its input state.
 */
import { evalBool, evalNumber, roundHalfAway, type Expr, type Scope } from "../expr";
import type {
  ActionState,
  AttackDef,
  AttackEvent,
  DropReason,
  EffectDef,
  FrameInput,
  FrameTrace,
  InteractionDef,
  TimingConfig,
  TimingEvent,
  TimingRun,
  TimingScript,
  TimingState,
  WindowSpan,
} from "./types";

export class TimingError extends Error {}

/** spec §1 */
export const msToFrames = (ms: number, fps: number): number => roundHalfAway((ms * fps) / 1000);
export const framesToMs = (frames: number, fps: number): number => (frames * 1000) / fps;

/** spec §6 */
export function expandAttack(def: AttackDef, start: number): AttackEvent[] {
  return def.hits.map((h, i) => {
    const a: AttackEvent = { id: `${def.id}#${i}`, frame: start + def.windup + h.offset, tags: h.tags.slice() };
    if (h.damage !== undefined) a.damage = h.damage;
    return a;
  });
}

export function cloneTimingState(s: TimingState): TimingState {
  const charges: TimingState["charges"] = {};
  for (const k of Object.keys(s.charges)) charges[k] = { count: s.charges[k]!.count, pending: s.charges[k]!.pending.slice() };
  return {
    frame: s.frame,
    resources: { ...s.resources },
    statuses: { ...s.statuses },
    stunUntil: s.stunUntil,
    action: s.action ? { ...s.action, windows: s.action.windows.map((w) => ({ ...w })) } : null,
    charges,
    readyAt: { ...s.readyAt },
    buffered: s.buffered ? { ...s.buffered } : null,
    presses: s.presses.map((p) => [p[0], p[1]] as [number, string]),
    pending: s.pending.map((a) => ({ ...a, tags: a.tags.slice() })),
    defeated: s.defeated,
  };
}

/** spec §7.2 */
export function createTimingState(config: TimingConfig): TimingState {
  const resources: Record<string, number> = {};
  for (const r of config.resources) resources[r.id] = r.initial;
  const charges: TimingState["charges"] = {};
  const readyAt: Record<string, number> = {};
  for (const i of config.interactions) {
    if (i.charges) charges[i.id] = { count: i.charges.max, pending: [] };
    readyAt[i.id] = 0;
  }
  return { frame: 0, resources, statuses: {}, stunUntil: 0, action: null, charges, readyAt, buffered: null, presses: [], pending: [], defeated: false };
}

/** spec §4.3: effective windows for a given shrink (Infinity removes every strict window). */
export function buildWindows(def: InteractionDef, start: number, shrink: number): WindowSpan[] {
  const lens = def.windows.map((w) => w.frames);
  def.windows.forEach((w, i) => {
    if (!w.strict) return;
    const cut = Math.min(w.frames, shrink);
    lens[i]! -= cut;
    for (let j = i + 1; j < def.windows.length; j++) {
      if (!def.windows[j]!.strict) { lens[j]! += cut; break; }
    }
  });
  const out: WindowSpan[] = [];
  let at = start;
  def.windows.forEach((w, i) => {
    out.push({ id: w.id, from: at, to: at + lens[i]! });
    at += lens[i]!;
  });
  return out;
}

interface Candidate {
  id: string;
  pressFrame: number;
  shrink: number;
  buffered: boolean;
}

export function stepTiming(config: TimingConfig, prev: TimingState, input: FrameInput): { state: TimingState; events: TimingEvent[] } {
  const s = cloneTimingState(prev);
  const t = s.frame;
  const events: TimingEvent[] = [];
  const byId = new Map<string, InteractionDef>();
  const order = new Map<string, number>();
  config.interactions.forEach((i, n) => { byId.set(i.id, i); order.set(i.id, n); });
  const outcomes = new Map(config.outcomes.map((o) => [o.id, o]));
  const getInteraction = (id: string) => {
    const d = byId.get(id);
    if (!d) throw new TimingError(`互動「${id}」不存在`);
    return d;
  };

  let attackDamage = 0;
  const scope: Scope = (path) => {
    switch (path) {
      case "frame": return t;
      case "attack.damage": return attackDamage;
      case "catch.index": return s.action?.catches ?? 0;
      case "action.shrink": return s.action?.shrink ?? 0;
      case "action.buffered": return s.action?.buffered ?? false;
    }
    if (path.startsWith("res.")) return s.resources[path.slice(4)];
    if (path.startsWith("status.")) return Math.max(0, (s.statuses[path.slice(7)] ?? 0) - t);
    if (path.startsWith("charges.")) return s.charges[path.slice(8)]?.count ?? 0;
    return undefined;
  };
  const frames = (e: Expr) => Math.max(0, roundHalfAway(evalNumber(e, scope)));
  const clampRes = (id: string, v: number) => {
    const def = config.resources.find((r) => r.id === id);
    if (!def) throw new TimingError(`資源「${id}」不存在`);
    return Math.min(def.max, Math.max(0, v));
  };
  const endAction = () => {
    if (!s.action) return;
    events.push({ frame: t, type: "phase", interaction: s.action.interaction, phase: "idle" });
    s.action = null;
  };

  function applyOutcome(outcomeId: string, damage: number): void {
    const outcome = outcomes.get(outcomeId);
    if (!outcome) throw new TimingError(`結果「${outcomeId}」不存在`);
    attackDamage = damage;
    for (const ef of outcome.effects as EffectDef[]) {
      if (ef.when && !evalBool(ef.when, scope)) continue;
      const ev = { frame: t, type: "effect" as const, outcome: outcomeId, effect: ef.type } as Extract<TimingEvent, { type: "effect" }>;
      switch (ef.type) {
        case "damage": {
          const amt = Math.max(0, evalNumber(ef.amount, scope));
          const h = config.healthResource;
          s.resources[h] = clampRes(h, (s.resources[h] ?? 0) - amt);
          ev.target = h; ev.value = amt;
          events.push(ev);
          if (s.resources[h] === 0 && !s.defeated) {
            s.defeated = true;
            events.push({ frame: t, type: "defeated" });
          }
          break;
        }
        case "addResource": {
          const amt = evalNumber(ef.amount, scope);
          s.resources[ef.resource] = clampRes(ef.resource, (s.resources[ef.resource] ?? 0) + amt);
          ev.target = ef.resource; ev.value = amt;
          events.push(ev);
          break;
        }
        case "invulnerable": {
          const n = frames(ef.frames);
          s.statuses.invulnerable = Math.max(s.statuses.invulnerable ?? 0, t + n);
          ev.target = "invulnerable"; ev.frames = n;
          events.push(ev);
          break;
        }
        case "status": {
          const n = frames(ef.frames);
          s.statuses[ef.status] = Math.max(s.statuses[ef.status] ?? 0, t + n);
          ev.target = ef.status; ev.frames = n;
          events.push(ev);
          break;
        }
        case "stun": {
          const n = frames(ef.frames);
          ev.frames = n;
          events.push(ev);
          if (n > 0) {
            endAction();
            s.stunUntil = Math.max(s.stunUntil, t + n);
          }
          break;
        }
        case "restoreCharge": {
          const n = frames(ef.amount);
          const def = getInteraction(ef.interaction);
          const ch = s.charges[ef.interaction];
          if (def.charges && ch) {
            ch.count = Math.min(def.charges.max, ch.count + n);
            if (def.charges.mode === "sequential") {
              if (ch.count >= def.charges.max) ch.pending = [];
            } else {
              ch.pending.splice(Math.max(0, ch.pending.length - n), n);
            }
          }
          ev.target = ef.interaction; ev.value = n;
          events.push(ev);
          break;
        }
        case "cancelRecovery":
          events.push(ev);
          endAction();
          break;
        case "hitstop": {
          ev.frames = frames(ef.frames);
          events.push(ev);
          break;
        }
        case "timeScale": {
          ev.value = evalNumber(ef.scale, scope); ev.frames = frames(ef.frames);
          events.push(ev);
          break;
        }
        case "cue": {
          ev.target = ef.cue;
          if (ef.value) ev.value = evalNumber(ef.value, scope);
          events.push(ev);
          break;
        }
      }
    }
    attackDamage = 0;
  }

  if (s.defeated) {
    // spec §7 step 0
    for (const id of input.presses) events.push({ frame: t, type: "drop", interaction: id, pressFrame: t, reason: "defeated" });
    s.pending = [];
    s.buffered = null;
    s.frame = t + 1;
    return { state: s, events };
  }

  // 1. timers
  for (const k of Object.keys(s.statuses)) if (s.statuses[k]! <= t) delete s.statuses[k];
  for (const def of config.interactions) {
    const ch = s.charges[def.id];
    if (!def.charges || !ch) continue;
    if (def.charges.mode === "sequential") {
      if (ch.pending.length > 0 && ch.pending[0]! <= t) {
        ch.count += 1;
        ch.pending = ch.count >= def.charges.max ? [] : [ch.pending[0]! + def.charges.recharge];
        events.push({ frame: t, type: "recharge", interaction: def.id, count: ch.count });
      }
    } else {
      const due = ch.pending.filter((p) => p <= t).length;
      ch.pending = ch.pending.filter((p) => p > t);
      for (let n = 0; n < due; n++) {
        ch.count += 1;
        events.push({ frame: t, type: "recharge", interaction: def.id, count: ch.count });
      }
    }
  }
  const maxWithin = Math.max(0, ...config.interactions.map((i) => i.spam?.withinFrames ?? 0));
  s.presses = s.presses.filter((p) => p[0] > t - maxWithin);

  // 2. action phases
  if (s.action && s.action.recoveryEnd === null && t >= s.action.activeEnd) {
    const a = s.action;
    const def = getInteraction(a.interaction);
    const total = a.windows.reduce((n, w) => n + (w.to - w.from), 0);
    a.recoveryEnd = a.activeEnd + (a.catches > 0 || total === 0 ? def.successRecovery : def.whiffRecovery);
    if (a.catches === 0 && total > 0) {
      events.push({ frame: t, type: "whiff", interaction: def.id, outcome: def.whiffOutcome ?? null });
      if (def.whiffOutcome) applyOutcome(def.whiffOutcome, 0);
    }
    if (s.action === a) events.push({ frame: t, type: "phase", interaction: a.interaction, phase: "recovery" });
  }
  if (s.action && s.action.recoveryEnd !== null && t >= s.action.recoveryEnd) endAction();

  // 3. input
  const cands: Candidate[] = [];
  for (const id of input.presses) {
    const def = getInteraction(id);
    events.push({ frame: t, type: "press", interaction: id });
    let shrink = 0;
    let locked = false;
    const sp = def.spam;
    if (sp) {
      const n = s.presses.filter((p) => t - sp.withinFrames < p[0] && p[0] <= t && (sp.scope === "all" || p[1] === id)).length;
      if (sp.lockoutAfter > 0 && n >= sp.lockoutAfter) {
        locked = true;
        s.stunUntil = Math.max(s.stunUntil, t + sp.lockoutFrames);
      } else {
        shrink = Math.min(n * sp.shrinkPerPress, sp.maxShrink);
      }
    }
    s.presses.push([t, id]);
    if (locked) events.push({ frame: t, type: "drop", interaction: id, pressFrame: t, reason: "spamLockout" });
    else cands.push({ id, pressFrame: t, shrink, buffered: false });
  }
  if (s.buffered && t - s.buffered.frame > getInteraction(s.buffered.interaction).buffer) {
    events.push({ frame: t, type: "drop", interaction: s.buffered.interaction, pressFrame: s.buffered.frame, reason: "bufferExpired" });
    s.buffered = null;
  }
  const rank = (c: Candidate) => [getInteraction(c.id).priority, order.get(c.id)!, c.buffered ? 1 : 0, c.pressFrame];
  const better = (a: Candidate, b: Candidate) => {
    const ra = rank(a), rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i]! < rb[i]!;
    return false;
  };
  const drop = (c: Candidate, reason: DropReason) => events.push({ frame: t, type: "drop", interaction: c.id, pressFrame: c.pressFrame, reason });
  const busy = s.action !== null || t < s.stunUntil;
  if (busy) {
    let chosen: Candidate | null = null;
    for (const c of cands) if (getInteraction(c.id).buffer > 0 && (!chosen || better(c, chosen))) chosen = c;
    if (chosen) {
      if (s.buffered) events.push({ frame: t, type: "drop", interaction: s.buffered.interaction, pressFrame: s.buffered.frame, reason: "bufferReplaced" });
      s.buffered = { interaction: chosen.id, frame: chosen.pressFrame, shrink: -1 };
      events.push({ frame: t, type: "buffer", interaction: chosen.id, pressFrame: chosen.pressFrame });
    }
    for (const c of cands) if (c !== chosen) drop(c, getInteraction(c.id).buffer > 0 ? "conflict" : "busy");
  } else {
    if (s.buffered) cands.push({ id: s.buffered.interaction, pressFrame: s.buffered.frame, shrink: -1, buffered: true });
    s.buffered = null;
    const ok: Candidate[] = [];
    const failed = new Map<Candidate, DropReason>();
    for (const c of cands) {
      const def = getInteraction(c.id);
      let why: DropReason | null = null;
      if (t < (s.readyAt[c.id] ?? 0)) why = "cooldown";
      else if (def.charges && (s.charges[c.id]?.count ?? 0) <= 0) why = "noCharge";
      else if (def.cost && (s.resources[def.cost.resource] ?? 0) < def.cost.amount) why = "noResource";
      if (why) failed.set(c, why); else ok.push(c);
    }
    let chosen: Candidate | null = null;
    for (const c of ok) if (!chosen || better(c, chosen)) chosen = c;
    for (const c of cands) {
      if (c !== chosen) drop(c, failed.get(c) ?? "conflict");
    }
    if (chosen) {
      const def = getInteraction(chosen.id);
      if (def.charges) {
        const ch = s.charges[def.id]!;
        ch.count -= 1;
        if (def.charges.mode === "sequential") { if (ch.pending.length === 0) ch.pending = [t + def.charges.recharge]; }
        else ch.pending.push(t + def.charges.recharge);
      }
      if (def.cost) s.resources[def.cost.resource] = clampRes(def.cost.resource, s.resources[def.cost.resource]! - def.cost.amount);
      s.readyAt[def.id] = t + def.cooldown;
      const windows = buildWindows(def, t + def.startup, chosen.buffered ? Infinity : chosen.shrink);
      const activeEnd = windows.length ? windows[windows.length - 1]!.to : t + def.startup;
      const action: ActionState = {
        interaction: def.id, start: t, buffered: chosen.buffered, shrink: chosen.buffered ? -1 : chosen.shrink,
        windows, activeEnd, recoveryEnd: null, catches: 0,
      };
      s.action = action;
      events.push({ frame: t, type: "accept", interaction: def.id, pressFrame: chosen.pressFrame, buffered: chosen.buffered, shrink: action.shrink, windows: windows.map((w) => ({ ...w })) });
      if (def.onAccept) applyOutcome(def.onAccept, 0);
    }
  }

  // 4. attacks
  for (const a of input.attacks) s.pending.push({ ...a, tags: a.tags.slice() });
  const key = (a: AttackEvent) => Math.max(t, a.frame + config.inputOffset);
  // Array.prototype.sort is stable, so equal resolve frames keep arrival order.
  s.pending.sort((a, b) => key(a) - key(b));
  while (s.pending.length > 0 && key(s.pending[0]!) <= t) {
    if (s.defeated) { s.pending = []; break; }
    const atk = s.pending.shift()!;
    const dmg = atk.damage ?? 1;
    const act = s.action;
    let handled = false;
    if (act && t < act.activeEnd) {
      const def = getInteraction(act.interaction);
      const w = act.windows.find((x) => x.from <= t && t < x.to);
      if (w && (def.maxCatches === 0 || act.catches < def.maxCatches)) {
        const row = def.table.find((r) => r.tag === null || atk.tags.includes(r.tag));
        const out = row?.cells[w.id] ?? null;
        if (out) {
          handled = true;
          events.push({ frame: t, type: "resolve", attack: atk.id, impactFrame: atk.frame, via: "interaction", interaction: def.id, window: w.id, outcome: out });
          applyOutcome(out, dmg);
          if (s.action === act) {
            act.catches += 1;
            if (def.maxCatches > 0 && act.catches >= def.maxCatches) act.activeEnd = t + 1;
          }
        }
      }
    }
    if (handled) continue;
    if ((s.statuses.invulnerable ?? 0) > t) {
      events.push({ frame: t, type: "resolve", attack: atk.id, impactFrame: atk.frame, via: "invulnerable", outcome: null });
    } else {
      events.push({ frame: t, type: "resolve", attack: atk.id, impactFrame: atk.frame, via: "hit", outcome: config.hitOutcome });
      applyOutcome(config.hitOutcome, dmg);
    }
  }

  s.frame = t + 1;
  return { state: s, events };
}

/** Snapshot of a state right after frame `state.frame - 1` was processed. */
export function traceFrame(config: TimingConfig, state: TimingState): FrameTrace {
  const t = state.frame - 1;
  const a = state.action;
  const stunned = state.stunUntil > t;
  let phase: FrameTrace["phase"];
  if (a) {
    const startup = config.interactions.find((i) => i.id === a.interaction)?.startup ?? 0;
    phase = a.recoveryEnd !== null ? "recovery" : t < a.start + startup ? "startup" : "active";
  } else {
    phase = stunned ? "stun" : "idle";
  }
  const tr: FrameTrace = {
    frame: t,
    phase,
    invulnerable: (state.statuses.invulnerable ?? 0) > t,
    stunned,
    charges: {},
    resources: { ...state.resources },
  };
  if (a) {
    tr.interaction = a.interaction;
    const w = a.recoveryEnd === null && t < a.activeEnd ? a.windows.find((x) => x.from <= t && t < x.to) : undefined;
    if (w) tr.window = w.id;
  }
  for (const k of Object.keys(state.charges)) tr.charges[k] = state.charges[k]!.count;
  return tr;
}

export function runTiming(config: TimingConfig, script: TimingScript): TimingRun;
export function runTiming(config: TimingConfig, script: TimingScript, opts: { trace: true }): TimingRun & { trace: FrameTrace[] };
export function runTiming(config: TimingConfig, script: TimingScript, opts?: { trace?: boolean }): TimingRun {
  let state = createTimingState(config);
  const events: TimingEvent[] = [];
  const trace: FrameTrace[] = [];
  for (let t = 0; t < script.frames; t++) {
    const input: FrameInput = {
      presses: script.presses.filter((p) => p.frame === t).map((p) => p.interaction),
      attacks: script.attacks.filter((a) => a.frame === t),
    };
    const r = stepTiming(config, state, input);
    state = r.state;
    events.push(...r.events);
    if (opts?.trace) trace.push(traceFrame(config, state));
  }
  return opts?.trace ? { events, final: state, trace } : { events, final: state };
}
