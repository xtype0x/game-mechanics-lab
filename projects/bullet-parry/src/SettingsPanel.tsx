import { Timing } from "@gml/core";
import { TimingEditor, exportTimingConfig, parseTimingConfig } from "@gml/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { RESERVED_KEYS, gamePresets, keyConflicts, keyHint, keyLabel, matchPreset, rulesStatus, type KeyOverrides } from "./game";
import { VolumeControl } from "./AssetPanel";
import type { AssetSnapshot, AssetStore } from "./assets/store";
import { DIFFICULTY_RANGE, DIFFICULTY_TIERS, defaultSettings, tierName, type GameSettings } from "./storage";

const ms = (frames: number, fps: number) => Math.round(Timing.framesToMs(frames, fps));

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Button that waits for the next key press and reports its `code` (Esc cancels; reserved keys are refused). */
function KeyCapture({ onPick, label }: { onPick: (code: string) => void; label: string }) {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return undefined;
    const down = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") { setOn(false); return; }
      if (RESERVED_KEYS.includes(e.code)) { setMsg(keyLabel(e.code) + " 是系統保留鍵，請換一個。"); return; }
      setMsg(null);
      setOn(false);
      onPick(e.code);
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [on, onPick]);
  return (
    <>
      <button type="button" className={"bp-btn small" + (on ? " primary" : "")} aria-label={label} onClick={() => { setMsg(null); setOn((v) => !v); }}>
        {on ? "請按下新按鍵…（Esc 取消）" : "重設按鍵"}
      </button>
      {msg ? <small className="bp-err-inline">{msg}</small> : null}
    </>
  );
}

