import type { Timing } from "@gml/core";
import { LanguageSwitch } from "@gml/ui/i18n";
import { useEffect, useRef } from "react";
import { useText } from "./i18n";
import { SOUND_SLOTS } from "./audio/events";
import { IMAGE_RANGE, IMAGE_MIMES, formatBytes, packBytes, LIMITS } from "./assets/pack";
import type { AssetSnapshot, AssetStore } from "./assets/store";
import { drawSlot, fitOf, listSlots, slotBox, type SlotInfo } from "./render/slots";

interface Props { store: AssetStore; snap: AssetSnapshot }

/** Volume slider + mute toggle (shared by the settings and asset screens). */
export function VolumeControl({ store, snap }: Props) {
  const t = useText().assets;
  return (
    <div className="bp-field bp-vol">
      <span>{t.volume(Math.round(snap.volume * 100))}</span>
      <div className="bp-row left">
        <input
          type="range" min={0} max={1} step={0.05} value={snap.volume} aria-label={t.volumeAria}
          onChange={(e) => { store.audio.unlock(); store.setVolume(Number(e.target.value)); }}
          onPointerUp={() => store.audio.play("sfx.parry", true)}
        />
        <label className="bp-check">
          <input type="checkbox" checked={snap.muted} onChange={(e) => store.setMuted(e.target.checked)} />
          <span>{t.mute}</span>
        </label>
      </div>
      {!store.audio.available ? <small>{t.noWebAudio}</small> : null}
    </div>
  );
}

/** Quick switch between the default art and the last custom pack, plus a dropdown to pick any pack. */
export function PackSwitch({ store, snap, onManage, compact }: Props & { onManage: () => void; compact?: boolean }) {
  const t = useText().assets;
  const cur = snap.active?.name ?? t.defaultPack;
  const target = snap.packs.find((p) => p.id === (snap.lastId ?? snap.packs[0]?.id))?.name;
  const label = snap.activeId ? t.switchToDefault : target ? t.switchTo(target) : t.noCustomPack;
  if (compact) {
    return (
      <button
        type="button" tabIndex={-1} className="bp-packbtn" title={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { if (!store.toggleDefault()) onManage(); }}
      >{t.packButton(cur)}</button>
    );
  }
  return (
    <div className="bp-packswitch">
      <select
        aria-label={t.packSelectAria} value={snap.activeId ?? ""}
        onChange={(e) => store.setActive(e.target.value || null)}
      >
        <option value="">{t.defaultPack}</option>
        {snap.packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button type="button" className="bp-btn" title={label} onClick={() => { if (!store.toggleDefault()) onManage(); }}>⇄ {label}</button>
    </div>
  );
}

/** Canvas preview of one image slot (default or uploaded art) with its draw box outlined. */
function SlotPreview({ store, slotId, tick }: { store: AssetStore; slotId: string; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const W = 132;
    const H = 88;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const box = slotBox(slotId);
    const k = Math.min(W / (box.w * 1.5), H / (box.h * 1.25));
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0b0e1d";
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(k, k);
      if (fitOf(slotId) !== "contain") { ctx.beginPath(); ctx.rect(-box.w / 2, -box.h / 2, box.w, box.h); ctx.clip(); }
      drawSlot(ctx, slotId, 0, 0, box.w, box.h, performance.now() / 1000, {}, store.registry);
      ctx.restore();
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(k, k);
      ctx.strokeStyle = "rgba(124,149,255,0.85)";
      ctx.lineWidth = 1 / k;
      ctx.setLineDash([4 / k, 3 / k]);
      ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
      ctx.beginPath();
      ctx.moveTo(-4 / k, 0); ctx.lineTo(4 / k, 0); ctx.moveTo(0, -4 / k); ctx.lineTo(0, 4 / k);
      ctx.stroke();
      ctx.restore();
    };
    draw();
    const id = window.setInterval(draw, 100);
    return () => window.clearInterval(id);
  }, [store, slotId, tick]);
  return <canvas ref={ref} className="bp-prev" style={{ width: 132, height: 88 }} aria-label={useText().assets.previewAria} />;
}

function NumField(props: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void }) {
  return (
    <label className="bp-num">
      <span>{props.label}</span>
      <input
        type="number" min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) props.onChange(n); }}
      />
    </label>
  );
}

