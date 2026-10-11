/**
 * Built-in timing configs (docs/spec/timing.md §9). Parry and dodge are ordinary interaction data here.
 */
import { c, op, r } from "../expr";
import type { InteractionDef, OutcomeDef, ResultRow, TimingConfig, WindowDef } from "./types";

const dmg = r("attack.damage");

interface Tuning {
  /** Strict "perfect" window and normal window lengths. */
  parry: { startup: number; perfect: number; normal: number; successRecovery: number; whiffRecovery: number; buffer: number; spam?: InteractionDef["spam"] };
  dodge: { startup: number; perfect: number; normal: number; whiffRecovery: number; buffer: number; charges: NonNullable<InteractionDef["charges"]> };
  /** Fraction of the attack's damage a normal parry lets through. */
  chip: number;
  slow: { scale: number; frames: number };
  /** Witch Time style: a perfect dodge on the first catch also refunds a dodge charge. */
  refundCharge?: boolean;
}

function baseOutcomes(t: Tuning): OutcomeDef[] {
  const firstCatch = op("eq", r("catch.index"), c(0));
  return [
    {
      id: "hit", name: "受傷", kind: "fail",
      effects: [
        { type: "damage", amount: dmg },
        { type: "invulnerable", frames: c(60) },
        { type: "stun", frames: c(20) },
        { type: "cue", cue: "anim:hurt" },
      ],
    },
    {
      id: "perfectParry", name: "完美格擋", kind: "perfect",
      effects: [
        { type: "addResource", resource: "gauge", amount: c(25) },
        { type: "hitstop", frames: c(6) },
        { type: "cue", cue: "reflect" },
        { type: "cue", cue: "attackerStagger" },
      ],
    },
    {
      id: "parry", name: "格擋", kind: "success",
      effects: [
        { type: "addResource", resource: "gauge", amount: c(5) },
        { type: "hitstop", frames: c(3) },
        ...(t.chip > 0 ? [{ type: "damage" as const, amount: op("mul", dmg, c(t.chip)) }] : []),
      ],
    },
    {
      id: "guardBroken", name: "破防", kind: "fail",
      effects: [
        { type: "damage", amount: dmg },
        { type: "invulnerable", frames: c(60) },
        { type: "stun", frames: c(20) },
        { type: "cue", cue: "anim:guardBroken" },
      ],
    },
    { id: "whiffParry", name: "格擋落空", kind: "fail", effects: [{ type: "cue", cue: "anim:whiff" }] },
    {
      id: "perfectDodge", name: "完美閃避", kind: "perfect",
      effects: [
        { type: "addResource", resource: "gauge", amount: c(20), when: firstCatch },
        { type: "timeScale", scale: c(t.slow.scale), frames: c(t.slow.frames), when: firstCatch },
        ...(t.refundCharge ? [{ type: "restoreCharge" as const, interaction: "dodge", amount: c(1), when: firstCatch }] : []),
        { type: "cue", cue: "vfx:perfectDodge", when: firstCatch },
        { type: "cue", cue: "pass" },
      ],
    },
    { id: "dodge", name: "閃避", kind: "success", effects: [{ type: "cue", cue: "vfx:dodge" }, { type: "cue", cue: "pass" }] },
    {
      id: "skillOn", name: "技能發動", kind: "success",
      effects: [
        { type: "invulnerable", frames: c(240) },
        { type: "cue", cue: "vfx:skill" },
      ],
    },
  ];
}

function parryInteraction(t: Tuning["parry"]): InteractionDef {
  const table: ResultRow[] = [
    { tag: "unblockable", cells: { perfect: "guardBroken", normal: "guardBroken" } },
    { tag: null, cells: { perfect: "perfectParry", normal: "parry" } },
  ];
  return {
    id: "parry", name: "格擋", key: "KeyJ", priority: 1,
    startup: t.startup,
    windows: [
      { id: "perfect", name: "完美", frames: t.perfect, strict: true },
      { id: "normal", name: "普通", frames: t.normal },
    ],
    successRecovery: t.successRecovery, whiffRecovery: t.whiffRecovery,
    maxCatches: 1, table, whiffOutcome: "whiffParry", cooldown: 0, buffer: t.buffer,
    ...(t.spam ? { spam: t.spam } : {}),
  };
}

