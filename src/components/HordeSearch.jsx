import React, { useState, useMemo, useContext } from 'react';
import dexData from '../../UpdatedDex.json';
import hordeData from '../../horderegiondata.json';
import SearchFilter from './SearchFilter';
import { ColorContext } from '../colorConfig';

const REGION_OPTIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova'];
const EV_OPTIONS = ['', 'HP', 'Attack', 'Defense', 'Sp. Attack', 'Sp. Defense', 'Speed'];
const METHOD_OPTIONS = ['', 'Grass', 'Cave', 'Water', 'Dark Grass'];
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

function methodKey(m=''){ return String(m).toLowerCase().trim(); }

function normalizeTimeTag(tag=''){
  const map = { day:'Day', night:'Night', morning:'Morning', afternoon:'Afternoon', dawn:'Dawn', dusk:'Dusk' };
  const k = methodKey(tag);
  return map[k] || '';
}

function cleanMethodLabel(method=''){
  let m = String(method || '').trim();
  m = m.replace(/_/g,' ');
  m = m.replace(/\)+$/, '');
  const open = (m.match(/\(/g) || []).length;
  const close = (m.match(/\)/g) || []).length;
  if(open > close) m = m + ')';
  if(/^hordes?\b/i.test(m)) m = 'Horde';
  m = m.replace(/\(([^)]+)\)/g, (_, t) => {
    const norm = normalizeTimeTag(t);
    return norm ? `(${norm})` : '';
  });
  m = m.trim();
  return m.split(/\s+/).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
}

function MethodPill({ method, compact=false }){
  const { methodColors, rarityColors } = useContext(ColorContext);
  if(!method) return null;
  const label = cleanMethodLabel(method);
  const m = methodKey(label);
  const raw = m.replace(/[^a-z]+/g, ' ');
  const base = /\blure\b/.test(raw)
    ? 'lure'
    : /\bhorde\b/.test(raw)
    ? 'horde'
    : (methodColors[m] ? m : m.replace(/\s*\(.*\)$/,''));
  const bg = base === 'lure'
    ? (rarityColors[base] || '#7f8c8d')
    : (methodColors[base] || '#7f8c8d');
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', fontSize:compact?11:12, borderRadius:999,
      color:'#111', background:bg, fontWeight:800, border:'1px solid #00000022'
    }}>
      {label}
    </span>
  );
}

