import { Gacha, Rng } from '@gml/core';
import { describe, expect, it } from 'vitest';
import { GAMES, buildModel } from '../src/catalog/games';
import { fromCatalog, migrateCatalogState } from '../src/state';

describe('generic catalog models', () => {
  const worst: Record<string, number> = {
    'hsr:character':180, 'hsr:weapon':160, 'hsr:standard':90,
    'genshin:character':180, 'genshin:weapon':154, 'genshin:standard':90,
    'zzz:character':180, 'zzz:weapon':160, 'zzz:standard':90,
    'ba:pickup:global':200, 'ba:pickup:jp':200,
    'wuwa:character':160, 'wuwa:weapon':80, 'wuwa:standard':80,
    'endfield:character':120, 'endfield:standard':80,
    'nte:character':90, 'nte:standard':90,
  };
  for (const g of GAMES) for (const t of g.types) {
    const key=`${g.id}:${t.kind}${t.region ? `:${t.region}` : ''}`;
    it(`${key}: valid rules and the expected guaranteed maximum`, () => {
      const model=buildModel(g,t);
      expect(Gacha.validateModel(model).filter(i=>i.level==='error')).toEqual([]);
      const epi=model.modules.find(x=>x.kind==='epitomized');
      const target: Gacha.Target=epi?.kind==='epitomized'
        ? {tier:'top',mode:'item',itemId:epi.item,copies:1}
        : {tier:'top',mode:t.top.share === undefined ? 'tier' : 'featured',copies:1};
      expect(Gacha.worstCase(model,target)).toBe(worst[key]);
    });
  }
  it('preserves consolidated rates fitted from the rule references', () => {
    const rate=(game:string,kind:string)=>{ const g=GAMES.find(x=>x.id===game)!; const m=buildModel(g,g.types.find(t=>t.kind===kind)!); return 1/Gacha.targetDistribution(m,{tier:'top',mode:'tier',copies:1}).mean; };
    expect(rate('hsr','character')).toBeCloseTo(.016,3);
    expect(rate('zzz','character')).toBeCloseTo(.016,3);
    expect(rate('zzz','weapon')).toBeCloseTo(.02,3);
    expect(rate('wuwa','character')).toBeCloseTo(.018,3);
    expect(rate('nte','character')).toBeCloseTo(.0187,3);
  });
  it('retains lower-tier rate-up and guarantee rules without named banner data', () => {
    const g=GAMES[0]!; const m=buildModel(g,g.types[0]!);
    expect(m.modules).toContainEqual({kind:'featured',tier:'mid',share:.5,items:['f4:any']});
    expect(m.modules).toContainEqual({kind:'guarantee',tier:'mid'});
    expect(m.items.find(x=>x.id==='f4:any')?.name).toBe('UP 4★');
  });
  it('offers two generic weapons, so selecting a path still models the split featured pool', () => {
    const s=fromCatalog({game:'genshin',kind:'weapon'});
    const f=s.model.modules.find(x=>x.kind==='featured'&&x.tier==='top');
    expect(f?.kind==='featured' ? f.items : []).toEqual(['f5:any','f5:other']);
    expect(s.model.items.filter(x=>x.id.startsWith('f5:')).map(x=>x.name)).toEqual(['限定 5★ 武器 A','限定 5★ 武器 B']);
    expect(s.target.itemId).toBe('f5:any');
  });
});

describe('legacy banner migration', () => {
  const legacy=()=>{
    const s=fromCatalog({game:'hsr',kind:'character'});
    s.model=JSON.parse(JSON.stringify(s.model).replaceAll('f5:any','f5:1505')) as Gacha.GachaModel;
    s.model.items.find(x=>x.id==='f5:1505')!.name='舊版角色名稱';
    s.model.name+='：舊版角色名稱';
    Object.assign(s.catalog!,{bannerId:'old-live-banner'});
    s.presetId+=':old-live-banner';
    s.target={tier:'top',mode:'item',itemId:'f5:1505',copies:2};
    s.start.vars['since:top']=42; s.start.vars['guar:top']=1;
    s.wallet={currency:1600,freePulls:10}; s.budget=900;
    return s;
  };
  it('replaces live names and IDs while preserving goal, counters, wallet and prices', () => {
    const s=legacy(); const next=migrateCatalogState(s);
    expect(JSON.stringify(next.model)).not.toContain('舊版角色名稱');
    expect(next.model.items.find(x=>x.id==='f5:any')?.name).toBe('限定 5★ 角色');
    expect(next.catalog).not.toHaveProperty('bannerId');
    expect(next.target).toEqual({...s.target,itemId:'f5:any'});
    expect(next.start).toEqual(s.start); expect(next.wallet).toEqual(s.wallet); expect(next.packs).toEqual(s.packs); expect(next.budget).toBe(900);
    expect(migrateCatalogState(next)).toEqual(next);
  });
  it('preserves edited rule values while removing legacy character names', () => {
    const s=legacy(); s.presetId=null; s.model.pull.cost=123; s.model.name='My custom rules';
    const next=migrateCatalogState(s);
    expect(next.model.name).toBe('My custom rules'); expect(next.model.pull.cost).toBe(123);
    expect(next.model.items.find(x=>x.id==='f5:1505')?.name).toBe('限定 5★ 角色');
    expect(next.target).toEqual(s.target); expect(next.start).toEqual(s.start);
    const a=Gacha.pull(s.model,structuredClone(s.start),new Rng(42));
    const b=Gacha.pull(next.model,structuredClone(next.start),new Rng(42));
    expect(a).toEqual(b);
  });
  it('removes legacy names from saved comparisons without changing their rules or targets', () => {
    const s=legacy(); s.compare=[{id:'c1',name:s.model.name,model:structuredClone(s.model),target:s.target,start:s.start}];
    const next=migrateCatalogState(s); const entry=next.compare[0]!;
    expect(entry.name).not.toContain('舊版角色名稱'); expect(entry.model.items.some(x=>x.name==='舊版角色名稱')).toBe(false);
    expect(entry.model.modules).toEqual(s.compare[0]!.model.modules); expect(entry.target).toEqual(s.target);
  });
});
