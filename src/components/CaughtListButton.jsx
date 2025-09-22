import React, { useContext, useMemo, useState, useEffect } from 'react';
import { CaughtContext } from '../caughtContext.js';
import dexRaw from '../../UpdatedDex.json';

const SPRITES_BASE = (import.meta.env.VITE_SPRITES_BASE || `${import.meta.env.BASE_URL}sprites/`).replace(/\/+$/, '/');
const SPRITES_EXT  = import.meta.env.VITE_SPRITES_EXT || '.png';
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

function normalizeKey(s=''){
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/♀/g,'-f')
    .replace(/♂/g,'-m')
    .replace(/[^\w\s-]/g,'')
    .replace(/\s+/g,'-')
    .replace(/-+/g,'-')
    .trim();
}

function localSpriteCandidates(mon){
  const id = String(mon?.id||'').trim();
  const key = normalizeKey(mon?.name||'');
  const bases = [SPRITES_BASE, `${import.meta.env.BASE_URL}sprites/`, `${import.meta.env.BASE_URL}sprites/pokeapi/`, `${import.meta.env.BASE_URL}sprites/national/`];
  const exts = [SPRITES_EXT, '.png', '.gif', '.webp'];
  const out = [];
  for (const b of bases){ for (const e of exts){ if (id) out.push(`${b}${id}${e}`); if (key) out.push(`${b}${key}${e}`); } }
  return [...new Set(out)];
}
function spriteSources(mon, { shiny=false } = {}){
  if (!mon) return [];
  const arr = [];
  if (shiny) {
    if (mon.sprites?.front_shiny) arr.push(mon.sprites.front_shiny);
    const shinyArt = mon.sprites?.other?.["official-artwork"]?.front_shiny;
    if (shinyArt) arr.push(shinyArt);
  } else {
    if (mon.sprite) arr.push(mon.sprite);
    if (mon.sprites?.front_default) arr.push(mon.sprites.front_default);
  }
  if (mon.image) arr.push(mon.image);
  if (mon.icon) arr.push(mon.icon);
  arr.push(...localSpriteCandidates(mon));
  if (shiny) arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${mon.id}.png`);
  arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${mon.id}.png`);
  arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${mon.id}.png`);
  return [...new Set(arr)].filter(Boolean);
}
function Sprite({ mon, size=56, alt='', style: imgStyle }){
  const [shinyGlobal, setShinyGlobal] = useState(() => {
    try { return JSON.parse(localStorage.getItem('shinySprites') ?? 'false'); } catch { return false; }
  });
  useEffect(() => {
    const onChange = (e) => setShinyGlobal(!!e?.detail?.enabled);
    window.addEventListener('shiny-global-changed', onChange);
    return () => window.removeEventListener('shiny-global-changed', onChange);
  }, []);
  const srcs = useMemo(()=> spriteSources(mon, { shiny: !!shinyGlobal }), [mon, shinyGlobal]);
  const [idx, setIdx] = useState(0);
  const src = srcs[idx] || TRANSPARENT_PNG;
  return (
    <img
      src={src}
      alt={alt || mon?.name || ''}
      style={{ width:size, height:size, objectFit:'contain', imageRendering:'pixelated', ...(imgStyle||{}) }}
      onError={() => { if (idx < srcs.length - 1) setIdx(idx + 1); }}
    />
  );
}



// Skip standalone entries for alternate forms
const FORM_IDS = new Set();
for (const mon of dexRaw) {
  if (!Array.isArray(mon.forms)) continue;
  for (const f of mon.forms) {
    if (typeof f.id === 'number' && f.id !== mon.id) {
      FORM_IDS.add(f.id);
    }
  }
}

const EVOLUTION_PARENTS = new Map();
for (const mon of dexRaw) {
  if (!Array.isArray(mon.evolutions)) continue;
  for (const evo of mon.evolutions) {
    if (!evo || typeof evo.id !== 'number') continue;
    if (!EVOLUTION_PARENTS.has(evo.id)) EVOLUTION_PARENTS.set(evo.id, []);
    EVOLUTION_PARENTS.get(evo.id).push(mon.id);
  }
}

const DEX_LIST = dexRaw
  .filter(m => !FORM_IDS.has(m.id))
  .map(m => ({
    id: m.id,
    name: m.name,
    sprite: m.sprite,
    sprites: m.sprites,
    image: m.image,
    icon: m.icon,
    slug: m.slug,
    locations: Array.isArray(m.locations) ? m.locations : [],
    preEvolutionIds: EVOLUTION_PARENTS.get(m.id) || []
  }))
  .sort((a, b) => a.id - b.id);

const DEX_BY_ID = new Map(DEX_LIST.map(mon => [mon.id, mon]));

function hasRegionLocation(mon, region) {
  if (!mon) return false;
  return (mon.locations || []).some(loc => loc?.region_name === region);
}

const REGION_CHAIN_CACHE = new Map();
function monMatchesRegionFilter(mon, region) {
  if (region === 'All') return true;
  if (!mon) return false;
  const key = `${mon.id}|${region}`;
  if (REGION_CHAIN_CACHE.has(key)) return REGION_CHAIN_CACHE.get(key);
  const result = hasRegionInChain(mon, region, new Set());
  REGION_CHAIN_CACHE.set(key, result);
  return result;
}

function hasRegionInChain(mon, region, visited) {
  if (!mon || visited.has(mon.id)) return false;
  visited.add(mon.id);
  if (hasRegionLocation(mon, region)) return true;
  for (const prevId of mon.preEvolutionIds || []) {
    const prev = DEX_BY_ID.get(prevId);
    if (hasRegionInChain(prev, region, visited)) return true;
  }
  return false;
}

function collectEvolutionSources(mon, region, visited = new Set(), sources = new Map()) {
  if (!mon || visited.has(mon.id)) return sources;
  visited.add(mon.id);
  for (const prevId of mon.preEvolutionIds || []) {
    const prev = DEX_BY_ID.get(prevId);
    if (!prev) continue;
    if (hasRegionLocation(prev, region)) {
      if (!sources.has(prev.id)) sources.set(prev.id, prev.name);
    } else {
      collectEvolutionSources(prev, region, visited, sources);
    }
  }
  return sources;
}

function getEvolutionHint(mon, region) {
  if (!mon || region === 'All') return '';
  if (!monMatchesRegionFilter(mon, region)) return '';
  const entries = Array.from(collectEvolutionSources(mon, region).entries()).sort((a, b) => a[0] - b[0]);
  if (!entries.length) return '';
  const names = entries.map(([, name]) => name);
  if (names.length === 1) return 'No Location - Evolve from ' + names[0];
  const last = names.pop();
  return 'No Location - Evolve from ' + names.join(', ') + ' or ' + last;
}

const REGION_OPTIONS = Object.freeze([
  { value: 'All', label: 'Region (All)' },
  { value: 'Kanto', label: 'Kanto' },
  { value: 'Johto', label: 'Johto' },
  { value: 'Hoenn', label: 'Hoenn' },
  { value: 'Sinnoh', label: 'Sinnoh' },
  { value: 'Unova', label: 'Unova' }
]);
const REGION_SORT_INDEX = REGION_OPTIONS.reduce((map, option, idx) => {
  if (option.value !== 'All') map[option.value] = idx;
  return map;
}, {});

function groupLocationsByRegion(locations = []) {
  const buckets = new Map();
  for (const loc of locations || []) {
    const region = loc?.region_name || 'Unknown';
    if (!buckets.has(region)) buckets.set(region, []);
    buckets.get(region).push(loc);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => {
      const aIdx = REGION_SORT_INDEX[a[0]] ?? Number.MAX_SAFE_INTEGER;
      const bIdx = REGION_SORT_INDEX[b[0]] ?? Number.MAX_SAFE_INTEGER;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a[0].localeCompare(b[0]);
    })
    .map(([region, entries]) => ({
      region,
      locations: entries.slice().sort((a, b) => (a.location || '').localeCompare(b.location || ''))
    }));
}

function titleCase(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s(-])([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
}

export default function CaughtListButton(){
  const { caught, toggleCaught } = useContext(CaughtContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('All');
  const [hideCaught, setHideCaught] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!open) setExpandedId(null);
  }, [open]);

  useEffect(() => {
    setExpandedId(null);
  }, [regionFilter, hideCaught]);

  const btnStyle = {
    padding:'6px 10px', borderRadius:10, border:'1px solid var(--divider)',
    background:'linear-gradient(180deg,var(--surface),var(--card))', color:'var(--text)',
    fontWeight:700, cursor:'pointer', boxShadow:'var(--shadow-1)'
  };
  const overlayStyle = {
    position:'fixed', top:0, left:0, width:'100vw', height:'100vh',
    background:'rgba(0,0,0,0.7)', zIndex:20000
  };
  const modalStyle = {
    position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)',
    background:'var(--surface)', color:'var(--text)', padding:16,
    width:'85%', maxWidth:1100, maxHeight:'85%', overflow:'hidden',
    borderRadius:'var(--radius-lg)', boxShadow:'var(--shadow-2)', display:'flex', flexDirection:'column'
  };
  const headerStyle = {
    display:'flex',
    alignItems:'center',
    justifyContent:'space-between',
    gap:12,
    marginBottom:14,
    position:'relative',
    flexWrap:'wrap'
  };
  const controlsRowStyle = { display:'flex', alignItems:'center', gap:12, flexWrap:'nowrap', flex:'1 1 auto', minWidth:0 };
  const hideCaughtLabelStyle = { display:'inline-flex', alignItems:'center', gap:6, fontWeight:700, cursor:'pointer', flex:'0 0 auto' };
  const hideCaughtCheckboxStyle = { width:16, height:16, accentColor:'var(--accent)' };
  const regionBadgeStyle = { padding:'4px 12px', borderRadius:999, border:'1px solid var(--accent)', color:'var(--accent)', fontWeight:800, fontSize:13, background:'rgba(255,255,255,0.04)', flex:'0 0 auto' };
  const gridStyle = { display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', columnGap:10, rowGap:16, alignItems:'stretch' };
  const chipStyle = (filled, expanded) => ({
    display:'flex',
    flexDirection:'column',
    gap:8,
    border: (expanded ? 2 : filled ? 2 : 1) + 'px solid ' + (expanded ? 'var(--accent)' : filled ? '#22c55e' : '#ffffff'),
    borderRadius:10,
    padding:10,
    background:'var(--surface)',
    cursor:'pointer',
    overflow:'hidden',
    boxShadow: expanded ? '0 0 0 1px var(--accent)' : 'none'
  });
  const chipHeaderStyle = { display:'grid', gridTemplateColumns:'auto 1fr auto', alignItems:'center', gap:10 };
  const chipNameStyle = { textAlign:'center', minWidth:0 };
  const locationContainerStyle = { display:'flex', flexDirection:'column', gap:6, background:'var(--card)', padding:10, borderRadius:8, border:'1px solid var(--divider)' };
  const regionGroupStyle = { display:'flex', flexDirection:'column', gap:6 };
  const regionTitleStyle = { fontWeight:800, fontSize:13, color:'var(--accent)' };
  const locationEntryStyle = { fontSize:13, lineHeight:1.45, background:'rgba(0,0,0,0.15)', padding:'6px 8px', borderRadius:6, border:'1px solid var(--divider)' };
  const catchButtonStyle = { border:'none', background:'transparent', padding:0, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center' };

  function PokeballIcon({ filled=false, size=30 }){
    const stroke = filled ? '#000' : '#bbb';
    return (
      <svg width={size} height={size} viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="15" fill={filled ? '#fff' : 'none'} stroke={stroke} strokeWidth="2" />
        {filled && <path d="M16 1a15 15 0 0 1 15 15H1A15 15 0 0 1 16 1z" fill="#e53e3e" />}
        <path d="M1 16h30" stroke={stroke} strokeWidth="2" />
        <circle cx="16" cy="16" r="5" fill={filled ? '#fff' : 'none'} stroke={stroke} strokeWidth="2" />
      </svg>
    );
  }

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEX_LIST.filter(mon => {
      if (hideCaught && caught.has(mon.id)) return false;
      if (!monMatchesRegionFilter(mon, regionFilter)) return false;
      if (!q) return true;
      return String(mon.id).includes(q) || mon.name.toLowerCase().includes(q);
    });
  }, [query, regionFilter, hideCaught, caught]);

  return (
    <>
      <button style={btnStyle} onClick={()=>setOpen(true)} title="Pokedex">Pokedex</button>
      {open && (
        <div style={overlayStyle} onClick={()=>setOpen(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            {/* Close X */}
            <button
              type="button"
              aria-label="Close"
              onClick={()=>setOpen(false)}
              style={{
                position:'absolute', top:8, right:8,
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                width:40, height:40,
                border:'none', background:'transparent',
                color:'var(--accent)', cursor:'pointer',
                borderRadius:8, fontWeight:900, fontSize:18, lineHeight:1,
                zIndex:5, boxSizing:'border-box'
              }}
            >
              <span style={{ pointerEvents:'none' }}>X</span>
            </button>

            {/* Header controls */}
            <div style={headerStyle}>
              <div style={controlsRowStyle}>
                <input
                  className="input"
                  placeholder="Search"
                  value={query}
                  onChange={e=>setQuery(e.target.value)}
                  style={{ width:220, flex:'0 0 220px', borderRadius:8, padding:'6px 10px' }}
                />
                <select
                  className="input"
                  value={regionFilter}
                  onChange={e=>setRegionFilter(e.target.value)}
                  style={{ width:220, borderRadius:8, padding:'6px 10px', flex:'0 0 220px' }}
                >
                  {REGION_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <label style={hideCaughtLabelStyle}>
                  <input
                    type="checkbox"
                    checked={hideCaught}
                    onChange={e=>setHideCaught(e.target.checked)}
                    style={hideCaughtCheckboxStyle}
                  />
                  Hide Caught
                </label>
                {regionFilter !== 'All' && (
                  <div style={regionBadgeStyle}>{regionFilter}</div>
                )}
              </div>

            </div>

            {/* Grid of chips */}
            <div style={{ flex:1, overflow:'auto' }}>
              <div style={gridStyle}>
                {list.map(mon => {
                  const filled = caught.has(mon.id);
                  const isExpanded = expandedId === mon.id;
                  const locationPool = regionFilter === 'All'
                    ? (mon.locations || [])
                    : (mon.locations || []).filter(loc => loc?.region_name === regionFilter);
                  const groupedLocations = isExpanded ? groupLocationsByRegion(locationPool) : [];
                  const evolutionHint = regionFilter === 'All' ? '' : getEvolutionHint(mon, regionFilter);
                  const emptyLocationsMessage = evolutionHint || (regionFilter === 'All' ? 'No known locations available.' : 'No known locations in ' + regionFilter + '.');
                  return (
                    <div
                      key={mon.id}
                      style={chipStyle(filled, isExpanded)}
                      onClick={() => setExpandedId(isExpanded ? null : mon.id)}
                      title={isExpanded ? 'Hide locations' : 'Show locations'}
                    >
                      <div style={chipHeaderStyle}>
                        <Sprite mon={mon} alt={mon.name} style={{ opacity: filled ? 0.6 : 1 }} />
                        <div style={{ ...chipNameStyle, opacity: filled ? 0.6 : 1 }}>
                          <div style={{ fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{titleCase(mon.name)}</div>
                          <div className="label-muted" style={{ fontSize:12 }}>#{mon.id}</div>
                        </div>
                        <button
                          type='button'
                          onClick={e => { e.stopPropagation(); toggleCaught(mon.id); }}
                          style={catchButtonStyle}
                          aria-pressed={filled}
                          title={filled ? 'Mark as uncaught' : 'Mark as caught'}
                        >
                          <PokeballIcon filled={filled} />
                        </button>
                      </div>
                      {isExpanded && (
                        <div
                          style={locationContainerStyle}
                          onClick={e => e.stopPropagation()}
                        >
                          {groupedLocations.length ? (
                            groupedLocations.map(({ region, locations }) => (
                              <div key={region} style={regionGroupStyle}>
                                <div style={regionTitleStyle}>{region}</div>
                                {locations.map((loc, idx) => {
                                  const details = [];
                                  if (loc.type) details.push(titleCase(loc.type));
                                  if (loc.rarity) details.push(loc.rarity);
                                  if (loc.min_level != null || loc.max_level != null) {
                                    if (loc.min_level != null && loc.max_level != null) {
                                      details.push(loc.min_level === loc.max_level ? 'Lv. ' + loc.min_level : 'Lv. ' + loc.min_level + '-' + loc.max_level);
                                    } else if (loc.min_level != null) {
                                      details.push('Lv. ' + loc.min_level + '+');
                                    } else if (loc.max_level != null) {
                                      details.push('Lv. up to ' + loc.max_level);
                                    }
                                  }
                                  const detailText = details.join(' - ');
                                  return (
                                    <div key={`${region}-${idx}`} style={locationEntryStyle}>
                                      <div style={{ fontWeight:700 }}>{titleCase(loc.location || 'Unknown')}</div>
                                      {detailText && (
                                        <div className="label-muted" style={{ fontSize:12 }}>{detailText}</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ))
                          ) : (
                            <div style={{ fontStyle:'italic', color:'var(--muted)', fontSize:13 }}>
                              {emptyLocationsMessage}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop:14, textAlign:'center', fontWeight:800 }}>
              Total caught {caught.size}/{DEX_LIST.length}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
