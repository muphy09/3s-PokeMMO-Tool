import React, { useState, useMemo } from 'react';
import dexData from '../../UpdatedDex.json';
import hordeData from '../../horderegiondata.json';

const REGION_OPTIONS = ['All', 'Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova'];
const EV_OPTIONS = ['','HP','Attack','Defense','Sp. Attack','Sp. Defense','Speed'];
const SIZE_OPTIONS = ['All','x3','x5'];

function normalizeName(s=''){return s.toLowerCase();}

function getDexMon(name){
  const key = normalizeName(name);
  return dexData.find(m => normalizeName(m.name) === key) || null;
}

function buildHordeIndex(){
  const map = new Map();
  for (const region of hordeData.horderegiondata){
    for (const area of region.areas){
      for (const p of area.pokemon){
        const key = normalizeName(p.name);
        const entry = {region: region.region, area: area.name, hordeSize: p.hordeSize || area.defaultHordeSize};
        if(!map.has(key)) map.set(key, []);
        map.get(key).push(entry);
      }
    }
  }
  return map;
}

const HORDE_INDEX = buildHordeIndex();

function formatEvYield(yields){
  if(!yields) return '';
  const mapping = {
    HP: yields.ev_hp,
    Attack: yields.ev_attack,
    Defense: yields.ev_defense,
    'Sp. Attack': yields.ev_sp_attack,
    'Sp. Defense': yields.ev_sp_defense,
    Speed: yields.ev_speed
  };
  const parts = [];
  for(const [stat,val] of Object.entries(mapping)){
    if(val>0) parts.push(`${val} ${stat}`);
  }
  return parts.join(', ');
}

export default function HordeSearch(){
  const [term,setTerm] = useState('');
  const [region,setRegion] = useState('All');
  const [evFilter,setEvFilter] = useState('');
  const [size,setSize] = useState('All');
  const [open,setOpen] = useState(null);

  const filtered = useMemo(()=>{
    const q = normalizeName(term);
    const results = [];
    for(const [name,locs] of HORDE_INDEX.entries()){
      if(q && !name.includes(q)) continue;
      const mon = getDexMon(name);
      if(!mon) continue;
      if(evFilter){
        const key = 'ev_'+evFilter.toLowerCase().replace(/\s+/g,'_');
        if(!(mon.yields && mon.yields[key] > 0)) continue;
      }
      const locFiltered = locs.filter(l =>
        (region==='All' || l.region===region) &&
        (size==='All' || l.hordeSize === Number(size.replace('x','')))
      );
      if(locFiltered.length===0) continue;
      results.push({name, mon, locations: locFiltered});
    }
    results.sort((a,b)=>a.name.localeCompare(b.name));
    return results;
  },[term,region,evFilter,size]);

  const clearFilters = () => { setRegion('All'); setEvFilter(''); setSize('All'); };
  const filtersActive = region!=='All' || evFilter || size!=='All';

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
        <input
          value={term}
          onChange={e=>setTerm(e.target.value)}
          placeholder="Search Pokémon"
          className="input"
          style={{flex:'1 1 200px',height:44,borderRadius:10,padding:'0 10px'}}
        />
        <select value={region} onChange={e=>setRegion(e.target.value)} className="input" style={{height:44,borderRadius:10}}>
          {REGION_OPTIONS.map(r=> <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={evFilter} onChange={e=>setEvFilter(e.target.value)} className="input" style={{height:44,borderRadius:10}}>
          {EV_OPTIONS.map(o=> <option key={o} value={o}>{o || 'EV Yield'}</option>)}
        </select>
        <select value={size} onChange={e=>setSize(e.target.value)} className="input" style={{height:44,borderRadius:10}}>
          {SIZE_OPTIONS.map(o=> <option key={o} value={o}>{o}</option>)}
        </select>
        {filtersActive && (
          <button className="btn" onClick={clearFilters} style={{height:44,borderRadius:10}}>Clear Filters</button>
        )}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10}}>
        {filtered.map(p => {
          const evText = formatEvYield(p.mon.yields);
          const img = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.mon.id}.png`;
          const isOpen = open===p.name;
          return (
            <div key={p.name} style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',gap:8,border:'1px solid var(--divider)',borderRadius:10,padding:10,background:'var(--surface)',textAlign:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',width:'100%'}} onClick={()=>setOpen(isOpen?null:p.name)}>
                <img src={img} alt={p.mon.name} width={42} height={42}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700}}>{p.mon.name}</div>
                  <div style={{fontSize:14}}>Locations: {p.locations.length}</div>
                  <div style={{border:'1px solid var(--divider)',padding:'2px 4px',borderRadius:6,fontSize:12,marginTop:4}}>{evText}</div>
                </div>
              </div>
              {isOpen && (
                <div style={{width:'100%',textAlign:'left',marginTop:4}}>
                  {p.locations.map((l,i)=>(
                    <div key={i} style={{fontSize:14,padding:'2px 0'}}>{l.region} - {l.area} (x{l.hordeSize})</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