export function SettingsPanel(props: { settings: GameSettings; onChange: (s: GameSettings) => void; onClose: () => void; inGame: boolean; store: AssetStore; assets: AssetSnapshot }) {
  const { settings, onChange, onClose, inGame, store, assets } = props;
  const { config } = settings;
  const presets = useMemo(gamePresets, []);
  const matched = matchPreset(config, presets);
  const status = useMemo(() => rulesStatus(config), [config]);
  const conflicts = useMemo(() => keyConflicts(config, settings.keys), [config, settings.keys]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const setKey = (id: string, code: string | null) => {
    const keys: KeyOverrides = { ...settings.keys };
    if (code) keys[id] = code;
    else delete keys[id];
    onChange({ ...settings, keys });
  };
  const nameOf = (id: string) => config.interactions.find((i) => i.id === id)?.name ?? id;
  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange({ ...settings, config: parseTimingConfig(await file.text()) });
      setImportMsg(null);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : String(e));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="bp-panel wide" role="dialog" aria-label="設定">
      <div className="bp-panel-head">
        <h2>設定</h2>
        <button type="button" className="bp-btn ghost" onClick={onClose}>關閉</button>
      </div>
      {inGame ? <p className="bp-note">設定會在下一局開始時生效。</p> : null}

      <h3>判定規則</h3>
      <label className="bp-field">
        <span>載入預設</span>
        <select
          value={matched ?? "__custom"}
          onChange={(e) => {
            const p = presets.find((x) => x.id === e.target.value);
            if (p) onChange({ ...settings, config: structuredClone(p) });
          }}
        >
          {matched ? null : <option value="__custom">{config.name}（{presets.some((p) => p.id === config.id) ? "已修改" : "自訂"}）</option>}
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {config.description ? <p className="bp-note">{config.description}</p> : null}
      <div className="bp-row left">
        <button type="button" className="bp-btn small" onClick={() => download((config.id || "timing") + ".json", exportTimingConfig(config))}>匯出判定設定</button>
        <button type="button" className="bp-btn small" onClick={() => fileRef.current?.click()}>匯入判定設定</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void doImport(e.target.files?.[0])} />
      </div>
      {importMsg ? <p className="bp-error" role="alert">{importMsg}</p> : null}
      {!status.ok ? (
        <div className="bp-error" role="alert">
          有 {status.errors.length} 個錯誤，修正前無法開始遊戲：
          <ul>{status.errors.slice(0, 5).map((i, k) => <li key={k}><code>{i.path}</code> {i.message}</li>)}</ul>
        </div>
      ) : null}
      {status.warnings.length > 0 ? (
        <div className="bp-warn">
          {status.warnings.length} 個警告（不影響開始遊戲）：
          <ul>{status.warnings.slice(0, 4).map((i, k) => <li key={k}><code>{i.path}</code> {i.message}</li>)}</ul>
        </div>
      ) : null}

      <details className="bp-details">
        <summary>進階：判定規則編輯器（新增互動、改判定窗、結果與效果）</summary>
        <div className="bp-editor">
          <TimingEditor config={config} onChange={(c) => onChange({ ...settings, config: c })} />
        </div>
      </details>

      <h3>互動與按鍵</h3>
      <ul className="bp-list bp-keys">
        {config.interactions.map((i, n) => (
          <li key={n + ":" + i.id}>
            <b style={{ color: i.color }}>{i.name}</b>
            <span className="bp-key">{keyHint(config, i.id, keyLabel, settings.keys) || "無按鍵（只能點按鈕）"}</span>
            <KeyCapture label={"重設 " + i.name + " 的按鍵"} onPick={(code) => setKey(i.id, code)} />
            {settings.keys[i.id] ? <button type="button" className="bp-btn small ghost" onClick={() => setKey(i.id, null)}>預設</button> : null}
            <span className="bp-dim bp-grow">
              {i.windows.length > 0
                ? "啟動 " + i.startup + "f；" + i.windows.map((w) => w.name + " " + w.frames + "f/" + ms(w.frames, config.fps) + "ms").join("、")
                : "即時發動"}
              {i.charges ? "；充能 " + i.charges.max + "，每 " + (i.charges.recharge / config.fps).toFixed(1) + " 秒回 1" : ""}
              {i.cost ? "；消耗 " + i.cost.amount : ""}
            </span>
          </li>
        ))}
      </ul>
      {conflicts.length > 0 ? (
        <p className="bp-warn">
          按鍵重複：{conflicts.map((c) => keyLabel(c.code) + "（" + c.ids.map(nameOf).join("、") + "）").join("；")}。重複時只有排在前面的互動會被觸發。
        </p>
      ) : null}

      <h3>遊戲選項</h3>
      <label className="bp-field">
        <span>難度倍率 ×{settings.difficulty.toFixed(1)}・{tierName(settings.difficulty)}</span>
        <input
          type="range" min={DIFFICULTY_RANGE.min} max={DIFFICULTY_RANGE.max} step={DIFFICULTY_RANGE.step}
          value={settings.difficulty} onChange={(e) => onChange({ ...settings, difficulty: Number(e.target.value) })}
        />
        <small>越高節奏越快：攻擊變化更早出現、出招更頻繁、連射更密集（子彈速度不變）。修羅級會出現格擋與閃避交替的「交錯彈幕」。開局較緩和的階段也會跟著縮短。</small>
        <span className="bp-tiers">{DIFFICULTY_TIERS.map((t) => (
          <button key={t.name} type="button" className={tierName(settings.difficulty) === t.name ? "on" : ""} onClick={() => onChange({ ...settings, difficulty: t.at })}>{t.name}</button>
        ))}</span>
      </label>
      <label className="bp-check">
        <input type="checkbox" checked={settings.practice} onChange={(e) => onChange({ ...settings, practice: e.target.checked })} />
        <span>練習模式：生命無限、子彈較慢，成績不會存成最佳分數</span>
      </label>
      <VolumeControl store={store} snap={assets} />
      <label className="bp-check">
        <input type="checkbox" checked={settings.showFrameBar} onChange={(e) => onChange({ ...settings, showFrameBar: e.target.checked })} />
        <span>顯示判定幀數條（遊戲畫面下方，最近 2 秒的來彈、窗口、按鍵與結算）</span>
      </label>
      <label className="bp-check">
        <input type="checkbox" checked={settings.judgeFreeze} disabled={!settings.showFrameBar} onChange={(e) => onChange({ ...settings, judgeFreeze: e.target.checked })} />
        <span>暫停時凍結判定條，並可往回拖曳檢視剛剛的交手</span>
      </label>
      <div className="bp-row">
        <button type="button" className="bp-btn ghost" onClick={() => onChange({ ...defaultSettings(), packActive: settings.packActive, packLast: settings.packLast, volume: settings.volume, muted: settings.muted })}>重設為預設</button>
      </div>
    </div>
  );
}
