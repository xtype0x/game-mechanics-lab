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
        setMsg({ tone: "ok", text: `已複製分享連結（${link.length.toLocaleString()} 字元）。對方打開連結就能載入這套規則。`, link });
      } catch {
        setMsg({ tone: "ok", text: "無法自動複製，請手動複製下面的連結：", link });
      }
    } catch {
      setMsg({ tone: "error", text: "產生連結失敗" });
    }
  };

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    const r = parseRules(await f.text());
    if (file.current) file.current.value = "";
    if (!r.ok) { setMsg({ tone: "error", text: `無法匯入：${r.error}` }); return; }
    onImport(r.rules);
    setMsg({ tone: "ok", text: `已匯入「${r.rules.model.name}」。` });
  };

  return (
    <Card title="分享與備份">
      <p className="hint">分享的是規則與目標，不含你的抽卡進度與儲值設定。連結把規則存在網址裡，不會上傳到任何伺服器。</p>
      <div className="share-actions">
        <button className="btn primary" onClick={copyLink}>🔗 複製分享連結</button>
        <button className="btn" onClick={() => downloadRules(rules)}>匯出檔案</button>
        <button className="btn" onClick={() => file.current?.click()}>匯入檔案</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
      </div>
      {msg && (
        <div className={`issue ${msg.tone === "error" ? "error" : "ok"}`} role="status">
          {msg.text}
          {msg.link && <input className="share-link" readOnly value={msg.link} onFocus={(e) => e.currentTarget.select()} aria-label="分享連結" />}
        </div>
      )}
    </Card>
  );
}
