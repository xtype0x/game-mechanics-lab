import {
  Rng, disclosure, newGachaState, pullMany, rateUpBanner, simpleBanner, targetDistribution,
  type BannerDef, type GachaItem, type GachaTier, type Project, type PullResult,
} from "@ggt/core";
import { useMemo, useState } from "react";
import type { Updater } from "../../useProject";
import { ErrorBox, Field, NumberField, Section, fmt, pct, tryCompute } from "../../ui";
import { BannerPicker, GachaIssues, itemName, useBanner } from "./common";

const nextId = (prefix: string, taken: string[]) => { let n = 1; while (taken.includes(`${prefix}${n}`)) n++; return `${prefix}${n}`; };

export function PoolEditor({ project, update }: { project: Project; update: Updater }) {
  const { banner, issues, errors, edit } = useBanner(project, update);
  const allies = project.battle.units.filter((u) => u.team === "ally");

  const addBanner = (make: (b: Project["battle"]) => BannerDef) => update((p) => {
    const b = make(p.battle);
    b.id = nextId(`${b.id}-`, p.gacha.banners.map((x) => x.id));
    p.gacha.banners.push(b);
    p.gacha.active = b.id;
  });
  const duplicate = () => update((p) => {
    const src = p.gacha.banners.find((x) => x.id === banner?.id);
    if (!src) return;
    const b = JSON.parse(JSON.stringify(src)) as BannerDef;
    b.id = nextId("banner", p.gacha.banners.map((x) => x.id));
    b.name = `${src.name}（複製）`;
    p.gacha.banners.push(b);
    p.gacha.active = b.id;
  });
  const remove = () => update((p) => {
    if (p.gacha.banners.length <= 1) return;
    p.gacha.banners = p.gacha.banners.filter((x) => x.id !== banner?.id);
    p.gacha.active = p.gacha.banners[0]!.id;
  });

  return (
    <div className="tool-layout">
      <div className="workspace">
        <Section
          title="卡池"
          actions={<>
            <button className="btn small" onClick={() => addBanner(simpleBanner)}>＋ 簡易池</button>
            <button className="btn small" onClick={() => addBanner(rateUpBanner)}>＋ 限定池</button>
            <button className="btn small" disabled={!banner} onClick={duplicate}>複製</button>
            <button className="btn small ghost" disabled={project.gacha.banners.length <= 1} onClick={remove}>刪除</button>
          </>}
        >
          <BannerPicker project={project} update={update} />
          <p className="muted small">選中的卡池也是 DEMO「召喚」使用的卡池。</p>
          {banner && (
            <div className="grid-fields">
              <Field label="名稱"><input value={banner.name} onChange={(e) => edit((b) => { b.name = e.target.value; })} /></Field>
              <Field label="每抽花費"><NumberField value={banner.cost} min={0} onChange={(v) => edit((b) => { b.cost = Math.max(0, v); })} /></Field>
            </div>
          )}
          {banner && <Field label="說明"><input value={banner.description ?? ""} onChange={(e) => edit((b) => { b.description = e.target.value; })} /></Field>}
        </Section>
        {banner && <TierEditor banner={banner} edit={edit} />}
        {banner && <ItemEditor banner={banner} edit={edit} allies={allies.map((u) => ({ id: u.id, name: u.name }))} />}
        <GachaIssues issues={issues} />
      </div>
      <div className="results">
        <div className="results-head"><h2>機率總覽</h2></div>
        {banner && (errors.length ? <p className="muted">請先修正錯誤。</p> : <Overview banner={banner} seed={project.seed} />)}
      </div>
    </div>
  );
}