function ImageRow({ store, snap, slot }: Props & { slot: SlotInfo }) {
  const t = useText().assets;
  const a = snap.active?.images[slot.id];
  const r = IMAGE_RANGE;
  return (
    <li className="bp-slot">
      <SlotPreview store={store} slotId={slot.id} tick={snap.version} />
      <div className="bp-slot-body">
        <div className="bp-slot-head">
          <b>{slot.label}</b>
          <code className="bp-key">{slot.id}</code>
          <span className="bp-dim">{a ? t.customSize(formatBytes(a.blob.size)) : t.defaultState}</span>
        </div>
        <div className="bp-row left">
          <label className="bp-btn small">
            {t.uploadImage}
            <input
              type="file" hidden accept={IMAGE_MIMES.join(",")}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void store.setImage(slot.id, f); }}
            />
          </label>
          {a ? <button type="button" className="bp-btn small ghost" onClick={() => store.clearImage(slot.id)}>{t.clearToDefault}</button> : null}
        </div>
        {a ? (
          <div className="bp-opts">
            <NumField label={t.frames} value={a.frames} min={r.frames.min} max={r.frames.max} step={1} onChange={(n) => store.setImageOptions(slot.id, { frames: n })} />
            <NumField label="fps" value={a.fps} min={r.fps.min} max={r.fps.max} step={1} onChange={(n) => store.setImageOptions(slot.id, { fps: n })} />
            <NumField label={t.scale} value={a.scale} min={r.scale.min} max={r.scale.max} step={0.05} onChange={(n) => store.setImageOptions(slot.id, { scale: n })} />
            <NumField label={t.offsetX} value={a.offsetX} min={r.offset.min} max={r.offset.max} step={1} onChange={(n) => store.setImageOptions(slot.id, { offsetX: n })} />
            <NumField label={t.offsetY} value={a.offsetY} min={r.offset.min} max={r.offset.max} step={1} onChange={(n) => store.setImageOptions(slot.id, { offsetY: n })} />
            <small className="bp-dim">{t.framesNote}</small>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function SoundRow({ store, snap, id, label }: Props & { id: string; label: string }) {
  const t = useText().assets;
  const a = snap.active?.sounds[id];
  return (
    <li className="bp-slot sound">
      <div className="bp-slot-body">
        <div className="bp-slot-head">
          <b>{label}</b>
          <code className="bp-key">{id}</code>
          <span className="bp-dim">{a ? t.customSize(formatBytes(a.blob.size)) : t.defaultSynth}</span>
        </div>
        <div className="bp-row left">
          <button type="button" className="bp-btn small" onClick={() => { store.audio.unlock(); store.audio.play(id, true); }}>{t.listen}</button>
          <label className="bp-btn small">
            {t.uploadSound}
            <input
              type="file" hidden accept="audio/*"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void store.setSound(id, f); }}
            />
          </label>
          {a ? <button type="button" className="bp-btn small ghost" onClick={() => store.clearSound(id)}>{t.clearToDefault}</button> : null}
        </div>
        {a ? (
          <label className="bp-num wide">
            <span>{t.soundVolume(Math.round(a.volume * 100))}</span>
            <input
              type="range" min={0} max={2} step={0.05} value={a.volume} aria-label={t.soundVolumeAria(label)}
              onChange={(e) => store.setSoundVolume(id, Number(e.target.value))}
            />
          </label>
        ) : null}
      </div>
    </li>
  );
}

const GROUPS: SlotInfo["group"][] = ["player", "gunner", "bullet", "scene"];

export function AssetPanel(props: Props & { config: Timing.TimingConfig; onClose: () => void }) {
  const { store, snap, config, onClose } = props;
  const t = useText().assets;
  const slots = listSlots(config);
  const pack = snap.active;
  const importRef = useRef<HTMLInputElement>(null);
  const confirmDelete = () => {
    if (pack && window.confirm(t.confirmDelete(pack.name))) store.deletePack(pack.id);
  };
  return (
    <div className="bp-panel wide" role="dialog" aria-label={t.dialog}>
      <div className="bp-panel-head">
        <h2>{t.title}</h2>
        <LanguageSwitch className="bp-lang bp-lang-panel" />
        <button type="button" className="bp-btn ghost" onClick={onClose}>{t.close}</button>
      </div>
      <p className="bp-note">{t.privacyNote}</p>
      {!snap.persisted ? <p className="bp-warn">{t.noIndexedDb}</p> : null}
      {snap.error ? (
        <p className="bp-error" role="alert">
          {snap.error} <button type="button" className="bp-link" onClick={() => store.dismissError()}>{t.dismiss}</button>
        </p>
      ) : null}

      <div className="bp-packbar">
        <PackSwitch store={store} snap={snap} onManage={() => undefined} />
        <div className="bp-row left">
          <button type="button" className="bp-btn small" onClick={() => store.createPack()}>{t.newPack}</button>
          <button type="button" className="bp-btn small" disabled={!pack} onClick={() => pack && store.duplicatePack(pack.id)}>{t.duplicate}</button>
          <button type="button" className="bp-btn small" disabled={!pack} onClick={() => pack && void store.exportPack(pack.id)}>{t.export}</button>
          <button type="button" className="bp-btn small" onClick={() => importRef.current?.click()}>{t.import}</button>
          <button type="button" className="bp-btn small ghost" disabled={!pack} onClick={confirmDelete}>{t.delete}</button>
          <input
            ref={importRef} type="file" hidden accept=".json,application/json"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void store.importPack(f); }}
          />
        </div>
        {pack ? (
          <label className="bp-field">
            <span>{t.packName(formatBytes(packBytes(pack)), formatBytes(LIMITS.totalBytes))}</span>
            <input
              key={pack.id} type="text" defaultValue={pack.name} maxLength={LIMITS.nameLength}
              onBlur={(e) => store.renamePack(pack.id, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
          </label>
        ) : <p className="bp-note">{t.usingDefault}</p>}
      </div>

      {GROUPS.map((g) => (
        <section key={g}>
          <h3>{t.groups[g]}</h3>
          <ul className="bp-slots">
            {slots.filter((s) => s.group === g).map((s) => <ImageRow key={s.id} store={store} snap={snap} slot={s} />)}
          </ul>
        </section>
      ))}
      <section>
        <h3>{t.soundsHeading}</h3>
        <VolumeControl store={store} snap={snap} />
        <ul className="bp-slots">
          {SOUND_SLOTS.map((s) => <SoundRow key={s.id} store={store} snap={snap} id={s.id} label={t.soundLabels[s.id]} />)}
        </ul>
      </section>
    </div>
  );
}
