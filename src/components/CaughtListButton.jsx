import React, { useContext, useMemo, useState, useEffect } from 'react';
import { CaughtContext } from '../caughtContext.js';
import nonLegendaryData from '../data/nonLegendaryIds.json';
import dexRaw from '../../UpdatedDex.json';
import regionPokedexData from '../data/regionPokedex.json';

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
  .filter(m => !FORM_IDS.has(m.id) && m.id <= 649)
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

// Build a map from Pokemon name to regional dex entries
const REGION_DEX_BY_NAME = new Map();
for (const [pokemonName, regions] of Object.entries(regionPokedexData)) {
  REGION_DEX_BY_NAME.set(pokemonName, regions);
}

// Helper to check if a Pokemon is in a specific region's dex
function monMatchesRegionFilter(mon, region) {
  if (region === 'All') return true;
  if (!mon) return false;
  const regionalData = REGION_DEX_BY_NAME.get(mon.name);
  if (!regionalData) return false;
  return regionalData.hasOwnProperty(region);
}

// Helper to get the regional dex ID for a Pokemon
function getRegionalDexId(mon, region) {
  if (!mon || region === 'All') return null;
  const regionalData = REGION_DEX_BY_NAME.get(mon.name);
  if (!regionalData) return null;
  return regionalData[region] || null;
}

