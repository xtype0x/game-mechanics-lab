import {
  DEFAULT_ELEMENT_MAP,
  DEFAULT_STATUS_CATEGORY_MAP,
  ascensionFor,
  characterStatsAt,
  enemyStatsAt,
  renderSkillText,
  unitFromCharacter,
  unitFromEnemy,
  validatePack,
  type ImportOptions,
  type ImportResult,
  type Project,
  type RefCharacter,
  type RefEnemy,
  type ReferencePack,
} from "@gml/core";
import { useMemo, useRef, useState } from "react";
import { Badge, elementLabel, ErrorBox, Field, fmt, nextId, NumberField, Section, Segmented, useElementOptions } from "@gml/ui";
import { GoLink } from "../nav";
import type { Updater } from "../useProject";

// The pack stays in memory for this browser session only; it is never written into the project or the build.
let loadedPack: { pack: ReferencePack; fileName: string } | null = null;

type Kind = "enemies" | "characters";

export function ReferenceImport({ project, update }: { project: Project; update: Updater }) {
  const [state, setState] = useState(loadedPack);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text()) as unknown;
      const errs = validatePack(raw);
      if (errs.length) throw new Error(errs.join("；"));
      loadedPack = { pack: raw as ReferencePack, fileName: f.name };
      setState(loadedPack);
      setError(null);
    } catch (e) {
      setError(`無法讀取資料包：${(e as Error).message}`);
    }
  };

  return (
    <div className="tool-layout">
      <div className="workspace">
        <Section
          title="參考資料包"
          actions={<button className="btn small primary" onClick={() => fileRef.current?.click()}>{state ? "換一個資料包" : "開啟資料包…"}</button>}
        >
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void load(f); }} />
          {!state && (
            <div className="muted small">
              <p>把自己蒐集的研究資料轉成可編輯的角色／敵人草稿，再用模擬工具調整。資料包只在這個分頁的記憶體中，不會寫進專案檔或匯出的 DEMO；匯入後的角色則是普通的專案內容，可以自由修改。</p>
              <p>資料包格式見 <code>docs/reference-pack.md</code>；可用 <code>scripts/build-*-pack.mjs</code> 從本機研究快照產生。</p>
            </div>
          )}
          {error && <ErrorBox error={error} />}
          {state && (
            <>
              <p><strong>{state.pack.title}</strong> <span className="muted small">（{state.fileName}・敵人 {state.pack.enemies.length}・角色 {state.pack.characters.length}）</span></p>
              {state.pack.caveats.length > 0 && (
                <div className="caveats">
                  <strong>使用前請注意</strong>
                  <ul>{state.pack.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
              )}
            </>
          )}
        </Section>
        {state && <Browser pack={state.pack} project={project} update={update} />}
      </div>
      <div className="results">
        <div className="results-head"><h2>已匯入</h2></div>
        <Imported project={project} />
      </div>
    </div>
  );
}

function Imported({ project }: { project: Project }) {
  const list = project.battle.units.filter((u) => u.source);
  if (!list.length) return <p className="muted small">專案中還沒有匯入的角色或敵人。</p>;
  return (
    <ul className="dep-list">
      {list.map((u) => (
        <li key={u.id}>
          <GoLink node={{ kind: "unit", id: u.id }}>{u.name}</GoLink> <span className="muted small">{u.team === "ally" ? "我方" : "敵方"}・{u.source!.note}</span>
        </li>
      ))}
    </ul>
  );
}

