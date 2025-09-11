import React, { useState, useMemo } from 'react';
import dexData from '../../UpdatedDex.json';
import hordeData from '../../horderegiondata.json';
import SearchFilter from './SearchFilter';

const REGION_OPTIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova'];
const EV_OPTIONS = ['', 'HP', 'Attack', 'Defense', 'Sp. Attack', 'Sp. Defense', 'Speed'];
const SIZE_OPTIONS = ['x3', 'x5'];

function normalizeName(s=''){return s.toLowerCase();}

function getDexMon(name){
  const key = normalizeName(name);
  return dexData.find(m => normalizeName(m.name) === key) || null;
}

function buildHordeData(){
  const map = new Map();
  const areas = new Set();
  for (const region of hordeData.horderegiondata){
    for (const area of region.areas){
      areas.add(area.name);
      for (const p of area.pokemon){
        const key = normalizeName(p.name);
        const entry = {
          region: region.region,
          area: area.name,
          hordeSize: p.hordeSize || area.defaultHordeSize,
          method: p.method,
          floors: p.floors || [],
          basements: p.basements || [],
          rooms: p.rooms || []
        };
        if(!map.has(key)) map.set(key, []);
        map.get(key).push(entry);
      }
    }
  }
  return { map, areas: Array.from(areas).sort() };
}

const { map: HORDE_INDEX, areas: AREA_OPTIONS } = buildHordeData();

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

function formatLocationExtras(l){
  const extras = [];
  if(l.floors && l.floors.length) extras.push('F' + l.floors.join(', F'));
  if(l.basements && l.basements.length) extras.push('B' + l.basements.join(', B'));
  if(l.rooms && l.rooms.length) extras.push('R' + l.rooms.join(', R'));
  return extras.length ? ' ' + extras.join(', ') : '';
}

function formatMethod(m=''){return m.replace('-', ' ');}

export default function HordeSearch(){
  const [term,setTerm] = useState('');
  const [area,setArea] = useState('');
  const [region,setRegion] = useState('');
  const [evFilter,setEvFilter] = useState('');
  const [size,setSize] = useState('');
  const [open,setOpen] = useState(null);

  const filtered = useMemo(()=>{
    const q = normalizeName(term);
    const areaQ = normalizeName(area);
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
        (!region || l.region===region) &&
        (!size || l.hordeSize === Number(size.replace('x',''))) &&
        (!areaQ || normalizeName(l.area).includes(areaQ))
      );
      if(locFiltered.length===0) continue;
      results.push({name, mon, locations: locFiltered});
    }
    results.sort((a,b)=>a.name.localeCompare(b.name));
    return results;
  },[term,area,region,evFilter,size]);

  const clearFilters = () => { setRegion(''); setEvFilter(''); setSize(''); };
  const filtersActive = region || evFilter || size;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <input
        value={term}
        onChange={e=>setTerm(e.target.value)}
        placeholder="Search Pokémon"
        className="input"
        style={{width:260,height:44,borderRadius:10,padding:'0 10px'}}
      />
      <SearchFilter
        value={area}
        onChange={setArea}
        options={AREA_OPTIONS}
        placeholder="Route/Area Search"
        style={{width:260}}
        minChars={2}
      />
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
        <select value={region} onChange={e=>setRegion(e.target.value)} className="input" style={{height:44,borderRadius:10}}>
          <option value="">Select Region</option>
          {REGION_OPTIONS.map(r=> <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={evFilter} onChange={e=>setEvFilter(e.target.value)} className="input" style={{height:44,borderRadius:10}}>
          {EV_OPTIONS.map(o=> <option key={o} value={o}>{o || 'Select EV'}</option>)}
        </select>
        <select value={size} onChange={e=>setSize(e.target.value)} className="input" style={{height:44,borderRadius:10}}>
          <option value="">Select Horde Amount</option>
          {SIZE_OPTIONS.map(o=> <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {filtersActive && (
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <button className="btn" onClick={clearFilters} style={{height:32,borderRadius:8}}>Clear Filters</button>
          {region && <div style={{padding:'4px 8px',borderRadius:6,background:'var(--primary)',color:'var(--onprimary)',fontSize:14}}>{region}</div>}
          {evFilter && <div style={{padding:'4px 8px',borderRadius:6,background:'var(--primary)',color:'var(--onprimary)',fontSize:14}}>{evFilter}</div>}
          {size && <div style={{padding:'4px 8px',borderRadius:6,background:'var(--primary)',color:'var(--onprimary)',fontSize:14}}>{size}</div>}
        </div>
      )}
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
                    <div key={i} style={{fontSize:14,padding:'2px 0',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                      <span>{l.region} - {l.area}{formatLocationExtras(l)} (x{l.hordeSize})</span>
                      <span style={{border:'1px solid var(--divider)',padding:'0 6px',borderRadius:6,fontSize:12,textTransform:'capitalize'}}>{formatMethod(l.method)}</span>
                    </div>
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