function hasRegionLocation(mon, region) {
  if (!mon) return false;
  return (mon.locations || []).some(loc => loc?.region_name === region);
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

function defaultCollapsedRegionsForMon(mon, regionFilter) {
  if (!mon) return new Set();
  if (regionFilter !== 'All') return new Set();
  const sections = groupLocationsByRegion((mon.locations || []).filter(Boolean));
  const next = new Set();
  for (const section of sections) {
    const key = section.region || 'Unknown';
    next.add(key);
  }
  return next;
}

function titleCase(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s(-])([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
}

export default function CaughtListButton(){
  const { caught, toggleCaught, replaceCaught } = useContext(CaughtContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('All');
  const [hideCaught, setHideCaught] = useState(false);
  const [activeMon, setActiveMon] = useState(null);
  const [collapsedRegions, setCollapsedRegions] = useState(() => new Set());
  const [showCatchAllConfirm, setShowCatchAllConfirm] = useState(false);
  const [isApplyingCatchAll, setIsApplyingCatchAll] = useState(false);
  const [catchAllError, setCatchAllError] = useState('');

  useEffect(() => {
    if (!open) {
      setActiveMon(null);
      setCollapsedRegions(new Set());
    }
  }, [open]);

  useEffect(() => {
    setActiveMon(null);
  }, [regionFilter, hideCaught]);

  const btnStyle = {
    padding:'6px 10px', borderRadius:10, border:'1px solid var(--divider)',
    background:'linear-gradient(180deg,var(--surface),var(--card))', color:'var(--text)',
    fontWeight:700, cursor:'pointer', boxShadow:'var(--shadow-1)'
  };
  const overlayStyle = {
    position:'fixed', top:0, left:0, width:'100vw', height:'100vh',
    background:'rgba(0,0,0,0.7)', zIndex:20000,
    display:'flex', alignItems:'center', justifyContent:'center', padding:'24px'
  };
  const modalStyle = {
    position:'relative',
    background:'var(--surface)', color:'var(--text)', padding:16,
    width:'85%', maxWidth:1100,
    maxHeight:'85vh', height:'min(85vh, 920px)', minHeight:'min(620px, 85vh)', overflow:'hidden',
    borderRadius:'var(--radius-lg)', boxShadow:'var(--shadow-2)', display:'flex', flexDirection:'column'
  };
  const hideCaughtLabelStyle = { display:'inline-flex', alignItems:'center', gap:6, fontWeight:700, cursor:'pointer' };
  const hideCaughtCheckboxStyle = { width:16, height:16, accentColor:'var(--accent)' };
  const catchAllButtonStyle = {
    border:'1px solid var(--accent)',
    background:'var(--accent)',
    color:'var(--surface)',
    fontWeight:800,
    padding:'6px 12px',
    borderRadius:8,
    cursor:'pointer',
    flex:'0 0 auto',
    marginLeft:8,
    boxShadow:'0 6px 16px rgba(0,0,0,0.25)'
  };
  const confirmScrimStyle = {
    position:'absolute',
    inset:0,
    background:'rgba(0,0,0,0.65)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    padding:20,
    zIndex:15
  };
  const confirmCardStyle = {
    background:'var(--card)',
    color:'var(--text)',
    borderRadius:12,
    padding:'20px 24px',
    width:'min(360px, 90%)',
    display:'flex',
    flexDirection:'column',
    gap:16,
    boxShadow:'0 12px 32px rgba(0,0,0,0.45)'
  };
  const confirmActionsStyle = { display:'flex', justifyContent:'flex-end', gap:12 };
  const confirmButtonStyle = {
    border:'1px solid var(--divider)',
    borderRadius:8,
    padding:'6px 16px',
    fontWeight:700,
    cursor:'pointer',
    background:'var(--surface)',
    color:'var(--text)'
  };
  const confirmPrimaryButtonStyle = {
    ...confirmButtonStyle,
    background:'var(--accent)',
    color:'var(--surface)',
    borderColor:'var(--accent)'
  };
  const confirmErrorStyle = { color:'#f87171', fontSize:13, fontWeight:600 };
  const gridStyle = { display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', columnGap:10, rowGap:16, alignItems:'stretch' };
  const chipStyle = (filled, active) => ({
    display:'flex',
    flexDirection:'column',
    gap:8,
    border: (active ? 2 : filled ? 2 : 1) + 'px solid ' + (active ? 'var(--accent)' : filled ? '#22c55e' : '#ffffff'),
    borderRadius:10,
    padding:10,
    background:'var(--surface)',
    cursor:'pointer',
    overflow:'hidden',
    boxShadow: active ? '0 0 0 1px var(--accent)' : 'none',
    transition:'border-color 120ms ease, box-shadow 120ms ease'
  });
  const chipHeaderStyle = { display:'grid', gridTemplateColumns:'auto 1fr auto', alignItems:'center', gap:10 };
  const chipNameStyle = { textAlign:'center', minWidth:0 };
  const locationScrimStyle = { position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:20010, padding:'24px' };
  const locationCardStyle = { background:'var(--card)', color:'var(--text)', borderRadius:12, padding:20, width:'min(440px, 90vw)', maxHeight:'80vh', boxShadow:'0 12px 32px rgba(0,0,0,0.45)', display:'flex', flexDirection:'column', gap:16 };
  const locationHeaderStyle = { display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 };
  const locationHeaderInfoStyle = { display:'flex', alignItems:'center', gap:12, minWidth:0 };
  const locationBodyStyle = { display:'flex', flexDirection:'column', gap:12, overflowY:'auto', paddingRight:4 };
  const regionButtonStyle = { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', background:'var(--surface)', border:'1px solid var(--divider)', borderRadius:8, padding:'10px 12px', fontWeight:800, fontSize:15, cursor:'pointer', color:'inherit' };
  const regionChevronStyle = { display:'inline-flex', alignItems:'center', justifyContent:'center', width:18, marginLeft:12, fontSize:16, lineHeight:1 };
  const regionGroupStyle = { display:'flex', flexDirection:'column', gap:8, borderRadius:10, border:'1px solid var(--divider)', background:'rgba(0,0,0,0.25)', padding:'8px 10px' };
  const locationListStyle = { listStyle:'none', margin:0, padding:0, display:'flex', flexDirection:'column', gap:8 };
  const locationEntryStyle = { fontSize:13, lineHeight:1.45, background:'var(--surface)', padding:'8px 10px', borderRadius:6, border:'1px solid var(--divider)' };
  const emptyLocationsStyle = { fontStyle:'italic', color:'var(--muted)', fontSize:13 };
  const locationActionButtonStyle = { border:'1px solid var(--divider)', borderRadius:8, padding:'6px 12px', background:'var(--surface)', fontWeight:700, cursor:'pointer', color:'var(--text)' };
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

  const catchAllIds = useMemo(() => {
    const validIds = new Set(DEX_LIST.map(mon => mon.id));
    return (nonLegendaryData?.ids || []).filter(id => validIds.has(id));
  }, []);

  const handleCatchAllClick = () => {
    setCatchAllError('');
    if (!catchAllIds.length) {
      setCatchAllError('No Pokémon available to update.');
    }
    setShowCatchAllConfirm(true);
  };

  const handleCatchAllConfirm = () => {
    if (isApplyingCatchAll) return;
    setCatchAllError('');
    if (!catchAllIds.length) {
      setCatchAllError('No Pokémon available to update.');
      return;
    }
    try {
      setIsApplyingCatchAll(true);
      replaceCaught(catchAllIds);
      setShowCatchAllConfirm(false);
    } catch (err) {
      console.error(err);
      setCatchAllError('Failed to overwrite caught data.');
    } finally {
      setIsApplyingCatchAll(false);
    }
  };

  const handleCatchAllCancel = () => {
    if (isApplyingCatchAll) return;
    setCatchAllError('');
    setShowCatchAllConfirm(false);
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = DEX_LIST.filter(mon => {
      if (hideCaught && caught.has(mon.id)) return false;
      if (!monMatchesRegionFilter(mon, regionFilter)) return false;
      if (!q) return true;
      return String(mon.id).includes(q) || mon.name.toLowerCase().includes(q);
    });

    // Sort by regional ID if a region is selected, otherwise by national ID
    return filtered.sort((a, b) => {
      const aId = regionFilter === 'All' ? a.id : (getRegionalDexId(a, regionFilter) || a.id);
      const bId = regionFilter === 'All' ? b.id : (getRegionalDexId(b, regionFilter) || b.id);
      return aId - bId;
    });
  }, [query, regionFilter, hideCaught, caught]);

  const regionStats = useMemo(() => {
    if (regionFilter === 'All') {
      return { caughtCount: caught.size, totalCount: DEX_LIST.length };
    }
    const regionPokemon = DEX_LIST.filter(mon => monMatchesRegionFilter(mon, regionFilter));
    const caughtInRegion = regionPokemon.filter(mon => caught.has(mon.id)).length;
    return { caughtCount: caughtInRegion, totalCount: regionPokemon.length };
  }, [regionFilter, caught]);

  const locationOverlayData = useMemo(() => {
    if (!activeMon) return { sections: [], emptyMessage: '' };
    const allLocations = (activeMon.locations || []).filter(Boolean);
    const pool = regionFilter === 'All'
      ? allLocations
      : allLocations.filter(loc => loc?.region_name === regionFilter);
    const sections = regionFilter === 'All'
      ? groupLocationsByRegion(pool)
      : (pool.length
        ? [{
            region: pool[0]?.region_name || regionFilter || 'Unknown',
            locations: pool.slice().sort((a, b) => (a.location || '').localeCompare(b.location || ''))
          }]
        : []);
    const evolutionHint = regionFilter === 'All' ? '' : getEvolutionHint(activeMon, regionFilter);
    const emptyMessage = evolutionHint || (regionFilter === 'All'
      ? 'No known locations available.'
      : 'No known locations in ' + regionFilter + '.');
    return { sections, emptyMessage };
  }, [activeMon, regionFilter]);

  useEffect(() => {
    if (!activeMon) {
      setCollapsedRegions(new Set());
    }
  }, [activeMon]);

  useEffect(() => {
    if (!activeMon) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setActiveMon(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMon]);

  const toggleRegionCollapsed = (region) => {
    setCollapsedRegions(prev => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  };

  const formatLocationDetails = (loc) => {
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
    return details.join(' - ');
  };

  const handleMonClick = (mon) => {
    if (activeMon?.id === mon.id) {
      setActiveMon(null);
      setCollapsedRegions(new Set());
      return;
    }
    setCollapsedRegions(defaultCollapsedRegionsForMon(mon, regionFilter));
    setActiveMon(mon);
  };

  const activeMonCaught = activeMon ? caught.has(activeMon.id) : false;
  const overlaySubtitle = regionFilter === 'All' ? 'Showing all regions' : 'Filtered to ' + titleCase(regionFilter);

  return (
    <>
      <button style={btnStyle} onClick={()=>setOpen(true)} title="Pokedex">Pokedex</button>
      {open && (
        <div style={overlayStyle} onClick={()=>setOpen(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            {showCatchAllConfirm && (
              <div style={confirmScrimStyle}>
                <div style={confirmCardStyle}>
                  <div style={{ fontWeight:800, fontSize:16 }}>
                    Are you sure? This will overwrite Catch data
                  </div>
                  {catchAllError && (
                    <div style={confirmErrorStyle}>{catchAllError}</div>
                  )}
                  <div style={confirmActionsStyle}>
                    <button
                      type="button"
                      onClick={handleCatchAllCancel}
                      style={{
                        ...confirmButtonStyle,
                        opacity: isApplyingCatchAll ? 0.7 : 1,
                        cursor: isApplyingCatchAll ? 'not-allowed' : 'pointer'
                      }}
                      disabled={isApplyingCatchAll}
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={handleCatchAllConfirm}
                      style={{
                        ...confirmPrimaryButtonStyle,
                        opacity: isApplyingCatchAll ? 0.7 : 1,
                        cursor: isApplyingCatchAll ? 'not-allowed' : 'pointer'
                      }}
                      disabled={isApplyingCatchAll}
                    >
                      {isApplyingCatchAll ? 'Working…' : 'Yes'}
                    </button>
                  </div>
                </div>
              </div>
            )}
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

            {/* Title */}
            <div style={{ textAlign:'center', fontWeight:900, fontSize:20, marginBottom:12 }}>Pokedex</div>

            {/* Header controls */}
            <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:12, marginBottom:24, flexWrap:'wrap' }}>
              <input
                className="input"
                placeholder="Search"
                value={query}
                onChange={e=>setQuery(e.target.value)}
                style={{ width:200, borderRadius:8, padding:'6px 10px' }}
              />
              <select
                className="input"
                value={regionFilter}
                onChange={e=>setRegionFilter(e.target.value)}
                style={{ width:200, borderRadius:8, padding:'6px 10px' }}
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
              <button
                type="button"
                onClick={handleCatchAllClick}
                style={catchAllButtonStyle}
                title="Mark all non-legendary Pokémon as caught"
              >
                Catch All (Non-Legendary)
              </button>
            </div>

            {/* Grid of chips */}
            <div style={{ flex:1, overflow:'auto', minHeight:0, padding:'20px' }}>
              <div style={gridStyle}>
                {list.map(mon => {
                  const filled = caught.has(mon.id);
                  const isActive = activeMon?.id === mon.id;
                  const regionalId = getRegionalDexId(mon, regionFilter);
                  const displayId = regionalId !== null ? regionalId : mon.id;
                  return (
                    <div
                      key={mon.id}
                      style={chipStyle(filled, isActive)}
                      onClick={() => handleMonClick(mon)}
                      title={isActive ? 'Hide locations' : 'Show locations'}
                    >
                      <div style={chipHeaderStyle}>
                        <Sprite mon={mon} alt={mon.name} style={{ opacity: filled ? 0.6 : 1 }} />
                        <div style={{ ...chipNameStyle, opacity: filled ? 0.6 : 1 }}>
                          <div style={{ fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{titleCase(mon.name)}</div>
                          <div className="label-muted" style={{ fontSize:12 }}>#{displayId}</div>
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
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop:14, textAlign:'center', fontWeight:800 }}>
              Total caught {regionStats.caughtCount}/{regionStats.totalCount}
            </div>
            {activeMon && (
              <div style={locationScrimStyle} onClick={() => setActiveMon(null)}>
                <div style={locationCardStyle} onClick={e => e.stopPropagation()}>
                  <div style={locationHeaderStyle}>
                    <div style={locationHeaderInfoStyle}>
                      <Sprite mon={activeMon} size={72} alt={activeMon.name} />
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontWeight:900, fontSize:20, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          #{String(activeMon.id).padStart(3, '0')} {titleCase(activeMon.name)}
                        </div>
                        <div className="label-muted" style={{ fontSize:13, marginTop:4 }}>
                          {overlaySubtitle}
                        </div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
                      <button
                        type="button"
                        style={{
                          ...locationActionButtonStyle,
                          borderColor: activeMonCaught ? 'var(--accent)' : 'var(--divider)',
                          color: activeMonCaught ? 'var(--accent)' : 'var(--text)'
                        }}
                        onClick={e => { e.stopPropagation(); toggleCaught(activeMon.id); }}
                      >
                        {activeMonCaught ? 'Caught' : 'Catch'}
                      </button>
                      <button
                        type="button"
                        style={locationActionButtonStyle}
                        onClick={e => { e.stopPropagation(); setActiveMon(null); }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div style={locationBodyStyle}>
                    {locationOverlayData.sections.length ? (
                      locationOverlayData.sections.map(({ region, locations }) => {
                        const regionKey = region || 'Unknown';
                        const collapsed = collapsedRegions.has(regionKey);
                        return (
                          <div key={regionKey} style={regionGroupStyle}>
                            <button
                              type="button"
                              style={regionButtonStyle}
                              onClick={e => { e.stopPropagation(); toggleRegionCollapsed(regionKey); }}
                            >
                              <span style={{ fontWeight:800 }}>{titleCase(regionKey)}</span>
                              <span aria-hidden="true" style={regionChevronStyle}>
                                {String.fromCharCode(collapsed ? 0x25B6 : 0x25BC)}
                              </span>
                            </button>
                            {!collapsed && (
                              <ul style={locationListStyle}>
                                {locations.map((loc, idx) => {
                                  const detailText = formatLocationDetails(loc);
                                  return (
                                    <li key={`${regionKey}-${idx}`} style={locationEntryStyle}>
                                      <div style={{ fontWeight:700 }}>{titleCase(loc.location || 'Unknown')}</div>
                                      {detailText && (
                                        <div className="label-muted" style={{ fontSize:12 }}>{detailText}</div>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div style={emptyLocationsStyle}>{locationOverlayData.emptyMessage}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

