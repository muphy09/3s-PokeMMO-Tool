import React, { useContext, useMemo, useState, useEffect } from 'react';
import { AlphaCaughtContext } from '../alphaCaughtContext.js';
import dexRaw from '../../UpdatedDex.json';
import alphaData from '../../data/alpha_pokemon.json';
import alphaIconUrl from '../../data/alpha.ico';

const SPRITES_BASE = (import.meta.env.VITE_SPRITES_BASE || `${import.meta.env.BASE_URL}sprites/`).replace(/\/+$/, '/');
const SPRITES_EXT  = import.meta.env.VITE_SPRITES_EXT || '.png';
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

function normalizeKey(s=''){
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/�T?/g,'-f')
    .replace(/�T,/g,'-m')
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
function Sprite({ mon, size=48, alt='', style: imgStyle }){
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

function titleCase(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s(-])([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
}

// Build a name->mon map using base entries (skip standalone alt forms)
const FORM_IDS = new Set();
for (const mon of dexRaw) {
  if (!Array.isArray(mon.forms)) continue;
  for (const f of mon.forms) {
    if (typeof f.id === 'number' && f.id !== mon.id) {
      FORM_IDS.add(f.id);
    }
  }
}
const MON_BY_NAME = new Map();
for (const m of dexRaw) {
  if (FORM_IDS.has(m.id)) continue;
  MON_BY_NAME.set(normalizeKey(m.name), m);
}

function toMonListFromNestedNames(nested){
  const out = [];
  for(const group of nested || []){
    for(const name of group || []){
      const mon = MON_BY_NAME.get(normalizeKey(name));
      if(mon) out.push(mon);
    }
  }
  // de-dupe by id
  const seen = new Set();
  return out.filter(m => { if(seen.has(m.id)) return false; seen.add(m.id); return true; });
}

function toEventMap(eventObj){
  const map = new Map();
  for(const [eventName, nested] of Object.entries(eventObj || {})){
    map.set(eventName, toMonListFromNestedNames(nested));
  }
  return map;
}

export default function AlphaDexButton(){
  const { alphaCaught, toggleAlphaCaught } = useContext(AlphaCaughtContext);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('normal'); // 'normal' | 'event'
  const [query, setQuery] = useState(''); // search for Normal Spawn tab

  const normalMon = useMemo(() => toMonListFromNestedNames(alphaData.normal_alpha), []);
  const eventMap = useMemo(() => toEventMap(alphaData.event_alpha), []);
  const allAlphaIds = useMemo(() => {
    const ids = new Set(normalMon.map(m=>m.id));
    for(const list of eventMap.values()) for(const m of list) ids.add(m.id);
    return ids;
  }, [normalMon, eventMap]);

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
    display:'grid',
    gridTemplateColumns:'auto 1fr auto',
    alignItems:'center',
    gap:8,
    marginBottom:14,
    position:'relative'
  };
  const tabBtn = (active) => ({
    padding:'6px 10px', borderRadius:8, border:'1px solid var(--divider)', cursor:'pointer',
    fontWeight:800, background: active ? 'var(--card)' : 'transparent', color:'var(--text)'
  });
  const gridStyle = { display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', columnGap:10, rowGap:16, alignItems:'stretch' };
  const chipStyle = (filled) => ({
    display:'grid', gridTemplateColumns:'auto 1fr auto', alignItems:'center', gap:10,
    border:`${filled ? 2 : 1}px solid ${filled ? '#ff4d4d' : '#ffffff'}`,
    borderRadius:10, padding:10, background:'var(--surface)', cursor:'pointer', overflow:'hidden'
  });
  const footerStyle = { marginTop:14, textAlign:'center', fontWeight:800 };

  const renderChip = (mon) => {
    const filled = alphaCaught.has(mon.id);
    return (
      <div
        key={mon.id}
        style={chipStyle(filled)}
        onClick={() => toggleAlphaCaught(mon.id)}
        title={filled ? 'Mark Alpha as uncaught' : 'Mark Alpha as caught'}
      >
        <Sprite mon={mon} size={56} alt={mon.name} style={{ opacity: filled ? 0.6 : 1 }} />
        <div style={{ textAlign:'center', minWidth:0, opacity: filled ? 0.6 : 1 }}>
          <div style={{ fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{titleCase(mon.name)}</div>
          <div className="label-muted" style={{ fontSize:12 }}>#{mon.id}</div>
        </div>
        <img src={alphaIconUrl} alt="Alpha Caught" style={{ width:30, height:30, opacity: filled ? 1 : 0.35, pointerEvents:'none', justifySelf:'end' }} />
      </div>
    );
  };

  const totalAlphaCaught = useMemo(() => {
    let count = 0;
    for(const id of alphaCaught){ if(allAlphaIds.has(id)) count++; }
    return count;
  }, [alphaCaught, allAlphaIds]);

  // Persisted dropdown states for Event tab
  const [eventOpen, setEventOpen] = useState(() => {
    try {
      const raw = localStorage.getItem('alphaEventOpenMap');
      if (raw) {
        const parsed = JSON.parse(raw);
        // Ensure any new events default to open
        const allKeys = Object.keys(alphaData?.event_alpha || {});
        for (const k of allKeys) if (!(k in parsed)) parsed[k] = true;
        return parsed;
      }
    } catch {}
    // Default: open all event groups
    const initial = {};
    for (const k of Object.keys(alphaData?.event_alpha || {})) initial[k] = true;
    return initial;
  });
  useEffect(() => {
    try { localStorage.setItem('alphaEventOpenMap', JSON.stringify(eventOpen)); } catch {}
  }, [eventOpen]);

  function EventDropdowns({ eventMap, renderChip, gridStyle }){
    return (
      <div style={{ display:'grid', gap:12 }}>
        {Array.from(eventMap.entries()).map(([evt, list]) => {
          const isOpen = !!eventOpen[evt];
          return (
            <div key={evt}>
              <div
                onClick={() => setEventOpen(prev => ({ ...prev, [evt]: !prev[evt] }))}
                style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  fontWeight:900, border:'1px solid var(--divider)', borderRadius:8,
                  padding:'6px 10px', cursor:'pointer', userSelect:'none', background:'var(--surface)'
                }}
              >
                <span>{evt}</span>
                <span className="label-muted" style={{ fontWeight:700 }}>{isOpen ? '▼' : '▶'}</span>
              </div>
              {isOpen && (
                <div style={{ marginTop:8 }}>
                  <div style={gridStyle}>
                    {list.map(renderChip)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <button style={btnStyle} onClick={()=>setOpen(true)} title="Alpha Dex">Alpha Dex</button>
      {open && (
        <div style={overlayStyle} onClick={()=>setOpen(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            {/* Close button (precise hit area) */}
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

            {/* Header with tabs (left) and centered search (for Normal Spawn) */}
            <div style={headerStyle}>
              <div style={{ display:'flex', gap:8 }}>
                <button style={tabBtn(tab==='normal')} onClick={()=>setTab('normal')}>Normal Spawn</button>
                <button style={tabBtn(tab==='event')} onClick={()=>setTab('event')}>Event Spawn</button>
              </div>
              {tab === 'normal' ? (
                <input
                  className="input"
                  placeholder="Search"
                  value={query}
                  onChange={e=>setQuery(e.target.value)}
                  style={{ justifySelf:'center', width:280, borderRadius:8, padding:'6px 10px' }}
                />
              ) : <div />}
              <div />
            </div>
            <div style={{ flex:1, overflow:'auto' }}>
              {tab==='normal' && (()=>{
                const q = query.trim().toLowerCase();
                const filtered = q ? normalMon.filter(m => String(m.id).includes(q) || (m.name||'').toLowerCase().includes(q)) : normalMon;
                return (
                  <div style={gridStyle}>
                    {filtered.map(renderChip)}
                  </div>
                );
              })()}
              {tab==='event' && (
                <EventDropdowns eventMap={eventMap} renderChip={renderChip} gridStyle={gridStyle} />
              )}
            </div>
            <div style={footerStyle}>Total Alpha Caught {totalAlphaCaught}/{allAlphaIds.size}</div>
          </div>
        </div>
      )}
    </>
  );
}
