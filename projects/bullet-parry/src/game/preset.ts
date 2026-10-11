import { Timing, c } from "@gml/core";

type Cfg = Timing.TimingConfig;

export const GAME_PRESET_ID = "bullet-parry-default";

/**
 * Game-tuned default: the core "lenient" preset with a 2-charge sequential dodge (3 s each), a full-gauge skill
 * granting 4 s of invulnerability.
 */
export function bulletParryDefault(): Cfg {
  const base = Timing.TIMING_PRESETS.find((p) => p.id === "lenient");
  if (!base) throw new Error("core preset 'lenient' missing");
  const cfg = structuredClone(base);
  cfg.id = GAME_PRESET_ID;
  cfg.name = "子彈格擋（預設）";
  cfg.description = "寬鬆判定窗；閃避 2 次充能、每 3 秒回 1 次；技能耗滿量表、無敵 4 秒；完美格擋會把子彈打回去。";
  const dodge = cfg.interactions.find((i) => i.id === "dodge");
  if (dodge) dodge.charges = { max: 2, recharge: 180, mode: "sequential" };
  const skill = cfg.interactions.find((i) => i.id === "skill");
  if (skill) skill.cost = { resource: "gauge", amount: 100 };
  const colors: Record<string, string> = { parry: "#ffd45c", dodge: "#6ee7ff", skill: "#ff9de2" };
  for (const i of cfg.interactions) if (colors[i.id]) i.color = colors[i.id];
  for (const o of cfg.outcomes) {
    if (o.id === "perfectParry") for (const e of o.effects) if (e.type === "addResource") e.amount = c(30);
    if (o.id === "perfectDodge") for (const e of o.effects) if (e.type === "timeScale") e.frames = c(30);
  }
  return cfg;
}

/** Game default first, then every core preset (cloned so edits never leak back). */
export function gamePresets(): Cfg[] {
  return [bulletParryDefault(), ...Timing.TIMING_PRESETS.map((p) => structuredClone(p))];
}