function dodgeInteraction(t: Tuning["dodge"]): InteractionDef {
  return {
    id: "dodge", name: "閃避", key: "KeyK", priority: 2,
    startup: t.startup,
    windows: [
      { id: "perfect", name: "完美", frames: t.perfect, strict: true },
      { id: "normal", name: "普通", frames: t.normal },
    ],
    successRecovery: t.whiffRecovery, whiffRecovery: t.whiffRecovery,
    maxCatches: 0,
    table: [{ tag: null, cells: { perfect: "perfectDodge", normal: "dodge" } }],
    cooldown: 0, charges: t.charges, buffer: t.buffer,
  };
}

const skillInteraction = (): InteractionDef => ({
  id: "skill", name: "技能", key: "KeyL", priority: 0,
  startup: 0, windows: [], successRecovery: 10, whiffRecovery: 0, maxCatches: 0, table: [],
  onAccept: "skillOn", cooldown: 0, cost: { resource: "gauge", amount: 100 }, buffer: 0,
});

function preset(id: string, name: string, description: string, t: Tuning, extraOutcomes: OutcomeDef[] = [], extra: InteractionDef[] = []): TimingConfig {
  return {
    version: 1, id, name, description, fps: 60, inputOffset: 0,
    tags: [
      { id: "bullet", name: "子彈", color: "#f59e0b" },
      { id: "unblockable", name: "不可格擋", color: "#ef4444" },
      { id: "thrust", name: "突刺", color: "#a855f7" },
      { id: "sweep", name: "掃腿", color: "#0ea5e9" },
      { id: "energy", name: "能量彈", color: "#22c55e" },
    ],
    resources: [
      { id: "hp", name: "生命", max: 3, initial: 3 },
      { id: "gauge", name: "技能量表", max: 100, initial: 0 },
    ],
    statuses: [{ id: "counter", name: "反擊窗" }],
    outcomes: [...baseOutcomes(t), ...extraOutcomes],
    interactions: [skillInteraction(), parryInteraction(t.parry), dodgeInteraction(t.dodge), ...extra],
    hitOutcome: "hit",
    healthResource: "hp",
  };
}

const lenient = preset(
  "lenient", "寬鬆", "判定窗寬、沒有連打懲罰，適合初次體驗。",
  {
    parry: { startup: 2, perfect: 8, normal: 14, successRecovery: 8, whiffRecovery: 20, buffer: 6 },
    dodge: { startup: 1, perfect: 8, normal: 14, whiffRecovery: 10, buffer: 6, charges: { max: 2, recharge: 180, mode: "sequential" } },
    chip: 0, slow: { scale: 0.5, frames: 20 },
  },
);

const souls = preset(
  "souls", "魂系", "格擋完美窗口短，普通格擋會被削血；連打會縮短完美窗口並鎖定。",
  {
    parry: {
      startup: 2, perfect: 4, normal: 8, successRecovery: 10, whiffRecovery: 28, buffer: 3,
      spam: { withinFrames: 20, scope: "self", shrinkPerPress: 2, maxShrink: 4, lockoutAfter: 3, lockoutFrames: 30 },
    },
    dodge: { startup: 2, perfect: 4, normal: 12, whiffRecovery: 10, buffer: 3, charges: { max: 2, recharge: 180, mode: "sequential" } },
    chip: 0.25, slow: { scale: 0.6, frames: 12 },
  },
);

const sekiro = preset(
  "sekiro", "隻狼風", "完美格擋極短（3 幀），連打懲罰很重；以格擋為核心。",
  {
    parry: {
      startup: 2, perfect: 3, normal: 6, successRecovery: 6, whiffRecovery: 24, buffer: 2,
      spam: { withinFrames: 30, scope: "all", shrinkPerPress: 3, maxShrink: 3, lockoutAfter: 3, lockoutFrames: 40 },
    },
    dodge: { startup: 2, perfect: 3, normal: 10, whiffRecovery: 12, buffer: 2, charges: { max: 2, recharge: 150, mode: "sequential" } },
    chip: 0, slow: { scale: 0.6, frames: 10 },
  },
);

