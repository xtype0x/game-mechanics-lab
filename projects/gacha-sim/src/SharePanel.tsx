import { tr, sourceText, displayText } from "./i18n";
import { useRef, useState } from "react";
import { downloadRules, parseRules, shareLink, type SharedRules } from "./share";
import { Card } from "./ui";
import type { SimState } from "./state";

/** Share link, export and import of the current rule set (rules and goal only). */
export function SharePanel({ s, onImport }: { s: SimState; onImport: (r: SharedRules) => void }) {
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string; link?: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const rules: SharedRules = { model: s.model, target: s.target };

  const copyLink = async () => {
    try {
      const link = await shareLink(rules);
      try {
        await navigator.clipboard.writeText(link);
        setMsg({ tone: "ok", text: sourceText("sharePanel1", link.length.toLocaleString()), link });
      } catch {
        setMsg({ tone: "ok", text: sourceText("sharePanel2"), link });
      }
    } catch {
      setMsg({ tone: "error", text: sourceText("sharePanel3") });
    }
  };

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    const r = parseRules(await f.text());
    if (file.current) file.current.value = "";
    if (!r.ok) { setMsg({ tone: "error", text: sourceText("sharePanel4", r.error) }); return; }
    onImport(r.rules);
    setMsg({ tone: "ok", text: sourceText("sharePanel5", r.rules.model.name) });
  };

  return (
    <Card title={tr("sharePanel6")}>
      <p className="hint">{tr("sharePanel7")}</p>
      <div className="share-actions">
        <button className="btn primary" onClick={copyLink}>{tr("sharePanel8")}</button>
        <button className="btn" onClick={() => downloadRules(rules)}>{tr("sharePanel9")}</button>
        <button className="btn" onClick={() => file.current?.click()}>{tr("sharePanel10")}</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
      </div>
      {msg && (
        <div className={`issue ${msg.tone === "error" ? "error" : "ok"}`} role="status">
          {displayText(msg.text)}
          {msg.link && <input className="share-link" readOnly value={msg.link} onFocus={(e) => e.currentTarget.select()} aria-label={tr("sharePanel11")} />}
        </div>
      )}
    </Card>
  );
}
