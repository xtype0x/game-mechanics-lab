/**
 * Static checks for user-edited battle content. Errors make battles unsafe to run; warnings are suspicious
 * but legal. Messages are UI text; the `where` path lets editors highlight the offending field.
 */
import type { DamageRules } from "../damage";
import { collectRefs } from "../expr";
import type { BattleConfig } from "../project";

export interface BattleIssue {
  level: "error" | "warning";
  message: string;
  where: { unitId?: string; skillId?: string; statusId?: string; passiveId?: string; encounterId?: string; field?: string };
}

const UNIT_VARS = ["hpPct", "broken", "energy", "toughnessPct", "phase", "shield", "av", "rank"];
export const AI_SCOPE_REFS = [...UNIT_VARS.map((v) => `self.${v}`), "battle.turn", "battle.cycle", "battle.allies", "battle.foes"];
/** Passive conditions only: the trigger subject (spec §14.1). */
export const TARGET_SCOPE_REFS = ["target.exists", "target.isFoe", ...UNIT_VARS.map((v) => `target.${v}`)];

/**
 * Error text for a variable the AI/passive scope can't provide, or null (spec §6, §13.11, §14.1).
 * `target.*` exists only for passives; AI rules have no subject.
 */
export function aiRefProblem(ref: string, statusIds: Set<string>, opts: { unitIds?: Set<string>; passive?: boolean } = {}): string | null {
  if (AI_SCOPE_REFS.includes(ref)) return null;
  for (const who of ["self", "target"]) {
    if (who === "target" && !ref.startsWith("target.")) continue;
    if (who === "target" && !opts.passive) return `「${ref}」只能用在被動條件（AI 規則沒有觸發對象）`;
    if (who === "target" && TARGET_SCOPE_REFS.includes(ref)) return null;
    if (new RegExp(`^${who}\\.counter\\.[A-Za-z_]\\w*$`).test(ref)) return null;
    if (ref.startsWith(`${who}.status.`)) { const id = ref.slice(who.length + 8); return statusIds.has(id) ? null : `狀態「${id}」不存在`; }
  }
  if (ref.startsWith("battle.count.")) { const id = ref.slice(13); return !opts.unitIds || opts.unitIds.has(id) ? null : `角色「${id}」不存在`; }
  return `未定義的變數「${ref}」`;
}