const witch = preset(
  "witch", "魔女時間", "以閃避為主：完美閃避觸發長時間慢動作並回復一次閃避充能；格擋較難。",
  {
    parry: {
      startup: 2, perfect: 2, normal: 6, successRecovery: 10, whiffRecovery: 30, buffer: 2,
      spam: { withinFrames: 20, scope: "self", shrinkPerPress: 1, maxShrink: 2, lockoutAfter: 4, lockoutFrames: 30 },
    },
    dodge: { startup: 1, perfect: 6, normal: 14, whiffRecovery: 10, buffer: 4, charges: { max: 3, recharge: 120, mode: "parallel" } },
    chip: 0, slow: { scale: 0.3, frames: 45 }, refundCharge: true,
  },
);

function showcase(): TimingConfig {
  const cfg = preset(
    "showcase", "互動展示", "示範自訂互動：看破（只對突刺）、跳躍（只對掃腿）、吸收（只對能量彈）。",
    {
      parry: {
        startup: 2, perfect: 4, normal: 8, successRecovery: 10, whiffRecovery: 28, buffer: 3,
        spam: { withinFrames: 20, scope: "self", shrinkPerPress: 2, maxShrink: 4, lockoutAfter: 3, lockoutFrames: 30 },
      },
      dodge: { startup: 2, perfect: 4, normal: 12, whiffRecovery: 10, buffer: 3, charges: { max: 2, recharge: 180, mode: "sequential" } },
      chip: 0, slow: { scale: 0.5, frames: 20 },
    },
    [
      {
        id: "mikiriOk", name: "看破", kind: "perfect",
        effects: [
          { type: "cue", cue: "attackerStagger" },
          { type: "addResource", resource: "gauge", amount: c(40) },
          { type: "status", status: "counter", frames: c(60) },
        ],
      },
      { id: "jumpOver", name: "跳過", kind: "success", effects: [{ type: "cue", cue: "vfx:jump" }, { type: "cue", cue: "pass" }] },
      {
        id: "absorbPerfect", name: "完美吸收", kind: "perfect",
        effects: [{ type: "addResource", resource: "gauge", amount: c(30) }, { type: "cue", cue: "vfx:absorb" }],
      },
      { id: "absorbNormal", name: "吸收", kind: "neutral", effects: [{ type: "damage", amount: op("mul", dmg, c(0.5)) }, { type: "cue", cue: "vfx:absorb" }] },
    ],
    [
      {
        id: "mikiri", name: "看破", key: "KeyU", priority: 3, startup: 1,
        windows: [{ id: "perfect", name: "看破", frames: 8 }] as WindowDef[],
        successRecovery: 6, whiffRecovery: 30, maxCatches: 1,
        table: [{ tag: "thrust", cells: { perfect: "mikiriOk" } }, { tag: null, cells: { perfect: null } }],
        whiffOutcome: "whiffParry", cooldown: 0, buffer: 0,
      },
      {
        id: "jump", name: "跳躍", key: "KeyI", priority: 3, startup: 2,
        windows: [{ id: "air", name: "騰空", frames: 14 }],
        successRecovery: 10, whiffRecovery: 18, maxCatches: 0,
        table: [{ tag: "sweep", cells: { air: "jumpOver" } }, { tag: null, cells: { air: null } }],
        cooldown: 0, buffer: 0,
      },
      {
        id: "absorb", name: "吸收", key: "KeyO", priority: 3, startup: 1,
        windows: [{ id: "perfect", name: "完美", frames: 4, strict: true }, { id: "normal", name: "普通", frames: 8 }],
        successRecovery: 12, whiffRecovery: 24, maxCatches: 1,
        table: [{ tag: "energy", cells: { perfect: "absorbPerfect", normal: "absorbNormal" } }, { tag: null, cells: { perfect: null, normal: null } }],
        cooldown: 0, buffer: 0,
      },
    ],
  );
  return cfg;
}

export const TIMING_PRESETS: TimingConfig[] = [lenient, souls, sekiro, witch, showcase()];
