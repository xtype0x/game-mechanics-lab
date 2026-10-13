import { Gacha } from '@gml/core';
import { getLocale, setLocale } from '@gml/ui/i18n';
import { afterEach, describe, expect, it } from 'vitest';
import { GAMES, buildModel } from '../src/catalog/games';
import { displayText, en, sourceText, tr, zhHant } from '../src/i18n';
import { fromCatalog } from '../src/state';
const cjk=/[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
const slots=(text:string)=>[...text.matchAll(/\{\d+\}/g)].map(x=>x[0]).sort();
afterEach(()=>setLocale('zh-Hant'));

describe('complete English gacha text',()=>{
  it('has an English entry for every source string, with matching placeholders',()=>{
    expect(Object.keys(en).sort()).toEqual(Object.keys(zhHant).sort());
    for(const key of Object.keys(zhHant) as (keyof typeof zhHant)[]){
      expect(en[key].trim(),key).not.toBe('');
      expect(cjk.test(en[key]),key).toBe(false);
      expect(slots(en[key]),key).toEqual(slots(zhHant[key]));
    }
  });
  it('translates every built-in game pool, item, rarity, currency and source note',()=>{
    const missing:string[]=[];
    for(const g of GAMES) for(const t of g.types){
      const m=buildModel(g,t);
      const labels=[g.name,t.name,m.name,m.description,m.source,m.pull.currency,...m.tiers.map(x=>x.name),...m.items.map(x=>x.name)];
      for(const label of labels) if (cjk.test(displayText(label,'en'))) missing.push(`${m.id}: ${label}`);
    }
    for(const p of Gacha.PRESETS){
      for(const label of [p.model.name,p.model.description,p.model.source,p.model.pull.currency,...p.model.items.map(x=>x.name)]) if(cjk.test(displayText(label,'en')))missing.push(label!);
    }
    expect(missing).toEqual([]);
  });
  it('translates dynamic validation and share errors while keeping custom names intact',()=>{
    expect(displayText('稀有度必須有 1 到 12 個','en')).toBe('Must have 1–12 rarity tiers');
    const s=fromCatalog({game:'hsr',kind:'character'});
    s.model.modules.push({kind:'hardPity',tier:'missing',at:10});
    const errors=Gacha.validateModel(s.model).filter(x=>x.level==='error');
    expect(errors.length).toBeGreaterThan(0);
    errors.forEach(x=>expect(cjk.test(displayText(x.message,'en'))).toBe(false));
    expect(displayText('My custom pool','en')).toBe('My custom pool');
    expect(displayText('我自訂的物品','en')).toBe('我自訂的物品');
  });
  it('switches visible text without rewriting catalog model data or item IDs',()=>{
    const before=fromCatalog({game:'genshin',kind:'weapon'});
    expect(getLocale()).toBe('zh-Hant'); setLocale('en');
    expect(tr('app1')).toBe('Gacha simulator');
    expect(tr('modelEditor17',sourceText('games34'))).toBe('S-rank rate');
    expect(fromCatalog({game:'genshin',kind:'weapon'})).toEqual(before);
    setLocale('zh-Hant'); expect(tr('app1')).toBe('抽卡模擬器');
  });
});