export function validateBattle(cfg: BattleConfig, damage: DamageRules): BattleIssue[] {
  const out: BattleIssue[] = [];
  const err = (message: string, where: BattleIssue["where"]) => out.push({ level: "error", message, where });
  const warn = (message: string, where: BattleIssue["where"]) => out.push({ level: "warning", message, where });
  const statusIds = new Set(cfg.statuses.map((s) => s.id));
  const stepIds = new Set(damage.steps.map((s) => s.id));
  const unitIds = new Set<string>();
  const allUnitIds = new Set(cfg.units.map((u) => u.id));

  for (const u of cfg.units) {
    const w = { unitId: u.id };
    if (unitIds.has(u.id)) err(`角色 ID「${u.id}」重複`, w);
    unitIds.add(u.id);
    if (!(u.stats.hp! > 0)) err(`「${u.name}」的生命值必須大於 0`, { ...w, field: "hp" });
    if (!(u.stats.spd! > 0)) err(`「${u.name}」的速度必須大於 0`, { ...w, field: "spd" });

    const skillIds = new Set<string>();
    for (const sk of u.skills) {
      const ws = { ...w, skillId: sk.id };
      if (skillIds.has(sk.id)) err(`「${u.name}」的技能 ID「${sk.id}」重複`, ws);
      skillIds.add(sk.id);
      if (!sk.effects.length) warn(`「${u.name}・${sk.name}」沒有任何效果`, ws);
      if (sk.type === "ultimate") {
        const cost = sk.energyCost ?? u.stats.maxEnergy ?? 0;
        if (cost <= 0) warn(`「${u.name}・${sk.name}」不需要能量，每個決策點都能施放`, ws);
        else if (cost > (u.stats.maxEnergy ?? 0)) err(`「${u.name}・${sk.name}」需要 ${cost} 能量，但能量上限只有 ${u.stats.maxEnergy ?? 0}，永遠無法施放`, ws);
      }
      for (const e of sk.effects) {
        if (e.kind === "status" && !statusIds.has(e.statusId)) err(`「${u.name}・${sk.name}」使用不存在的狀態「${e.statusId}」`, ws);
        if (e.kind === "damage") {
          if (e.multiplier < 0) err(`「${u.name}・${sk.name}」的倍率不能是負數`, ws);
          if (e.hits && (e.hits.length === 0 || e.hits.some((h) => !(h >= 0)))) err(`「${u.name}・${sk.name}」的命中比例不正確`, ws);
        }
        const label = `「${u.name}・${sk.name}」`;
        if (e.kind === "summon") {
          const s = cfg.units.find((x) => x.id === e.unitId);
          if (!s) err(`${label}召喚不存在的角色「${e.unitId}」`, ws);
          else if (s.team !== u.team) err(`${label}召喚的「${s.name}」與施放者不同陣營`, ws);
          else if (s.id === u.id) warn(`${label}召喚自己的複製體，可能無限增生（受場上人數上限限制）`, ws);
          if (!(e.count >= 1)) err(`${label}的召喚數量至少為 1`, ws);
        }
        if (e.kind === "dismiss" && e.unitId !== undefined && !cfg.units.some((x) => x.id === e.unitId)) err(`${label}移除不存在的角色「${e.unitId}」`, ws);
        if (e.kind === "queueSkill") {
          const side = e.target === "enemy" || e.target === "blast" || e.target === "allEnemies" ? (u.team === "ally" ? "enemy" : "ally") : u.team;
          if (!cfg.units.some((x) => x.team === side && x.skills.some((s) => s.id === e.skillId))) warn(`${label}指定的下一個技能「${e.skillId}」不存在於任何可能的目標上，不會有效果`, ws);
          if (side === "ally") warn(`${label}指定我方的下一個技能；我方由玩家或自動策略控制，只有被支配或事件單位會使用`, ws);
        }
        if (e.kind === "counter" && !e.key.trim()) err(`${label}的計數器名稱不能是空的`, ws);
        if (e.kind === "detonate" && e.statusId !== undefined && !statusIds.has(e.statusId)) err(`${label}引爆不存在的狀態「${e.statusId}」`, ws);
        if (e.kind === "detonate" && !(e.ratio >= 0)) err(`${label}的引爆比例不能是負數`, ws);
        if (!("target" in e)) continue;
        const foeMode = e.target === "enemy" || e.target === "blast";
        if (foeMode && sk.targeting === "ally") warn(`「${u.name}・${sk.name}」選擇友方目標，但效果打向敵人；會改打第一個敵人`, ws);
        if (e.target === "ally" && sk.targeting === "enemy") warn(`「${u.name}・${sk.name}」選擇敵方目標，但效果作用於友方；會作用於自己`, ws);
      }
    }

    const usable = u.skills.filter((s) => s.type !== "ultimate" && s.type !== "followup" && s.type !== "dot");
    if (!usable.length) err(`「${u.name}」沒有可以在回合中使用的技能（普攻或戰技）`, w);
    if (u.team === "ally" && !u.skills.some((s) => s.type === "basic" || s.spDelta >= 0)) {
      warn(`「${u.name}」沒有不消耗技能點的技能，技能點用完時會無法行動`, w);
    }

    // Allies use AI rules only while charmed or as timeline events (spec §14.3, §14.4).
    const rules = u.ai ?? [];
    for (const r of rules) {
      const wr = { ...w, skillId: r.skillId, field: "ai" };
      const sk = u.skills.find((s) => s.id === r.skillId);
      if (!sk) err(`「${u.name}」的 AI 規則指向不存在的技能「${r.skillId}」`, wr);
      else if (sk.type === "followup") err(`「${u.name}」的 AI 規則不能使用追加攻擊「${sk.name}」`, wr);
      if (r.weight < 0) err(`「${u.name}」的 AI 權重不能是負數`, wr);
      if (r.when) for (const ref of collectRefs(r.when)) { const why = aiRefProblem(ref, statusIds, { unitIds: allUnitIds }); if (why) err(`「${u.name}」的 AI 條件：${why}`, wr); }
    }
    if (rules.length && rules.every((r) => r.weight <= 0)) warn(`「${u.name}」所有 AI 規則權重都是 0，會只用第一個技能`, w);
    if (u.timelineEvent) {
      if (u.passives?.some((p) => p.on === "selfHit")) warn(`「${u.name}」是事件單位，不會被攻擊，「自己受到攻擊時」被動永遠不會觸發`, w);
      if (u.phases?.length) warn(`「${u.name}」是事件單位，不會受到傷害，階段不會有作用`, { ...w, field: "phases" });
    }

    for (const [el, v] of Object.entries(u.elementRes ?? {})) if (!Number.isFinite(v)) err(`「${u.name}」的「${el}」屬性抗性不是數字`, { ...w, field: "elementRes" });
    for (const [cat, v] of Object.entries(u.statusRes ?? {})) {
      if (!Number.isFinite(v)) err(`「${u.name}」的「${cat}」狀態抵抗不是數字`, { ...w, field: "statusRes" });
      else if (!cfg.statuses.some((s) => s.category === cat)) warn(`「${u.name}」的狀態抵抗「${cat}」沒有任何狀態屬於這個分類`, { ...w, field: "statusRes" });
    }
    (u.phases ?? []).forEach((ph, i) => {
      if (ph.stats?.hp !== undefined && !(ph.stats.hp > 0)) err(`「${u.name}」第 ${i + 2} 階段的生命值必須大於 0`, { ...w, field: "phases" });
      if (ph.stats?.spd !== undefined && !(ph.stats.spd > 0)) err(`「${u.name}」第 ${i + 2} 階段的速度必須大於 0`, { ...w, field: "phases" });
    });
    if (u.boundToSummoner && !cfg.units.some((x) => x.skills.some((sk) => sk.effects.some((e) => e.kind === "summon" && e.unitId === u.id)))) warn(`「${u.name}」設定為隨召喚者消失，但沒有任何技能召喚它`, w);
    for (const p of u.passives ?? []) {
      const wp = { ...w, passiveId: p.id };
      const sk = u.skills.find((s) => s.id === p.skillId);
      if (!sk) err(`「${u.name}」的被動「${p.name}」指向不存在的技能「${p.skillId}」`, wp);
      else if (sk.type !== "followup") warn(`「${u.name}」的被動「${p.name}」使用的「${sk.name}」不是追加攻擊類型`, wp);
      if (p.limitPerTurn < 0) err(`「${u.name}」的被動「${p.name}」次數上限不能是負數`, wp);
      if (p.limitPerTurn === 0 && p.on === "selfHit") warn(`「${u.name}」的被動「${p.name}」沒有次數上限，多段攻擊可能連續觸發很多次`, wp);
      if (p.when) for (const ref of collectRefs(p.when)) { const why = aiRefProblem(ref, statusIds, { unitIds: allUnitIds, passive: true }); if (why) err(`「${u.name}」的被動條件：${why}`, wp); }
      if (p.limitPerTurn === 0 && p.on === "allyHit") warn(`「${u.name}」的被動「${p.name}」沒有次數上限，隊友每一段命中都會觸發`, wp);
      if (p.skillTypes && p.on !== "foeAction") warn(`「${u.name}」的被動「${p.name}」設定了技能類型篩選，但只有「對手行動」觸發會使用`, wp);
      if (p.on === "phaseChange" && !u.phases?.length) warn(`「${u.name}」沒有階段，被動「${p.name}」永遠不會觸發`, wp);
    }
  }

  const seenStatus = new Set<string>();
  for (const s of cfg.statuses) {
    const w = { statusId: s.id };
    if (seenStatus.has(s.id)) err(`狀態 ID「${s.id}」重複`, w);
    seenStatus.add(s.id);
    if (!(s.duration >= 0) || !Number.isInteger(s.duration)) err(`狀態「${s.name}」持續回合必須是 0（永久）或正整數`, w);
    if (s.shield && !(s.shield.multiplier >= 0 && s.shield.flat >= 0)) err(`狀態「${s.name}」的護盾數值不能是負數`, w);
    if (s.revive && !(s.revive.hpPct > 0 && s.revive.hpPct <= 1)) err(`狀態「${s.name}」的復活血量比例必須在 0 到 100% 之間`, w);
    if (s.revive && s.kind === "debuff") warn(`狀態「${s.name}」是減益但有復活效果，可能讓敵人替我方施加復活`, w);
    if (s.release && s.duration === 0 && s.dispellable === false) warn(`狀態「${s.name}」永久、不可驅散，只會在施加者倒下時解除`, w);
    if (s.charm && s.skipTurn) warn(`狀態「${s.name}」同時是無法行動與支配；無法行動優先，支配不會發生`, w);
    if (s.charm && s.kind === "buff") warn(`狀態「${s.name}」是增益但有支配效果，會被當成增益驅散與計算機率`, w);
    if (!(s.maxStacks >= 1)) err(`狀態「${s.name}」最大層數至少為 1`, w);
    const damageStats = new Set(damage.stats.map((x) => x.key));
    for (const m of s.modifiers) {
      // Conditional modifiers (spec §15.1): passive-style scope, damage calculations only.
      for (const [field, expr] of [["條件", m.when], ["倍數", m.scaleBy]] as const) {
        if (expr) for (const ref of collectRefs(expr)) { const why = aiRefProblem(ref, statusIds, { unitIds: allUnitIds, passive: true }); if (why) err(`狀態「${s.name}」修正的${field}：${why}`, w); }
      }
      if (m.scaleBy && m.op !== "add" && m.op !== "pct") err(`狀態「${s.name}」的修正倍數只能用在「加」或「百分比」`, w);
      if ((m.when || m.scaleBy) && m.target.startsWith("stat:") && !damageStats.has(m.target.slice(5))) warn(`狀態「${s.name}」的條件式修正只在傷害計算中生效；「${m.target.slice(5)}」不是傷害公式的數值，不會有效果`, w);
      if (m.target.startsWith("step:") && !stepIds.has(m.target.slice(5))) warn(`狀態「${s.name}」修正的乘區「${m.target.slice(5)}」不在目前的傷害公式中，不會有效果`, w);
      else if (!m.target.startsWith("step:") && !m.target.startsWith("stat:")) err(`狀態「${s.name}」的修正對象「${m.target}」格式錯誤`, w);
    }
  }

  const checkTeam = (ids: string[], team: "ally" | "enemy", where: BattleIssue["where"], label: string) => {
    for (const id of ids) {
      const u = cfg.units.find((x) => x.id === id);
      if (!u) err(`${label}使用不存在的角色「${id}」`, where);
      else if (u.team !== team) err(`${label}的「${u.name}」不是${team === "ally" ? "我方" : "敵方"}`, where);
    }
  };
  checkTeam(cfg.encounter.allies, "ally", { field: "encounter" }, "目前隊伍");
  checkTeam(cfg.encounter.enemies, "enemy", { field: "encounter" }, "目前戰鬥");
  if (cfg.encounter.allies.length < 1 || cfg.encounter.allies.length > 4) err("我方隊伍需要 1 到 4 人", { field: "encounter" });
  if (cfg.encounter.enemies.length < 1) err("至少需要一名敵人", { field: "encounter" });
  for (const e of cfg.encounters ?? []) {
    checkTeam(e.enemies, "enemy", { encounterId: e.id }, `戰鬥「${e.name}」`);
    if (!e.enemies.length) err(`戰鬥「${e.name}」沒有敵人`, { encounterId: e.id });
  }

  const r = cfg.rules;
  if (!(r.avBase > 0) || !(r.firstCycleAv > 0) || !(r.cycleAv > 0)) err("行動值與輪次長度必須大於 0", { field: "rules" });
  if (!(r.maxCycles >= 1)) err("最大輪數至少為 1", { field: "rules" });
  if (r.maxFieldUnits !== undefined && !(r.maxFieldUnits >= 1)) err("場上人數上限至少為 1", { field: "rules" });
  if (r.spStart > r.spMax) warn("初始技能點大於上限，開場會被限制在上限", { field: "rules" });
  for (const ref of collectRefs(r.breakDamage)) {
    if (!ref.startsWith("attacker.") && !ref.startsWith("defender.")) err(`擊破傷害公式使用未定義的變數「${ref}」`, { field: "rules" });
  }
  return out;
}
