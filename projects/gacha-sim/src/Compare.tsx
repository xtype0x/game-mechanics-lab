import { tr, displayText } from "./i18n";
import { useMemo } from "react";
import { useLocale } from '@gml/ui/i18n';
import { Card, fmt, pct, twd } from "./ui";
import { analyze, nextId, normalize, type SimState } from "./state";

/** Same budget, wallet and packs for every saved model, so the rules are the only difference. */
export function Compare({ s, set }: { s: SimState; set: (fn: (x: SimState) => void) => void }) {
  const [locale] = useLocale();
  const rows = useMemo(() => {
    const entries = [{ id: "current", name: tr("compare1", s.model.name), model: s.model, target: s.target, start: s.start }, ...s.compare];
    return entries.map((e) => ({ e, a: analyze(normalize({ ...s, model: e.model, target: e.target, start: e.start })) }));
  }, [s, locale]);
  const add = () => set((x) => {
    x.compare.push({ id: nextId("c", x.compare.map((c) => c.id)), name: x.model.name, model: structuredClone(x.model), target: structuredClone(x.target), start: structuredClone(x.start) });
  });
  return (
    <Card title={tr("compare2")} actions={<button className="btn" onClick={add}>{tr("compare3")}</button>}>
      <p className="hint">{tr("compare4")}</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{tr("compare5")}</th><th className="r">{tr("panels48")}</th><th className="r">{tr("compare6")}</th><th className="r">P90</th><th className="r">{tr("panels51")}</th><th className="r">{tr("compare7")}</th><th className="r">{tr("panels46")}</th><th /></tr></thead>
          <tbody>
            {rows.map(({ e, a }) => (
              <tr key={e.id} className={e.id === "current" ? "current" : ""}>
                <td>{e.id === "current" ? displayText(e.name) : <input aria-label={tr("compare8")} value={displayText(e.name)} onChange={(ev) => set((x) => { const c = x.compare.find((y) => y.id === e.id); if (c) c.name = ev.target.value; })} />}</td>
                {a.summary && a.spend ? (
                  <>
                    <td className="r mono">{fmt(a.summary.mean, 1)}</td>
                    <td className="r mono">{a.summary.percentiles.p50}</td>
                    <td className="r mono">{a.summary.percentiles.p90}</td>
                    <td className="r mono">{a.worst ?? tr("panels52")}</td>
                    <td className="r mono">{twd(a.spend.mean)}</td>
                    <td className="r mono">{pct(a.budgetChance ?? 0, 1)}</td>
                  </>
                ) : <td colSpan={6} className="issue error">{displayText(a.errors[0]?.message ?? a.error)}</td>}
                <td className="r">{e.id !== "current" && <button className="btn tiny ghost" aria-label={tr("compare9")} onClick={() => set((x) => { x.compare = x.compare.filter((c) => c.id !== e.id); })}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