function TierEditor({ banner, edit }: { banner: BannerDef; edit: (fn: (b: BannerDef) => void) => void }) {
  const editT = (i: number, fn: (t: GachaTier) => void) => edit((b) => fn(b.tiers[i]!));
  return (
    <Section
      title="稀有度（由高到低）"
      actions={<button className="btn small" onClick={() => edit((b) => { b.tiers.splice(Math.max(0, b.tiers.length - 1), 0, { id: nextId("t", b.tiers.map((t) => t.id)), name: "新稀有度", rate: 0.05, items: [] }); })}>＋ 稀有度</button>}
    >
      <p className="muted small">每抽只擲一次：從最高稀有度開始累加機率，落在哪一段就是哪個稀有度。最低稀有度拿剩下的機率。保底計數是「距離上次抽到這個稀有度」的抽數。</p>
      {banner.tiers.map((t, i) => {
        const last = i === banner.tiers.length - 1;
        return (
          <div key={t.id} className="tier-card">
            <div className="grid-fields">
              <Field label="名稱"><input value={t.name} onChange={(e) => editT(i, (x) => { x.name = e.target.value; })} /></Field>
              <Field label={last ? "機率（剩餘值）" : "基礎機率"}>
                {last ? <input disabled value="—" /> : <NumberField percent value={t.rate} min={0} max={1} onChange={(v) => editT(i, (x) => { x.rate = Math.min(1, Math.max(0, v)); })} />}
              </Field>
              {!last && <>
                <Field label="軟保底起點（第幾抽）" hint="0 為沒有軟保底"><NumberField value={t.softPityStart ?? 0} min={0} onChange={(v) => editT(i, (x) => { const n = Math.max(0, Math.round(v)); if (n) x.softPityStart = n; else { delete x.softPityStart; delete x.softPityStep; } })} /></Field>
                {!!t.softPityStart && <Field label="每抽增加"><NumberField percent value={t.softPityStep ?? 0} min={0} onChange={(v) => editT(i, (x) => { x.softPityStep = Math.max(0, v); })} /></Field>}
                <Field label="硬保底（第幾抽必中）" hint="0 為沒有硬保底"><NumberField value={t.hardPity ?? 0} min={0} onChange={(v) => editT(i, (x) => { const n = Math.max(0, Math.round(v)); if (n) x.hardPity = n; else delete x.hardPity; })} /></Field>
              </>}
            </div>
            <label className="check">
              <input type="checkbox" checked={!!t.featured} onChange={(e) => editT(i, (x) => { if (e.target.checked) x.featured = { share: 0.5, guarantee: true, items: [] }; else delete x.featured; })} />
              有限定（UP）物品
            </label>
            {t.featured && (
              <div className="grid-fields">
                <Field label="抽中時為限定的機率"><NumberField percent value={t.featured.share} min={0} max={1} onChange={(v) => editT(i, (x) => { x.featured!.share = Math.min(1, Math.max(0, v)); })} /></Field>
                <label className="check"><input type="checkbox" checked={t.featured.guarantee} onChange={(e) => editT(i, (x) => { x.featured!.guarantee = e.target.checked; })} />大保底：歪了之後下一次必定限定</label>
              </div>
            )}
            {t.featured && <ItemChips label="限定物品" banner={banner} ids={t.featured.items} onChange={(ids) => editT(i, (x) => { x.featured!.items = ids; })} />}
            <ItemChips label={t.featured ? "一般物品（歪的時候）" : "物品"} banner={banner} ids={t.items} onChange={(ids) => editT(i, (x) => { x.items = ids; })} />
            <div className="row-gap">
              <button className="btn small ghost" disabled={i === 0} onClick={() => edit((b) => { const [x] = b.tiers.splice(i, 1); b.tiers.splice(i - 1, 0, x!); })}>上移</button>
              <button className="btn small ghost" disabled={last} onClick={() => edit((b) => { const [x] = b.tiers.splice(i, 1); b.tiers.splice(i + 1, 0, x!); })}>下移</button>
              <button className="btn small ghost" disabled={banner.tiers.length <= 1} onClick={() => edit((b) => { b.tiers.splice(i, 1); })}>刪除</button>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

function ItemChips({ label, banner, ids, onChange }: { label: string; banner: BannerDef; ids: string[]; onChange: (ids: string[]) => void }) {
  const free = banner.items.filter((x) => !ids.includes(x.id));
  return (
    <Field label={label}>
      <div className="chips">
        {ids.map((id) => <button key={id} className="chip-btn on" title="點擊移除" onClick={() => onChange(ids.filter((x) => x !== id))}>{itemName(banner, id)} ✕</button>)}
        {free.length > 0 && (
          <select aria-label={`加入${label}`} value="" onChange={(e) => e.target.value && onChange([...ids, e.target.value])}>
            <option value="">＋ 加入</option>
            {free.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
      </div>
    </Field>
  );
}

function ItemEditor({ banner, edit, allies }: { banner: BannerDef; edit: (fn: (b: BannerDef) => void) => void; allies: { id: string; name: string }[] }) {
  const editI = (i: number, fn: (x: GachaItem) => void) => edit((b) => fn(b.items[i]!));
  const freeAllies = allies.filter((a) => !banner.items.some((x) => x.kind === "unit" && x.unitId === a.id));
  return (
    <Section
      title="物品"
      actions={<>
        {freeAllies.length > 0 && (
          <select aria-label="加入角色物品" value="" onChange={(e) => {
            const a = allies.find((x) => x.id === e.target.value);
            if (a) edit((b) => { b.items.push({ id: `u.${a.id}`, name: a.name, kind: "unit", unitId: a.id }); });
          }}>
            <option value="">＋ 角色</option>
            {freeAllies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <button className="btn small" onClick={() => edit((b) => { b.items.push({ id: nextId("item", b.items.map((x) => x.id)), name: "新資源", kind: "resource", resource: "exp", amount: 100 }); })}>＋ 資源</button>
      </>}
    >
      <table className="table">
        <thead><tr><th>名稱</th><th>內容</th><th /></tr></thead>
        <tbody>
          {banner.items.map((x, i) => (
            <tr key={x.id}>
              <td><input value={x.name} onChange={(e) => editI(i, (it) => { it.name = e.target.value; })} /></td>
              <td>{x.kind === "unit" ? <span className="muted">角色：{allies.find((a) => a.id === x.unitId)?.name ?? `（不存在）${x.unitId}`}</span> : (
                <span className="row-gap">
                  <input className="mono" style={{ width: 80 }} value={x.resource ?? ""} aria-label="資源種類" onChange={(e) => editI(i, (it) => { it.resource = e.target.value; })} />
                  <NumberField ariaLabel="數量" value={x.amount ?? 0} onChange={(v) => editI(i, (it) => { it.amount = v; })} />
                </span>
              )}</td>
              <td className="r"><button className="btn icon" aria-label="刪除物品" onClick={() => edit((b) => {
                b.items.splice(i, 1);
                for (const t of b.tiers) { t.items = t.items.filter((id) => id !== x.id); if (t.featured) t.featured.items = t.featured.items.filter((id) => id !== x.id); }
              })}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">DEMO 只會發放角色與資源種類「exp」（經驗）；重複獲得的角色轉為經驗。</p>
    </Section>
  );
}

function Overview({ banner, seed }: { banner: BannerDef; seed: number | string }) {
  const stats = useMemo(() => tryCompute(() => {
    const d = disclosure(banner);
    const top = banner.tiers[0]!;
    const toTop = targetDistribution(banner, { mode: "tier", copies: 1 });
    const hasFeat = !!top.featured?.items.length;
    const toFeat = hasFeat ? targetDistribution(banner, { mode: "featured", copies: 1 }) : null;
    return { d, top, toTop, toFeat };
  }), [banner]);
  const [sample, setSample] = useState<{ n: number; results: PullResult[] } | null>(null);
  if (!stats.ok) return <ErrorBox error={stats.error} />;
  const { d, top, toTop, toFeat } = stats.value;
  const draw = (n: number) => setSample({ n, results: pullMany(banner, newGachaState(banner), new Rng(seed, `gacha.sample.${banner.id}`), n) });
  return (
    <>
      <Section title="各稀有度機率">
        <table className="table">
          <thead><tr><th>稀有度</th><th className="r">基礎</th><th className="r">綜合（含保底）</th></tr></thead>
          <tbody>{d.tiers.map((t) => <tr key={t.id}><td>{t.name}</td><td className="r mono">{pct(t.base, 3)}</td><td className="r mono">{pct(t.consolidated, 3)}</td></tr>)}</tbody>
        </table>
        <div className="kv">
          <span>平均幾抽出一次 {top.name}</span><strong>{fmt(toTop.mean, 2)}</strong>
          {toFeat && <><span>平均幾抽出一次限定 {top.name}</span><strong>{fmt(toFeat.mean, 2)}</strong></>}
        </div>
        <p className="muted small">綜合機率是長期平均每抽的機率（含軟硬保底與大保底），精確計算。抽數分布與預算請用「抽卡機率與預算模擬器」。</p>
      </Section>
      <Section title="試抽" actions={<><button className="btn small" onClick={() => draw(10)}>抽 10 次</button><button className="btn small" onClick={() => draw(1000)}>抽 1000 次</button></>}>
        {!sample && <p className="muted small">用專案種子從新的保底進度開始抽，同種子結果相同。</p>}
        {sample && sample.n <= 10 && (
          <div className="chips">{sample.results.map((r, i) => <span key={i} className={`chip-btn ${r.tierId === top.id ? "on" : ""}`}>{banner.tiers.find((t) => t.id === r.tierId)?.name} {itemName(banner, r.itemId)}{r.featured ? "（限定）" : ""}</span>)}</div>
        )}
        {sample && sample.n > 10 && (
          <table className="table">
            <thead><tr><th>稀有度</th><th className="r">次數</th><th className="r">頻率</th><th className="r">綜合機率</th></tr></thead>
            <tbody>{d.tiers.map((t) => {
              const k = sample.results.filter((r) => r.tierId === t.id).length;
              return <tr key={t.id}><td>{t.name}</td><td className="r mono">{k}</td><td className="r mono">{pct(k / sample.n, 2)}</td><td className="r mono">{pct(t.consolidated, 2)}</td></tr>;
            })}</tbody>
          </table>
        )}
      </Section>
    </>
  );
}
