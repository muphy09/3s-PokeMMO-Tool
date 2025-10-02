import { useMemo, useState, useEffect } from 'react';
import dexRaw from '../../UpdatedDex.json';

const SPRITES_BASE = (import.meta.env.VITE_SPRITES_BASE || `${import.meta.env.BASE_URL}sprites/`).replace(/\/+$/, '/');
const SPRITES_EXT  = import.meta.env.VITE_SPRITES_EXT || '.png';
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
const PLACEHOLDER_POKEMON = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 10c-5.5 0-10 4.5-10 10v5h-5c-5.5 0-10 4.5-10 10v30c0 5.5 4.5 10 10 10h5v5c0 5.5 4.5 10 10 10s10-4.5 10-10v-5h5c5.5 0 10-4.5 10-10V35c0-5.5-4.5-10-10-10h-5v-5c0-5.5-4.5-10-10-10z" fill="none" stroke="currentColor" stroke-width="2"/><text x="50" y="55" font-size="40" text-anchor="middle" fill="currentColor">?</text></svg>`)}`;

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
  // Use placeholder for Pokemon with ID >= 650 (Event Pokemon with incorrect sprite data)
  if (mon?.id != null && mon.id >= 650) {
    return [PLACEHOLDER_POKEMON];
  }
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

function titleCase(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s(-])([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
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

// Event Pokemon are those with ID > 649
const EVENT_DEX_LIST = dexRaw
  .filter(m => !FORM_IDS.has(m.id) && m.id > 649)
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

export default function EventDexButton(){
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

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
  const gridStyle = { display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', columnGap:10, rowGap:16, alignItems:'stretch' };
  const chipStyle = {
    display:'flex',
    flexDirection:'column',
    gap:8,
    border:'1px solid #ffffff',
    borderRadius:10,
    padding:10,
    background:'var(--surface)',
    overflow:'hidden'
  };
  const chipHeaderStyle = { display:'grid', gridTemplateColumns:'auto 1fr', alignItems:'center', gap:10 };
  const chipNameStyle = { textAlign:'center', minWidth:0 };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EVENT_DEX_LIST.filter(mon => {
      if (!q) return true;
      return String(mon.id).includes(q) || mon.name.toLowerCase().includes(q);
    });
  }, [query]);

  return (
    <>
      <button style={btnStyle} onClick={()=>setOpen(true)} title="Event Dex">Event Dex</button>
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
            <div style={{ textAlign:'center', fontWeight:900, fontSize:20, marginBottom:12 }}>Event Dex</div>

            {/* Header controls */}
            <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:12, marginBottom:24, flexWrap:'wrap' }}>
              <input
                className="input"
                placeholder="Search"
                value={query}
                onChange={e=>setQuery(e.target.value)}
                style={{ width:280, borderRadius:8, padding:'6px 10px' }}
              />
            </div>

            {/* Grid of chips */}
            <div style={{ flex:1, overflow:'auto', minHeight:0, padding:'20px' }}>
              <div style={gridStyle}>
                {list.map(mon => {
                  return (
                    <div
                      key={mon.id}
                      style={chipStyle}
                    >
                      <div style={chipHeaderStyle}>
                        <Sprite mon={mon} alt={mon.name} />
                        <div style={chipNameStyle}>
                          <div style={{ fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{titleCase(mon.name)}</div>
                          <div className="label-muted" style={{ fontSize:12 }}>#{mon.id}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop:14, textAlign:'center', fontWeight:800 }}>
              Total Event Pokemon {EVENT_DEX_LIST.length}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
