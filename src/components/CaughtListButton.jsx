import React, { useContext, useMemo, useState } from 'react';
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
function spriteSources(mon){
  if (!mon) return [];
  const arr = [];
  if (mon.sprite) arr.push(mon.sprite);
  if (mon.sprites?.front_default) arr.push(mon.sprites.front_default);
  if (mon.image) arr.push(mon.image);
  if (mon.icon) arr.push(mon.icon);
  arr.push(...localSpriteCandidates(mon));
  arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${mon.id}.png`);
  arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${mon.id}.png`);
  return [...new Set(arr)].filter(Boolean);
}
function Sprite({ mon, size=32, alt='' }){
  const srcs = useMemo(()=> spriteSources(mon), [mon]);
  const [idx, setIdx] = useState(0);
  const src = srcs[idx] || TRANSPARENT_PNG;
  return (
    <img
      src={src}
      alt={alt || mon?.name || ''}
      style={{ width:size, height:size, objectFit:'contain', imageRendering:'pixelated' }}
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
    background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center',
    justifyContent:'center', zIndex:1000
  };
  const modalStyle = {
    background:'var(--surface)', color:'var(--text)', padding:20,
    width:'80%', maxWidth:400, maxHeight:'80%', overflowY:'auto',
    borderRadius:'var(--radius-lg)', boxShadow:'var(--shadow-2)'
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEX_LIST;
    return DEX_LIST.filter(m => String(m.id).includes(q) || m.name.toLowerCase().includes(q));
  }, [query]);

  return (
    <>
      <button style={btnStyle} onClick={()=>setOpen(true)} title="Caught List">Caught List</button>
      {open && (
        <div style={overlayStyle} onClick={()=>setOpen(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <input
              className="input"
              placeholder="Search"
              value={query}
              onChange={e=>setQuery(e.target.value)}
              style={{ width:'100%', marginBottom:12, borderRadius:8, padding:8 }}
            />
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 0', paddingRight:8, fontWeight:700, borderBottom:'1px solid var(--divider)' }}>
                <span style={{ width:20, textAlign:'center' }}>Caught</span>
                <span style={{ width:32 }}></span>
                <span style={{ flex:1 }}>Name</span>
                <span style={{ minWidth:40, textAlign:'right', marginRight:4 }}>ID</span>
              </div>
              <div style={{ maxHeight:'60vh', overflowY:'auto' }}>
                {list.map(mon => (
                  <label key={mon.id} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 0', paddingRight:8, borderBottom:'1px solid var(--divider)' }}>
                    <input type="checkbox" checked={caught.has(mon.id)} onChange={()=>toggleCaught(mon.id)} />
                    <Sprite mon={mon} size={32} alt={mon.name} />
                    <span style={{ flex:1 }}>{titleCase(mon.name)}</span>
                    <span className="label-muted" style={{ minWidth:40, textAlign:'right', marginRight:4 }}>#{mon.id}</span>
                  </label>
                ))}
              </div>
              <div style={{ marginTop:8, textAlign:'center', fontWeight:700 }}>
                Total caught {caught.size}/{DEX_LIST.length}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}