function Browser({ pack, project, update }: { pack: ReferencePack; project: Project; update: Updater }) {
  const [kind, setKind] = useState<Kind>(pack.enemies.length ? "enemies" : "characters");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [level, setLevel] = useState(80);
  const [toughnessScale, setToughnessScale] = useState(1);
  const [elementMap, setElementMap] = useState<Record<string, string>>(() => ({ ...DEFAULT_ELEMENT_MAP }));
  const [addEncounter, setAddEncounter] = useState(true);
  const [added, setAdded] = useState<{ id: string; name: string } | null>(null);
  const elements = useElementOptions(project.battle.units);

  const needle = q.trim().toLowerCase();
  const enemies = useMemo(() => pack.enemies.filter((e) => !needle || `${e.name} ${e.variantLabel ?? ""} ${e.group ?? ""} ${e.key}`.toLowerCase().includes(needle)), [pack, needle]);
  const characters = useMemo(() => pack.characters.filter((c) => !needle || `${c.name} ${c.id} ${c.path ?? ""}`.toLowerCase().includes(needle)), [pack, needle]);
  const enemy = kind === "enemies" ? pack.enemies.find((e) => e.key === selected) : undefined;
  const character = kind === "characters" ? pack.characters.find((c) => c.id === selected) : undefined;

  const opts: ImportOptions = { level, elementMap, statusCategoryMap: DEFAULT_STATUS_CATEGORY_MAP, toughnessScale };
  const taken = project.battle.units.map((u) => u.id);
  const preview: ImportResult | null = useMemo(() => {
    try {
      if (enemy) return unitFromEnemy(pack, enemy, opts, taken);
      if (character) return unitFromCharacter(character, { ...opts, level: Math.min(level, 80) }, taken);
    } catch {
      return null;
    }
    return null;
  }, [pack, enemy, character, level, toughnessScale, elementMap, taken.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => {
    if (!preview) return;
    const u = preview.unit;
    update((p) => {
      p.battle.units.push(structuredClone(u));
      if (u.team === "enemy" && addEncounter) {
        const id = nextId("ref", p.battle.encounters.map((e) => e.id));
        p.battle.encounters.push({ id, name: `參考：${u.name}`, enemies: [u.id], description: "由參考資料匯入建立" });
        p.battle.encounter.enemies = [u.id];
      }
    });
    setAdded({ id: u.id, name: u.name });
  };

  return (
    <>
      <Section title="轉換設定">
        <div className="grid-fields">
          <Field label={`等級 ${level}${kind === "characters" ? `（突破 ${ascensionFor(Math.min(level, 80))}）` : ""}`}>
            <input type="range" min={1} max={kind === "characters" ? 80 : (pack.enemyCurves?.hp.length ?? 100)} value={Math.min(level, kind === "characters" ? 80 : 100)} onChange={(e) => setLevel(Number(e.target.value))} />
          </Field>
          {kind === "enemies" && (
            <Field label="韌性換算倍率" hint="不同來源的韌性刻度不同，尚未核實；預設不換算">
              <NumberField value={toughnessScale} min={0} onChange={(v) => setToughnessScale(Math.max(0, v))} />
            </Field>
          )}
        </div>
        <details className="map-details">
          <summary>屬性對照（來源 → 本專案）</summary>
          <div className="res-grid">
            {pack.elementNames.map((src) => (
              <label key={src} className="res-cell on">
                <span className="small">{src}</span>
                <select value={elementMap[src] ?? ""} onChange={(e) => setElementMap((m) => { const n = { ...m }; if (e.target.value) n[src] = e.target.value; else delete n[src]; return n; })}>
                  <option value="">（略過）</option>
                  {elements.map((el) => <option key={el} value={el}>{elementLabel(el)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="muted small">狀態抵抗分類：{Object.entries(DEFAULT_STATUS_CATEGORY_MAP).map(([a, b]) => `${a}→${b}`).join("、")}。要生效，專案中的狀態需設定相同的分類。</p>
        </details>
      </Section>

      <Section title="瀏覽">
        <div className="row-gap">
          <Segmented value={kind} onChange={(k) => { setKind(k); setSelected(null); }} options={[{ value: "enemies", label: `敵人（${pack.enemies.length}）` }, { value: "characters", label: `角色（${pack.characters.length}）` }]} />
          <input type="search" placeholder="搜尋…" aria-label="搜尋參考資料" value={q} onChange={(e) => setQ(e.target.value)} className="grow" />
        </div>
        <div className="ref-list" role="listbox" aria-label="參考資料">
          {kind === "enemies" && enemies.slice(0, 300).map((e) => (
            <button key={e.key} role="option" aria-selected={e.key === selected} className={`ref-item ${e.key === selected ? "on" : ""}`} onClick={() => setSelected(e.key)}>
              <strong>{e.name}</strong>{e.variantLabel && <span className="muted small">{e.variantLabel}</span>}
              {pack.interactions?.some((x) => x.enemyKey === e.key) && <Badge tone="info">互動</Badge>}
            </button>
          ))}
          {kind === "characters" && characters.slice(0, 300).map((c) => (
            <button key={c.id} role="option" aria-selected={c.id === selected} className={`ref-item ${c.id === selected ? "on" : ""}`} onClick={() => setSelected(c.id)}>
              <strong>{c.name}</strong><span className="muted small">{c.element}・{c.path}{c.rarity ? `・${c.rarity}★` : ""}</span>
            </button>
          ))}
        </div>
      </Section>

      {enemy && <EnemyDetail pack={pack} e={enemy} level={level} />}
      {character && <CharacterDetail c={character} level={Math.min(level, 80)} />}

      {preview && (
        <Section
          title={`轉換結果：${preview.unit.name}`}
          actions={<button className="btn small primary" onClick={add}>加入專案</button>}
        >
          {preview.unit.team === "enemy" && <label className="check small"><input type="checkbox" checked={addEncounter} onChange={(e) => setAddEncounter(e.target.checked)} />同時建立一場只有它的戰鬥並載入（可在快速驗證立即看到結果）</label>}
          <table className="table">
            <tbody>
              {(["hp", "atk", "def", "spd", "toughness", "effectHit", "effectRes", "taunt", "critRate", "critDmg", "maxEnergy"] as const).filter((k) => preview.unit.stats[k] !== undefined && !(k === "toughness" && preview.unit.team === "ally")).map((k) => (
                <tr key={k}><td>{k}</td><td className="r mono">{fmt(preview.unit.stats[k]!, k.startsWith("effect") || k.startsWith("crit") ? 4 : 3)}</td></tr>
              ))}
              <tr><td>屬性</td><td className="r">{elementLabel(preview.unit.element)}</td></tr>
              {preview.unit.team === "enemy" && <tr><td>弱點</td><td className="r">{preview.unit.weaknesses.map(elementLabel).join("、") || "—"}</td></tr>}
              {preview.unit.elementRes && <tr><td>屬性抗性</td><td className="r small">{Object.entries(preview.unit.elementRes).map(([k, v]) => `${elementLabel(k)} ${fmt(v * 100, 0)}%`).join("、")}</td></tr>}
              {preview.unit.statusRes && Object.keys(preview.unit.statusRes).length > 0 && <tr><td>狀態抵抗</td><td className="r small">{Object.entries(preview.unit.statusRes).map(([k, v]) => `${k} ${fmt(v * 100, 0)}%`).join("、")}</td></tr>}
              <tr><td>技能</td><td className="r small">{preview.unit.skills.map((s) => s.name).join("、")}</td></tr>
            </tbody>
          </table>
          {preview.warnings.length > 0 && <ul className="warn-list">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          {added && <p className="ok-note">已加入「{added.name}」。<GoLink node={{ kind: "unit", id: added.id }}>前往編輯 →</GoLink></p>}
        </Section>
      )}
    </>
  );
}

function EnemyDetail({ pack, e, level }: { pack: ReferencePack; e: RefEnemy; level: number }) {
  const s = enemyStatsAt(pack, e, level);
  const inter = pack.interactions?.filter((x) => x.enemyKey === e.key) ?? [];
  return (
    <Section title={`來源資料：${e.name}${e.variantLabel ? `（${e.variantLabel}）` : ""}`}>
      <p className="muted small"><code>{e.key}</code>{e.group ? `・${e.group}` : ""}・Lv{level}：HP {fmt(s.hp, 3)}、ATK {fmt(s.atk, 3)}、DEF {fmt(s.def, 3)}、SPD {fmt(s.spd, 2)}、韌性 {e.toughness}</p>
      <ul className="ref-skills">
        {e.skills.map((sk, i) => <li key={i}><strong>{sk.name}</strong> <span className="muted small">{sk.type}{sk.phases?.length ? `・階段 ${sk.phases.join("/")}` : ""}</span><div className="small">{sk.desc}</div></li>)}
      </ul>
      {inter.length > 0 && (
        <>
          <h4 className="subhead">已整理的互動機制</h4>
          {inter.map((x) => (
            <div key={x.id} className="interaction">
              <strong>{x.title}</strong>
              <p className="small">{x.summary}</p>
              {x.coverage ? (
                <div className="small">
                  {x.coverage.supported.length > 0 && <div>✓ 可用目前規則表達：{x.coverage.supported.join("、")}</div>}
                  {x.coverage.missing.length > 0 && <div className="warn-text">✕ 尚未支援：{x.coverage.missing.join("、")}</div>}
                </div>
              ) : <div className="small muted">需要：{x.needs.join("、")}</div>}
            </div>
          ))}
        </>
      )}
    </Section>
  );
}

function CharacterDetail({ c, level }: { c: RefCharacter; level: number }) {
  const s = characterStatsAt(c, level);
  return (
    <Section title={`來源資料：${c.name}`}>
      <p className="muted small">Lv{level}（突破 {ascensionFor(level)}，不含光錐／遺器／行跡）：{Object.entries(s).map(([k, v]) => `${k} ${fmt(v, 3)}`).join("、")}・能量 {c.maxEnergy}</p>
      <ul className="ref-skills">
        {c.skills.map((sk) => {
          const lv = Math.min(sk.maxLevel, sk.type === "Normal" ? 6 : 10);
          return <li key={sk.id}><strong>{sk.name}</strong> <span className="muted small">{sk.typeText ?? sk.type}・{sk.effect}・Lv{lv}・參數 {JSON.stringify(sk.params[lv - 1] ?? [])}</span><div className="small">{renderSkillText(sk.desc, sk.params[lv - 1] ?? [])}</div></li>;
        })}
      </ul>
    </Section>
  );
}
