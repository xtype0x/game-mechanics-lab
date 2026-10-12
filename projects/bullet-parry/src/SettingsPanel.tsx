import { Timing } from "@gml/core";
import { TimingEditor, exportTimingConfig, parseTimingConfig } from "@gml/ui";
import { LanguageSwitch, useLocale } from "@gml/ui/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { RESERVED_KEYS, gamePresets, keyConflicts, keyHint, keyLabel, matchPreset, rulesStatus, type KeyOverrides } from "./game";
import { VolumeControl } from "./AssetPanel";
import type { AssetSnapshot, AssetStore } from "./assets/store";
import { useText } from "./i18n";
import { DIFFICULTY_RANGE, DIFFICULTY_TIERS, defaultSettings, tierId, tierName, type GameSettings } from "./storage";

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
  const t = useText().settings;
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return undefined;
    const down = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") { setOn(false); return; }
      if (RESERVED_KEYS.includes(e.code)) { setMsg(t.reservedKey(keyLabel(e.code))); return; }
      setMsg(null);
      setOn(false);
      onPick(e.code);
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [on, onPick, t]);
  return (
    <>
      <button type="button" className={"bp-btn small" + (on ? " primary" : "")} aria-label={label} onClick={() => { setMsg(null); setOn((v) => !v); }}>
        {on ? t.capturing : t.rebind}
      </button>
      {msg ? <small className="bp-err-inline">{msg}</small> : null}
    </>
  );
}

export function SettingsPanel(props: { settings: GameSettings; onChange: (s: GameSettings) => void; onClose: () => void; inGame: boolean; store: AssetStore; assets: AssetSnapshot }) {
  const { settings, onChange, onClose, inGame, store, assets } = props;
  const { config } = settings;
  const [locale] = useLocale();
  const t = useText().settings;
  const presets = useMemo(() => gamePresets(locale), [locale]);
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
    <div className="bp-panel wide" role="dialog" aria-label={t.dialog}>
      <div className="bp-panel-head">
        <h2>{t.title}</h2>
        <LanguageSwitch className="bp-lang bp-lang-panel" />
        <button type="button" className="bp-btn ghost" onClick={onClose}>{t.close}</button>
      </div>
      {inGame ? <p className="bp-note">{t.nextRound}</p> : null}

      <h3>{t.rulesHeading}</h3>
      <label className="bp-field">
        <span>{t.loadPreset}</span>
        <select
          value={matched ?? "__custom"}
          onChange={(e) => {
            const p = presets.find((x) => x.id === e.target.value);
            if (p) onChange({ ...settings, config: structuredClone(p) });
          }}
        >
          {matched ? null : <option value="__custom">{t.customOption(config.name, presets.some((p) => p.id === config.id))}</option>}
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {config.description ? <p className="bp-note">{config.description}</p> : null}
      <div className="bp-row left">
        <button type="button" className="bp-btn small" onClick={() => download((config.id || "timing") + ".json", exportTimingConfig(config))}>{t.exportConfig}</button>
        <button type="button" className="bp-btn small" onClick={() => fileRef.current?.click()}>{t.importConfig}</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void doImport(e.target.files?.[0])} />
      </div>
      {importMsg ? <p className="bp-error" role="alert">{importMsg}</p> : null}
      {!status.ok ? (
        <div className="bp-error" role="alert">
          {t.errorsBlock(status.errors.length)}
          <ul>{status.errors.slice(0, 5).map((i, k) => <li key={k}><code>{i.path}</code> {i.message}</li>)}</ul>
        </div>
      ) : null}
      {status.warnings.length > 0 ? (
        <div className="bp-warn">
          {t.warningsBlock(status.warnings.length)}
          <ul>{status.warnings.slice(0, 4).map((i, k) => <li key={k}><code>{i.path}</code> {i.message}</li>)}</ul>
        </div>
      ) : null}

      <details className="bp-details">
        <summary>{t.advanced}</summary>
        <div className="bp-editor">
          <TimingEditor config={config} onChange={(c) => onChange({ ...settings, config: c })} />
        </div>
      </details>

      <h3>{t.keysHeading}</h3>
      <ul className="bp-list bp-keys">
        {config.interactions.map((i, n) => (
          <li key={n + ":" + i.id}>
            <b style={{ color: i.color }}>{i.name}</b>
            <span className="bp-key">{keyHint(config, i.id, keyLabel, settings.keys) || t.noKey}</span>
            <KeyCapture label={t.rebindLabel(i.name)} onPick={(code) => setKey(i.id, code)} />
            {settings.keys[i.id] ? <button type="button" className="bp-btn small ghost" onClick={() => setKey(i.id, null)}>{t.defaultKey}</button> : null}
            <span className="bp-dim bp-grow">
              {i.windows.length > 0
                ? t.startupWindows(i.startup, i.windows.map((w) => t.windowEntry(w.name, w.frames, ms(w.frames, config.fps))).join(t.listSep))
                : t.instant}
              {i.charges ? t.charges(i.charges.max, (i.charges.recharge / config.fps).toFixed(1)) : ""}
              {i.cost ? t.cost(i.cost.amount) : ""}
            </span>
          </li>
        ))}
      </ul>
      {conflicts.length > 0 ? (
        <p className="bp-warn">
          {t.keyConflict(conflicts.map((c) => ({ key: keyLabel(c.code), names: c.ids.map(nameOf) })))}
        </p>
      ) : null}

      <h3>{t.optionsHeading}</h3>
      <label className="bp-field">
        <span>{t.difficulty(settings.difficulty.toFixed(1), tierName(settings.difficulty))}</span>
        <input
          type="range" min={DIFFICULTY_RANGE.min} max={DIFFICULTY_RANGE.max} step={DIFFICULTY_RANGE.step}
          value={settings.difficulty} onChange={(e) => onChange({ ...settings, difficulty: Number(e.target.value) })}
        />
        <small>{t.difficultyNote}</small>
        <span className="bp-tiers">{DIFFICULTY_TIERS.map((tier) => (
          <button key={tier.id} type="button" className={tierId(settings.difficulty) === tier.id ? "on" : ""} onClick={() => onChange({ ...settings, difficulty: tier.at })}>{t.tiers[tier.id]}</button>
        ))}</span>
      </label>
      <label className="bp-check">
        <input type="checkbox" checked={settings.practice} onChange={(e) => onChange({ ...settings, practice: e.target.checked })} />
        <span>{t.practice}</span>
      </label>
      <VolumeControl store={store} snap={assets} />
      <label className="bp-check">
        <input type="checkbox" checked={settings.showFrameBar} onChange={(e) => onChange({ ...settings, showFrameBar: e.target.checked })} />
        <span>{t.showFrameBar}</span>
      </label>
      <label className="bp-check">
        <input type="checkbox" checked={settings.judgeFreeze} disabled={!settings.showFrameBar} onChange={(e) => onChange({ ...settings, judgeFreeze: e.target.checked })} />
        <span>{t.judgeFreeze}</span>
      </label>
      <div className="bp-row">
        <button type="button" className="bp-btn ghost" onClick={() => onChange({ ...defaultSettings(), packActive: settings.packActive, packLast: settings.packLast, volume: settings.volume, muted: settings.muted })}>{t.reset}</button>
      </div>
    </div>
  );
}
