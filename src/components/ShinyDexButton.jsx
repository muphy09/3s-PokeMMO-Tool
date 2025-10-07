import React, { useContext, useMemo, useState, useEffect } from 'react';
import { ShinyCaughtContext } from '../shinyCaughtContext.js';
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

function spriteSources(mon){
  if (!mon) return [];
  const arr = [];

  // Always use shiny sprites in ShinyDex
  if (mon.sprites?.front_shiny) arr.push(mon.sprites.front_shiny);
  const shinyArt = mon.sprites?.other?.["official-artwork"]?.front_shiny;
  if (shinyArt) arr.push(shinyArt);

  // Add shiny PokeAPI URLs as fallbacks
  arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${mon.id}.png`);
  arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${mon.id}.png`);

  return [...new Set(arr)].filter(Boolean);
}

function Sprite({ mon, size=56, alt='', style: imgStyle }){
  // Always show shiny sprites in ShinyDex
  const srcs = useMemo(()=> spriteSources(mon), [mon]);
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

const DEX_LIST = dexRaw
  .filter(m => !FORM_IDS.has(m.id) && m.id <= 649)
  .map(m => ({
    id: m.id,
    name: m.name,
    sprite: m.sprite,
    sprites: m.sprites,
    image: m.image,
    icon: m.icon,
    slug: m.slug
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

const REGION_OPTIONS = Object.freeze([
  { value: 'All', label: 'Region (All)' },
  { value: 'Kanto', label: 'Kanto' },
  { value: 'Johto', label: 'Johto' },
  { value: 'Hoenn', label: 'Hoenn' },
  { value: 'Sinnoh', label: 'Sinnoh' },
  { value: 'Unova', label: 'Unova' }
]);

const METHOD_OPTIONS = ['Egg', 'Horde', 'Encounter', 'Trade', 'Purchase'];

function titleCase(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s(-])([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
}

export default function ShinyDexButton(){
  const { shinyCaught, addShinyEntry, updateShinyEntry, removeShinyEntry } = useContext(ShinyCaughtContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('All');
  const [hideUncaught, setHideUncaught] = useState(true); // Changed to hideUncaught, default true
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [activeMonForInput, setActiveMonForInput] = useState(null);
  const [activeMonForView, setActiveMonForView] = useState(null);
  const [viewingEntryIndex, setViewingEntryIndex] = useState(null);
  const [editingEntryIndex, setEditingEntryIndex] = useState(null);

  // Form state for catch input
  const [catchDate, setCatchDate] = useState('');
  const [catchTime, setCatchTime] = useState('');
  const [catchMethod, setCatchMethod] = useState('Encounter');
  const [encounters, setEncounters] = useState('');

  useEffect(() => {
    if (!open) {
      setShowAddModal(false);
      setActiveMonForInput(null);
      setActiveMonForView(null);
      setAddSearchQuery('');
    }
  }, [open]);

  useEffect(() => {
    setActiveMonForInput(null);
    setActiveMonForView(null);
  }, [regionFilter, hideUncaught]);

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
  const addButtonStyle = {
    width:32, height:32, borderRadius:'50%', border:'2px solid var(--accent)',
    background:'var(--accent)', color:'var(--surface)', fontSize:20, fontWeight:900,
    cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
    padding:0, lineHeight:1
  };
  const gridStyle = { display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', columnGap:10, rowGap:16, alignItems:'stretch' };
  const chipStyle = (active) => ({
    display:'flex',
    flexDirection:'column',
    gap:8,
    border: (active ? 2 : 2) + 'px solid ' + (active ? 'var(--accent)' : '#fbbf24'),
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
  const formScrimStyle = { position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:20010, padding:'24px' };
  const formCardStyle = { background:'var(--card)', color:'var(--text)', borderRadius:12, padding:20, width:'min(500px, 90vw)', maxHeight:'80vh', boxShadow:'0 12px 32px rgba(0,0,0,0.45)', display:'flex', flexDirection:'column', gap:16, overflowY:'auto' };
  const formHeaderStyle = { display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 };
  const formHeaderInfoStyle = { display:'flex', alignItems:'center', gap:12, minWidth:0 };
  const formBodyStyle = { display:'flex', flexDirection:'column', gap:12, paddingRight:4 };
  const formLabelStyle = { fontWeight:700, fontSize:14, marginBottom:4 };
  const formInputStyle = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--divider)', background:'var(--surface)', color:'var(--text)', fontSize:14 };
  const formActionsStyle = { display:'flex', justifyContent:'flex-end', gap:12, marginTop:8 };
  const formButtonStyle = { border:'1px solid var(--divider)', borderRadius:8, padding:'8px 16px', fontWeight:700, cursor:'pointer', background:'var(--surface)', color:'var(--text)' };
  const formPrimaryButtonStyle = { ...formButtonStyle, background:'var(--accent)', color:'var(--surface)', borderColor:'var(--accent)' };
  const viewCardStyle = { background:'var(--card)', color:'var(--text)', borderRadius:12, padding:20, width:'min(500px, 90vw)', maxHeight:'80vh', boxShadow:'0 12px 32px rgba(0,0,0,0.45)', display:'flex', flexDirection:'column', gap:16, overflowY:'auto' };
  const viewDataStyle = { display:'flex', flexDirection:'column', gap:12 };
  const viewItemStyle = { background:'var(--surface)', padding:'10px 12px', borderRadius:8, border:'1px solid var(--divider)' };
  const viewLabelStyle = { fontWeight:800, fontSize:13, color:'var(--muted)', marginBottom:4 };
  const viewValueStyle = { fontWeight:600, fontSize:15 };
  const entryCardStyle = { background:'var(--surface)', padding:'12px', borderRadius:8, border:'1px solid var(--divider)', marginBottom:8 };
  const entryHeaderStyle = { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 };
  const searchListStyle = { display:'flex', flexDirection:'column', gap:8, maxHeight:'400px', overflowY:'auto', paddingRight:4 };
  const searchItemStyle = { display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'var(--surface)', border:'1px solid var(--divider)', borderRadius:8, cursor:'pointer', transition:'border-color 120ms ease' };

  // Get list of caught Pokemon (those with at least one entry)
  const caughtList = useMemo(() => {
    const caughtIds = Array.from(shinyCaught.keys());
    const mons = caughtIds.map(id => DEX_BY_ID.get(id)).filter(Boolean);

    const q = query.trim().toLowerCase();
    let filtered = mons;

    if (!hideUncaught) {
      // Show all Pokemon
      filtered = DEX_LIST;
    }

    // Apply search filter
    if (q) {
      filtered = filtered.filter(mon =>
        String(mon.id).includes(q) || mon.name.toLowerCase().includes(q)
      );
    }

    // Apply region filter
    filtered = filtered.filter(mon => monMatchesRegionFilter(mon, regionFilter));

    // Sort by ID
    return filtered.sort((a, b) => {
      const aId = regionFilter === 'All' ? a.id : (getRegionalDexId(a, regionFilter) || a.id);
      const bId = regionFilter === 'All' ? b.id : (getRegionalDexId(b, regionFilter) || b.id);
      return aId - bId;
    });
  }, [query, regionFilter, hideUncaught, shinyCaught]);

  // Filter Pokemon for add modal
  const addSearchList = useMemo(() => {
    const q = addSearchQuery.trim().toLowerCase();
    if (!q) return DEX_LIST.slice(0, 50); // Show first 50 if no query

    return DEX_LIST.filter(mon =>
      String(mon.id).includes(q) || mon.name.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [addSearchQuery]);

  const totalShinyCaught = useMemo(() => {
    let total = 0;
    for (const entries of shinyCaught.values()) {
      total += entries.length;
    }
    return total;
  }, [shinyCaught]);

  const handleMonClick = (mon) => {
    const entries = shinyCaught.get(mon.id);
    if (entries && entries.length > 0) {
      // Has entries, show view modal
      setActiveMonForView(mon);
      setActiveMonForInput(null);
    }
  };

  const handleAddShinyClick = () => {
    setShowAddModal(true);
    setAddSearchQuery('');
  };

  const handleSelectPokemonFromAdd = (mon) => {
    setShowAddModal(false);
    setActiveMonForInput(mon);
    setEditingEntryIndex(null);
    // Reset form
    const now = new Date();
    setCatchDate(now.toISOString().split('T')[0]);
    setCatchTime(now.toTimeString().split(' ')[0].substring(0, 5));
    setCatchMethod('Encounter');
    setEncounters('');
  };

  const handleSaveCatch = () => {
    if (!activeMonForInput) return;
    const data = {
      date: catchDate,
      time: catchTime,
      method: catchMethod,
      encounters: encounters ? parseInt(encounters) : 0,
      timestamp: Date.now()
    };

    if (editingEntryIndex !== null) {
      // Updating existing entry
      updateShinyEntry(activeMonForInput.id, editingEntryIndex, data);
    } else {
      // Adding new entry
      addShinyEntry(activeMonForInput.id, data);
    }

    setActiveMonForInput(null);
    setEditingEntryIndex(null);
  };

  const handleCancelInput = () => {
    setActiveMonForInput(null);
    setEditingEntryIndex(null);
  };

  const handleCloseView = () => {
    setActiveMonForView(null);
    setViewingEntryIndex(null);
  };

  const handleRemoveEntry = (index) => {
    if (!activeMonForView) return;
    removeShinyEntry(activeMonForView.id, index);

    const entries = shinyCaught.get(activeMonForView.id);
    if (!entries || entries.length === 0) {
      setActiveMonForView(null);
    }
  };

  const handleEditEntry = (index) => {
    if (!activeMonForView) return;
    const entries = shinyCaught.get(activeMonForView.id);
    if (!entries || !entries[index]) return;

    const entry = entries[index];
    setCatchDate(entry.date || '');
    setCatchTime(entry.time || '');
    setCatchMethod(entry.method || 'Encounter');
    setEncounters(entry.encounters?.toString() || '');

    setEditingEntryIndex(index);
    setActiveMonForInput(activeMonForView);
    setActiveMonForView(null);
  };

  const handleAddAnotherEntry = () => {
    if (!activeMonForView) return;

    const now = new Date();
    setCatchDate(now.toISOString().split('T')[0]);
    setCatchTime(now.toTimeString().split(' ')[0].substring(0, 5));
    setCatchMethod('Encounter');
    setEncounters('');

    setEditingEntryIndex(null);
    setActiveMonForInput(activeMonForView);
    setActiveMonForView(null);
  };

  return (
    <>
      <button style={btnStyle} onClick={()=>setOpen(true)} title="Shiny Dex">Shiny Dex</button>
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

            {/* Title */}
            <div style={{ textAlign:'center', fontWeight:900, fontSize:20, marginBottom:12 }}>Shiny Dex</div>

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
                  checked={hideUncaught}
                  onChange={e=>setHideUncaught(e.target.checked)}
                  style={hideCaughtCheckboxStyle}
                />
                Hide Un-Caught
              </label>
              <button
                type="button"
                onClick={handleAddShinyClick}
                style={addButtonStyle}
                title="Add Shiny Pokemon"
              >
                +
              </button>
            </div>

            {/* Grid of chips */}
            <div style={{ flex:1, overflow:'auto', minHeight:0, padding:'20px' }}>
              {caughtList.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--muted)', fontStyle:'italic', marginTop:40 }}>
                  No shiny Pokemon to display. Click the + button to add your first shiny!
                </div>
              ) : (
                <div style={gridStyle}>
                  {caughtList.map(mon => {
                    const entries = shinyCaught.get(mon.id) || [];
                    const count = entries.length;
                    const isActive = activeMonForView?.id === mon.id;
                    const regionalId = getRegionalDexId(mon, regionFilter);
                    const displayId = regionalId !== null ? regionalId : mon.id;
                    return (
                      <div
                        key={mon.id}
                        style={chipStyle(isActive)}
                        onClick={() => handleMonClick(mon)}
                        title={`View ${count} shiny ${count === 1 ? 'entry' : 'entries'}`}
                      >
                        <div style={chipHeaderStyle}>
                          <Sprite mon={mon} alt={mon.name} />
                          <div style={chipNameStyle}>
                            <div style={{ fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{titleCase(mon.name)}</div>
                            <div className="label-muted" style={{ fontSize:12 }}>#{displayId}</div>
                          </div>
                          <div style={{ fontSize:20, fontWeight:900, color:'#fbbf24' }}>
                            {count}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ marginTop:14, textAlign:'center', fontWeight:800 }}>
              Total Caught Shinies: {totalShinyCaught}
            </div>

            {/* Add Pokemon Modal */}
            {showAddModal && (
              <div style={formScrimStyle} onClick={() => setShowAddModal(false)}>
                <div style={formCardStyle} onClick={e => e.stopPropagation()}>
                  <div style={formHeaderStyle}>
                    <div style={{ fontWeight:900, fontSize:18 }}>
                      Select Pokemon
                    </div>
                  </div>
                  <div>
                    <input
                      className="input"
                      placeholder="Search Pokemon..."
                      value={addSearchQuery}
                      onChange={e => setAddSearchQuery(e.target.value)}
                      style={formInputStyle}
                      autoFocus
                    />
                  </div>
                  <div style={searchListStyle}>
                    {addSearchList.map(mon => (
                      <div
                        key={mon.id}
                        style={searchItemStyle}
                        onClick={() => handleSelectPokemonFromAdd(mon)}
                      >
                        <Sprite mon={mon} size={48} alt={mon.name} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:800 }}>{titleCase(mon.name)}</div>
                          <div className="label-muted" style={{ fontSize:12 }}>#{mon.id}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={formActionsStyle}>
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      style={formButtonStyle}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Input Modal */}
            {activeMonForInput && (
              <div style={formScrimStyle} onClick={() => setActiveMonForInput(null)}>
                <div style={formCardStyle} onClick={e => e.stopPropagation()}>
                  <div style={formHeaderStyle}>
                    <div style={formHeaderInfoStyle}>
                      <Sprite mon={activeMonForInput} size={72} alt={activeMonForInput.name} />
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontWeight:900, fontSize:20, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {titleCase(activeMonForInput.name)}
                        </div>
                        <div className="label-muted" style={{ fontSize:13, marginTop:4 }}>
                          {editingEntryIndex !== null ? 'Edit Shiny Catch Details' : 'Enter Shiny Catch Details'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={formBodyStyle}>
                    <div>
                      <label style={formLabelStyle}>Date</label>
                      <input
                        type="date"
                        value={catchDate}
                        onChange={e => setCatchDate(e.target.value)}
                        style={formInputStyle}
                      />
                    </div>
                    <div>
                      <label style={formLabelStyle}>Time</label>
                      <input
                        type="time"
                        value={catchTime}
                        onChange={e => setCatchTime(e.target.value)}
                        style={formInputStyle}
                      />
                    </div>
                    <div>
                      <label style={formLabelStyle}>Method</label>
                      <select
                        value={catchMethod}
                        onChange={e => setCatchMethod(e.target.value)}
                        style={formInputStyle}
                      >
                        {METHOD_OPTIONS.map(method => (
                          <option key={method} value={method}>{method}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={formLabelStyle}>Encounters</label>
                      <input
                        type="number"
                        min="0"
                        value={encounters}
                        onChange={e => setEncounters(e.target.value)}
                        placeholder="Number of encounters"
                        style={formInputStyle}
                      />
                    </div>
                  </div>
                  <div style={formActionsStyle}>
                    <button
                      type="button"
                      onClick={handleCancelInput}
                      style={formButtonStyle}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCatch}
                      style={formPrimaryButtonStyle}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* View Modal - Shows all entries for a Pokemon */}
            {activeMonForView && (
              <div style={formScrimStyle} onClick={() => setActiveMonForView(null)}>
                <div style={viewCardStyle} onClick={e => e.stopPropagation()}>
                  <div style={formHeaderStyle}>
                    <div style={formHeaderInfoStyle}>
                      <Sprite mon={activeMonForView} size={72} alt={activeMonForView.name} />
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontWeight:900, fontSize:20, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {titleCase(activeMonForView.name)}
                        </div>
                        <div className="label-muted" style={{ fontSize:13, marginTop:4 }}>
                          {shinyCaught.get(activeMonForView.id)?.length || 0} Shiny {(shinyCaught.get(activeMonForView.id)?.length || 0) === 1 ? 'Catch' : 'Catches'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={viewDataStyle}>
                    {(() => {
                      const entries = shinyCaught.get(activeMonForView.id) || [];
                      return entries.map((entry, index) => (
                        <div key={index} style={entryCardStyle}>
                          <div style={entryHeaderStyle}>
                            <div style={{ fontWeight:800, fontSize:15 }}>
                              Catch #{index + 1}
                            </div>
                            <div style={{ display:'flex', gap:8 }}>
                              <button
                                type="button"
                                onClick={() => handleEditEntry(index)}
                                style={{ ...formButtonStyle, padding:'4px 12px', fontSize:13 }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveEntry(index)}
                                style={{ ...formButtonStyle, padding:'4px 12px', fontSize:13, color:'#ef4444', borderColor:'#ef4444' }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                            <div>
                              <div style={viewLabelStyle}>Date</div>
                              <div style={viewValueStyle}>{entry.date || 'N/A'}</div>
                            </div>
                            <div>
                              <div style={viewLabelStyle}>Time</div>
                              <div style={viewValueStyle}>{entry.time || 'N/A'}</div>
                            </div>
                            <div>
                              <div style={viewLabelStyle}>Method</div>
                              <div style={viewValueStyle}>{entry.method || 'N/A'}</div>
                            </div>
                            <div>
                              <div style={viewLabelStyle}>Encounters</div>
                              <div style={viewValueStyle}>{entry.encounters ?? 'N/A'}</div>
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                  <div style={formActionsStyle}>
                    <button
                      type="button"
                      onClick={handleAddAnotherEntry}
                      style={formButtonStyle}
                    >
                      Add Another
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseView}
                      style={formPrimaryButtonStyle}
                    >
                      Close
                    </button>
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
