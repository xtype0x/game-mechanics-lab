import { Gacha } from "@ggt/core";
import { useState } from "react";
import { LineChart } from "./charts";
import { Card, Fold, fmt, pct } from "./ui";
import type { Analysis, SimState } from "./state";

const VAR_LABEL = (m: Gacha.GachaModel, v: string) => {
  const [kind, id] = v.split(":") as [string, string];
  const t = m.tiers.find((x) => x.id === id)?.name ?? id;
  return { since: `${t} 保底計數`, guar: `${t} 大保底旗標`, miss: `${t} 累計保底計數`, fate: `${t} 定軌點數`, pts: "兌換點數", batch: "連抽位置" }[kind] ?? v;
};

export function MathPanel({ s, a }: { s: SimState; a: Analysis }) {
  const [mc, setMc] = useState<{ key: string; r: Gacha.MonteCarlo } | null>(null);
  if (!a.dist || !a.summary) return null;
  const { dist, summary: sm } = a;
  const m = s.model;
  const relevant = Gacha.relevantVars(m, s.target);
  const key = JSON.stringify([m, s.target, s.start]);
  const freshMc = mc && mc.key === key ? mc.r : null;
  const runMc = () => setMc({ key, r: Gacha.simulateTarget(m, s.target, 5000, Date.now() >>> 0, { start: s.start }) });
  const within = freshMc ? Array.from(freshMc.pulls).filter((n) => n <= (a.budgetPulls ?? 0)).length : 0;
  const ci = freshMc ? Gacha.wilson(within, freshMc.runs) : null;

  return (
    <Card title="進階：數學與統計" className="math">
      <p className="hint">給想深入研究的人。以下都是<b>精確計算</b>（把保底狀態寫成馬可夫鏈逐抽推算），不是抽樣；最後一項用抽樣交叉驗證。</p>

      <Fold title="分布與動差" summary={`平均 ${fmt(sm.mean, 2)}，標準差 ${fmt(sm.sd, 2)}`}>
        <table className="table compact">
          <tbody>
            <tr><td>期望值 E[N] ＝ Σ n·P(N = n)</td><td className="r mono">{fmt(sm.mean, 4)}</td></tr>
            <tr><td>變異數 Var[N] ＝ Σ (n − E[N])²·P(N = n)</td><td className="r mono">{fmt(sm.variance, 2)}</td></tr>
            <tr><td>標準差</td><td className="r mono">{fmt(sm.sd, 3)}</td></tr>
            <tr><td>偏態（&gt;0 表示右尾較長：少數人要抽特別多）</td><td className="r mono">{fmt(sm.skewness, 3)}</td></tr>
            {(["p10", "p25", "p50", "p75", "p90", "p95", "p99"] as const).map((q) => <tr key={q}><td>{q.toUpperCase()}：最小的 n 使 P(N ≤ n) ≥ {q.slice(1)}%</td><td className="r mono">{sm.percentiles[q]}</td></tr>)}
            <tr><td>保證上限（狀態圖上到完成的最長路徑）</td><td className="r mono">{a.worst ?? "無（存在不會完成的循環）"}</td></tr>
          </tbody>
        </table>
        {dist.tail > 1e-12 && <p className="hint">計算到第 {dist.pmf.length - 1} 抽時仍有 {pct(dist.tail, 4)} 未完成（沒有保證上限時的截斷）。</p>}
      </Fold>

      <Fold title="條件機率（哪一抽最容易出）" summary={`最高 ${pct(Math.max(...sm.hazard), 1)}`}>
        <p>h(n) ＝ P(N = n ∣ N ≥ n)：前面都沒完成的前提下，第 n 抽完成的機率。軟保底、硬保底、累計保底都會在這張圖上變成明顯的上升或尖峰。</p>
        <LineChart series={[{ label: "條件機率 h(n)", points: sm.hazard }]} xLabel="抽數" />
      </Fold>

      <Fold title="馬可夫鏈模型" summary={`${fmt(dist.states, 0)} 個狀態`}>
        <p>每一抽的機率只取決於目前的計數器（保底計數、大保底旗標、點數…），所以整個卡池是一條有限狀態的馬可夫鏈。這個目標用到的計數器：</p>
        <ul>
          {relevant.length ? relevant.map((v) => <li key={v}>{VAR_LABEL(m, v)}（{Gacha.varDomain(m, v)} 種值）</li>) : <li>沒有（每抽機率固定，結果是幾何分布）</li>}
        </ul>
        <p>狀態數 ＝ 各計數器值的乘積 × 已拿到的份數（{s.target.copies}）。從起點的機率向量 π₀ 開始，每抽做一次 π<sub>n+1</sub> ＝ π<sub>n</sub>·P，完成的機率從向量中移出，記為 P(N = n)。計算到剩餘機率 ≤ 10⁻¹² 為止，耗時 {fmt(a.ms, 0)} 毫秒。</p>
        <p>和目標無關的計數器（例如較低稀有度的保底）會被消去，狀態數因此變小但結果不變。</p>
      </Fold>

      <Fold title="長期機率（含保底）" summary={a.longRun ? `${m.tiers[0]!.name} ${pct(a.longRun.tiers[0]!, 3)}` : "太多狀態"}>
        {a.longRun ? (
          <>
            <p>一直抽下去，平均每抽落在各稀有度的比例（馬可夫鏈的穩態分布，共 {fmt(a.longRun.states, 0)} 個狀態）。這就是機率公示常見的「綜合機率」。</p>
            <table className="table compact">
              <thead><tr><th>稀有度</th><th className="r">基礎機率</th><th className="r">綜合機率</th><th className="r">其中限定</th></tr></thead>
              <tbody>
                {m.tiers.map((t, i) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td className="r mono">{i === m.tiers.length - 1 ? "剩餘" : pct(t.rate, 3)}</td>
                    <td className="r mono">{pct(a.longRun!.tiers[i]!, 3)}</td>
                    <td className="r mono">{a.longRun!.featuredShare[i]! > 0 ? pct(a.longRun!.featuredShare[i]!, 1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">不含點數兌換（兌換是玩家的選擇，不是抽卡結果）。有大保底時，限定的長期比例 ＝ 1 ∕ (2 − 限定機率)。</p>
          </>
        ) : <p className="hint">{a.longRunError}。可用下方抽樣估計。</p>}
      </Fold>

      {a.budgetCopies && (a.budgetPulls ?? 0) > 0 && (
        <Fold title="預算內拿到幾個" summary={`至少一個 ${pct(1 - a.budgetCopies[0]!, 1)}`}>
          <p>用同一條馬可夫鏈跑 {a.budgetPulls} 抽（不在完成時停止），計算拿到 k 個的機率：</p>
          <table className="table compact">
            <tbody>{a.budgetCopies.map((p, k) => <tr key={k}><td>{k === a.budgetCopies!.length - 1 ? `${k} 個以上` : `${k} 個`}</td><td className="r mono">{pct(p, 2)}</td></tr>)}</tbody>
          </table>
        </Fold>
      )}

      <Fold title="抽樣驗證（蒙地卡羅）" summary={freshMc ? `平均 ${fmt(freshMc.mean, 2)}` : "未執行"}>
        <p>用真正的抽卡規則實際抽 5000 次（每次抽到完成為止），和上面的精確結果比對。</p>
        <button className="btn" onClick={runMc}>抽樣 5000 次</button>
        {freshMc && (
          <table className="table compact">
            <tbody>
              <tr><td>抽樣平均抽數（95% 信賴區間）</td><td className="r mono">{fmt(freshMc.mean, 2)}（{fmt(freshMc.meanCi[0], 2)}–{fmt(freshMc.meanCi[1], 2)}）</td></tr>
              <tr><td>精確平均</td><td className="r mono">{fmt(sm.mean, 2)}{sm.mean >= freshMc.meanCi[0] && sm.mean <= freshMc.meanCi[1] ? "（在區間內）" : "（在區間外，抽樣誤差偶爾會發生）"}</td></tr>
              {(a.budgetPulls ?? 0) > 0 && <tr><td>抽樣預算內達成（Wilson 95% 區間）</td><td className="r mono">{pct(within / freshMc.runs, 1)}（{pct(ci![0], 1)}–{pct(ci![1], 1)}）</td></tr>}
              {(a.budgetPulls ?? 0) > 0 && <tr><td>精確預算內達成</td><td className="r mono">{pct(a.budgetChance ?? 0, 1)}</td></tr>}
            </tbody>
          </table>
        )}
      </Fold>
    </Card>
  );
}