export default function HordeSearch(){
  const [term,setTerm] = useState('');
  const [area,setArea] = useState('');
  const [region,setRegion] = useState('');
  const [evFilter,setEvFilter] = useState('');
  const [method,setMethod] = useState('');
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
        (!method || methodKey(l.method) === methodKey(method)) &&
        (!areaQ || normalizeName(l.area).includes(areaQ))
      );
      if(locFiltered.length===0) continue;
      results.push({name, mon, locations: locFiltered});
    }
    results.sort((a,b)=>a.name.localeCompare(b.name));
    return results;
  },[term,area,region,evFilter,method,size]);

  const clearFilters = () => {
    setTerm('');
    setArea('');
    setRegion('');
    setEvFilter('');
    setMethod('');
    setSize('');
  };
  const filtersActive = term || area || region || evFilter || method || size;
  const chipStyle = {
    padding:'4px 8px',
    borderRadius:6,
    background:'var(--primary)',
    color:'var(--onprimary)',
    fontSize:14,
    border:'1px solid var(--accent)',
    boxShadow:'0 0 0 2px var(--accent)',
    display:'inline-flex',
    alignItems:'center',
    gap:6,
    margin:4
  };
  const chipX = {
    marginLeft:4,
    display:'inline-flex',
    alignItems:'center',
    justifyContent:'center',
    width:16,
    height:16,
    borderRadius:999,
    border:'1px solid #ffffff55',
    background:'transparent',
    color:'var(--onprimary)',
    fontWeight:900,
    lineHeight:1,
    cursor:'pointer',
    opacity:.9
  };
  const selectedStyle = {
    border:'1px solid var(--accent)',
    boxShadow:'0 0 0 2px var(--accent)'
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
        <input
          value={term}
          onChange={e=>setTerm(e.target.value)}
          placeholder="Search Pokémon"
          className="input"
          style={{flex:'1 1 160px',height:44,borderRadius:10,padding:'0 10px'}}
        />
        <SearchFilter
          value={area}
          onChange={setArea}
          options={AREA_OPTIONS}
          placeholder="Route/Area Search"
          style={{flex:'1 1 160px'}}
          minChars={2}
        />
        <select value={region} onChange={e=>setRegion(e.target.value)} className="input" style={{flex:'1 1 160px',height:44,borderRadius:10}}>
          <option value="">Region (All)</option>
          {REGION_OPTIONS.map(r=> <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={evFilter} onChange={e=>setEvFilter(e.target.value)} className="input" style={{flex:'1 1 160px',height:44,borderRadius:10}}>
          {EV_OPTIONS.map(o=> <option key={o} value={o}>{o || 'EV Yield (All)'}</option>)}
        </select>
        <select value={method} onChange={e=>setMethod(e.target.value)} className="input" style={{flex:'1 1 160px',height:44,borderRadius:10}}>
          {METHOD_OPTIONS.map(o=> <option key={o} value={o}>{o || 'Method (All)'}</option>)}
        </select>
        <select value={size} onChange={e=>setSize(e.target.value)} className="input" style={{flex:'1 1 160px',height:44,borderRadius:10}}>
          <option value="">Horde Size (All)</option>
          {SIZE_OPTIONS.map(o=> <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {filtersActive && (
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <button type="button" className="region-btn" onClick={clearFilters}>Clear Filters</button>
          {term && (
            <div style={chipStyle}>
              <span>{term}</span>
              <button type="button" aria-label="Clear Name Filter" title="Clear" style={chipX} className="chip-x" onClick={(e)=>{ e.stopPropagation(); setTerm(''); }}>×</button>
            </div>
          )}
          {area && (
            <div style={chipStyle}>
              <span>{area}</span>
              <button type="button" aria-label="Clear Area Filter" title="Clear" style={chipX} className="chip-x" onClick={(e)=>{ e.stopPropagation(); setArea(''); }}>×</button>
            </div>
          )}
          {region && (
            <div style={chipStyle}>
              <span>{region}</span>
              <button type="button" aria-label="Clear Region Filter" title="Clear" style={chipX} className="chip-x" onClick={(e)=>{ e.stopPropagation(); setRegion(''); }}>×</button>
            </div>
          )}
          {evFilter && (
            <div style={chipStyle}>
              <span>{evFilter}</span>
              <button type="button" aria-label="Clear EV Filter" title="Clear" style={chipX} className="chip-x" onClick={(e)=>{ e.stopPropagation(); setEvFilter(''); }}>×</button>
            </div>
          )}
          {method && (
            <div style={chipStyle}>
              <span>{method}</span>
              <button type="button" aria-label="Clear Method Filter" title="Clear" style={chipX} className="chip-x" onClick={(e)=>{ e.stopPropagation(); setMethod(''); }}>×</button>
            </div>
          )}
          {size && (
            <div style={chipStyle}>
              <span>{size}</span>
              <button type="button" aria-label="Clear Horde Size Filter" title="Clear" style={chipX} className="chip-x" onClick={(e)=>{ e.stopPropagation(); setSize(''); }}>×</button>
            </div>
          )}
        </div>
      )}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10}}>
        {filtered.map(p => {
          const evText = formatEvYield(p.mon.yields);
          const img = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.mon.id}.png`;
          const isOpen = open===p.name;
          return (
              <div key={p.name} style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',gap:8,border:'1px solid var(--divider)',borderRadius:10,padding:10,background:'var(--surface)',textAlign:'center',...(isOpen?selectedStyle:{})}}>
                <div style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',width:'100%'}} onClick={()=>setOpen(isOpen?null:p.name)}>
                  <img src={img} alt={p.mon.name} width={72} height={72} style={{imageRendering:'pixelated'}}/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700}}>{p.mon.name}</div>
                    <div style={{fontSize:13}}><em>Locations:</em> {p.locations.length}</div>
                    <div style={{border:'1px solid var(--divider)',padding:'2px 4px',borderRadius:6,fontSize:12,marginTop:4,maxWidth:180,display:'inline-block'}}>{evText}</div>
                  </div>
                </div>
              {isOpen && (
                <div style={{width:'100%',textAlign:'left',marginTop:4}}>
                  {p.locations.map((l,i)=>(
                    <div key={i} style={{fontSize:14,padding:'2px 0',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                      <span>{l.region} - {l.area}{formatLocationExtras(l)} (x{l.hordeSize})</span>
                      <MethodPill method={l.method} compact />
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
