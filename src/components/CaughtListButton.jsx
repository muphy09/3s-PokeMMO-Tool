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

const DEX_LIST = dexRaw
  .filter(m => !FORM_IDS.has(m.id))
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

function titleCase(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s(-])([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
}

export default function CaughtListButton(){
  const { caught, toggleCaught } = useContext(CaughtContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

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
    display:'grid', gridTemplateColumns:'1fr auto 1fr', alignItems:'center', gap:8, marginBottom:14, position:'relative'
  };
  const gridStyle = { display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', columnGap:10, rowGap:16, alignItems:'stretch' };
  const chipStyle = (filled) => ({
    display:'grid', gridTemplateColumns:'auto 1fr auto', alignItems:'center', gap:10,
    border:`${filled ? 2 : 1}px solid ${filled ? '#22c55e' : '#ffffff'}`,
    borderRadius:10, padding:10, background:'var(--surface)', cursor:'pointer', overflow:'hidden'
  });

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
    if (!q) return DEX_LIST;
    return DEX_LIST.filter(m => String(m.id).includes(q) || m.name.toLowerCase().includes(q));
  }, [query]);

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

            {/* Header with centered search */}
            <div style={headerStyle}>
              <div />
              <input
                className="input"
                placeholder="Search"
                value={query}
                onChange={e=>setQuery(e.target.value)}
                style={{ width:280, borderRadius:8, padding:'6px 10px', justifySelf:'center' }}
              />
              <div />
            </div>

            {/* Grid of chips */}
            <div style={{ flex:1, overflow:'auto' }}>
              <div style={gridStyle}>
                {list.map(mon => {
                  const filled = caught.has(mon.id);
                  return (
                    <div
                      key={mon.id}
                      style={chipStyle(filled)}
                      onClick={()=>toggleCaught(mon.id)}
                      title={filled ? 'Mark as uncaught' : 'Mark as caught'}
                    >
                      <Sprite mon={mon} alt={mon.name} style={{ opacity: filled ? 0.6 : 1 }} />
                      <div style={{ textAlign:'center', minWidth:0, opacity: filled ? 0.6 : 1 }}>
                        <div style={{ fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{titleCase(mon.name)}</div>
                        <div className="label-muted" style={{ fontSize:12 }}>#{mon.id}</div>
                      </div>
                      <div style={{ pointerEvents:'none', justifySelf:'end' }}>
                        <PokeballIcon filled={filled} />
                      </div>
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
