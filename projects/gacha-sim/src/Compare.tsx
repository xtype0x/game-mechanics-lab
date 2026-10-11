import { useMemo } from "react";
import { Card, fmt, pct, twd } from "./ui";
import { analyze, nextId, normalize, type SimState } from "./state";

/** Same budget, wallet and packs for every saved model, so the rules are the only difference. */
export function Compare({ s, set }: { s: SimState; set: (fn: (x: SimState) => void) => void }) {
  const rows = useMemo(() => {
    const entries = [{ id: "current", name: `${s.model.name}（目前）`, model: s.model, target: s.target, start: s.start }, ...s.compare];
    return entries.map((e) => ({ e, a: analyze(normalize({ ...s, model: e.model, target: e.target, start: e.start })) }));
  }, [s]);
  const add = () => set((x) => {
    x.compare.push({ id: nextId("c", x.compare.map((c) => c.id)), name: x.model.name, model: structuredClone(x.model), target: structuredClone(x.target), start: structuredClone(x.start) });
  });
  return (
    <Card title="比較" actions={<button className="btn" onClick={add}>＋ 把目前模型加入比較</button>}>
      <p className="hint">用相同的預算與儲值方案比較不同規則。每列的目標是加入當時設定的目標。</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>模型</th><th className="r">平均抽數</th><th className="r">中位數</th><th className="r">P90</th><th className="r">保證上限</th><th className="r">平均花費</th><th className="r">預算內達成</th><th /></tr></thead>
          <tbody>
            {rows.map(({ e, a }) => (
              <tr key={e.id} className={e.id === "current" ? "current" : ""}>
                <td>{e.id === "current" ? e.name : <input aria-label="比較名稱" value={e.name} onChange={(ev) => set((x) => { const c = x.compare.find((y) => y.id === e.id); if (c) c.name = ev.target.value; })} />}</td>
                {a.summary && a.spend ? (
                  <>
                    <td className="r mono">{fmt(a.summary.mean, 1)}</td>
                    <td className="r mono">{a.summary.percentiles.p50}</td>
                    <td className="r mono">{a.summary.percentiles.p90}</td>
                    <td className="r mono">{a.worst ?? "無"}</td>
                    <td className="r mono">{twd(a.spend.mean)}</td>
                    <td className="r mono">{pct(a.budgetChance ?? 0, 1)}</td>
                  </>
                ) : <td colSpan={6} className="issue error">{a.errors[0]?.message ?? a.error}</td>}
                <td className="r">{e.id !== "current" && <button className="btn tiny ghost" aria-label="移除比較" onClick={() => set((x) => { x.compare = x.compare.filter((c) => c.id !== e.id); })}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
