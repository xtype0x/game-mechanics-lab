import { aggregate, batchSeed, battleSetupOf, simulateOne, validateBattle, type BatchStats, type BattleRules, type EncounterPreset, type Project, type RoundingMode } from "@gml/core";
import { useState } from "react";
import { elementLabel, ErrorBox, ExprField, Field, fmt, IssueList, nextId, NumberField, pct, Section, useBattleSetup } from "@gml/ui";
import type { Updater } from "../../useProject";
import { useFocus } from "../../nav";

const QUICK_RUNS = 100;

export function EncounterEditor({ project, update }: { project: Project; update: Updater }) {
  const list = project.battle.encounters;
  const [selected, setSelected] = useState(list[0]?.id ?? "");
  const enc = list.find((e) => e.id === selected);
  useFocus(["enemy.encounter"], (f) => { if (f.encounterId && list.some((e) => e.id === f.encounterId)) setSelected(f.encounterId); });
  const enemies = project.battle.units.filter((u) => u.team === "enemy");
  const [addId, setAddId] = useState(enemies[0]?.id ?? "");
  const { issues } = useBattleSetup(project);
  const edit = (fn: (e: EncounterPreset) => void) => update((p) => { const e = p.battle.encounters.find((x) => x.id === selected); if (e) fn(e); });
  const editRules = (fn: (r: BattleRules) => void) => update((p) => fn(p.battle.rules));
  const nameOf = (id: string) => project.battle.units.find((u) => u.id === id)?.name ?? id;
  const r = project.battle.rules;
  const loaded = enc && project.battle.encounter.enemies.join() === enc.enemies.join();

  return (
    <div className="tool-layout">
      <div className="workspace">
        <Section
          title="戰鬥清單"
          actions={
            <button className="btn small" onClick={() => {
              const id = nextId("enc", list.map((e) => e.id));
              update((p) => { p.battle.encounters.push({ id, name: "新戰鬥", enemies: [enemies[0]?.id ?? ""].filter(Boolean) }); });
              setSelected(id);
            }}>＋ 新增戰鬥</button>
          }
        >
          <div className="unit-list">
            {list.map((e) => (
              <button key={e.id} className={`unit-item ${e.id === selected ? "on" : ""}`} onClick={() => setSelected(e.id)}>
                <strong>{e.name}</strong>
                <span className="muted small">{e.enemies.map(nameOf).join("、")}</span>
              </button>
            ))}
          </div>
        </Section>

        {enc && (
          <Section
            title={`編輯：${enc.name}`}
            actions={
              <>
                <button className="btn small primary" disabled={loaded} onClick={() => update((p) => { p.battle.encounter.enemies = [...enc.enemies]; })}>{loaded ? "已載入模擬器" : "載入到模擬器"}</button>
                <button className="btn small ghost" disabled={list.length <= 1} onClick={() => { if (confirm(`刪除「${enc.name}」？`)) { update((p) => { p.battle.encounters = p.battle.encounters.filter((x) => x.id !== enc.id); }); setSelected(list.find((x) => x.id !== enc.id)?.id ?? ""); } }}>刪除</button>
              </>
            }
          >
            <div className="grid-fields">
              <Field label="名稱"><input value={enc.name} onChange={(e) => edit((x) => { x.name = e.target.value; })} /></Field>
              <Field label="說明"><input value={enc.description ?? ""} onChange={(e) => edit((x) => { x.description = e.target.value; })} /></Field>
            </div>
            <h4 className="subhead">敵人站位（由左到右；擴散攻擊會波及相鄰位置）</h4>
            <div className="lineup">
              {enc.enemies.map((id, i) => (
                <div key={i} className="lineup-slot">
                  <strong>{nameOf(id)}</strong>
                  <span className="muted small">位置 {i + 1}</span>
                  <div className="row-gap">
                    <button className="btn icon" aria-label="左移" disabled={i === 0} onClick={() => edit((x) => { const [m] = x.enemies.splice(i, 1); x.enemies.splice(i - 1, 0, m!); })}>←</button>
                    <button className="btn icon" aria-label="右移" disabled={i === enc.enemies.length - 1} onClick={() => edit((x) => { const [m] = x.enemies.splice(i, 1); x.enemies.splice(i + 1, 0, m!); })}>→</button>
                    <button className="btn icon" aria-label="移除" disabled={enc.enemies.length <= 1} onClick={() => edit((x) => { x.enemies.splice(i, 1); })}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="row-gap">
              <select aria-label="加入敵人" value={addId} onChange={(e) => setAddId(e.target.value)}>
                {enemies.map((u) => <option key={u.id} value={u.id}>{u.name}（{u.role}）</option>)}
              </select>
              <button className="btn small" disabled={enc.enemies.length >= 5} onClick={() => edit((x) => { x.enemies.push(addId); })}>＋ 加入</button>
              {enc.enemies.length >= 5 && <span className="muted small">最多 5 名敵人</span>}
            </div>
            <IssueList issues={issues.filter((x) => x.where.encounterId === enc.id)} />
          </Section>
        )}

        <Section title="戰鬥規則（所有戰鬥共用）">
          <div className="grid-fields">
            <Field label="最大輪數（超過判定超時）"><NumberField value={r.maxCycles} min={1} onChange={(v) => v >= 1 && editRules((x) => { x.maxCycles = Math.round(v); })} /></Field>
            <Field label="初始技能點"><NumberField value={r.spStart} min={0} onChange={(v) => editRules((x) => { x.spStart = Math.max(0, Math.round(v)); })} /></Field>
            <Field label="技能點上限"><NumberField value={r.spMax} min={1} onChange={(v) => v >= 1 && editRules((x) => { x.spMax = Math.round(v); })} /></Field>
            <Field label="受擊獲得能量"><NumberField value={r.energyOnHitTaken} min={0} onChange={(v) => editRules((x) => { x.energyOnHitTaken = Math.max(0, v); })} /></Field>
            <Field label="擊倒獲得能量"><NumberField value={r.energyOnKill} min={0} onChange={(v) => editRules((x) => { x.energyOnKill = Math.max(0, v); })} /></Field>
            <Field label="擊破延後行動"><NumberField percent value={r.breakDelay} min={0} onChange={(v) => editRules((x) => { x.breakDelay = Math.max(0, v); })} /></Field>
            <Field label="數值取整">
              <select value={r.rounding} onChange={(e) => editRules((x) => { x.rounding = e.target.value as RoundingMode; })}>
                <option value="floor">無條件捨去</option><option value="round">四捨五入</option><option value="ceil">無條件進位</option><option value="none">不取整</option>
              </select>
            </Field>
          </div>
          <Field label="擊破傷害公式（可用 attacker.* 與 defender.*，含 defender.maxToughness、attacker.breakEffect）">
            <ExprField value={r.breakDamage} onChange={(e) => e && editRules((x) => { x.breakDamage = e; })} />
          </Field>
          <IssueList issues={issues.filter((x) => x.where.field === "rules")} />
        </Section>
      </div>

      <div className="results">
        <div className="results-head"><h2>戰鬥預覽</h2></div>
        {enc && <Preview project={project} enc={enc} />}
      </div>
    </div>
  );
}

function Preview({ project, enc }: { project: Project; enc: EncounterPreset }) {
  const [stats, setStats] = useState<{ key: string; s: BatchStats } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const team = project.battle.encounter.allies.map((id) => project.battle.units.find((u) => u.id === id)!).filter(Boolean);
  const foes = enc.enemies.map((id) => project.battle.units.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  const key = JSON.stringify([enc.enemies, project.battle, project.damage.config, project.seed]);

  const run = () => {
    const p: Project = { ...project, battle: { ...project.battle, encounter: { ...project.battle.encounter, enemies: [...enc.enemies] } } };
    try {
      const setup = battleSetupOf(p);
      const errors = validateBattle(p.battle, setup.damage).filter((i) => i.level === "error");
      if (errors.length) throw new Error(errors[0]!.message);
      setStats({ key, s: aggregate(Array.from({ length: QUICK_RUNS }, (_, i) => simulateOne(setup, p.battle.policy, batchSeed(project.seed, i)))) });
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
  };
  const fresh = stats?.key === key ? stats.s : null;

  return (
    <>
      <div className="cards">
        <div className="card"><span>敵人數</span><strong>{foes.length}</strong></div>
        <div className="card"><span>總生命值</span><strong>{fmt(foes.reduce((a, u) => a + (u.stats.hp ?? 0), 0), 0)}</strong></div>
        <div className="card"><span>總韌性</span><strong>{fmt(foes.reduce((a, u) => a + (u.stats.toughness ?? 0), 0), 0)}</strong></div>
      </div>
      <Section title="弱點覆蓋（目前隊伍）">
        <table className="table">
          <thead><tr><th>敵人</th><th>弱點</th><th>可削韌的隊員</th></tr></thead>
          <tbody>
            {foes.map((u, i) => {
              const breakers = team.filter((a) => u.weaknesses.includes(a.element));
              return (
                <tr key={i}>
                  <td>{u.name}</td>
                  <td>{u.weaknesses.length ? u.weaknesses.map(elementLabel).join(" ") : <span className="muted">無</span>}</td>
                  <td className={breakers.length || !(u.stats.toughness! > 0) ? "" : "down"}>{u.stats.toughness! > 0 ? (breakers.length ? breakers.map((a) => a.name).join("、") : "沒有人能擊破") : <span className="muted">無韌性</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <Section title={`快速試跑（${QUICK_RUNS} 場）`} actions={<button className="btn small primary" onClick={run}>試跑</button>}>
        {err && <ErrorBox error={err} />}
        {fresh ? (
          <div className="cards">
            <div className="card accent"><span>勝率</span><strong>{pct(fresh.winRate, 0)}</strong></div>
            <div className="card"><span>平均輪數</span><strong>{fresh.cycles ? fmt(fresh.cycles.mean, 1) : "—"}</strong></div>
            <div className="card"><span>超時</span><strong>{pct(fresh.timeoutRate, 0)}</strong></div>
          </div>
        ) : <p className="muted small">用目前隊伍與自動策略打這場戰鬥 {QUICK_RUNS} 次。更詳細的統計請用「批量戰鬥模擬」。</p>}
      </Section>
    </>
  );
}
